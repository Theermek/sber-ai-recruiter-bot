import dotenv from 'dotenv';
dotenv.config();

console.log("🚀 Чекпоинт 1 пройден! Переменные окружения загружены.");
console.log("API_ID существует:", !!process.env.TELEGRAM_API_ID);
