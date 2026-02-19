import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncio
import os
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import (
    Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, PreCheckoutQuery, LabeledPrice
)
from aiogram.enums import ParseMode
from sqlalchemy import select, desc
from dotenv import load_dotenv
import random

from database.models import (
    async_session, User, Case, CaseOpening, 
    Gift, CaseItem, Withdrawal, Payment
)

load_dotenv()

# Инициализация бота
bot = Bot(token=os.getenv("BOT_TOKEN"))
admin_bot = Bot(token=os.getenv("ADMIN_BOT_TOKEN"))
dp = Dispatcher()
router = Router()

WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-domain.com")
ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x]
PAYMENT_TOKEN = os.getenv("PAYMENT_TOKEN")


# === УТИЛИТЫ ===

async def get_or_create_user(telegram_id: int, username: str = None, 
                             first_name: str = None, last_name: str = None):
    """Получить или создать пользователя"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
                last_name=last_name
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
        
        return user


async def check_free_case_available(user: User) -> bool:
    """Проверка доступности бесплатного кейса"""
    if not user.last_free_case:
        return True
    
    time_diff = datetime.utcnow() - user.last_free_case
    return time_diff >= timedelta(hours=24)


async def open_case(user_id: int, case_id: int) -> dict:
    """Открытие кейса и получение награды"""
    async with async_session() as session:
        # Получаем кейс
        case = await session.get(Case, case_id)
        if not case:
            return {"success": False, "error": "Кейс не найден"}
        
        # Получаем пользователя
        user = await session.get(User, user_id)
        if not user:
            return {"success": False, "error": "Пользователь не найден"}
        
        # Проверяем бесплатный кейс
        if case.is_free:
            if not await check_free_case_available(user):
                return {"success": False, "error": "Бесплатный кейс доступен раз в 24 часа"}
            user.last_free_case = datetime.utcnow()
        else:
            # Проверяем баланс
            if user.balance < case.price:
                return {"success": False, "error": "Недостаточно звезд"}
            user.balance -= case.price
        
        # Получаем предметы кейса
        result = await session.execute(
            select(CaseItem).where(CaseItem.case_id == case_id)
        )
        items = result.scalars().all()
        
        if not items:
            return {"success": False, "error": "В кейсе нет предметов"}
        
        # Выбираем случайный предмет с учетом вероятности
        total_chance = sum(item.drop_chance for item in items)
        rand = random.uniform(0, total_chance)
        
        current = 0
        won_item = None
        for item in items:
            current += item.drop_chance
            if rand <= current:
                won_item = item
                break
        
        if not won_item:
            won_item = items[0]
        
        # Получаем информацию о гифте
        gift = await session.get(Gift, won_item.gift_id)
        
        # Создаем запись об открытии
        opening = CaseOpening(
            user_id=user.id,
            case_id=case_id,
            gift_id=gift.id
        )
        session.add(opening)
        await session.commit()
        await session.refresh(opening)
        
        return {
            "success": True,
            "opening_id": opening.id,
            "gift": {
                "id": gift.id,
                "name": gift.name,
                "rarity": gift.rarity,
                "value": gift.value,
                "image_url": gift.image_url
            },
            "balance": user.balance
        }


# === HANDLERS ===

@router.message(Command("start"))
async def cmd_start(message: Message):
    """Стартовое сообщение"""
    user = await get_or_create_user(
        message.from_user.id,
        message.from_user.username,
        message.from_user.first_name,
        message.from_user.last_name
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🎰 Открыть приложение",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )],
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats")]
    ])
    
    await message.answer(
        f"👋 Привет, {message.from_user.first_name}!\n\n"
        f"🎁 Добро пожаловать в мир кейсов!\n\n"
        f"💎 Открывай кейсы и выигрывай крутые гифты!\n"
        f"⭐ Каждый день доступен бесплатный кейс!\n\n"
        f"💰 Твой баланс: {user.balance} звезд",
        reply_markup=keyboard
    )


@router.callback_query(F.data == "balance")
async def show_balance(callback: CallbackQuery):
    """Показать баланс"""
    user = await get_or_create_user(callback.from_user.id)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 Пополнить", callback_data="topup")],
        [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_menu")]
    ])
    
    await callback.message.edit_text(
        f"💰 Ваш баланс: {user.balance} ⭐\n\n"
        f"Пополните баланс для открытия кейсов!",
        reply_markup=keyboard
    )


@router.callback_query(F.data == "topup")
async def topup_menu(callback: CallbackQuery):
    """Меню пополнения"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="50 ⭐", callback_data="pay_50"),
            InlineKeyboardButton(text="100 ⭐", callback_data="pay_100")
        ],
        [
            InlineKeyboardButton(text="250 ⭐", callback_data="pay_250"),
            InlineKeyboardButton(text="500 ⭐", callback_data="pay_500")
        ],
        [InlineKeyboardButton(text="◀️ Назад", callback_data="balance")]
    ])
    
    await callback.message.edit_text(
        "💳 Выберите количество звезд для покупки:",
        reply_markup=keyboard
    )


