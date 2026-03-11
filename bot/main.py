import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import math
import asyncio
import os
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from sqlalchemy import or_
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import (
    Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, PreCheckoutQuery, LabeledPrice 
)
from aiogram.enums import ParseMode
from sqlalchemy import select, desc, func
from dotenv import load_dotenv
import random

from database.models import (
    async_session, User, Case, CaseOpening, 
    Gift, CaseItem, Withdrawal, Payment, ReferralEarning
)

load_dotenv()
class AdminState(StatesGroup):
    waiting_for_user_search = State()
    waiting_for_broadcast = State()
    waiting_for_add_balance = State()
    waiting_for_mass_bonus = State()
    promo_code = State()
    promo_type = State()
    promo_value = State()
    promo_limit = State()
# Инициализация бота
bot = Bot(token=os.getenv("BOT_TOKEN"))
admin_bot = Bot(token=os.getenv("ADMIN_BOT_TOKEN"))
dp = Dispatcher()
router = Router()

WEBAPP_URL = os.getenv("WEBAPP_URL", "https://tgqwen.onrender.com/")
ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x]
PAYMENT_TOKEN = os.getenv("PAYMENT_TOKEN")


# === УТИЛИТЫ ===

async def get_or_create_user(telegram_id: int, username: str = None,
                             first_name: str = None, last_name: str = None,
                             photo_url: str = None, referrer_code: str = None):
    """Получить или создать пользователя"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(User).where(User.telegram_id == telegram_id)
            )
            user = result.scalar_one_or_none()

            if not user:
                # Создаём нового пользователя
                user = User(
                    telegram_id=telegram_id,
                    username=username,
                    first_name=first_name,
                    last_name=last_name,
                    photo_url=photo_url,
                    balance=0  # Баланс 0 при регистрации
                )
                
                # Если есть реферальный код — находим реферера
                if referrer_code:
                    referrer_result = await session.execute(
                        select(User).where(User.referral_code == referrer_code)
                    )
                    referrer = referrer_result.scalar_one_or_none()
                    if referrer and referrer.telegram_id != telegram_id:
                        user.referrer_id = referrer.id
                
                session.add(user)
                await session.commit()
                await session.refresh(user)
                print(f"✅ Новый пользователь создан: {telegram_id} ({first_name})")
            else:
                # Обновляем данные если изменились
                updated = False
                if username and user.username != username:
                    user.username = username
                    updated = True
                if first_name and user.first_name != first_name:
                    user.first_name = first_name
                    updated = True
                if last_name and user.last_name != last_name:
                    user.last_name = last_name
                    updated = True
                if photo_url and user.photo_url != photo_url:
                    user.photo_url = photo_url
                    updated = True
                if updated:
                    await session.commit()
                    print(f"🔄 Данные пользователя обновлены: {telegram_id}")

            return user
    except Exception as e:
        print(f"❌ Ошибка в get_or_create_user: {e}")
        import traceback
        traceback.print_exc()
        return None


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
@router.callback_query(F.data.startswith("wd_appr_"))
async def approve_withdrawal(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return
    wd_id = int(callback.data.split("_")[2])
    
    async with async_session() as session:
        wd = await session.get(Withdrawal, wd_id)
        if not wd or wd.status != 'pending':
            return await callback.message.edit_text(callback.message.html_text + "\n\n⚠️ <i>Заявка уже была обработана</i>", parse_mode="HTML")
            
        wd.status = 'completed'
        wd.completed_at = datetime.utcnow()
        
        # Помечаем сам предмет как выведенный (чтобы он пропал из инвентаря)
        opening = await session.get(CaseOpening, wd.opening_id)
        if opening:
            opening.is_withdrawn = True
            
        await session.commit()
        
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➡️ К списку заявок", callback_data="admin_pending_wd_1")],
        [InlineKeyboardButton(text="🏠 В меню", callback_data="admin_back")]
    ])
    await callback.message.edit_text(f"✅ <b>Заявка #{wd_id} успешно ОДОБРЕНА!</b>\nПредмет исчез из инвентаря игрока.", parse_mode="HTML", reply_markup=kb)

@router.callback_query(F.data.startswith("wd_rej_"))
async def reject_withdrawal(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return
    wd_id = int(callback.data.split("_")[2])
    
    async with async_session() as session:
        wd = await session.get(Withdrawal, wd_id)
        if not wd or wd.status != 'pending':
            return await callback.message.edit_text(callback.message.html_text + "\n\n⚠️ <i>Заявка уже была обработана</i>", parse_mode="HTML")
            
        wd.status = 'rejected'
        wd.completed_at = datetime.utcnow()
        await session.commit()
        
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➡️ К списку заявок", callback_data="admin_pending_wd_1")],
        [InlineKeyboardButton(text="🏠 В меню", callback_data="admin_back")]
    ])
    await callback.message.edit_text(f"❌ <b>Заявка #{wd_id} ОТКЛОНЕНА!</b>\nИгрок увидит статус 'Отклонено' в инвентаре.", parse_mode="HTML", reply_markup=kb)
@router.message(Command("start"))
async def cmd_start(message: Message):
    """Стартовое сообщение"""
    try:
        # Получаем реферальный код из аргумента команды /start CODE
        referrer_code = message.text.split()[1] if len(message.text.split()) > 1 else None
        
        # Получаем фото профиля
        photo_url = None
        try:
            if message.from_user.photo:
                # Получаем фото наибольшего размера
                photos = await message.bot.get_user_profile_photos(message.from_user.id)
                if photos and photos.photos:
                    photo_file = await message.bot.get_file(photos.photos[-1][-1].file_id)
                    photo_url = f"https://api.telegram.org/file/bot{os.getenv('BOT_TOKEN')}/{photo_file.file_path}"
        except Exception as e:
            print(f"⚠️ Не удалось получить фото: {e}")
        
        user = await get_or_create_user(
            message.from_user.id,
            message.from_user.username,
            message.from_user.first_name,
            message.from_user.last_name,
            photo_url,
            referrer_code
        )
        
        # Если пользователь не создался — всё равно отвечаем
        balance = user.balance if user else 0
        name = message.from_user.first_name or "Пользователь"

        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="🎰 Открыть приложение",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )],
            [InlineKeyboardButton(text="💰 Баланс", callback_data="balance")],
            [InlineKeyboardButton(text="📊 Статистика", callback_data="stats")]
        ])

        await message.answer(
            f"👋 Привет, {name}!\n\n"
            f"Открывай кейсы и выигрывай крутые гифты! Открывай бесплатный кейс раз в 24 часа!\n",
            reply_markup=keyboard
        )
        
        if user:
            print(f"✅ /start отработан для пользователя {message.from_user.id}")
        else:
            print(f"⚠️ /start отработан для пользователя {message.from_user.id} (гость)")
            
    except Exception as e:
        print(f"❌ Ошибка в cmd_start: {e}")
        import traceback
        traceback.print_exc()
        # Всё равно отвечаем пользователю
        try:
            await message.answer(
                "👋 Привет! Добро пожаловать в мир кейсов!\n\n"
                "🎰 Нажми кнопку ниже чтобы открыть приложение:",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(
                        text="🎰 Открыть приложение",
                        web_app=WebAppInfo(url=WEBAPP_URL)
                    )]
                ])
            )
        except:
            pass


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
    """Обработка успешного платежа (с учетом промокодов)"""
    payload = message.successful_payment.invoice_payload
    # payload выглядит как "pay_123"
    payment_id = int(payload.split('_')[1]) if payload.startswith('pay_') else None
    amount = message.successful_payment.total_amount
    
    async with async_session() as session:
        result = await session.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalar_one()
        
        # Находим наш подготовленный платеж
        payment = await session.get(Payment, payment_id) if payment_id else None
        
        bonus = 0
        if payment:
            payment.status = "completed"
            payment.telegram_payment_id = message.successful_payment.telegram_payment_charge_id
            bonus = payment.bonus_amount
            
            # Фиксируем использование промокода
            if payment.promo_id:
                promo = await session.get(PromoCode, payment.promo_id)
                if promo:
                    promo.uses_count += 1
                    session.add(PromoCodeUsage(user_id=user.id, promo_id=promo.id))
        
        # Начисляем основу + бонус от промокода
        total_add = amount + bonus
        user.balance += total_add
        
        # Реферальная система
        if user.referrer_id:
            referrer = await session.get(User, user.referrer_id)
            if referrer:
                bonus_stars = int(amount * 0.05) # 5% от чистого депа (без учета промо-бонуса)
                if bonus_stars > 0:
                    referrer.balance += bonus_stars
                    session.add(ReferralEarning(referrer_id=referrer.id, referred_user_id=user.id, amount=bonus_stars, source='deposit_bonus'))
                    try:
                        await bot.send_message(chat_id=referrer.telegram_id, text=f"🎁 <b> Вы получили реферальную награду!</b>\nВам начислено: <b>{bonus_stars} ⭐</b>", parse_mode="HTML")
                    except Exception: pass 
                    
        await session.commit()

    # Уведомление юзеру
    text = f"✅ Платеж успешно обработан!\n💰 Начислено: {amount} ⭐"
    if bonus > 0:
        text += f"\n🎁 Бонус по промокоду: +{bonus} ⭐"
    text += f"\n💎 Новый баланс: {user.balance} ⭐"
    await message.answer(text)


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

# @router.message(Command("admin"))
# async def admin_panel(message: Message):
#     """Админ панель"""
#     if message.from_user.id not in ADMIN_IDS:
#         await message.answer("❌ У вас нет доступа к админ-панели")
#         return
    
#     keyboard = InlineKeyboardMarkup(inline_keyboard=[
#         [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
#         [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin_users")],
#         [InlineKeyboardButton(text="💸 Выводы", callback_data="admin_withdrawals")]
#     ])
    
#     await message.answer(
#         "⚙️ Админ-панель\n\nВыберите действие:",
#         reply_markup=keyboard
#     )


# @router.callback_query(F.data == "admin_stats")
# async def admin_stats(callback: CallbackQuery):
#     """Статистика для админа"""
#     if callback.from_user.id not in ADMIN_IDS:
#         await callback.answer("❌ Доступ запрещен", show_alert=True)
#         return
    
#     async with async_session() as session:
#         users_count = len((await session.execute(select(User))).scalars().all())
#         openings_count = len((await session.execute(select(CaseOpening))).scalars().all())
        
#         payments_result = await session.execute(
#             select(Payment).where(Payment.status == "completed")
#         )
#         total_revenue = sum(p.amount for p in payments_result.scalars().all())
    
#     await callback.message.edit_text(
#         f"📊 Статистика платформы:\n\n"
#         f"👥 Пользователей: {users_count}\n"
#         f"🎁 Открытий кейсов: {openings_count}\n"
#         f"💰 Общий доход: {total_revenue} ⭐"
#     )

# === ADMIN КОМАНДЫ (ПОЛНАЯ АДМИНКА) ===
def get_admin_keyboard():
    """Генератор главной клавиатуры админа"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Статистика", callback_data="admin_stats")],
        [
            InlineKeyboardButton(text="🔍 Найти юзера", callback_data="admin_search_user"),
            InlineKeyboardButton(text="👥 Все юзеры", callback_data="admin_users_list_1")
        ],
        [
            InlineKeyboardButton(text="📢 Рассылка", callback_data="admin_broadcast_start"),
            InlineKeyboardButton(text="💸 Бонус ВСЕМ", callback_data="admin_mass_bonus")
        ],
        [
            InlineKeyboardButton(text="📤 Новые выводы", callback_data="admin_pending_wd_1"),
            InlineKeyboardButton(text="🗄 История выводов", callback_data="admin_history_wd_1")
        ],
        [InlineKeyboardButton(text="🎟 Промокоды", callback_data="admin_promos")], 
        [InlineKeyboardButton(text="🔄 Сбросить мой Free Кейс", callback_data="admin_reset_my_free")]
    ])

