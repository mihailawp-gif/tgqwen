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
    
    # Получаем настройки из env
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    # Инициализируем и запускаем веб-сервер
    print("🚀 Starting web server...")
    app = await init_app()
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    print(f"✅ Web server started on http://{host}:{port}")
    print("=" * 60)
    
    # Создаём задачи для ботов
    async def start_main_bot():
        print("🤖 Starting main bot...")
        try:
            await dp.start_polling(bot)
        except Exception as e:
            print(f"❌ Main bot error: {e}")
    
    async def start_admin_bot():
        print("👮 Starting admin bot...")
        try:
            await admin_dp.start_polling(admin_bot)
        except Exception as e:
            print(f"❌ Admin bot error: {e}")
    
    # Запускаем ботов в фоне
    bot_task = asyncio.create_task(start_main_bot())
    admin_bot_task = asyncio.create_task(start_admin_bot())
    
    print("🎉 All services started!")
    print("=" * 60)
    
    # Держим приложение запущенным
    try:
        # Ждём пока сервер работает
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        print("\n👋 Shutting down...")
        bot_task.cancel()
        admin_bot_task.cancel()
        await runner.cleanup()

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
