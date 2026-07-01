// Default env so modules that read config at import time load without a real .env.
process.env.TELEGRAM_BOT_TOKEN ||= "test-bot-token";
process.env.ALLOWED_TELEGRAM_IDS ||= "111";