@router.callback_query(F.data == "admin_promos")
async def admin_promos_menu(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return 
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ Создать промокод", callback_data="promo_create")],
        [InlineKeyboardButton(text="📋 Активные промокоды", callback_data="promo_list")],
        [InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")]
    ])
    await callback.message.edit_text("🎟 <b>Управление промокодами</b>", reply_markup=kb, parse_mode="HTML")

@router.callback_query(F.data == "promo_create")
async def promo_create_step1(callback: CallbackQuery, state: FSMContext):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💰 На баланс (+ Звезды)", callback_data="promo_type_balance")],
        [InlineKeyboardButton(text="💳 На депозит (+ % к пополнению)", callback_data="promo_type_deposit")],
        [InlineKeyboardButton(text="◀️ Отмена", callback_data="admin_promos")]
    ])
    await callback.message.edit_text("Выберите тип промокода:", reply_markup=kb)

@router.callback_query(F.data.startswith("promo_type_"))
async def promo_create_step2(callback: CallbackQuery, state: FSMContext):
    p_type = callback.data.split("_")[2]
    await state.update_data(promo_type=p_type)
    await state.set_state(AdminState.promo_code)
    await callback.message.edit_text("Введите текст промокода (Например: SUMMER2026):")

@router.message(AdminState.promo_code)
async def promo_create_step3(message: Message, state: FSMContext):
    await state.update_data(promo_code=message.text.strip().upper())
    await state.set_state(AdminState.promo_value)
    
    data = await state.get_data()
    msg = "Введите сумму звезд:" if data['promo_type'] == 'balance' else "Введите процент бонуса (например 50 для +50%):"
    await message.answer(msg)

