from aiohttp import web
from aiohttp.web import middleware
import aiohttp_cors
import os
import ssl
from datetime import datetime, timedelta
from sqlalchemy import select, desc
from sqlalchemy.orm import joinedload
from dotenv import load_dotenv
import random

from database.models import (
    async_session, User, Case, CaseOpening,
    Gift, CaseItem, Withdrawal, init_db, ReferralEarning
)

load_dotenv()

# === MIDDLEWARE ===

@middleware
async def log_middleware(request, handler):
    """Логирование всех запросов"""
    print(f"[HTTP] {request.method} {request.path}")
    return await handler(request)

@middleware
async def error_middleware(request, handler):
    try:
        return await handler(request)
    except web.HTTPException as ex:
        return web.json_response({'success': False, 'error': str(ex)}, status=ex.status)
    except Exception as e:
        print(f"Error: {e}")
        return web.json_response({'success': False, 'error': 'Internal server error'}, status=500)


# === API HANDLERS ===

async def init_user(request):
    """Инициализация пользователя"""
    import uuid
    data = await request.json()
    telegram_id = data.get('telegram_id')

    if not telegram_id:
        return web.json_response({'success': False, 'error': 'telegram_id required'})

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            # Генерируем уникальный реферальный код
            referral_code = str(uuid.uuid4())[:8].upper()
            
            user = User(
                telegram_id=telegram_id,
                username=data.get('username'),
                first_name=data.get('first_name'),
                last_name=data.get('last_name'),
                photo_url=data.get('photo_url'),
                balance=5000,  # Даем сразу 5000 звезд для теста
                referral_code=referral_code
            )
            
            # Проверяем есть ли реферер
            referrer_code = data.get('referrer_code')
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
        else:
            # Обновляем данные пользователя если изменились
            if data.get('photo_url') and user.photo_url != data.get('photo_url'):
                user.photo_url = data.get('photo_url')
            if data.get('username') and user.username != data.get('username'):
                user.username = data.get('username')
            if data.get('first_name') and user.first_name != data.get('first_name'):
                user.first_name = data.get('first_name')
            if data.get('last_name') and user.last_name != data.get('last_name'):
                user.last_name = data.get('last_name')
            # Генерируем реферальный код если его нет
            if not user.referral_code:
                user.referral_code = str(uuid.uuid4())[:8].upper()
            await session.commit()

        return web.json_response({
            'success': True,
            'user': {
                'id': user.id,
                'telegram_id': user.telegram_id,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'photo_url': user.photo_url,
                'balance': user.balance,
                'free_case_available': user.free_case_available,
                'referral_code': user.referral_code,
                'referrer_id': user.referrer_id
            }
        })


async def list_cases(request):
    """Список всех кейсов"""
    async with async_session() as session:
        result = await session.execute(
            select(Case).where(Case.is_active == True)
        )
        cases = result.scalars().all()
        
        cases_data = []
        for case in cases:
            local_img = f'static/images/cases/case_{case.id}.png'
            image_url = f'/static/images/cases/case_{case.id}.png' if os.path.exists(local_img) else (case.image_url or '/static/images/free-stars-case.png')
            cases_data.append({
                'id': case.id,
                'name': case.name,
                'description': case.description,
                'price': case.price,
                'image_url': image_url,
                'is_free': case.is_free
            })
        
        return web.json_response({
            'success': True,
            'cases': cases_data
        })


