import aiohttp
from aiohttp import web
from aiohttp.web import middleware
import aiohttp_cors
import os
import ssl
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, desc
from sqlalchemy.orm import joinedload
from dotenv import load_dotenv
import random
import json
MINES_BANK = 10000

MINES_COEFS = {
    3: [1.14, 1.3, 1.49, 1.73, 2.02, 2.37, 2.82, 3.38, 4.11, 5.05, 6.32, 8.04, 10.45, 13.94, 19.17, 27.38, 41.07, 65.71, 115, 230, 575, 2300]
}

from database.models import (
    async_session, User, Case, CaseOpening,
    Gift, CaseItem, Withdrawal, init_db, ReferralEarning, Payment, MinesGame
)

load_dotenv()

# === MIDDLEWARE ===
@middleware
async def log_middleware(request, handler):
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
            referral_code = str(uuid.uuid4())[:8].upper()
            user = User(
                telegram_id=telegram_id,
                username=data.get('username'),
                first_name=data.get('first_name'),
                last_name=data.get('last_name'),
                photo_url=data.get('photo_url'),
                balance=0,
                referral_code=referral_code
            )
            
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
            if data.get('photo_url') and user.photo_url != data.get('photo_url'):
                user.photo_url = data.get('photo_url')
            if data.get('username') and user.username != data.get('username'):
                user.username = data.get('username')
            if data.get('first_name') and user.first_name != data.get('first_name'):
                user.first_name = data.get('first_name')
            if data.get('last_name') and user.last_name != data.get('last_name'):
                user.last_name = data.get('last_name')
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
    async with async_session() as session:
        result = await session.execute(select(Case).where(Case.is_active == True))
        cases = result.scalars().all()
        cases_data = []
        for case in cases:
            local_img = f'static/images/cases/case_{case.id}.png'
            image_url = f'/static/images/cases/case_{case.id}.png' if os.path.exists(local_img) else (case.image_url or '/static/images/free-stars-case.png')
            cases_data.append({
                'id': case.id, 'name': case.name, 'description': case.description,
                'price': case.price, 'image_url': image_url, 'is_free': case.is_free
            })
        return web.json_response({'success': True, 'cases': cases_data})

async def get_case_items(request):
    case_id = int(request.match_info['case_id'])
    async with async_session() as session:
        case = await session.get(Case, case_id)
        if not case: return web.json_response({'success': False, 'error': 'Case not found'})
        result = await session.execute(select(CaseItem).where(CaseItem.case_id == case_id).options(joinedload(CaseItem.gift)))
        items = result.scalars().unique().all()

        if case.is_free:
            stars_item = None
            for item in items:
                if item.gift.gift_number and item.gift.gift_number >= 200:
                    stars_item = item
                    break

            if stars_item:
                gift = stars_item.gift
                gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)
                preview_items = [{
                    'id': stars_item.id, 'drop_chance': 73.0,
                    'gift': {'id': gift.id, 'name': 'STARS', 'rarity': gift.rarity or 'common', 'value': '1-10', 'image_url': gift.image_url, 'gift_number': gift_number, 'is_stars': True }
                }]
                non_stars_items = [item for item in items if not (item.gift.gift_number and item.gift.gift_number >= 200)]
                fake_chances = {'legendary': 3.0, 'epic': 5.0, 'rare': 8.0, 'common': 11.0}
                
                for item in non_stars_items:
                    g = item.gift
                    gift_number = g.gift_number if g.gift_number else ((g.id - 1) % 120 + 1)
                    fake_chance = fake_chances.get(g.rarity or 'common', 11.0)
                    preview_items.append({
                        'id': item.id, 'drop_chance': fake_chance,
                        'gift': {'id': g.id, 'name': g.name, 'rarity': g.rarity or 'common', 'value': g.value, 'image_url': g.image_url, 'gift_number': gift_number, 'is_stars': False}
                    })
                return web.json_response({'success': True, 'items': preview_items})

        items_data = []
        for item in items:
            gift = item.gift
            gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)
            items_data.append({
                'id': item.id, 'drop_chance': item.drop_chance,
                'gift': {'id': gift.id, 'name': gift.name, 'rarity': gift.rarity, 'value': gift.value, 'image_url': gift.image_url, 'gift_number': gift_number, 'is_stars': bool(gift.gift_number and gift.gift_number >= 200)}
            })
        return web.json_response({'success': True, 'items': items_data})

