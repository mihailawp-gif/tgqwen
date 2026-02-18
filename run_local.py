#!/usr/bin/env python3
"""
Упрощенный запуск всех сервисов в одном процессе
Используйте для локального тестирования
"""
import asyncio
import os
import sys
from pathlib import Path

# Проверка .env
if not Path(".env").exists():
    print("❌ ERROR: .env file not found!")
    print("📝 Please copy .env.example to .env and fill in your settings")
    sys.exit(1)

# Проверка БД
if not Path("database/cases.db").exists():
    print("📊 Database not found. Initializing...")
    os.system("python database/init_db.py")

print("\n" + "=" * 60)
print("🚀 Starting Telegram Cases Mini App")
print("=" * 60)
print("\n⚠️  IMPORTANT: Make sure ngrok is running!")
print("   Run in another terminal: ngrok http 8080")
print("=" * 60 + "\n")

# Импорты
try:
    from dotenv import load_dotenv
    load_dotenv()
    
    from server import init_app as init_server
    from bot.main import main as bot_main
    from bot.admin_bot import process_withdrawals
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("📦 Please install dependencies: pip install -r requirements.txt")
    sys.exit(1)

async def run_all():
    """Запуск всех сервисов параллельно"""
    
    # Создаем задачи
    tasks = []
    
    # 1. Веб-сервер
    async def run_server():
        try:
            await init_server()
        except Exception as e:
            print(f"❌ Server error: {e}")
    
    # 2. Основной бот
    async def run_bot():
        try:
            import bot.main as bot_module
            dp = bot_module.dp
            dp.include_router(bot_module.router)
            
            bot_info = await bot_module.bot.get_me()
            print(f"\n✅ Main Bot: @{bot_info.username}")
            
            await dp.start_polling(bot_module.bot)
        except Exception as e:
            print(f"❌ Main bot error: {e}")
    
    # 3. Админ бот
    async def run_admin_bot():
        try:
            import bot.admin_bot as admin_module
            bot_info = await admin_module.admin_bot.get_me()
            print(f"✅ Admin Bot: @{bot_info.username}\n")
            
            print("=" * 60)
            print("✨ All services started successfully!")
            print("=" * 60)
            print("\n📱 Open your Telegram bot and test the Mini App!")
            print("⚙️  Press Ctrl+C to stop all services\n")
            
            await process_withdrawals()
        except Exception as e:
            print(f"❌ Admin bot error: {e}")
    
    # Запускаем все параллельно
    await asyncio.gather(
        run_server(),
        run_bot(),
        run_admin_bot(),
        return_exceptions=True
    )

if __name__ == "__main__":
    try:
        asyncio.run(run_all())
    except KeyboardInterrupt:
        print("\n\n🛑 Shutting down all services...")
        print("✅ Stopped successfully!")