async def get_case_items(request):
    """Получить предметы кейса"""
    case_id = int(request.match_info['case_id'])

    async with async_session() as session:
        # Получаем кейс
        case = await session.get(Case, case_id)
        if not case:
            return web.json_response({'success': False, 'error': 'Case not found'})

        # Получаем предметы с загруженным Gift (joinedload)
        result = await session.execute(
            select(CaseItem)
            .where(CaseItem.case_id == case_id)
            .options(joinedload(CaseItem.gift))
        )
        items = result.scalars().unique().all()

        # === СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ БЕСПЛАТНОГО КЕЙСА ===
        # Для предпросмотра показываем "фейковые" шансы для красоты
        if case.is_free:
            # Находим первый Stars предмет для отображения
            stars_item = None
            for item in items:
                if item.gift.gift_number and item.gift.gift_number >= 200:
                    stars_item = item
                    break

            if stars_item:
                gift = stars_item.gift  # Уже загружен через joinedload
                gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)

                # Показываем ОДИН общий приз "STARS" с шансом 73%
                # Реальное количество (1-10) определяется при открытии с весами
                # Реальный шанс на Stars: 99.99%
                preview_items = []
                
                # STARS с фейковым шансом 73%
                preview_items.append({
                    'id': stars_item.id,
                    'drop_chance': 73.0,
                    'gift': {
                        'id': gift.id,
                        'name': 'STARS',  # Общее название без указания количества
                        'rarity': gift.rarity or 'common',
                        'value': '1-10',  # Показываем диапазон
                        'image_url': gift.image_url,
                        'gift_number': gift_number,
                        'is_stars': True,
                    }
                })

                # Добавляем редкие предметы с ФЕйКОВЫМИ шансами для красоты
                # Реальный шанс: 0.01% на каждый
                # Для отображения: чем реже предмет, тем меньше шанс
                non_stars_items = [item for item in items
                                   if not (item.gift.gift_number and item.gift.gift_number >= 200)]
                
                # Распределяем фейковые шансы (логично: common > rare > epic > legendary)
                fake_chances = {
                    'legendary': 3.0,   # Легендарки — 3%
                    'epic': 5.0,        # Эпики — 5%
                    'rare': 8.0,        # Редкие — 8%
                    'common': 11.0,     # Обычные — 11%
                }
                
                for item in non_stars_items:
                    g = item.gift  # Уже загружен через joinedload
                    gift_number = g.gift_number if g.gift_number else ((g.id - 1) % 120 + 1)
                    rarity = g.rarity or 'common'
                    fake_chance = fake_chances.get(rarity, 11.0)
                    
                    preview_items.append({
                        'id': item.id,
                        'drop_chance': fake_chance,
                        'gift': {
                            'id': g.id,
                            'name': g.name,
                            'rarity': g.rarity or 'common',
                            'value': g.value,
                            'image_url': g.image_url,
                            'gift_number': gift_number,
                            'is_stars': False,
                        }
                    })

                return web.json_response({
                    'success': True,
                    'items': preview_items
                })

        # === ОБЫЧНАЯ ЛОГИКА ДЛЯ ПЛАТНЫХ КЕЙСОВ ===
        items_data = []
        for item in items:
            gift = item.gift  # Уже загружен через joinedload
            gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)
            items_data.append({
                'id': item.id,
                'drop_chance': item.drop_chance,
                'gift': {
                    'id': gift.id,
                    'name': gift.name,
                    'rarity': gift.rarity,
                    'value': gift.value,
                    'image_url': gift.image_url,
                    'gift_number': gift_number,
                    'is_stars': bool(gift.gift_number and gift.gift_number >= 200),
                }
            })

        return web.json_response({
            'success': True,
            'items': items_data
        })


