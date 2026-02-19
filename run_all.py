"""
Запуск сервера, бота и админки одновременно
"""
import asyncio
import sys
import os
import threading

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

def run_bot_sync():
    """Запуск основного бота в отдельном потоке"""
    print("🤖 Starting main bot...")
    try:
        from bot.main import dp, bot
        asyncio.run(dp.start_polling(bot))
    except Exception as e:
        print(f"❌ Main bot error: {e}")

def run_admin_bot_sync():
    """Запуск админ бота в отдельном потоке"""
    print("👮 Starting admin bot...")
    try:
        from bot.admin_bot import dp, admin_bot
        asyncio.run(dp.start_polling(admin_bot))
    except Exception as e:
        print(f"❌ Admin bot error: {e}")

async def main():
    """Запуск всех процессов параллельно"""
    print("=" * 60)
    print("🎮 Telegram Cases Mini App - Full Stack")
    print("=" * 60)
    
    # Импортируем всё здесь
    from server import init_app
    from aiohttp import web
    
    # Получаем настройки из env
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8000))
    
    # Запускаем ботов в отдельных потоках СРАЗУ
    bot_thread = threading.Thread(target=run_bot_sync, daemon=True)
    admin_bot_thread = threading.Thread(target=run_admin_bot_sync, daemon=True)
    
    bot_thread.start()
    admin_bot_thread.start()
    
    # Небольшая пауза чтобы боты успели стартовать
    await asyncio.sleep(2)
    
    # Инициализируем и запускаем веб-сервер
    print("🚀 Starting web server...")
    app = await init_app()
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    print(f"✅ Web server started on http://{host}:{port}")
    print("=" * 60)
    print("🎉 All services started!")
    print("=" * 60)
    
    # Держим приложение запущенным
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        print("\n👋 Shutting down...")
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