async def open_case(request):
    data = await request.json()
    case_id = data.get('case_id')
    user_telegram_id = data.get('user_id')

    if not case_id or not user_telegram_id: return web.json_response({'success': False, 'error': 'Missing parameters'})

    try:
        async with async_session() as session:
            user_result = await session.execute(select(User).where(User.telegram_id == user_telegram_id))
            user = user_result.scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            case = await session.get(Case, case_id)
            if not case: return web.json_response({'success': False, 'error': 'Case not found'})

            if case.is_free:
                if user.last_free_case:
                    time_diff = datetime.utcnow() - user.last_free_case
                    if time_diff < timedelta(hours=24):
                        remaining = timedelta(hours=24) - time_diff
                        return web.json_response({'success': False, 'error': f'Бесплатный кейс доступен через {remaining.seconds // 3600} ч'})
            else:
                if user.balance < case.price: return web.json_response({'success': False, 'error': 'Insufficient balance'})
                user.balance -= case.price

            items_result = await session.execute(select(CaseItem).where(CaseItem.case_id == case_id).options(joinedload(CaseItem.gift)))
            items = items_result.scalars().unique().all()
            if not items: return web.json_response({'success': False, 'error': 'No items in case'})

            if case.is_free:
                rare_chance = random.uniform(0, 100)
                is_stars = False
                
                if rare_chance < 0.01:
                    non_stars_items = [item for item in items if not (item.gift.gift_number and item.gift.gift_number >= 200)]
                    won_item = random.choice(non_stars_items) if non_stars_items else items[0]
                    gift = won_item.gift
                    user.balance += gift.value or 0
                else:
                    stars_weights = [25, 20, 15, 12, 10, 7, 5, 3, 2, 1]
                    stars_amount = random.choices(range(1, 11), weights=stars_weights, k=1)[0]
                    is_stars = True
                    won_item = next((item for item in items if item.gift.gift_number and item.gift.gift_number >= 200), items[0])
                    gift = won_item.gift
                    user.balance += stars_amount
                    gift.value = stars_amount
            else:
                total_chance = sum(item.drop_chance for item in items)
                rand = random.uniform(0, total_chance)
                current = 0
                won_item = items[0]
                for item in items:
                    current += item.drop_chance
                    if rand <= current:
                        won_item = item
                        break
                gift = won_item.gift
                is_stars = bool(gift.gift_number and gift.gift_number >= 200)
                if is_stars: user.balance += gift.value or 0

            opening = CaseOpening(user_id=user.id, case_id=case_id, gift_id=gift.id)
            if is_stars: opening.is_sold = True
            session.add(opening)

            if case.is_free: user.last_free_case = datetime.utcnow()

            await session.commit()
            await session.refresh(opening)

            return web.json_response({
                'success': True, 'opening_id': opening.id,
                'gift': { 'id': gift.id, 'name': gift.name, 'rarity': gift.rarity, 'value': gift.value, 'image_url': gift.image_url, 'gift_number': gift.gift_number or ((gift.id - 1) % 120 + 1), 'is_stars': bool(gift.gift_number and gift.gift_number >= 200) },
                'balance': user.balance
            })
    except Exception as e:
        print(f"❌ Error in open_case: {e}")
        return web.json_response({'success': False, 'error': f'Internal error: {str(e)}'}, status=500)

async def get_inventory(request):
    telegram_id = int(request.match_info['telegram_id'])
    try:
        async with async_session() as session:
            user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            # КОСТЫЛЬ ВЫРЕЗАН, ТОЧНАЯ ПРОВЕРКА ПО БАЗЕ
            openings = (await session.execute(
                select(CaseOpening)
                .where(CaseOpening.user_id == user.id, CaseOpening.is_sold == False)
                .order_by(desc(CaseOpening.created_at)).options(joinedload(CaseOpening.gift))
            )).scalars().unique().all()
            
            items_data = []
            for opening in openings:
                gift = opening.gift
                items_data.append({
                    'opening_id': opening.id, 'is_withdrawn': opening.is_withdrawn, 'is_sold': opening.is_sold, 'created_at': opening.created_at.isoformat(),
                    'gift': { 'id': gift.id, 'name': gift.name, 'rarity': gift.rarity, 'value': gift.value, 'image_url': gift.image_url, 'gift_number': gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1), 'is_stars': bool(gift.gift_number and gift.gift_number >= 200) }
                })
            return web.json_response({'success': True, 'inventory': items_data})
    except Exception as e:
        print(f"❌ Error in get_inventory: {e}")
        return web.json_response({'success': False, 'error': 'Internal server error'}, status=500)

