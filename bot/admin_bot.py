import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncio
import os
from aiogram import Bot, Dispatcher
from aiogram.types import Message
from sqlalchemy import select
from dotenv import load_dotenv

from database.models import async_session, Withdrawal, User, CaseOpening, Gift

load_dotenv()

# Инициализация бота для отправки гифтов
admin_bot = Bot(token=os.getenv("ADMIN_BOT_TOKEN"))
dp = Dispatcher()


async def process_withdrawals():
    """Обработка заявок на вывод"""
    while True:
        try:
            async with async_session() as session:
                # Получаем необработанные заявки
                result = await session.execute(
                    select(Withdrawal).where(Withdrawal.status == "pending")
                )
                withdrawals = result.scalars().all()
                
                for withdrawal in withdrawals:
                    try:
                        # Получаем данные
                        opening = await session.get(CaseOpening, withdrawal.opening_id)
                        user = await session.get(User, withdrawal.user_id)
                        gift = await session.get(Gift, opening.gift_id)
                        
                        # Отправляем гифт пользователю
                        # ВАЖНО: Здесь должна быть реальная логика отправки гифта через Telegram API
                        # Для примера просто отправляем сообщение
                        
                        try:
                            await admin_bot.send_message(
                                chat_id=user.telegram_id,
                                text=f"🎁 Поздравляем!\n\n"
                                     f"Вы получили гифт: {gift.name}\n"
                                     f"Редкость: {gift.rarity}\n"
                                     f"Ценность: {gift.value} ⭐\n\n"
                                     f"Гифт был отправлен на ваш аккаунт!"
                            )
                            
                            # Обновляем статус
                            withdrawal.status = "completed"
                            from datetime import datetime
                            withdrawal.completed_at = datetime.utcnow()
                            
                            await session.commit()
                            
                            print(f"✅ Gift sent to user {user.telegram_id}: {gift.name}")
                            
                        except Exception as e:
                            print(f"❌ Error sending gift to {user.telegram_id}: {e}")
                            withdrawal.status = "failed"
                            await session.commit()
                            
                    except Exception as e:
                        print(f"❌ Error processing withdrawal {withdrawal.id}: {e}")
                        continue
                        
        except Exception as e:
            print(f"❌ Error in withdrawal processing: {e}")
        
        # Проверяем каждые 10 секунд
        await asyncio.sleep(10)


async def main():
    """Запуск бота"""
    print("=" * 60)
    print("👑 Telegram Cases Admin Bot - Starting...")
    print("=" * 60)

    # Получаем информацию о боте
    try:
        bot_info = await admin_bot.get_me()
        print(f"✅ Bot: @{bot_info.username}")
        print(f"📝 Name: {bot_info.first_name}")
        print(f"🆔 ID: {bot_info.id}")
    except Exception as e:
        print(f"⚠️  Warning: Could not get bot info: {e}")

    print("=" * 60)
    print("🔄 Processing withdrawals every 10 seconds...")
    print("📤 Ready to send gifts to users")
    print("⚙️  Press Ctrl+C to stop")
    print("=" * 60)

    await process_withdrawals()


def start_bot():
    """Запуск бота (для вызова из run_all.py)"""
    asyncio.run(main())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Admin bot stopped")