@router.message(AdminState.promo_value)
async def promo_create_step4(message: Message, state: FSMContext):
    try:
        val = int(message.text.strip())
        await state.update_data(promo_value=val)
        await state.set_state(AdminState.promo_limit)
        await message.answer("Введите лимит активаций (введите 0, если промокод бесконечный):")
    except ValueError:
        await message.answer("Пожалуйста, введите число.")

@router.message(AdminState.promo_limit)
async def promo_create_finish(message: Message, state: FSMContext):
    try:
        limit = int(message.text.strip())
        data = await state.get_data()
        
        async with async_session() as session:
            promo = PromoCode(
                code=data['promo_code'],
                promo_type=data['promo_type'],
                value=data['promo_value'],
                uses_limit=limit
            )
            session.add(promo)
            await session.commit()
            
        await state.clear()
        
        t_str = "На Баланс" if data['promo_type'] == 'balance' else "На Депозит"
        v_str = f"{data['promo_value']} ⭐" if data['promo_type'] == 'balance' else f"+{data['promo_value']}%"
        l_str = "Бесконечный" if limit == 0 else str(limit)
        
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="admin_promos")]])
        await message.answer(f"✅ <b>Промокод создан!</b>\n\nКод: <code>{data['promo_code']}</code>\nТип: {t_str}\nБонус: {v_str}\nЛимит: {l_str}", parse_mode="HTML", reply_markup=kb)
    except Exception as e:
        await message.answer(f"Ошибка: {e}")
        await state.clear()