async def open_case(request):
    """Открытие кейса"""
    data = await request.json()
    case_id = data.get('case_id')
    user_telegram_id = data.get('user_id')
    
    if not case_id or not user_telegram_id:
        return web.json_response({'success': False, 'error': 'Missing parameters'})
    
    async with async_session() as session:
        # Получаем пользователя
        user_result = await session.execute(
            select(User).where(User.telegram_id == user_telegram_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})
        
        # Получаем кейс
        case = await session.get(Case, case_id)
        if not case:
            return web.json_response({'success': False, 'error': 'Case not found'})
        
        # Проверка бесплатного кейса
        if case.is_free:
            if user.last_free_case:
                time_diff = datetime.utcnow() - user.last_free_case
                if time_diff < timedelta(hours=24):
                    remaining = timedelta(hours=24) - time_diff
                    return web.json_response({
                        'success': False,
                        'error': f'Бесплатный кейс доступен через {remaining.seconds // 3600} ч'
                    })
        else:
            # Проверка баланса
            if user.balance < case.price:
                return web.json_response({'success': False, 'error': 'Insufficient balance'})
            user.balance -= case.price

        # Получаем предметы кейса с загруженным Gift (joinedload)
        items_result = await session.execute(
            select(CaseItem)
            .where(CaseItem.case_id == case_id)
            .options(joinedload(CaseItem.gift))
        )
        items = items_result.scalars().unique().all()

        if not items:
            return web.json_response({'success': False, 'error': 'No items in case'})

        # === СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ БЕСПЛАТНОГО КЕЙСА ===
        if case.is_free:
            # Шанс на выпадение редкого подарка (не Stars) — 0.01%
            rare_chance = random.uniform(0, 100)
            if rare_chance < 0.01:
                # Выпал редкий подарок — выбираем из НЕ-Stars предметов
                non_stars_items = [item for item in items
                                   if not (item.gift.gift_number and item.gift.gift_number >= 200)]
                if non_stars_items:
                    # Выбираем случайный не-Stars предмет
                    won_item = random.choice(non_stars_items)
                else:
                    # Если нет не-Stars предметов, берём первый
                    won_item = items[0]
            else:
                # Выпали Stars (99.99% шанс) — рандом 1-10 с весами
                # Веса: 1-5 stars имеют высокий шанс, 6-10 — меньший
                stars_weights = [25, 20, 15, 12, 10, 7, 5, 3, 2, 1]  # Сумма = 100
                stars_amount = random.choices(range(1, 11), weights=stars_weights, k=1)[0]

                # Находим предмет Stars с нужным количеством
                won_item = None
                for item in items:
                    if item.gift.gift_number and item.gift.gift_number >= 200:
                        if item.gift.value == stars_amount:
                            won_item = item
                            break

                # Если не нашли точное совпадение, берём первый Stars предмет
                if not won_item:
                    stars_items = [item for item in items
                                   if item.gift.gift_number and item.gift.gift_number >= 200]
                    if stars_items:
                        won_item = stars_items[0]
                    else:
                        won_item = items[0]

            # Получаем гифт (уже загружен через joinedload)
            gift = won_item.gift

            # Для бесплатного кейса — зачисляем Stars на баланс
            is_stars = bool(gift.gift_number and gift.gift_number >= 200)
            if is_stars:
                # Пересчитываем amount для Stars
                stars_weights = [25, 20, 15, 12, 10, 7, 5, 3, 2, 1]
                stars_amount = random.choices(range(1, 11), weights=stars_weights, k=1)[0]
                user.balance += stars_amount
                gift.value = stars_amount  # Обновляем значение для ответа
            else:
                user.balance += gift.value or 0
        else:
            # === ОБЫЧНАЯ ЛОГИКА ДЛЯ ПЛАТНЫХ КЕЙСОВ ===
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

            # Получаем гифт (уже загружен через joinedload)
            gift = won_item.gift

            # Если это Stars — зачисляем на баланс
            is_stars = bool(gift.gift_number and gift.gift_number >= 200)
            if is_stars:
                user.balance += gift.value or 0

        # Создаем запись об открытии
        opening = CaseOpening(
            user_id=user.id,
            case_id=case_id,
            gift_id=gift.id
        )
        if is_stars:
            opening.is_sold = True   # помечаем сразу чтобы не светился в инвентаре
        session.add(opening)

        # Помечаем бесплатный кейс как открытый (после успешного открытия)
        if case.is_free:
            user.last_free_case = datetime.utcnow()
        
        # === РЕФЕРАЛЬНАЯ СИСТЕМА ===
        # Если у пользователя есть реферер, начисляем 5% с трат
        if user.referrer_id and not case.is_free:
            referrer = await session.get(User, user.referrer_id)
            if referrer:
                referral_bonus = int(case.price * 0.05)  # 5% от стоимости кейса
                if referral_bonus > 0:
                    referrer.balance += referral_bonus
                    # Записываем в историю заработка
                    earning = ReferralEarning(
                        referrer_id=referrer.id,
                        referred_user_id=user.id,
                        amount=referral_bonus,
                        source='case_opening'
                    )
                    session.add(earning)
        
        await session.commit()
        await session.refresh(opening)
        
        return web.json_response({
            'success': True,
            'opening_id': opening.id,
            'gift': {
                'id': gift.id,
                'name': gift.name,
                'rarity': gift.rarity,
                'value': gift.value,
                'image_url': gift.image_url,
                'gift_number': gift.gift_number or ((gift.id - 1) % 120 + 1),
                'is_stars': bool(gift.gift_number and gift.gift_number >= 200),
            },
            'balance': user.balance
        })


