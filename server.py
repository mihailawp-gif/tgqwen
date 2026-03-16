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
import math
MINES_BANK = 10000


MINES_COEFS = {
    1: [1.04, 1.09, 1.14, 1.19, 1.25, 1.32, 1.39, 1.47, 1.56, 1.67, 1.79, 1.92, 2.08, 2.27, 2.50, 2.78, 3.12, 3.57, 4.17, 5.00, 6.25, 8.33, 12.50, 25.00],
    2: [1.09, 1.19, 1.3, 1.43, 1.58, 1.75, 1.96, 2.21, 2.5, 2.86, 3.3, 3.85, 4.55, 5.45, 6.67, 8.33, 10.71, 14.29, 20, 30, 50, 100, 300],
    3: [1.14, 1.3, 1.49, 1.73, 2.02, 2.37, 2.82, 3.38, 4.11, 5.05, 6.32, 8.04, 10.45, 13.94, 19.17, 27.38, 41.07, 65.71, 115, 230, 575, 2300],
    4: [1.19, 1.43, 1.73, 2.11, 2.61, 3.26, 4.13, 5.32, 6.95, 9.27, 12.64, 17.69, 25.56, 38.33, 60.24, 100.4, 180.71, 361.43, 843.33, 2530, 12650],
    5: [1.25, 1.58, 2.02, 2.61, 3.43, 4.57, 6.2, 8.59, 12.16, 17.69, 26.54, 41.28, 67.08, 115, 210.83, 421.67, 948.75, 2530, 8855, 53130],
    6: [1.32, 1.75, 2.37, 3.26, 4.57, 6.53, 9.54, 14.31, 22.12, 35.38, 58.97, 103.21, 191.67, 383.33, 843.33, 2108.33],
    7: [1.39, 1.96, 2.82, 4.13, 6.2, 9.54, 15.1, 24.72, 42.02, 74.7, 140.06, 280.13, 606.94, 1456.67, 4005.83, 13352.78],
    8: [1.47, 2.21, 3.38, 5.32, 8.59, 14.31, 24.72, 44.49, 84.04, 168.08, 360.16, 840.38, 2185, 6555, 24035, 120175, 1081575],
    9: [1.56, 2.5, 4.11, 6.95, 12.16, 22.12, 42.02, 84.04, 178.58, 408.19, 1020.47, 2857.31, 9286.25, 37145, 204297.5, 2042975],
    10: [1.67, 2.86, 5.05, 9.27, 17.69, 35.38, 74.7, 168.08, 408.19, 1088.5, 3265.49, 11429.23, 49526.67, 297160, 3268760],
    11: [1.79, 3.3, 6.32, 12.64, 26.54, 58.97, 140.06, 360.16, 1020.47, 3265.49, 12245.6, 57146.15, 371450, 4457400],
    12: [1.92, 3.85, 8.04, 17.69, 41.28, 103.21, 280.13, 840.38, 2857.31, 11429.23, 57146.15, 400023.08, 5200300],
    13: [2.08, 4.55, 10.45, 25.56, 67.08, 191.67, 606.94, 2185, 9286.25, 49526.67, 371450, 5200300],
    14: [2.27, 5.45, 13.94, 38.33, 115, 383.33, 1456.67, 6555, 37145, 297160, 4457400],
    15: [2.5, 6.67, 19.17, 60.24, 210.83, 843.33, 4005.83, 24035, 204297.5, 3268760],
    16: [2.78, 8.33, 27.38, 100.4, 421.67, 2108.33, 13352.78, 120175, 2042975],
    17: [3.13, 10.71, 41.07, 180.71, 948.75, 6325, 60087.5, 1081575],
    18: [3.57, 14.29, 65.71, 361.43, 2530, 25300, 480700],
    19: [4.17, 20, 115, 843.33, 8855, 177100],
    20: [5, 30, 230, 2530, 53130],
    21: [6.25, 50, 575, 12650],
    22: [8.33, 100, 2300],
    23: [12.5, 300],
    24: [25]
}
PLINKO_MULTIPLIERS = {
    'low': {
        8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
        9: [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
        10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
        11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
        12: [10.0, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10.0],
        13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
        14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
        15: [15.0, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.7, 0.7, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15.0],
        16: [16.0, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16.0]
    },
    'medium': {
        8: [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
        9: [18.0, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18.0],
        10: [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
        11: [24.0, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24.0],
        12: [33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0],
        13: [43.0, 13.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13.0, 43.0],
        14: [58.0, 15.0, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15.0, 58.0],
        15: [88.0, 18.0, 11.0, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11.0, 18.0, 88.0],
        16: [110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0] # Исправил опечатку из PHP файла (там была 1 вместо 10)
    },
    'high': {
        8: [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
        9: [43.0, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43.0],
        10: [76.0, 10.0, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10.0, 76.0],
        11: [120.0, 14.0, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14.0, 120.0],
        12: [170.0, 24.0, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24.0, 170.0],
        13: [260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.2, 0.2, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0],
        14: [420.0, 56.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18.0, 56.0, 420.0],
        15: [620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0],
        16: [1000.0, 130.0, 26.0, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26.0, 130.0, 1000.0]
    }
}
from database.models import (
    async_session, User, Case, CaseOpening,
    Gift, CaseItem, Withdrawal, init_db, ReferralEarning, Payment, MinesGame, CrashBet, DiceGame, PromoCode, PromoCodeUsage, PlinkoGame
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
import math

# === ДВИЖОК ИГРЫ КРАШ (LIVE MULTIPLAYER) ===
# === ДВИЖОК ИГРЫ КРАШ (LIVE MULTIPLAYER) ===
class CrashEngine:
    def __init__(self):
        self.state = 'WAITING'
        self.multiplier = 1.00
        self.crash_point = 1.00
        self.timer = 10.0       
        self.players = {}       
        self.history = []       
        self.clients = set()    
        self.start_time = 0

    def generate_crash(self):
        if random.random() < 0.10: 
            return 1.00
        val = 0.99 / (1.0 - random.random())
        return round(max(1.00, val), 2)

    # Вспомогательная функция для записи автовывода в базу без зависания сервера
    async def _process_auto_cashout_db(self, user_id, db_bet_id, win_amount, target_mul):
        try:
            async with async_session() as session:
                user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
                bet_record = await session.get(CrashBet, db_bet_id)
                if user and bet_record:
                    user.balance += win_amount
                    bet_record.cashout_multiplier = target_mul
                    bet_record.win_amount = win_amount
                    await session.commit()
        except Exception as e:
            print(f"Auto-cashout DB error: {e}")

    async def broadcast(self):
        if not self.clients: return
        msg = json.dumps({
            'state': self.state, 'multiplier': round(self.multiplier, 2),
            'timer': round(self.timer, 1), 'players': list(self.players.values()), 'history': self.history
        })
        for ws in list(self.clients):
            try: await ws.send_str(msg)
            except: self.clients.discard(ws)

    async def run_loop(self):
        while True:
            if self.state == 'WAITING':
                self.multiplier = 1.00
                self.players = {}
                self.timer = 8.0 
                
                while self.timer > 0:
                    await self.broadcast()
                    await asyncio.sleep(0.1)
                    self.timer -= 0.1
                
                self.crash_point = self.generate_crash()
                self.state = 'FLYING'
                self.start_time = asyncio.get_event_loop().time()
                
            elif self.state == 'FLYING':
                t = asyncio.get_event_loop().time() - self.start_time
                self.multiplier = max(1.0, math.pow(math.e, t / 10.0))
                
                # --- ЛОГИКА АВТОВЫВОДА НА СТОРОНЕ СЕРВЕРА ---
                for uid, p in list(self.players.items()):
                    if p['cashout'] is None and p.get('auto_cashout') and self.multiplier >= p['auto_cashout']:
                        target_mul = p['auto_cashout']
                        if target_mul <= self.crash_point:
                            win_amount = int(p['bet'] * target_mul)
                            p['cashout'] = target_mul
                            p['profit'] = win_amount
                            # Записываем в БД в фоне
                            asyncio.create_task(self._process_auto_cashout_db(uid, p['db_bet_id'], win_amount, target_mul))

                if self.multiplier >= self.crash_point:
                    self.multiplier = self.crash_point
                    self.state = 'CRASHED'
                    self.history.insert(0, self.crash_point)
                    if len(self.history) > 15: self.history.pop()
                    
                    await self.broadcast()
                    await asyncio.sleep(4.0)
                    self.state = 'WAITING'
                else:
                    await self.broadcast()
                    await asyncio.sleep(0.1)

crash_game = CrashEngine()

# --- API ЭНДПОИНТЫ КРАША ---
async def crash_ws(request):
    """Подключение по WebSocket для получения Live-данных"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    crash_game.clients.add(ws)
    try:
        async for msg in ws: pass # Просто держим соединение
    finally:
        crash_game.clients.discard(ws)
    return ws

async def crash_bet(request):
    """Сделать ставку"""
    data = await request.json()
    user_id = data.get('user_id')
    bet = int(data.get('bet', 0))
    # ДОЛЖНО БЫТЬ ЭТО:
    auto_cashout = data.get('auto_cashout') 

    if auto_cashout is not None:
        try:
            auto_cashout = float(auto_cashout)
            if auto_cashout < 1.01:
                auto_cashout = None
        except:
            auto_cashout = None

    if crash_game.state != 'WAITING':
        return web.json_response({'success': False, 'error': 'Раунд уже начался!'})
    if bet < 1:
        return web.json_response({'success': False, 'error': 'Минимальная ставка 1 ⭐'})
    if user_id in crash_game.players:
        return web.json_response({'success': False, 'error': 'Вы уже поставили в этом раунде!'})

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        if not user or user.balance < bet:
            return web.json_response({'success': False, 'error': 'Недостаточно звезд'})
        
        user.balance -= bet
        new_bet = CrashBet(user_id=user.id, bet_amount=bet)
        session.add(new_bet)
        await session.commit()
        await session.refresh(new_bet)

        crash_game.players[user_id] = {
            'user_id': user_id,
            'db_bet_id': new_bet.id,
            'name': user.first_name or 'Игрок',
            'avatar': user.photo_url,
            'bet': bet,
            'cashout': None,
            'profit': 0,
            'auto_cashout': auto_cashout # <--- И ВОТ ЭТА СТРОЧКА ДОЛЖНА БЫТЬ ТУТ
        }
        return web.json_response({'success': True, 'balance': user.balance})

async def crash_cashout(request):
    """Забрать выигрыш (Вывод)"""
    data = await request.json()
    user_id = data.get('user_id')

    if crash_game.state != 'FLYING':
        return web.json_response({'success': False, 'error': 'Раунд завершен!'})
    if user_id not in crash_game.players:
        return web.json_response({'success': False, 'error': 'Вы не делали ставку!'})
    
    player = crash_game.players[user_id]
    if player['cashout'] is not None:
        return web.json_response({'success': False, 'error': 'Уже забрали!'})

    # Фиксируем выигрыш по текущему иксу сервера
    current_mul = crash_game.multiplier
    win_amount = int(player['bet'] * current_mul)

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        
        # Находим ставку в БД и обновляем её статус (победа)
        bet_record = await session.get(CrashBet, player['db_bet_id'])
        if bet_record:
            bet_record.cashout_multiplier = current_mul
            bet_record.win_amount = win_amount
            
        user.balance += win_amount
        await session.commit()

        player['cashout'] = current_mul
        player['profit'] = win_amount
        
        return web.json_response({'success': True, 'balance': user.balance, 'win_amount': win_amount, 'multiplier': current_mul})
        
async def list_cases(request):
    async with async_session() as session:
        result = await session.execute(select(Case).where(Case.is_active == True))
        cases = result.scalars().all()
        cases_data = []
        for case in cases:
            local_img = f'dist/assets/images/cases/case_{case.id}.png'
            image_url = f'/assets/images/cases/case_{case.id}.png' if os.path.exists(local_img) else (case.image_url or '/assets/images/free-stars-case.png')
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

        items_data = []
        for item in items:
            gift = item.gift
            gift_number = gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1)
            items_data.append({
                'id': item.id, 
                'drop_chance': item.drop_chance,
                'gift': { 
                    'id': gift.id, 'name': gift.name, 'value': gift.value, 'image_url': gift.image_url, 
                    'gift_number': gift_number, 'is_stars': bool(gift.gift_number and gift.gift_number >= 200) 
                }
            })
        return web.json_response({'success': True, 'items': items_data})

async def open_case(request):
    data = await request.json()
    case_id = data.get('case_id')
    user_telegram_id = data.get('user_id')

    if not case_id or not user_telegram_id: return web.json_response({'success': False, 'error': 'Missing parameters'})

    try:
        case_id = int(case_id)
        async with async_session() as session:
            user = (await session.execute(select(User).where(User.telegram_id == user_telegram_id))).scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            case = await session.get(Case, case_id)
            if not case: return web.json_response({'success': False, 'error': 'Case not found'})

            # Списываем баланс или проверяем кулдаун
            if case.is_free:
                if user.last_free_case:
                    from datetime import timezone
                    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
                    
                    last_case = user.last_free_case
                    if isinstance(last_case, str):
                        last_case = datetime.fromisoformat(last_case)
                    last_case = last_case.replace(tzinfo=None)
                    
                    time_diff = now_utc - last_case
                    if time_diff < timedelta(hours=24):
                        remaining = timedelta(hours=24) - time_diff
                        hours_left = int(remaining.total_seconds() // 3600)
                        return web.json_response({'success': False, 'error': f'Бесплатный кейс доступен через {hours_left} ч'})
            else:
                if user.balance < case.price: return web.json_response({'success': False, 'error': 'Insufficient balance'})
                user.balance -= case.price

            items_result = await session.execute(select(CaseItem).where(CaseItem.case_id == case_id).options(joinedload(CaseItem.gift)))
            items = items_result.scalars().unique().all()
            if not items: return web.json_response({'success': False, 'error': 'No items in case'})

            # ЗАЩИТА: проверяем шансы
            total_chance = sum((float(item.drop_chance) if item.drop_chance else 0.0) for item in items)
            if total_chance <= 0: return web.json_response({'success': False, 'error': 'Шансы в кейсе не настроены'})
            
            rand = random.uniform(0, total_chance)
            current = 0
            won_item = items[0]
            
            for item in items:
                current += (float(item.drop_chance) if item.drop_chance else 0.0)
                if rand <= current:
                    won_item = item
                    break
                    
            gift = won_item.gift
            is_stars = bool(gift.gift_number and gift.gift_number >= 200)
            
            if is_stars: 
                user.balance += (int(gift.value) if gift.value else 0)

            opening = CaseOpening(user_id=user.id, case_id=case_id, gift_id=gift.id)
            if is_stars: 
                opening.is_sold = True 
                
            session.add(opening)

            if case.is_free: 
                from datetime import timezone
                user.last_free_case = datetime.now(timezone.utc).replace(tzinfo=None)

            await session.commit()
            await session.refresh(opening)

            return web.json_response({
                'success': True, 'opening_id': opening.id,
                'gift': { 
                    'id': gift.id, 'name': gift.name, 'value': gift.value, 'image_url': gift.image_url, 
                    'gift_number': gift.gift_number or ((gift.id - 1) % 120 + 1), 'is_stars': is_stars 
                },
                'balance': user.balance
            })
    except Exception as e:
        print(f"❌ Error in open_case: {e}")
        import traceback
        traceback.print_exc()
        # ТЕПЕРЬ ОШИБКА БУДЕТ ВЫВОДИТЬСЯ ПРЯМО В ТЕЛЕФОНЕ!
        return web.json_response({'success': False, 'error': f'Сбой сервера: {e}'}, status=500)
        
async def notify_admins_about_withdrawal(withdrawal_id, user_id, username, gift_name, price):
    """Фоновая функция для отправки уведомлений админам"""
    bot_token = os.getenv('BOT_TOKEN')
    admin_ids = [int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x]
    if not bot_token or not admin_ids: return

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    kb = {
        "inline_keyboard": [
            [
                {"text": "✅ Подтвердить", "callback_data": f"wd_appr_{withdrawal_id}"},
                {"text": "❌ Отклонить", "callback_data": f"wd_rej_{withdrawal_id}"}
            ]
        ]
    }
    text = (f"📤 <b>Новая заявка на вывод!</b>\n\n"
            f"🎁 Предмет: <b>{gift_name}</b>\n"
            f"💰 Ценность: {price} ⭐\n"
            f"👤 Игрок: <a href='tg://user?id={user_id}'>{username or 'Без имени'}</a>\n"
            f"🆔 Заявка: #{withdrawal_id}")
           
    async with aiohttp.ClientSession() as session:
        for ad_id in admin_ids:
            try:
                await session.post(url, json={"chat_id": ad_id, "text": text, "parse_mode": "HTML", "reply_markup": kb})
            except Exception: pass
            
async def get_inventory(request):
    telegram_id = int(request.match_info['telegram_id'])
    try:
        async with async_session() as session:
            user = (await session.execute(select(User).where(User.telegram_id == telegram_id))).scalar_one_or_none()
            if not user: return web.json_response({'success': False, 'error': 'User not found'})

            # Берем только те, что не проданы и НЕ ВЫВЕДЕНЫ УСПЕШНО (is_withdrawn == False)
            openings = (await session.execute(
                select(CaseOpening)
                .where(CaseOpening.user_id == user.id, CaseOpening.is_sold == False, CaseOpening.is_withdrawn == False)
                .order_by(desc(CaseOpening.created_at)).options(joinedload(CaseOpening.gift))
            )).scalars().unique().all()
            
            # Получаем статусы выводов
            opening_ids = [o.id for o in openings]
            withdrawals = (await session.execute(
                select(Withdrawal).where(Withdrawal.opening_id.in_(opening_ids)).order_by(desc(Withdrawal.created_at))
            )).scalars().all()

            wd_map = {}
            for w in withdrawals:
                if w.opening_id not in wd_map: 
                    wd_map[w.opening_id] = w.status # Записываем только самый свежий статус

            items_data = []
            for opening in openings:
                gift = opening.gift
                status = wd_map.get(opening.id)
                items_data.append({
                    'opening_id': opening.id, 
                    'status': status, # 'pending', 'rejected', или None
                    'created_at': opening.created_at.isoformat(),
                    'gift': { 'id': gift.id, 'name': gift.name, 'rarity': gift.rarity, 'value': gift.value, 'image_url': gift.image_url, 'gift_number': gift.gift_number if gift.gift_number else ((gift.id - 1) % 120 + 1), 'is_stars': bool(gift.gift_number and gift.gift_number >= 200) }
                })
            return web.json_response({'success': True, 'inventory': items_data})
    except Exception as e:
        return web.json_response({'success': False, 'error': 'Internal server error'}, status=500)

async def withdraw_item(request):
    data = await request.json()
    opening_id, user_telegram_id = data.get('opening_id'), data.get('user_id')
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_telegram_id))).scalar_one_or_none()
        opening = await session.get(CaseOpening, opening_id)
        if not user or not opening or opening.user_id != user.id: return web.json_response({'success': False, 'error': 'Not found'})
        if opening.is_withdrawn: return web.json_response({'success': False, 'error': 'Уже выведено'})
        
        # Проверяем, нет ли уже активной заявки
        existing = (await session.execute(select(Withdrawal).where(Withdrawal.opening_id == opening.id, Withdrawal.status == 'pending'))).scalar_one_or_none()
        if existing: return web.json_response({'success': False, 'error': 'Заявка уже в обработке'})

        # Создаем заявку со статусом pending. Флаг is_withdrawn НЕ трогаем!
        withdrawal = Withdrawal(user_id=user.id, opening_id=opening.id, status='pending')
        session.add(withdrawal)
        await session.commit()
        await session.refresh(withdrawal)
        
        gift = await session.get(Gift, opening.gift_id)
        
        # Отправляем уведомление админам
        asyncio.create_task(notify_admins_about_withdrawal(
            withdrawal.id, user.telegram_id, user.username, gift.name, gift.value
        ))
        
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
        
        try:
            from datetime import timezone
            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            
            last_case = user.last_free_case
            # Фикс на случай, если база вернула дату строкой
            if isinstance(last_case, str):
                last_case = datetime.fromisoformat(last_case)
            last_case = last_case.replace(tzinfo=None)
            
            time_diff = now_utc - last_case
            available = time_diff >= timedelta(hours=24)
            return web.json_response({'available': available, 'remaining_seconds': max(0, (timedelta(hours=24) - time_diff).total_seconds()) if not available else 0})
        except Exception as e:
            print(f"Time check error: {e}")
            return web.json_response({'available': True})


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
    code = data.get('promo_code', '').strip().upper()
    
    bot_token = os.getenv('BOT_TOKEN')
    if not bot_token: return web.json_response({'success': False, 'error': 'Токен бота не настроен'})

    bonus_amount = 0
    promo_id = None

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        if not user: return web.json_response({'success': False, 'error': 'Юзер не найден'})

        # Если ввели промокод, проверяем его перед созданием инвойса
        if code:
            promo = (await session.execute(select(PromoCode).where(PromoCode.code == code, PromoCode.is_active == True))).scalar_one_or_none()
            if not promo: return web.json_response({'success': False, 'error': 'Промокод не найден'})
            if promo.promo_type != 'deposit': return web.json_response({'success': False, 'error': 'Этот промокод не для депозита'})
            if promo.uses_limit > 0 and promo.uses_count >= promo.uses_limit: return web.json_response({'success': False, 'error': 'Лимит активаций исчерпан'})
            
            usage = (await session.execute(select(PromoCodeUsage).where(PromoCodeUsage.user_id == user.id, PromoCodeUsage.promo_id == promo.id))).scalar_one_or_none()
            if usage: return web.json_response({'success': False, 'error': 'Вы уже использовали этот код'})
            
            bonus_amount = int(stars * (promo.value / 100.0))
            promo_id = promo.id

        # Сохраняем черновик платежа, чтобы потом знать про бонус
        payment = Payment(user_id=user.id, amount=stars, bonus_amount=bonus_amount, promo_id=promo_id, status='pending')
        session.add(payment)
        await session.commit()
        await session.refresh(payment)

        api_url = f"https://api.telegram.org/bot{bot_token}/createInvoiceLink"
        # Передаем ID платежа в payload, чтобы потом его найти!
        invoice_payload = { "title": f"{stars} Telegram Stars", "description": f"Пополнение баланса на {stars} звезд", "payload": f"pay_{payment.id}", "provider_token": "", "currency": "XTR", "prices": [{"label": f"{stars} Stars", "amount": stars}] }

        try:
            async with aiohttp.ClientSession() as http_session:
                async with http_session.post(api_url, json=invoice_payload) as resp:
                    result = await resp.json()
                    if result.get("ok"): return web.json_response({'success': True, 'invoice_link': result["result"]})
                    else: return web.json_response({'success': False, 'error': result.get("description", "Ошибка API")})
        except Exception as e: return web.json_response({'success': False, 'error': 'Внутренняя ошибка сервера'})
    
async def activate_promo(request):
    data = await request.json()
    user_id = data.get('user_id')
    code = data.get('code', '').strip().upper()

    if not code: return web.json_response({'success': False, 'error': 'Введите промокод'})

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        promo = (await session.execute(select(PromoCode).where(PromoCode.code == code, PromoCode.is_active == True))).scalar_one_or_none()

        if not promo: return web.json_response({'success': False, 'error': 'Промокод не найден или неактивен'})
        if promo.promo_type != 'balance': return web.json_response({'success': False, 'error': 'Этот промокод только для пополнения!'})
        if promo.uses_limit > 0 and promo.uses_count >= promo.uses_limit: return web.json_response({'success': False, 'error': 'Лимит активаций исчерпан'})

        # Проверка, использовал ли уже этот юзер этот код
        usage = (await session.execute(select(PromoCodeUsage).where(PromoCodeUsage.user_id == user.id, PromoCodeUsage.promo_id == promo.id))).scalar_one_or_none()
        if usage: return web.json_response({'success': False, 'error': 'Вы уже активировали этот промокод'})

        # Выдаем бонус
        user.balance += promo.value
        promo.uses_count += 1
        
        # Записываем использование
        new_usage = PromoCodeUsage(user_id=user.id, promo_id=promo.id)
        session.add(new_usage)
        await session.commit()

        return web.json_response({'success': True, 'message': f'Активировано! +{promo.value} ⭐', 'balance': user.balance})
async def index(request):
    with open('dist/index.html', 'r', encoding='utf-8') as f: return web.Response(text=f.read(), content_type='text/html')

async def favicon(request):
    return web.FileResponse('dist/favicon.svg')
    
async def dice_play(request):
    data = await request.json()
    user_id = data.get('user_id')
    bet = int(data.get('bet', 0))
    chance = int(data.get('chance', 80))
    roll_type = data.get('type', 'under')

    if bet < 1: return web.json_response({'success': False, 'error': 'Минимальная ставка 1 ⭐'})
    if chance < 1 or chance > 95: return web.json_response({'success': False, 'error': 'Шанс от 1% до 95%'})
    if roll_type not in ['under', 'over']: return web.json_response({'success': False, 'error': 'Ошибка направления'})

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        if not user or user.balance < bet:
            return web.json_response({'success': False, 'error': 'Недостаточно звезд'})

        # Списываем ставку
        user.balance -= bet

        # --- Математика Nvuti (0 - 999999) ---
        rand_num = random.randint(0, 999999)
        nwin_under = (chance * 10000) - 1
        nwin_over = 1000000 - (chance * 10000)

        is_win = False
        # ВНЕДРИЛИ МАРЖУ (HOUSE EDGE 1%): 99 вместо 100
        multiplier = 99.0 / chance 
        
        # Проверка победы
        if roll_type == 'under' and rand_num <= nwin_under:
            is_win = True
        elif roll_type == 'over' and rand_num >= nwin_over:
            is_win = True

        win_amount = 0
        if is_win:
            win_amount = math.floor(bet * multiplier)
            user.balance += win_amount

        # Запись в БД
        game = DiceGame(user_id=user.id, bet=bet, chance=chance, roll_type=roll_type, roll_result=rand_num, win_amount=win_amount)
        session.add(game)
        await session.commit()

        return web.json_response({
            'success': True,
            'result': rand_num,
            'is_win': is_win,
            'win_amount': win_amount,
            'balance': user.balance
        })
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

        # --- НАСТРОЙКИ СУРОВОСТИ (ПОДКРУТКИ) ---
        # Можешь менять эти значения под свою экономику
        BASE_SCAM_CHANCE = 0.03  # 15% шанс принудительного слива на ПЕРВОМ же клике
        STEP_SCAM_CHANCE = 0.01  # +5% к шансу слива за каждый следующий открытый кристалл

        # АНТИ-МИНУС И ПОДКРУТКА
        if cell not in mines_pos:
            coefs = MINES_COEFS.get(game.bombs, [])
            # Защита от выхода за пределы массива коэффициентов
            safe_step = min(game.step, len(coefs) - 1)
            next_win = int(game.bet * coefs[safe_step])
            
            force_lose = False
            
            # 1. Классический анти-минус (защита кассы)
            if (next_win - game.bet) > MINES_BANK:
                force_lose = True
            
            # 2. Жесткая подкрутка (казино-режим)
            else:
                # Вычисляем текущий шанс слива. 
                # Например, на 3-м шаге шанс будет: 15% + (3 * 5%) = 30% шанса взорваться на пустом месте!
                current_scam_chance = BASE_SCAM_CHANCE + (game.step * STEP_SCAM_CHANCE)
                
                # Кидаем "кубик" от 0.0 до 1.0
                if random.random() < current_scam_chance:
                    force_lose = True

            # Если сервер решил слить игрока — незаметно перемещаем мину в кликнутую ячейку
            if force_lose and mines_pos:
                mine_to_remove = random.choice(mines_pos) # Берем случайную настоящую мину
                mines_pos.remove(mine_to_remove)          # Убираем её со старого места
                mines_pos.append(cell)                    # Кладем прямо под палец игроку
                game.mines_positions = json.dumps(mines_pos)

        # Добавляем ячейку в открытые
        clicked.append(cell)
        game.clicked_positions = json.dumps(clicked)

        if cell in mines_pos:
            # БАБАХ! Проигрыш
            game.is_active = False
            MINES_BANK += int(game.bet * 0.9) # 90% идет в банк проекта
            await session.commit()
            return web.json_response({'success': True, 'status': 'lose', 'mines': mines_pos, 'clicked': clicked})
        else:
            # УСПЕХ!
            game.step += 1
            coefs = MINES_COEFS.get(game.bombs, [])
            safe_step = min(game.step - 1, len(coefs) - 1)
            game.win_amount = int(game.bet * coefs[safe_step])
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
        clicked = json.loads(game.clicked_positions)
        await session.commit()
        return web.json_response({'success': True, 'win_amount': game.win_amount, 'balance': user.balance, 'mines': mines_pos, 'clicked': clicked})
async def plinko_play(request):
    data = await request.json()
    user_id = data.get('user_id')
    bet = int(data.get('bet', 0))
    difficulty = data.get('difficulty', 'low')
    pins = int(data.get('pins', 8))

    if bet < 1:
        return web.json_response({'success': False, 'error': 'Минимальная ставка 1 ⭐'})
    if difficulty not in ['low', 'medium', 'high']:
        return web.json_response({'success': False, 'error': 'Неверная сложность'})
    if pins < 8 or pins > 16:
        return web.json_response({'success': False, 'error': 'Пинов должно быть от 8 до 16'})

    async with async_session() as session:
        user = (await session.execute(select(User).where(User.telegram_id == user_id))).scalar_one_or_none()
        if not user or user.balance < bet:
            return web.json_response({'success': False, 'error': 'Недостаточно звезд'})

        # Списываем ставку
        user.balance -= bet

        # Генерируем траекторию (как в PHP скрипте)
        # Шарик на каждом ряду (от 0 до pins) падает либо влево (0), либо вправо (1)
        # Количество "вправо" (1) определяет номер итоговой корзины (от 0 до pins)
        directions = [random.choice([0, 1]) for _ in range(pins)]
        bucket = sum(directions)

        # Получаем множитель из таблицы
        multiplier = PLINKO_MULTIPLIERS[difficulty][pins][bucket]

        # Считаем выигрыш
        win_amount = math.floor(bet * multiplier)
        user.balance += win_amount

        # Записываем в БД
        game = PlinkoGame(
            user_id=user.id, bet=bet, difficulty=difficulty, 
            pins=pins, bucket=bucket, multiplier=multiplier, win_amount=win_amount
        )
        session.add(game)
        await session.commit()

        return web.json_response({
            'success': True,
            'path': directions, # Отдаем путь клиенту для отрисовки анимации
            'bucket': bucket,
            'multiplier': multiplier,
            'win_amount': win_amount,
            'balance': user.balance
        })
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
        web.get('/api/crash/ws', crash_ws),
        web.post('/api/crash/bet', crash_bet),
        web.post('/api/crash/cashout', crash_cashout),
        web.post('/api/dice/play', dice_play),
        web.post('/api/promo/activate', activate_promo),
        web.post('/api/plinko/play', plinko_play),
    ]

    for route in api_routes: cors.add(app.router.add_route(route.method, route.path, route.handler))
    app.router.add_get('/', index)
    app.router.add_get('/favicon.svg', favicon)
    
    import os
    
    os.makedirs('dist/assets', exist_ok=True)
    
    
    app.router.add_static('/assets', 'dist/assets', show_index=False)
    
    # Жесткий фикс базы при старте
    await init_db()
    return app

async def init_app():
    app = await create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    host, port = os.getenv('HOST', '0.0.0.0'), int(os.getenv('PORT', 8443))
    site = web.TCPSite(runner, host, port)
    asyncio.create_task(crash_game.run_loop())
    await site.start()
    print("🚀 Server Started!")
    try:
        while True: await asyncio.sleep(3600)
    except KeyboardInterrupt: pass
    finally: await runner.cleanup()

if __name__ == '__main__':
    asyncio.run(init_app())