@router.callback_query(F.data == "promo_list")
async def promo_list(callback: CallbackQuery):
    async with async_session() as session:
        promos = (await session.execute(select(PromoCode).where(PromoCode.is_active == True).order_by(desc(PromoCode.created_at)).limit(10))).scalars().all()
    
    if not promos:
        return await callback.message.edit_text("Нет активных промокодов.", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="admin_promos")]]))
        
    text = "📋 <b>Активные промокоды (Последние 10):</b>\n\n"
    for p in promos:
        l_str = f"{p.uses_count}/{p.uses_limit}" if p.uses_limit > 0 else f"{p.uses_count}/∞"
        v_str = f"{p.value}⭐" if p.promo_type == 'balance' else f"+{p.value}%"
        text += f"▪️ <code>{p.code}</code> ({v_str}) | Активаций: {l_str}\n"
        
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Назад", callback_data="admin_promos")]])
    await callback.message.edit_text(text, parse_mode="HTML", reply_markup=kb)
@router.callback_query(F.data.startswith("admin_pending_wd_"))
async def show_pending_withdrawals(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return
    
    page = int(callback.data.split("_")[3])
    
    async with async_session() as session:
        # Считаем сколько всего нерассмотренных заявок
        total = await session.scalar(select(func.count(Withdrawal.id)).where(Withdrawal.status == 'pending'))
        
        if total == 0:
            kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")]])
            return await callback.message.edit_text("🎉 <b>Активных заявок нет!</b>\nВсе выводы обработаны.", parse_mode="HTML", reply_markup=kb)
            
        if page > total: page = total
        if page < 1: page = 1
        
        # Получаем 1 конкретную заявку для текущей страницы
        withdrawals = (await session.execute(
            select(Withdrawal)
            .where(Withdrawal.status == 'pending')
            .order_by(Withdrawal.created_at)
            .limit(1)
            .offset(page - 1)
        )).scalars().all()
        
        if not withdrawals:
            return await callback.answer("Ошибка загрузки", show_alert=True)
            
        wd = withdrawals[0]
        user = await session.get(User, wd.user_id)
        opening = await session.get(CaseOpening, wd.opening_id)
        gift = await session.get(Gift, opening.gift_id) if opening else None
        
        gift_name = gift.name if gift else "Неизвестно"
        gift_val = gift.value if gift else 0
        uname = f"@{user.username}" if user.username else user.first_name
        user_link = f"<a href='tg://user?id={user.telegram_id}'>{uname}</a>"
        
        text = (
            f"📤 <b>ЗАЯВКА НА ВЫВОД #{wd.id}</b>\n\n"
            f"🎁 Предмет: <b>{gift_name}</b>\n"
            f"💰 Ценность: {gift_val} ⭐\n"
            f"👤 Игрок: {user_link} (ID: <code>{user.telegram_id}</code>)\n"
            f"🕒 Создана: {wd.created_at.strftime('%d.%m.%Y %H:%M')}\n\n"
            f"<i>Заявка {page} из {total}</i>"
        )
        
        kb = [
            [
                InlineKeyboardButton(text="✅ Подтвердить", callback_data=f"wd_appr_{wd.id}"),
                InlineKeyboardButton(text="❌ Отклонить", callback_data=f"wd_rej_{wd.id}")
            ]
        ]
        
        # Кнопки навигации
        nav = []
        if page > 1:
            nav.append(InlineKeyboardButton(text="⬅️ Пред.", callback_data=f"admin_pending_wd_{page-1}"))
        if page < total:
            nav.append(InlineKeyboardButton(text="След. ➡️", callback_data=f"admin_pending_wd_{page+1}"))
            
        if nav: kb.append(nav)
        kb.append([InlineKeyboardButton(text="🏠 В меню", callback_data="admin_back")])
        
        await callback.message.edit_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))