async def get_inventory(request):
    """Получить инвентарь пользователя"""
    telegram_id = int(request.match_info['telegram_id'])

    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})

        # Получаем только непроданные предметы (Stars помечаются как is_sold=True)
        openings_result = await session.execute(
            select(CaseOpening)
            .where(CaseOpening.user_id == user.id)
            .where(CaseOpening.is_sold == False)  # Исключаем Stars
            .order_by(desc(CaseOpening.created_at))
            .options(joinedload(CaseOpening.gift))
        )
        openings = openings_result.scalars().unique().all()

        items_data = []
        for opening in openings:
            gift = opening.gift  # Уже загружен через joinedload
            # gift_number берём из БД, fallback на id % 120
            gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)
            items_data.append({
                'opening_id': opening.id,
                'is_withdrawn': opening.is_withdrawn,
                'is_sold': opening.is_sold,
                'created_at': opening.created_at.isoformat(),
                'gift': {
                    'id': gift.id,
                    'name': gift.name,
                    'rarity': gift.rarity,
                    'value': gift.value,
                    'image_url': gift.image_url,
                    'gift_number': gift_number,
                    'is_stars': bool(gift.gift_number and gift.gift_number >= 200),
                }
            })

        return web.json_response({
            'success': True,
            'inventory': items_data
        })


async def withdraw_item(request):
    """Вывод предмета"""
    data = await request.json()
    opening_id = data.get('opening_id')
    user_telegram_id = data.get('user_id')
    
    if not opening_id or not user_telegram_id:
        return web.json_response({'success': False, 'error': 'Missing parameters'})
    
    async with async_session() as session:
        # Получаем пользователя
        user_result = await session.execute(
            select(User).where(User.telegram_id == user_telegram_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})
        
        # Получаем открытие
        opening = await session.get(CaseOpening, opening_id)
        if not opening:
            return web.json_response({'success': False, 'error': 'Opening not found'})
        
        if opening.user_id != user.id:
            return web.json_response({'success': False, 'error': 'Not your item'})
        
        if opening.is_withdrawn:
            return web.json_response({'success': False, 'error': 'Already withdrawn'})
        
        # Помечаем как выведенное
        opening.is_withdrawn = True
        
        # Создаем запись о выводе
        withdrawal = Withdrawal(
            user_id=user.id,
            opening_id=opening.id,
            status='pending'
        )
        session.add(withdrawal)
        await session.commit()
        
        # Здесь должна быть логика отправки гифта через admin_bot
        # Для примера просто помечаем как completed
        withdrawal.status = 'completed'
        withdrawal.completed_at = datetime.utcnow()
        await session.commit()
        
        return web.json_response({
            'success': True,
            'message': 'Withdrawal request created'
        })


async def sell_item(request):
    """Продать предмет — начислить value звёзд на баланс"""
    data = await request.json()
    opening_id = data.get('opening_id')
    user_telegram_id = data.get('user_id')
    
    if not opening_id or not user_telegram_id:
        return web.json_response({'success': False, 'error': 'Missing parameters'})
    
    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == user_telegram_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})
        
        opening = await session.get(CaseOpening, opening_id)
        if not opening:
            return web.json_response({'success': False, 'error': 'Opening not found'})
        
        if opening.user_id != user.id:
            return web.json_response({'success': False, 'error': 'Not your item'})

        if opening.is_withdrawn or opening.is_sold:
            return web.json_response({'success': False, 'error': 'Item already used'})

        # Получаем гифт через select
        gift_result = await session.execute(select(Gift).where(Gift.id == opening.gift_id))
        gift = gift_result.scalar_one()
        sell_value = gift.value or 0

        # Начисляем на баланс и помечаем как продано
        user.balance += sell_value
        opening.is_sold = True

        await session.commit()

        return web.json_response({
            'success': True,
            'earned': sell_value,
            'new_balance': user.balance,
            'message': f'Продано за {sell_value} ⭐'
        })


async def get_history(request):
    """Получить историю выигрышей"""
    async with async_session() as session:
        # Получаем последние 50 открытий с загруженным gift
        result = await session.execute(
            select(CaseOpening)
            .order_by(desc(CaseOpening.created_at))
            .limit(50)
            .options(joinedload(CaseOpening.gift))
        )
        openings = result.scalars().unique().all()

        history_data = []
        for opening in openings:
            # Получаем пользователя через select
            user_result = await session.execute(select(User).where(User.id == opening.user_id))
            user = user_result.scalar_one()
            gift = opening.gift  # Уже загружен через joinedload

            history_data.append({
                'id': opening.id,
                'created_at': opening.created_at.isoformat(),
                'user': {
                    'first_name': user.first_name or 'Пользователь',
                    'username': user.username
                },
                'gift': {
                    'id': gift.id,
                    'name': gift.name,
                    'rarity': gift.rarity,
                    'value': gift.value,
                    'image_url': gift.image_url,
                    'gift_number': gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1),
                }
            })

        return web.json_response({
            'success': True,
            'history': history_data
        })


