"""
Запуск сервера, бота и админки одновременно
"""
import asyncio
import sys
import os

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

async def run_server():
    """Запуск веб-сервера"""
    print("🚀 Starting web server...")
    from server import init_app
    from aiohttp import web
    
    app = await init_app()
    
    # Получаем настройки из env
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    print(f"✅ Web server started on http://{host}:{port}")
    
    # Держим сервер запущенным
    while True:
        await asyncio.sleep(3600)

async def run_bot():
    """Запуск основного бота"""
    print("🤖 Starting main bot...")
    from bot.main import dp, bot
    
    # Запускаем поллинг
    await dp.start_polling(bot)

async def run_admin_bot():
    """Запуск админ бота"""
    print("👮 Starting admin bot...")
    from bot.admin_bot import dp, admin_bot
    
    # Запускаем поллинг
    await dp.start_polling(admin_bot)

async def main():
    """Запуск всех процессов параллельно"""
    print("=" * 60)
    print("🎮 Telegram Cases Mini App - Full Stack")
    print("=" * 60)
    
    # Запускаем все три процесса параллельно
    await asyncio.gather(
        run_server(),
        run_bot(),
        run_admin_bot(),
        return_exceptions=True  # Если один упадёт, другие продолжат работать
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