@router.callback_query(F.data.startswith("admin_history_wd_"))
async def show_history_withdrawals(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return
    
    page = int(callback.data.split("_")[3])
    limit = 10 # Показываем по 10 штук на странице
    
    async with async_session() as session:
        # Ищем все, кроме 'pending' (то есть completed и rejected)
        total = await session.scalar(select(func.count(Withdrawal.id)).where(Withdrawal.status != 'pending'))
        
        if total == 0:
            kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")]])
            return await callback.message.edit_text("🗄 <b>История пуста.</b>\nВы еще не обработали ни одной заявки.", parse_mode="HTML", reply_markup=kb)
            
        total_pages = math.ceil(total / limit)
        if page > total_pages: page = total_pages
        if page < 1: page = 1
        
        withdrawals = (await session.execute(
            select(Withdrawal)
            .where(Withdrawal.status != 'pending')
            .order_by(desc(Withdrawal.completed_at))
            .limit(limit)
            .offset((page - 1) * limit)
        )).scalars().all()
        
        text = f"🗄 <b>История обработанных заявок</b>\n<i>Страница {page} из {total_pages}</i>\n\n"
        
        for wd in withdrawals:
            status_icon = "✅" if wd.status == 'completed' else "❌"
            user = await session.get(User, wd.user_id)
            uname = f"@{user.username}" if user and user.username else f"ID: {wd.user_id}"
            date_str = wd.completed_at.strftime('%d.%m %H:%M') if wd.completed_at else '—'
            
            text += f"{status_icon} <b>#{wd.id}</b> | {uname} | {date_str}\n"
            
        kb = []
        nav = []
        if page > 1:
            nav.append(InlineKeyboardButton(text="⬅️", callback_data=f"admin_history_wd_{page-1}"))
        nav.append(InlineKeyboardButton(text=f"{page}/{total_pages}", callback_data="ignore"))
        if page < total_pages:
            nav.append(InlineKeyboardButton(text="➡️", callback_data=f"admin_history_wd_{page+1}"))
            
        if nav: kb.append(nav)
        kb.append([InlineKeyboardButton(text="🏠 В меню", callback_data="admin_back")])
        
        await callback.message.edit_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))
@router.message(Command("admin"))
async def admin_panel(message: Message, state: FSMContext):
    if message.from_user.id not in ADMIN_IDS:
        return
    await state.clear()
    await message.answer("👑 <b>Панель администратора</b>\n\nВыбери действие:", reply_markup=get_admin_keyboard(), parse_mode="HTML")

# --- ИСПРАВЛЕННАЯ КНОПКА НАЗАД ---
@router.callback_query(F.data == "admin_back")
async def admin_back(callback: CallbackQuery, state: FSMContext):
    if callback.from_user.id not in ADMIN_IDS:
        return
    await state.clear()
    await callback.message.edit_text("👑 <b>Панель администратора</b>\n\nВыбери действие:", reply_markup=get_admin_keyboard(), parse_mode="HTML")