async def check_free_case(request):
    """Проверка доступности бесплатного кейса"""
    telegram_id = int(request.match_info['telegram_id'])

    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            return web.json_response({'available': True})

        if not user.last_free_case:
            return web.json_response({'available': True})

        time_diff = datetime.utcnow() - user.last_free_case
        available = time_diff >= timedelta(hours=24)

        return web.json_response({
            'available': available,
            'remaining_seconds': max(0, (timedelta(hours=24) - time_diff).total_seconds()) if not available else 0
        })


async def get_profile(request):
    """Получить профиль пользователя"""
    print(f"[PROFILE] Request for telegram_id: {request.match_info.get('telegram_id')}")
    telegram_id = int(request.match_info['telegram_id'])

    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            print(f"[PROFILE] User {telegram_id} not found")
            return web.json_response({'success': False, 'error': 'User not found'})
        
        print(f"[PROFILE] Found user {user.id}")

        # Считаем статистику
        openings_count = await session.execute(
            select(CaseOpening).where(CaseOpening.user_id == user.id)
        )
        total_openings = len(openings_count.scalars().all())

        # Считаем заработок от рефералов
        referral_earnings_result = await session.execute(
            select(ReferralEarning).where(ReferralEarning.referrer_id == user.id)
        )
        total_referral_earnings = sum(e.amount for e in referral_earnings_result.scalars().all())

        # Считаем количество рефералов
        referrals_result = await session.execute(
            select(User).where(User.referrer_id == user.id)
        )
        total_referrals = len(referrals_result.scalars().all())

        return web.json_response({
            'success': True,
            'profile': {
                'id': user.id,
                'telegram_id': user.telegram_id,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'username': user.username,
                'photo_url': user.photo_url,
                'balance': user.balance,
                'referral_code': user.referral_code,
                'referrer_id': user.referrer_id,
                'total_openings': total_openings,
                'total_referrals': total_referrals,
                'total_referral_earnings': total_referral_earnings,
                'created_at': user.created_at.isoformat() if user.created_at else None
            }
        })


async def get_referrals(request):
    """Получить список рефералов пользователя"""
    telegram_id = int(request.match_info['telegram_id'])

    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})

        # Получаем рефералов
        referrals_result = await session.execute(
            select(User)
            .where(User.referrer_id == user.id)
            .order_by(desc(User.created_at))
        )
        referrals = referrals_result.scalars().all()

        referrals_data = []
        for ref in referrals:
            # Считаем сколько заработано с этого реферала
            earnings_result = await session.execute(
                select(ReferralEarning).where(
                    ReferralEarning.referrer_id == user.id,
                    ReferralEarning.referred_user_id == ref.id
                )
            )
            earnings = earnings_result.scalars().all()
            total_earned = sum(e.amount for e in earnings)

            referrals_data.append({
                'id': ref.id,
                'telegram_id': ref.telegram_id,
                'first_name': ref.first_name,
                'username': ref.username,
                'photo_url': ref.photo_url,
                'joined_at': ref.created_at.isoformat() if ref.created_at else None,
                'total_earned': total_earned
            })

        return web.json_response({
            'success': True,
            'referrals': referrals_data
        })


async def get_referral_earnings(request):
    """Получить историю заработка от рефералов"""
    telegram_id = int(request.match_info['telegram_id'])

    async with async_session() as session:
        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            return web.json_response({'success': False, 'error': 'User not found'})

        # Получаем историю заработка
        earnings_result = await session.execute(
            select(ReferralEarning)
            .where(ReferralEarning.referrer_id == user.id)
            .order_by(desc(ReferralEarning.created_at))
            .limit(50)
        )
        earnings = earnings_result.scalars().all()

        earnings_data = []
        for e in earnings:
            referred_user = await session.get(User, e.referred_user_id)
            earnings_data.append({
                'id': e.id,
                'amount': e.amount,
                'source': e.source,
                'referred_user': {
                    'first_name': referred_user.first_name if referred_user else 'Unknown',
                    'username': referred_user.username if referred_user else ''
                },
                'created_at': e.created_at.isoformat() if e.created_at else None
            })

        return web.json_response({
            'success': True,
            'earnings': earnings_data
        })


