"""
Запуск сервера, бота и админки одновременно
"""
import asyncio
import sys
import os
import threading
import time

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

def run_bot_sync():
    """Запуск основного бота в отдельном потоке"""
    print("🤖 Starting main bot in thread...")
    try:
        import bot.main as bot_module
        print("🤖 Bot module imported, starting polling...")
        bot_module.start_bot()
    except Exception as e:
        print(f"❌ Main bot error: {e}")
        import traceback
        traceback.print_exc()

def run_admin_bot_sync():
    """Запуск админ бота в отдельном потоке"""
    print("👮 Starting admin bot in thread...")
    try:
        import bot.admin_bot as admin_bot_module
        print("👮 Admin bot module imported, starting polling...")
        admin_bot_module.start_bot()
    except Exception as e:
        print(f"❌ Admin bot error: {e}")
        import traceback
        traceback.print_exc()

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
    print("📦 Launching bot threads...")
    bot_thread = threading.Thread(target=run_bot_sync, daemon=True)
    admin_bot_thread = threading.Thread(target=run_admin_bot_sync, daemon=True)
    
    bot_thread.start()
    admin_bot_thread.start()
    
    # Даём время ботам на старт
    time.sleep(3)
    
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