# --- ПОСТРАНИЧНЫЙ СПИСОК ПОЛЬЗОВАТЕЛЕЙ ---
@router.callback_query(F.data.startswith("admin_users_list_"))
async def admin_users_list(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS:
        return
        
    page = int(callback.data.split("_")[3])
    limit = 10
    offset = (page - 1) * limit
    
    async with async_session() as session:
        # Считаем всего юзеров для пагинации
        total_users = await session.scalar(select(func.count(User.id)))
        total_pages = math.ceil(total_users / limit) if total_users > 0 else 1
        
        if page > total_pages: page = total_pages
        if page < 1: page = 1
        
        # Получаем юзеров для текущей страницы
        users_result = await session.execute(
            select(User).order_by(desc(User.created_at)).limit(limit).offset((page - 1) * limit)
        )
        users = users_result.scalars().all()
        
    kb = []
    # Генерируем кнопки для каждого юзера
    for u in users:
        name = u.first_name or "Без имени"
        uname = f"(@{u.username})" if u.username else ""
        kb.append([InlineKeyboardButton(text=f"👤 {name} {uname}", callback_data=f"admin_user_info_{u.telegram_id}")])
        
    # Кнопки пагинации
    nav = []
    if page > 1:
        nav.append(InlineKeyboardButton(text="⬅️", callback_data=f"admin_users_list_{page-1}"))
    nav.append(InlineKeyboardButton(text=f"{page}/{total_pages}", callback_data="ignore"))
    if page < total_pages:
        nav.append(InlineKeyboardButton(text="➡️", callback_data=f"admin_users_list_{page+1}"))
        
    if nav: kb.append(nav)
    kb.append([InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")])
    
    await callback.message.edit_text(f"👥 <b>База пользователей</b> (Всего: {total_users} чел.)\nСтраница {page} из {total_pages}", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")

# --- ПОЛНОЕ ДОСЬЕ ПОЛЬЗОВАТЕЛЯ (ФАРШ) ---
@router.callback_query(F.data.startswith("admin_user_info_"))
async def admin_user_info(callback: CallbackQuery, state: FSMContext):
    if callback.from_user.id not in ADMIN_IDS:
        return
        
    tg_id = int(callback.data.split("_")[3])
    
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
        if not user:
            return await callback.answer("Юзер не найден!", show_alert=True)
            
        # 1. Открыто кейсов
        openings_count = await session.scalar(select(func.count(CaseOpening.id)).where(CaseOpening.user_id == user.id))
        
        # 2. Сумма депозитов
        total_dep = await session.scalar(select(func.sum(Payment.amount)).where(Payment.user_id == user.id, Payment.status == 'completed')) or 0
        
        # 3. Выводы
        withdrawals_count = await session.scalar(select(func.count(Withdrawal.id)).where(Withdrawal.user_id == user.id))
        
        # 4. Анализ инвентаря
        inv_result = await session.execute(
            select(CaseOpening, Gift)
            .join(Gift, CaseOpening.gift_id == Gift.id)
            .where(CaseOpening.user_id == user.id, CaseOpening.is_sold == False, CaseOpening.is_withdrawn == False)
        )
        inventory = inv_result.all() # Список кортежей (CaseOpening, Gift)
        inv_count = len(inventory)
        inv_value = sum(g.value for o, g in inventory if g.value)
        
    # Сохраняем в стейт, чтобы можно было выдать баланс
    await state.update_data(target_user_id=user.telegram_id)
    
    # Формируем текст инвентаря
    inv_text = f"Предметов: <b>{inv_count}</b> (Ценность: {inv_value} ⭐)"
    if inv_count > 0:
        # Берем топ-3 самых дорогих предмета из инвентаря
        top_items = sorted([g for o, g in inventory], key=lambda x: x.value or 0, reverse=True)[:3]
        top_names = ", ".join(f"{g.name}" for g in top_items)
        inv_text += f"\n└ <i>Топ дроп: {top_names}</i>"
        
    date_reg = user.created_at.strftime('%d.%m.%Y') if user.created_at else 'Неизвестно'

    text = (
        f"👑 <b>ПОЛНОЕ ДОСЬЕ ИГРОКА</b>\n\n"
        f"├ <b>Внутренний ID:</b> <code>{user.id}</code>\n"
        f"├ <b>Telegram ID:</b> <code>{user.telegram_id}</code>\n"
        f"├ <b>Имя:</b> {user.first_name} {user.last_name or ''}\n"
        f"├ <b>Юзернейм:</b> @{user.username or '—'}\n"
        f"└ <b>Регистрация:</b> {date_reg}\n\n"
        f"💰 <b>ФИНАНСЫ:</b>\n"
        f"├ Текущий баланс: <b>{user.balance} ⭐</b>\n"
        f"└ Всего задонатил: <b>{total_dep} ⭐</b>\n\n"
        f"🎰 <b>АКТИВНОСТЬ:</b>\n"
        f"├ Открыл кейсов: <b>{openings_count}</b>\n"
        f"└ Выводов призов: <b>{withdrawals_count}</b>\n\n"
        f"🎒 <b>ИНВЕНТАРЬ:</b>\n"
        f"{inv_text}"
    )
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💰 Изменить баланс", callback_data="admin_edit_balance")],
        [InlineKeyboardButton(text="🔄 Сбросить Free Кейс", callback_data=f"admin_reset_free_{user.telegram_id}")],
        [
            InlineKeyboardButton(text="◀️ К списку", callback_data="admin_users_list_1"),
            InlineKeyboardButton(text="🏠 В меню", callback_data="admin_back")
        ]
    ])
    await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")

# --- МАССОВЫЙ БОНУС (КИЛЛЕР ФИЧА) ---
@router.callback_query(F.data == "admin_mass_bonus")
async def admin_mass_bonus_start(callback: CallbackQuery, state: FSMContext):
    if callback.from_user.id not in ADMIN_IDS:
        return
    await state.set_state(AdminState.waiting_for_mass_bonus)
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Отмена", callback_data="admin_back")]])
    await callback.message.edit_text("💸 <b>МАССОВЫЙ БОНУС</b>\n\nВведи сумму звезд, которую нужно начислить <b>ВСЕМ</b> зарегистрированным пользователям:", reply_markup=kb, parse_mode="HTML")

@router.message(AdminState.waiting_for_mass_bonus)
async def process_mass_bonus(message: Message, state: FSMContext):
    try:
        amount = int(message.text.strip())
    except ValueError:
        return await message.answer("❌ Введи просто число!")
        
    async with async_session() as session:
        users = (await session.execute(select(User))).scalars().all()
        for u in users:
            u.balance += amount
        await session.commit()
        
    await state.clear()
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")]])
    await message.answer(f"✅ Успешно! <b>{amount} ⭐</b> выдано всем игрокам (Охвачено: {len(users)} чел.)!", reply_markup=kb, parse_mode="HTML")

# --- ПОИСК И УПРАВЛЕНИЕ ЮЗЕРОМ ---


@router.message(AdminState.waiting_for_user_search)
async def process_user_search(message: Message, state: FSMContext):
    query = message.text.replace('@', '').strip()
    
    async with async_session() as session:
        # Ищем по ID или юзернейму
        if query.isdigit():
            result = await session.execute(select(User).where(User.telegram_id == int(query)))
        else:
            result = await session.execute(select(User).where(User.username.ilike(f"%{query}%")))
            
        user = result.scalar_one_or_none()
        
        if not user:
            await message.answer("❌ Пользователь не найден. Попробуй еще раз или нажми /admin")
            return
        
        # Считаем сколько он открыл кейсов
        openings = len((await session.execute(select(CaseOpening).where(CaseOpening.user_id == user.id))).scalars().all())
        
        # Сохраняем ID найденного юзера в состояние, чтобы потом менять ему баланс
        await state.update_data(target_user_id=user.telegram_id)
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="💰 Изменить баланс", callback_data="admin_edit_balance")],
            [InlineKeyboardButton(text="🔄 Сбросить Free Кейс", callback_data=f"admin_reset_free_{user.telegram_id}")],
            [InlineKeyboardButton(text="◀️ В меню", callback_data="admin_back")]
        ])
        
        await message.answer(
            f"👤 <b>Профиль игрока:</b>\n\n"
            f"ID: <code>{user.telegram_id}</code>\n"
            f"Имя: {user.first_name}\n"
            f"Юзернейм: @{user.username or 'нет'}\n"
            f"Баланс: <b>{user.balance} ⭐</b>\n"
            f"Открыл кейсов: {openings}\n"
            f"Реф. код: <code>{user.referral_code}</code>",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
    await state.set_state(None) # Выходим из состояния поиска

# --- ИЗМЕНЕНИЕ БАЛАНСА ---
@router.callback_query(F.data == "admin_edit_balance")
async def admin_edit_balance_start(callback: CallbackQuery, state: FSMContext):
    await state.set_state(AdminState.waiting_for_add_balance)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Отмена", callback_data="admin_back")]])
    await callback.message.edit_text("💸 Введи сумму, которую хочешь добавить (или отнять с минусом, например -100):", reply_markup=keyboard)

@router.message(AdminState.waiting_for_add_balance)
async def process_edit_balance(message: Message, state: FSMContext):
    try:
        amount = int(message.text.strip())
    except ValueError:
        await message.answer("❌ Введи просто число (например: 500 или -200)")
        return
        
    data = await state.get_data()
    target_id = data.get("target_user_id")
    
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == target_id))).scalar_one()
        user.balance += amount
        if user.balance < 0: 
            user.balance = 0 # Защита от отрицательного баланса
        await session.commit()
        
    await message.answer(f"✅ Баланс успешно изменен!\nНовый баланс: <b>{user.balance} ⭐</b>", parse_mode="HTML")
    await state.clear()