@router.callback_query(F.data.startswith("pay_"))
async def process_payment(callback: CallbackQuery):
    """Обработка платежа"""
    amount = int(callback.data.split("_")[1])
    
    # Создаем инвойс
    prices = [LabeledPrice(label=f"{amount} звезд", amount=amount)]
    
    await bot.send_invoice(
        chat_id=callback.from_user.id,
        title=f"Пополнение баланса на {amount} звезд",
        description=f"Покупка {amount} звезд для открытия кейсов",
        payload=f"stars_{amount}",
        provider_token="",  # Для Telegram Stars не нужен
        currency="XTR",  # Telegram Stars
        prices=prices
    )
    
    await callback.answer("💳 Счет отправлен!")


@router.pre_checkout_query()
async def process_pre_checkout(pre_checkout_query: PreCheckoutQuery):
    """Подтверждение платежа"""
    await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)


@router.message(F.successful_payment)
async def process_successful_payment(message: Message):
    """Обработка успешного платежа"""
    amount = message.successful_payment.total_amount
    
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == message.from_user.id)
        )
        user = result.scalar_one()
        user.balance += amount
        
        payment = Payment(
            user_id=user.id,
            amount=amount,
            status="completed",
            telegram_payment_id=message.successful_payment.telegram_payment_charge_id
        )
        session.add(payment)
        await session.commit()

    # Уведомление всем админам
    name = message.from_user.first_name or 'Пользователь'
    uname = f' (@{message.from_user.username})' if message.from_user.username else ''
    user_link = f'<a href="tg://user?id={message.from_user.id}">{name}</a>{uname}'
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(
                admin_id,
                f'💳 <b>Пополнение баланса</b>\n'
                f'👤 {user_link}\n'
                f'⭐ +{amount} звёзд\n'
                f'💰 Новый баланс: {user.balance} ⭐',
                parse_mode='HTML'
            )
        except Exception:
            pass

    await message.answer(
        f"✅ Платеж успешно обработан!\n"
        f"💰 Начислено: {amount} ⭐\n"
        f"💎 Новый баланс: {user.balance} ⭐"
    )