async def withdraw_item(request):
    data = await request.json()
    opening_id, user_telegram_id = data.get('opening_id'), data.get('user_id')
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_telegram_id))).scalar_one_or_none()
        opening = await session.get(CaseOpening, opening_id)
        if not user or not opening or opening.user_id != user.id: return web.json_response({'success': False, 'error': 'Not found'})
        if opening.is_withdrawn: return web.json_response({'success': False, 'error': 'Already withdrawn'})
        opening.is_withdrawn = True
        withdrawal = Withdrawal(user_id=user.id, opening_id=opening.id, status='completed', completed_at=datetime.utcnow())
        session.add(withdrawal)
        await session.commit()
        return web.json_response({'success': True, 'message': 'Withdrawal request created'})

async def sell_item(request):
    data = await request.json()
    opening_id, user_telegram_id = data.get('opening_id'), data.get('user_id')
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_telegram_id))).scalar_one_or_none()
        opening = await session.get(CaseOpening, opening_id)
        if not user or not opening or opening.user_id != user.id or opening.is_withdrawn or opening.is_sold: return web.json_response({'success': False, 'error': 'Invalid request'})
        gift = (await session.execute(select(Gift).where(Gift.id == opening.gift_id))).scalar_one()
        sell_value = gift.value or 0
        user.balance += sell_value
        opening.is_sold = True
        await session.commit()
        return web.json_response({'success': True, 'earned': sell_value, 'new_balance': user.balance, 'message': f'Продано за {sell_value} ⭐'})

async def get_history(request):
    async with async_session() as session:
        openings = (await session.execute(select(CaseOpening).order_by(desc(CaseOpening.created_at)).limit(50).options(joinedload(CaseOpening.gift)))).scalars().unique().all()
        history_data = []
        for opening in openings:
            user = (await session.execute(select(User).where(User.id == opening.user_id))).scalar_one()
            gift = opening.gift
            history_data.append({
                'id': opening.id, 'created_at': opening.created_at.isoformat(),
                'user': {'first_name': user.first_name or 'Пользователь', 'username': user.username},
                'gift': {'id': gift.id, 'name': gift.name, 'rarity': gift.rarity, 'value': gift.value, 'image_url': gift.image_url, 'gift_number': gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)}
            })
        return web.json_response({'success': True, 'history': history_data})

async def check_free_case(request):
    telegram_id = int(request.match_info['telegram_id'])
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
        if not user or not user.last_free_case: return web.json_response({'available': True})
        time_diff = datetime.utcnow() - user.last_free_case
        available = time_diff >= timedelta(hours=24)
        return web.json_response({'available': available, 'remaining_seconds': max(0, (timedelta(hours=24) - time_diff).total_seconds()) if not available else 0})