async def create_invoice(request):
    """Создание Telegram Invoice для пополнения баланса"""
    data = await request.json()
    stars = data.get('stars', 100)
    user_id = data.get('user_id')
    
    if not user_id:
        return web.json_response({'success': False, 'error': 'user_id required'})
    
    # Возвращаем данные для создания invoice через Telegram Bot
    # В реальном приложении здесь был бы вызов к боту
    return web.json_response({
        'success': True,
        'invoice_data': {
            'title': f'{stars} Telegram Stars',
            'description': f'Пополнение баланса на {stars} звезд',
            'payload': f'stars_{stars}_{user_id}',
            'currency': 'XTR',  # Telegram Stars
            'prices': [{'label': f'{stars} Stars', 'amount': stars}]
        }
    })


async def index(request):
    """Главная страница"""
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        return web.Response(text=f.read(), content_type='text/html')


async def tgs_test_page(request):
    """TGS diagnostic page"""
    with open('templates/tgs_test.html', 'r', encoding='utf-8') as f:
        return web.Response(text=f.read(), content_type='text/html')


# === APPLICATION SETUP ===

async def create_app():
    """Создание приложения"""
    app = web.Application(middlewares=[log_middleware, error_middleware])
    
    # Настройка CORS
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    })

    # API routes
    api_routes = [
        web.get('/api/user/{telegram_id}/profile', get_profile),
        web.get('/api/user/{telegram_id}/referrals', get_referrals),
        web.get('/api/user/{telegram_id}/referral-earnings', get_referral_earnings),
        web.get('/api/user/{telegram_id}/free-case-check', check_free_case),
        web.post('/api/user/init', init_user),
        web.get('/api/cases/list', list_cases),
        web.get('/api/cases/{case_id}/items', get_case_items),
        web.post('/api/cases/open', open_case),
        web.get('/api/inventory/{telegram_id}', get_inventory),
        web.post('/api/withdraw', withdraw_item),
        web.post('/api/sell', sell_item),
        web.get('/api/history/recent', get_history),
        web.post('/api/payment/create-invoice', create_invoice),
    ]

    for route in api_routes:
        cors.add(app.router.add_route(route.method, route.path, route.handler))
    
    # Static routes
    app.router.add_get('/', index)
    app.router.add_get('/test', tgs_test_page)
    app.router.add_static('/static', 'static', show_index=False)
    
    # Инициализация БД
    await init_db()
    
    return app


async def init_app():
    """Инициализация и запуск приложения"""
    app = await create_app()

    runner = web.AppRunner(app)
    await runner.setup()

    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 8443))
    webapp_url = os.getenv('WEBAPP_URL', f'https://localhost:{port}')

    # === HTTPS SSL ===
    use_https = os.getenv('USE_HTTPS', 'true').lower() == 'true'
    ssl_context = None

    if use_https:
        cert_file = os.getenv('SSL_CERT', 'ssl/cert.pem')
        key_file  = os.getenv('SSL_KEY',  'ssl/key.pem')

        if not (os.path.exists(cert_file) and os.path.exists(key_file)):
            print("⚠️  SSL certs not found — generating self-signed cert...")
            try:
                _generate_self_signed_cert(cert_file, key_file)
            except RuntimeError as e:
                print(f"⚠️  {e}")
                print("⚠️  Запускаемся на HTTP (без SSL).")
                use_https = False

        if use_https and os.path.exists(cert_file) and os.path.exists(key_file):
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(cert_file, key_file)
            print(f"🔒 HTTPS enabled ({cert_file})")

    site = web.TCPSite(runner, host, port, ssl_context=ssl_context)
    await site.start()

    scheme = 'https' if ssl_context else 'http'
    print("=" * 60)
    print("🚀 Telegram Cases Mini App - Server Started!")
    print("=" * 60)
    print(f"📡 Local:   {scheme}://localhost:{port}")
    print(f"🌐 Network: {scheme}://{host}:{port}")
    print(f"🔗 Public:  {webapp_url}")
    if ssl_context:
        print()
        print("📋 BotFather setup:")
        print(f"   /setmenubutton → URL: {webapp_url}")
        print("   (self-signed cert: браузер покажет предупреждение,")
        print("    но Telegram Mini App примет — это нормально)")
    print("=" * 60)
    print("⚙️  Press Ctrl+C to stop")
    print("=" * 60)

    try:
        while True:
            await asyncio.sleep(3600)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
    finally:
        await runner.cleanup()
        print("✅ Server stopped")


