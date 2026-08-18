import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import readline from "node:readline";
import dotenv from "dotenv";

dotenv.config();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const sessionString = process.env.TELEGRAM_SESSION || "";
const stringSession = new StringSession(sessionString);

if (!apiId || !apiHash) {
    console.error("❌ Ошибка: Укажи TELEGRAM_API_ID и TELEGRAM_API_HASH в файле .env!");
    process.exit(1);
}

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

// Простая и 100% типизированная функция для вопроса в консоли
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin as any,
        output: process.stdout as any,
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function runAuth() {
    console.log("🔄 Подключаемся к серверам Telegram...");

    // Запуск авторизации через наш хелпер askQuestion
    await client.start({
        phoneNumber: async () => await askQuestion("📱 Введите ваш номер телефона (например, +79991234567): "),
        password: async () => await askQuestion("🔒 Введите 2FA облачный пароль (если включен в TG): "),
        phoneCode: async () => await askQuestion("💬 Введите код подтверждения из Telegram: "),
        onError: (err) => console.log("Ошибка авторизации:", err),
    });

    console.log("\n🎉 Авторизация прошла успешно!");

    // Получаем данные о текущем пользователе
    const me = await client.getMe();
    console.log(`👤 Вы вошли как: ${me.firstName} (@${me.username})`);

    // Сохраняем строку сессии
    const savedSession = client.session.save() as unknown as string;
    console.log("\n================ СТРОКА СЕССИИ ================");
    console.log(savedSession);
    console.log("=================================================");
    console.log("👉 СКОПИРУЙ строку выше и вставь в файл .env в переменную TELEGRAM_SESSION=...");

    // Отключаемся от серверов
    await client.disconnect();
}

runAuth().catch(console.error);