# === ЧИСТАЯ ЛОГИКА ПРОФИЛЯ ===
async def get_profile(request):
    telegram_id = int(request.match_info['telegram_id'])
    try:
        async with async_session() as session:
            user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            openings_count = len((await session.execute(select(CaseOpening).where(CaseOpening.user_id == user.id))).scalars().all())
            total_referrals = len((await session.execute(select(User).where(User.referrer_id == user.id))).scalars().all())
            
            deposits_result = await session.execute(select(Payment).where(Payment.user_id == user.id, Payment.status == 'completed'))
            total_deposits = sum((p.amount or 0) for p in deposits_result.scalars().all())

            # КОСТЫЛЬ ВЫРЕЗАН, ТОЧНАЯ ПРОВЕРКА
            referral_earnings_result = await session.execute(
                select(ReferralEarning).where(ReferralEarning.referrer_id == user.id, ReferralEarning.is_withdrawn == False)
            )
            available_referral_earnings = sum((e.amount or 0) for e in referral_earnings_result.scalars().all())

            return web.json_response({
                'success': True,
                'profile': {
                    'id': user.id, 'telegram_id': user.telegram_id, 'first_name': user.first_name, 'username': user.username, 'photo_url': user.photo_url,
                    'balance': user.balance, 'referral_code': user.referral_code,
                    'total_openings': openings_count,
                    'total_referrals': total_referrals,
                    'total_deposits': total_deposits,
                    'available_referral_earnings': available_referral_earnings
                }
            })
    except Exception as e:
        print(f"❌ Error in get_profile: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)

async def withdraw_referrals(request):
    data = await request.json()
    telegram_id = data.get('telegram_id')

    try:
        async with async_session() as session:
            user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            # КОСТЫЛЬ ВЫРЕЗАН
            earnings_result = await session.execute(
                select(ReferralEarning).where(ReferralEarning.referrer_id == user.id, ReferralEarning.is_withdrawn == False)
            )
            earnings = earnings_result.scalars().all()
            
            total_amount = sum((e.amount or 0) for e in earnings)

            if total_amount == 0:
                return web.json_response({'success': False, 'error': 'Нет доступных звезд для вывода'})

            user.balance += total_amount
            
            for e in earnings:
                e.is_withdrawn = True

            await session.commit()
            
            return web.json_response({
                'success': True,
                'withdrawn': total_amount,
                'new_balance': user.balance
            })
    except Exception as e:
        print(f"❌ Error in withdraw_referrals: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)

async def get_referrals(request):
    telegram_id = int(request.match_info['telegram_id'])
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
        if not user: return web.json_response({'success': False, 'error': 'User not found'})

        referrals = (await session.execute(select(User).where(User.referrer_id == user.id).order_by(desc(User.created_at)))).scalars().all()
        referrals_data = []
        for ref in referrals:
            earnings = (await session.execute(select(ReferralEarning).where(ReferralEarning.referrer_id == user.id, ReferralEarning.referred_user_id == ref.id))).scalars().all()
            total_earned = sum((e.amount or 0) for e in earnings)
            referrals_data.append({
                'id': ref.id, 'first_name': ref.first_name, 'username': ref.username, 'photo_url': ref.photo_url,
                'joined_at': ref.created_at.isoformat() if ref.created_at else None, 'total_earned': total_earned
            })
        return web.json_response({'success': True, 'referrals': referrals_data})

async def create_invoice(request):
    data = await request.json()
    stars, user_id = data.get('stars', 100), data.get('user_id')
    bot_token = os.getenv('BOT_TOKEN')
    if not bot_token: return web.json_response({'success': False, 'error': 'Токен бота не настроен'})

    api_url = f"https://api.telegram.org/bot{bot_token}/createInvoiceLink"
    invoice_payload = { "title": f"{stars} Telegram Stars", "description": f"Пополнение баланса на {stars} звезд", "payload": f"stars_{stars}_{user_id}", "provider_token": "", "currency": "XTR", "prices": [{"label": f"{stars} Stars", "amount": stars}] }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(api_url, json=invoice_payload) as resp:
                result = await resp.json()
                if result.get("ok"): return web.json_response({'success': True, 'invoice_link': result["result"]})
                else: return web.json_response({'success': False, 'error': result.get("description", "Ошибка API")})
    except Exception as e: return web.json_response({'success': False, 'error': 'Внутренняя ошибка сервера'})

async def index(request):
    with open('templates/index.html', 'r', encoding='utf-8') as f: return web.Response(text=f.read(), content_type='text/html')
    
async def mines_start(request):
    data = await request.json()
    user_id = data.get('user_id')
    bet = int(data.get('bet', 0))
    bombs = int(data.get('bombs', 3))

    if bet < 1 or bombs not in MINES_COEFS:
        return web.json_response({'success': False, 'error': 'Неверная ставка или кол-во мин'})

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        if not user or user.balance < bet:
            return web.json_response({'success': False, 'error': 'Недостаточно звезд'})

        # Закрываем старые активные игры
        old_games = (await session.execute(select(MinesGame).where(MinesGame.user_id == user.id, MinesGame.is_active == True))).scalars().all()
        for og in old_games:
            og.is_active = False

        user.balance -= bet
        
        # Генерируем поле (ячейки от 0 до 24)
        all_cells = list(range(25))
        mines_pos = random.sample(all_cells, bombs)

        new_game = MinesGame(
            user_id=user.id,
            bet=bet,
            bombs=bombs,
            mines_positions=json.dumps(mines_pos),
            clicked_positions="[]",
            win_amount=bet # Начальный выигрыш равен ставке (пока не кликнул)
        )
        session.add(new_game)
        await session.commit()

        return web.json_response({'success': True, 'game_id': new_game.id, 'balance': user.balance})

async def mines_click(request):
    global MINES_BANK
    data = await request.json()
    user_id = data.get('user_id')
    cell = int(data.get('cell'))

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        game = (await session.execute(select(MinesGame).where(MinesGame.user_id == user.id, MinesGame.is_active == True))).scalar_one_or_none()

        if not game:
            return web.json_response({'success': False, 'error': 'Нет активной игры'})

        mines_pos = json.loads(game.mines_positions)
        clicked = json.loads(game.clicked_positions)

        if cell in clicked:
            return web.json_response({'success': False, 'error': 'Ячейка уже открыта'})

        # АНТИ-МИНУС ЛОГИКА
        if cell not in mines_pos:
            coefs = MINES_COEFS.get(game.bombs, [])
            next_win = int(game.bet * coefs[game.step])
            
            # Если выигрыш превышает кассу проекта -> принудительный слив
            if (next_win - game.bet) > MINES_BANK:
                # Перемещаем мину в кликнутую ячейку
                empty_cells = [c for c in range(25) if c not in clicked and c not in mines_pos and c != cell]
                if empty_cells:
                    mines_pos.remove(random.choice(mines_pos)) # Убираем одну случайную мину
                    mines_pos.append(cell) # Ставим её туда, куда кликнул юзер
                    game.mines_positions = json.dumps(mines_pos)

        clicked.append(cell)
        game.clicked_positions = json.dumps(clicked)

        if cell in mines_pos:
            # БАБАХ! Проигрыш
            game.is_active = False
            MINES_BANK += int(game.bet * 0.9) # 90% идет в банк проекта
            await session.commit()
            return web.json_response({'success': True, 'status': 'lose', 'mines': mines_pos})
        else:
            # УСПЕХ!
            game.step += 1
            coefs = MINES_COEFS.get(game.bombs, [])
            game.win_amount = int(game.bet * coefs[game.step - 1])
            await session.commit()
            return web.json_response({'success': True, 'status': 'continue', 'win_amount': game.win_amount, 'step': game.step})

async def mines_collect(request):
    global MINES_BANK
    data = await request.json()
    user_id = data.get('user_id')

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        game = (await session.execute(select(MinesGame).where(MinesGame.user_id == user.id, MinesGame.is_active == True))).scalar_one_or_none()

        if not game or game.step == 0:
            return web.json_response({'success': False, 'error': 'Нечего забирать'})

        game.is_active = False
        user.balance += game.win_amount
        MINES_BANK -= int(game.win_amount - game.bet) # Вычитаем профит юзера из банка

        mines_pos = json.loads(game.mines_positions)
        await session.commit()
        return web.json_response({'success': True, 'win_amount': game.win_amount, 'balance': user.balance, 'mines': mines_pos})
async def create_app():
    app = web.Application(middlewares=[log_middleware, error_middleware])
    cors = aiohttp_cors.setup(app, defaults={"*": aiohttp_cors.ResourceOptions(allow_credentials=True, expose_headers="*", allow_headers="*")})

    api_routes = [
        web.get('/api/user/{telegram_id}/profile', get_profile),
        web.get('/api/user/{telegram_id}/referrals', get_referrals),
        web.post('/api/user/withdraw-referrals', withdraw_referrals),
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
        web.post('/api/mines/start', mines_start),
        web.post('/api/mines/click', mines_click),
        web.post('/api/mines/collect', mines_collect),
    ]

    for route in api_routes: cors.add(app.router.add_route(route.method, route.path, route.handler))
    app.router.add_get('/', index)
    app.router.add_static('/static', 'static', show_index=False)
    
    # Жесткий фикс базы при старте
    await init_db()
    return app

async def init_app():
    app = await create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    host, port = os.getenv('HOST', '0.0.0.0'), int(os.getenv('PORT', 8443))
    site = web.TCPSite(runner, host, port)
    await site.start()
    print("🚀 Server Started!")
    try:
        while True: await asyncio.sleep(3600)
    except KeyboardInterrupt: pass
    finally: await runner.cleanup()

if __name__ == '__main__':
    asyncio.run(init_app())