import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// 1. Инициализируем Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ Ошибка: GEMINI_API_KEY не указан в .env");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

// 2. Читаем резюме и шаблон промпта
const resumePath = path.join(process.cwd(), "resume.md");
const promptTemplatePath = path.join(process.cwd(), "prompt.md");

if (!fs.existsSync(resumePath) || !fs.existsSync(promptTemplatePath)) {
    console.error("❌ Ошибка: Файлы resume.md и prompt.md должны лежать в корне проекта!");
    process.exit(1);
}

const resumeContent = fs.readFileSync(resumePath, "utf-8");
const promptTemplate = fs.readFileSync(promptTemplatePath, "utf-8");

// 3. Инициализируем Telegram Клиент
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const sessionString = process.env.TELEGRAM_SESSION || "";

if (!sessionString) {
    console.error("❌ Ошибка: TELEGRAM_SESSION не найден в .env. Пройди Чекпоинт 4!");
    process.exit(1);
}

const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getRandomDelay = (minSec: number, maxSec: number) => {
    return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
};

async function startBot() {
    console.log("🔄 Запуск Fullstack AI-ассистента...");

    await client.connect();
    console.log("✅ Подключение к Telegram установлено!");

    await prisma.$connect();
    console.log("✅ Подключение к PostgreSQL (Prisma) активно!");
    console.log("🎯 Бот готов к диалогу с @Giga_recruiter_bot...\n");

    client.addEventHandler(async (event) => {
        try {
            const message = event.message;
            if (message.out) return;

            const sender = await message.getSender() as any;
            const username = sender?.username;

            if (username !== "Giga_recruiter_bot") {
                return;
            }

            const recruiterQuestion = message.message || "";
            console.log(`\n📩 [Сбер прислал сообщение]:\n"${recruiterQuestion}"`);

            // ШАГ 1: Сохраняем вопрос рекрутера в БД
            await prisma.message.create({
                data: {
                    sender: "RECRUITER",
                    text: recruiterQuestion || "[Кнопки выбора / меню]",
                },
            });
            console.log("💾 Сообщение сохранено в базу данных.");

            // -------------------------------------------------------------------------
            // ПРАВИЛО 1: Финал интервью (Прощание) — НЕ ОТВЕЧАЕМ
            // -------------------------------------------------------------------------
            if (
                recruiterQuestion.includes("Спасибо за интервью") ||
                recruiterQuestion.includes("Пульс") ||
                recruiterQuestion.includes("передам ваше резюме и итоги")
            ) {
                console.log("🎉 [ФИНАЛ] Сбер завершил интервью и передал резюме! Отвечать не требуется.");
                return;
            }

            // -------------------------------------------------------------------------
            // ПРАВИЛО 2: Стартовое согласие на вопросы — ОТВЕЧАЕМ ПРОСТО "Да, готов"
            // -------------------------------------------------------------------------
            if (
                recruiterQuestion.includes("Будет удобно прямо сейчас ответить на несколько вопросов") ||
                recruiterQuestion.includes("уточнить недостающую информацию по вашему резюме")
            ) {
                console.log("👋 [СТАРТ] Приветственное сообщение от Сбера. Отвечаем 'Да, готов'...");
                const delay = getRandomDelay(3, 5);
                await sleep(delay);

                const quickAnswer = "Да, готов ответить на вопросы.";
                await client.sendMessage("Giga_recruiter_bot", { message: quickAnswer });

                await prisma.message.create({
                    data: { sender: "ME", text: quickAnswer },
                });
                console.log("📤 Отправлено согласие на интервью!");
                return;
            }

            // -------------------------------------------------------------------------
            // ПРАВИЛО 3: Интерактивные кнопки (Оценка 5 звезд ИЛИ Выбор вакансии)
            // -------------------------------------------------------------------------
            if (message.replyMarkup) {
                const lowerText = recruiterQuestion.toLowerCase();
                const isRating = lowerText.includes("оцен") || lowerText.includes("обратн") || lowerText.includes("звезд");

                if (isRating) {
                    // СЦЕНАРИЙ А: Оценка обратной связи (выбираем 5 звезд = 5-я кнопка с индексом 4)
                    console.log("⭐ Обнаружен запрос оценки! Выбираем 5 звёзд (5-я кнопка)...");
                    const delay = getRandomDelay(2, 4);
                    await sleep(delay);

                    try {
                        // Нажимаем на 5-ю кнопку (индекс 4)
                        await message.click({ i: 4 });
                        console.log("🌟 Успешно поставили оценку 5 звезд!");

                        await prisma.message.create({
                            data: { sender: "ME", text: "[Поставлена оценка: 5 звезд]" },
                        });
                        return;
                    } catch (err) {
                        console.log("⚠️ Не удалось нажать 5-ю кнопку, пробуем последнюю доступную:", err);
                    }
                } else {
                    // СЦЕНАРИЙ Б: Выбор вакансии из списка (выбираем первый вариант = кнопка с индексом 0)
                    console.log("🔘 Обнаружены кнопки выбора вакансии. Выбираем 1-й вариант...");
                    const delay = getRandomDelay(2, 4);
                    await sleep(delay);

                    try {
                        await message.click({ i: 0 });
                        console.log("👆 Успешно выбрали первый вариант вакансии!");

                        await prisma.message.create({
                            data: { sender: "ME", text: "[Выбран 1-й вариант вакансии по кнопке]" },
                        });
                        return;
                    } catch (btnErr) {
                        console.log("⚠️ Ошибка клика по вакансии, переходим к тексту:", btnErr);
                    }
                }
            }

            // -------------------------------------------------------------------------
            // СТАНДАРТНЫЙ СЦЕНАРИЙ: Генерация ответа через GEMINI AI
            // -------------------------------------------------------------------------
            const history = await prisma.message.findMany({
                take: 10,
                orderBy: { createdAt: "asc" },
            });

            const formattedHistory = history
                .map((m) => `${m.sender === "RECRUITER" ? "Рекрутер" : "Кандидат"}: ${m.text}`)
                .join("\n");

            const prompt = promptTemplate
                .replace("{{RESUME}}", resumeContent)
                .replace("{{HISTORY}}", formattedHistory)
                .replace("{{QUESTION}}", recruiterQuestion);

            console.log("🧠 Gemini генерирует ответ на основе резюме и контекста...");
            const aiResponse = await model.generateContent(prompt);
            const answerText = aiResponse.response.text().trim();

            console.log(`✨ [Сгенерированный ответ]:\n"${answerText}"`);

            const delay = getRandomDelay(5, 9);
            console.log(`⏳ Имитируем набор текста (${delay / 1000} сек)...`);
            await sleep(delay);

            await client.sendMessage("Giga_recruiter_bot", { message: answerText });
            console.log("📤 Ответ успешно отправлен в Telegram!");

            await prisma.message.create({
                data: {
                    sender: "ME",
                    text: answerText,
                },
            });
            console.log("💾 Наш ответ записан в базу данных.\n--- Ожидаем следующий шаг ---");

        } catch (error) {
            console.error("❌ Ошибка при обработке события:", error);
        }
    }, new NewMessage({}));
}

startBot().catch((err) => {
    console.error("Критическая ошибка:", err);
    prisma.$disconnect();
});
