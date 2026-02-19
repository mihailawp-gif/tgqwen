"""
Запуск сервера, бота и админки одновременно
"""
import asyncio
import sys
import os

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

async def main():
    """Запуск всех процессов параллельно"""
    print("=" * 60)
    print("🎮 Telegram Cases Mini App - Full Stack")
    print("=" * 60)
    
    # Импортируем всё здесь
    from server import init_app
    from aiohttp import web
    from bot.main import dp, bot
    from bot.admin_bot import dp as admin_dp, admin_bot
    
    # Создаём задачи для ботов
    async def start_main_bot():
        print("🤖 Starting main bot...")
        await dp.start_polling(bot)
    
    async def start_admin_bot():
        print("👮 Starting admin bot...")
        await admin_dp.start_polling(admin_bot)
    
    # Запускаем ботов в фоне
    bot_task = asyncio.create_task(start_main_bot())
    admin_bot_task = asyncio.create_task(start_admin_bot())
    
    # Инициализируем и запускаем веб-сервер
    print("🚀 Starting web server...")
    app = await init_app()
    
    # Получаем настройки из env
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    print(f"✅ Web server started on http://{host}:{port}")
    print("=" * 60)
    print("🎉 All services started successfully!")
    print("=" * 60)
    
    # Ждём завершения всех задач
    await asyncio.gather(bot_task, admin_bot_task, return_exceptions=True)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