# --- СБРОС БЕСПЛАТНОГО КЕЙСА ---
@router.callback_query(F.data.startswith("admin_reset_free_"))
async def admin_reset_free(callback: CallbackQuery):
    target_id = int(callback.data.split("_")[3])
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == target_id))).scalar_one()
        user.last_free_case = None
        user.free_case_available = True
        await session.commit()
    await callback.answer(f"Таймер сброшен для {user.first_name}!", show_alert=True)

# --- РАССЫЛКА (BROADCAST) ---
@router.callback_query(F.data == "admin_broadcast_start")
async def admin_broadcast_start(callback: CallbackQuery, state: FSMContext):
    await state.set_state(AdminState.waiting_for_broadcast)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="◀️ Отмена", callback_data="admin_back")]])
    await callback.message.edit_text("📢 Отправь мне сообщение (текст, фото или кружок), и я разошлю его всем пользователям базы:", reply_markup=keyboard)

@router.message(AdminState.waiting_for_broadcast)
async def process_broadcast(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("⏳ Начинаю рассылку... Это может занять какое-то время.")
    
    success = 0
    failed = 0
    
    async with async_session() as session:
        users = (await session.execute(select(User))).scalars().all()
        
    for user in users:
        try:
            # Копируем сообщение админа и отправляем юзеру
            await message.copy_to(chat_id=user.telegram_id)
            success += 1
        except Exception:
            failed += 1
            
    await message.answer(f"✅ <b>Рассылка завершена!</b>\n\nУспешно доставлено: {success}\nЗаблокировали бота: {failed}", parse_mode="HTML")

@router.callback_query(F.data == "admin_reset_my_free")
async def admin_reset_my_free_handler(callback: CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS:
        return
    
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == callback.from_user.id)
        )
        user = result.scalar_one_or_none()
        
        if user:
            user.last_free_case = None
            user.free_case_available = True
            await session.commit()
            # show_alert=True покажет окошко прямо по центру экрана 
            await callback.answer("✅ Твой таймер бесплатного кейса сброшен!", show_alert=True)
        else:
            await callback.answer("❌ Профиль не найден", show_alert=True)
