#!/bin/bash

# Скрипт запуска Telegram Cases Mini App

echo "🚀 Запуск Telegram Cases Mini App..."

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo "❌ Файл .env не найден!"
    echo "📝 Скопируйте .env.example в .env и заполните настройки"
    exit 1
fi

# Проверка наличия базы данных
if [ ! -f database/cases.db ]; then
    echo "📊 База данных не найдена. Инициализация..."
    python3 database/init_db.py
fi

# Создание папки для логов
mkdir -p logs

# Функция для остановки всех процессов при выходе
cleanup() {
    echo "
🛑 Остановка сервисов..."
    kill $WEB_PID $BOT_PID $ADMIN_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Запуск веб-сервера
echo "🌐 Запуск веб-сервера..."
python3 server.py > logs/web.log 2>&1 &
WEB_PID=$!
echo "✅ Веб-сервер запущен (PID: $WEB_PID)"

# Ждем немного перед запуском ботов
sleep 2

# Запуск основного бота
echo "🤖 Запуск основного бота..."
python3 bot/main.py > logs/bot.log 2>&1 &
BOT_PID=$!
echo "✅ Основной бот запущен (PID: $BOT_PID)"

# Запуск админ бота для отправки гифтов
echo "👑 Запуск админ бота..."
python3 bot/admin_bot.py > logs/admin.log 2>&1 &
ADMIN_PID=$!
echo "✅ Админ бот запущен (PID: $ADMIN_PID)"

echo "
═══════════════════════════════════════
✨ Все сервисы успешно запущены!
═══════════════════════════════════════

📊 Процессы:
  - Веб-сервер: PID $WEB_PID
  - Основной бот: PID $BOT_PID  
  - Админ бот: PID $ADMIN_PID

📁 Логи:
  - logs/web.log
  - logs/bot.log
  - logs/admin.log

🌐 Веб-интерфейс:
  - http://localhost:8080

⚙️  Для остановки нажмите Ctrl+C

═══════════════════════════════════════
"

# Ожидание сигнала остановки
wait
