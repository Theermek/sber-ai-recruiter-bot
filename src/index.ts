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
    console.error("❌ Ошибка: Убедись, что файлы resume.md и prompt.md лежат в корне проекта!");
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

            const recruiterQuestion = message.message;
            console.log(`\n📩 [Сбер прислал вопрос]: "${recruiterQuestion}"`);

            // ШАГ 1: Сохраняем вопрос рекрутера в БД
            await prisma.message.create({
                data: {
                    sender: "RECRUITER",
                    text: recruiterQuestion,
                },
            });
            console.log("💾 Вопрос сохранен в базу данных.");

            // ШАГ 2: Достаем последние 10 сообщений
            const history = await prisma.message.findMany({
                take: 10,
                orderBy: { createdAt: "asc" },
            });

            const formattedHistory = history
                .map((m) => `${m.sender === "RECRUITER" ? "Рекрутер" : "Кандидат"}: ${m.text}`)
                .join("\n");

            // ШАГ 3: Подставляем данные в наш секретный шаблон промпта
            const prompt = promptTemplate
                .replace("{{RESUME}}", resumeContent)
                .replace("{{HISTORY}}", formattedHistory)
                .replace("{{QUESTION}}", recruiterQuestion);

            console.log("🧠 Gemini генерирует ответ на основе резюме и истории...");
            const aiResponse = await model.generateContent(prompt);
            const answerText = aiResponse.response.text().trim();

            console.log(`✨ [Сгенерированный ответ]: "${answerText}"`);

            // ШАГ 4: Задержка
            const delay = getRandomDelay(5, 9);
            console.log(`⏳ Имитируем набор текста (${delay / 1000} сек)...`);
            await sleep(delay);

            // ШАГ 5: Отправка в TG
            await client.sendMessage("Giga_recruiter_bot", { message: answerText });
            console.log("📤 Ответ успешно отправлен в Telegram!");

            // ШАГ 6: Сохранение нашего ответа в БД
            await prisma.message.create({
                data: {
                    sender: "ME",
                    text: answerText,
                },
            });
            console.log("💾 Наш ответ записан в базу данных.\n--- Ожидаем следующий вопрос ---");

        } catch (error) {
            console.error("❌ Ошибка при обработке сообщения:", error);
        }
    }, new NewMessage({}));
}

startBot().catch((err) => {
    console.error("Критическая ошибка:", err);
    prisma.$disconnect();
});