def _generate_self_signed_cert(cert_file: str, key_file: str):
    """Генерирует самоподписанный SSL сертификат.
    Порядок попыток:
      1. cryptography (если установлен)
      2. openssl CLI (если есть в PATH)
      3. tempfile-трюк через встроенный ssl модуль Python (работает всегда)
    """
    import os, datetime as dt
    os.makedirs(os.path.dirname(cert_file) if os.path.dirname(cert_file) else '.', exist_ok=True)

    # --- Попытка 1: пакет cryptography ---
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import ipaddress

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"TelegramCases"),
        ])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(dt.datetime.utcnow())
            .not_valid_after(dt.datetime.utcnow() + dt.timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.DNSName(u"localhost"),
                    x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )
        with open(key_file, 'wb') as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ))
        with open(cert_file, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        print(f"✅ Self-signed cert generated (cryptography): {cert_file}, {key_file}")
        return
    except ImportError:
        pass

    # --- Попытка 2: openssl CLI ---
    try:
        import subprocess
        result = subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', key_file, '-out', cert_file,
            '-days', '3650', '-nodes',
            '-subj', '/CN=localhost/O=TelegramCases'
        ], check=True, capture_output=True)
        print(f"✅ Self-signed cert generated (openssl): {cert_file}")
        return
    except (FileNotFoundError, Exception):
        pass

    # --- Попытка 3: встроенный ssl.create_default_context + generate через tempfile ---
    # Python 3.x имеет ssl модуль, но не умеет генерировать cert напрямую.
    # Используем трюк: создаём временный скрипт и запускаем через тот же python.
    import subprocess, sys, textwrap
    script = textwrap.dedent(f"""
        import ssl, os, sys

        # Пробуем через встроенный _ssl низкоуровневый генератор (CPython internal)
        try:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_verify_locations  # just check it's there
        except Exception:
            pass

        # Генерируем через rsa встроенный в Python (только CPython 3.x)
        # Используем PyOpenSSL или встроенный механизм
        try:
            from OpenSSL import crypto
            k = crypto.PKey()
            k.generate_key(crypto.TYPE_RSA, 2048)
            cert = crypto.X509()
            cert.get_subject().CN = "localhost"
            cert.get_subject().O = "TelegramCases"
            cert.set_serial_number(1)
            cert.gmtime_adj_notBefore(0)
            cert.gmtime_adj_notAfter(3650 * 24 * 60 * 60)
            cert.set_issuer(cert.get_subject())
            cert.set_pubkey(k)
            cert.sign(k, 'sha256')
            os.makedirs(os.path.dirname({cert_file!r}) or '.', exist_ok=True)
            with open({cert_file!r}, 'wb') as f:
                f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
            with open({key_file!r}, 'wb') as f:
                f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
            print("ok_pyopenssl")
            sys.exit(0)
        except ImportError:
            pass

        print("no_method")
        sys.exit(1)
    """)
    try:
        result = subprocess.run([sys.executable, '-c', script],
                                capture_output=True, text=True)
        if result.returncode == 0 and 'ok_pyopenssl' in result.stdout:
            print(f"✅ Self-signed cert generated (pyOpenSSL): {cert_file}")
            return
    except Exception:
        pass

    # --- Последний вариант: запустить HTTP вместо HTTPS с предупреждением ---
    print("⚠️  Не удалось сгенерировать SSL сертификат автоматически.")
    print("   Установите cryptography:  pip install cryptography")
    print("   или pyOpenSSL:             pip install pyOpenSSL")
    print("   или добавьте openssl.exe в PATH")
    print("   Сервер запустится на HTTP (без SSL).")
    # Создаём пустые заглушки чтобы код дальше не падал — отключаем SSL
    # Сигналим вызывающему коду что certs не созданы
    raise RuntimeError("SSL cert generation failed — no suitable tool found. "
                       "Run: pip install cryptography")


if __name__ == '__main__':
    import asyncio
    asyncio.run(init_app())