# --- КНОПКА НАЗАД ---



# @router.message(Command("resetfreecase"))
# async def reset_free_case(message: Message):
#     """Сброс таймера бесплатного кейса (только для админов)"""
#     if message.from_user.id not in ADMIN_IDS:
#         await message.answer("❌ У вас нет доступа к этой команде")
#         return

#     args = message.text.split()
#     if len(args) > 1:
#         try:
#             target_telegram_id = int(args[1])
#         except ValueError:
#             await message.answer("❌ Неверный формат ID\nИспользование: /resetfreecase [telegram_id]")
#             return
#     else:
#         target_telegram_id = message.from_user.id

#     async with async_session() as session:
#         result = await session.execute(
#             select(User).where(User.telegram_id == target_telegram_id)
#         )
#         user = result.scalar_one_or_none()
#         if not user:
#             await message.answer(f"❌ Пользователь с ID <code>{target_telegram_id}</code> не найден", parse_mode="HTML")
#             return
#         user.last_free_case = None
#         user.free_case_available = True
#         await session.commit()

#     if target_telegram_id == message.from_user.id:
#         await message.answer("✅ Твой таймер бесплатного кейса сброшен")
#     else:
#         await message.answer(
#             f"✅ Таймер сброшен\n🆔 <code>{target_telegram_id}</code> · {user.first_name or '—'} (@{user.username or '—'})",
#             parse_mode="HTML"
#         )



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