@router.callback_query(F.data == "stats")
async def show_stats(callback: CallbackQuery):
    """Показать статистику"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == callback.from_user.id)
        )
        user = result.scalar_one()
        
        # Количество открытий
        openings_result = await session.execute(
            select(CaseOpening).where(CaseOpening.user_id == user.id)
        )
        openings_count = len(openings_result.scalars().all())
        
        # Количество выводов
        withdrawals_result = await session.execute(
            select(Withdrawal).where(
                Withdrawal.user_id == user.id,
                Withdrawal.status == "completed"
            )
        )
        withdrawals_count = len(withdrawals_result.scalars().all())
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_menu")]
    ])
    
    await callback.message.edit_text(
        f"📊 Ваша статистика:\n\n"
        f"🎁 Открыто кейсов: {openings_count}\n"
        f"✅ Выведено призов: {withdrawals_count}\n"
        f"💰 Баланс: {user.balance} ⭐",
        reply_markup=keyboard
    )


@router.callback_query(F.data == "back_to_menu")
async def back_to_menu(callback: CallbackQuery):
    """Возврат в главное меню"""
    user = await get_or_create_user(callback.from_user.id)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🎰 Открыть приложение",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )],
        [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats")]
    ])
    
    await callback.message.edit_text(
        f"👋 Привет, {callback.from_user.first_name}!\n\n"
        f"🎁 Добро пожаловать в мир кейсов!\n\n"
        f"💎 Открывай кейсы и выигрывай крутые гифты!\n"
        f"⭐ Каждый день доступен бесплатный кейс!\n\n"
        f"💰 Твой баланс: {user.balance} звезд",
        reply_markup=keyboard
    )


# === ADMIN КОМАНДЫ ===

@router.message(Command("admin"))
async def admin_panel(message: Message):
    """Админ панель"""
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("❌ У вас нет доступа к админ-панели")
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
        [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin_users")],
        [InlineKeyboardButton(text="💸 Выводы", callback_data="admin_withdrawals")]
    ])
    
    await message.answer(
        "⚙️ Админ-панель\n\nВыберите действие:",
        reply_markup=keyboard
    )


@router.callback_query(F.data == "admin_stats")
async def admin_stats(callback: CallbackQuery):
    """Статистика для админа"""
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer("❌ Доступ запрещен", show_alert=True)
        return
    
    async with async_session() as session:
        users_count = len((await session.execute(select(User))).scalars().all())
        openings_count = len((await session.execute(select(CaseOpening))).scalars().all())
        
        payments_result = await session.execute(
            select(Payment).where(Payment.status == "completed")
        )
        total_revenue = sum(p.amount for p in payments_result.scalars().all())
    
    await callback.message.edit_text(
        f"📊 Статистика платформы:\n\n"
        f"👥 Пользователей: {users_count}\n"
        f"🎁 Открытий кейсов: {openings_count}\n"
        f"💰 Общий доход: {total_revenue} ⭐"
    )




@router.message(Command("resetfreecase"))
async def reset_free_case(message: Message):
    """Сброс таймера бесплатного кейса (только для админов)"""
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("❌ У вас нет доступа к этой команде")
        return

    args = message.text.split()
    if len(args) > 1:
        try:
            target_telegram_id = int(args[1])
        except ValueError:
            await message.answer("❌ Неверный формат ID\nИспользование: /resetfreecase [telegram_id]")
            return
    else:
        target_telegram_id = message.from_user.id

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == target_telegram_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            await message.answer(f"❌ Пользователь с ID <code>{target_telegram_id}</code> не найден", parse_mode="HTML")
            return
        user.last_free_case = None
        user.free_case_available = True
        await session.commit()

    if target_telegram_id == message.from_user.id:
        await message.answer("✅ Твой таймер бесплатного кейса сброшен")
    else:
        await message.answer(
            f"✅ Таймер сброшен\n🆔 <code>{target_telegram_id}</code> · {user.first_name or '—'} (@{user.username or '—'})",
            parse_mode="HTML"
        )



@router.message(Command("setstars"))
async def set_stars(message: Message):
    """Выдача звёзд (только для админов)"""
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("❌ У вас нет доступа к этой команде")
        return

    args = message.text.split()
    if len(args) < 3:
        await message.answer("❌ Использование: /setstars <telegram_id> <количество>")
        return

    try:
        target_telegram_id = int(args[1])
        amount = int(args[2])
    except ValueError:
        await message.answer("❌ ID и количество должны быть числами")
        return

    if amount == 0:
        await message.answer("❌ Количество не может быть 0")
        return

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == target_telegram_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            await message.answer(f"❌ Пользователь <code>{target_telegram_id}</code> не найден", parse_mode="HTML")
            return
        old_balance = user.balance
        user.balance += amount
        await session.commit()

    sign = "+" if amount > 0 else ""
    await message.answer(
        f"✅ Баланс обновлён\n\n"
        f"👤 {user.first_name or '—'} (@{user.username or '—'})\n"
        f"🆔 <code>{target_telegram_id}</code>\n"
        f"💫 {sign}{amount} ⭐\n"
        f"💰 {old_balance} → {user.balance} ⭐",
        parse_mode="HTML"
    )

# === ЗАПУСК ===

async def main():
    print("=" * 60)
    print("🤖 Telegram Cases Bot - Starting...")
    print("=" * 60)
    
    dp.include_router(router)
    
    # Получаем информацию о боте
    bot_info = await bot.get_me()
    print(f"✅ Bot: @{bot_info.username}")
    print(f"📝 Name: {bot_info.first_name}")
    print(f"🆔 ID: {bot_info.id}")
    print("=" * 60)
    print("📱 Ready to receive commands!")
    print("⚙️  Press Ctrl+C to stop")
    print("=" * 60)

    await dp.start_polling(bot)


def start_bot():
    """Запуск бота (для вызова из run_all.py)"""
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
