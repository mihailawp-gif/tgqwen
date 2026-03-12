import asyncio
import sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).parent.parent))
from database.models import init_db, async_session, Case, Gift, CaseItem, User, CaseOpening, Withdrawal, MinesGame, CrashBet, DiceGame, PromoCode, PromoCodeUsage, Payment
from sqlalchemy import select, delete

# ──────────────────────────────────────────────────────────────────
# КАТАЛОГ ВСЕХ ГИФТОВ (Без редкостей, только Номер/ID, Название и Цена в звездах)
# ──────────────────────────────────────────────────────────────────
GIFTS_CATALOG = [
    (22,   "Plush Pepe",           1006500),
    (18,   "Durov's Cap",          80043),
    (81,  "Heart Locket",         210892), 
    (39,   "Precious Peach",       47259),
    (47,   "Heroic Helmet",        28662),
    (49,   "Astral Shard",         21195),
    (15,   "Mighty Arm",           19647),
    (127,  "Luxury Bag",           18098), 
    (4,    "Gem Signet",           14906), 
    (128,  "Krypton Gem",          11167), 
    (42,   "Mini Oscar",           11077),
    (129,  "Victory Hand",         10631), 
    (66,   "Parfume Bottle",       10429),
    (46,   "Scared Cat",           9775),
    (130,  "Jade Token",           9586),  
    (12,   "Artisan Brick",        9585),
    (77,   "Diamond Ring",         7851),
    (56,   "Kissed Frog",          6231),
    (131,  "Eclipse Ring",         6229),  
    (88,   "Swiss Watch",          5654),
    (84,   "Genie Lamp",           5438),
    (103,  "Red Lips",             4707),
    (102,  "Toy Bear",             4677),
    (132,  "Retro Car",            4621),  
    (58,   "Neko Helmet",          4129),
    (133,  "Ice Eagle",            3954),  
    (134,  "Signet Ring II",       3753),  
    (53,   "Vintage Cigar",        3729),
    (135,  "Golden Pacifier",      3643),
    (59,   "Electric Skull",       3623),
    (64,   "Skull Flower",         1174),
    (72,   "Voodoo Doll",          3331),
    (136,  "Engagement Ring",      2960),  
    (137,  "Winter Hat",           2663),  
    (63,   "Eternal Rose",         2632),
    (105,  "Ionic Dryer",          1916),
    (52,   "Magic Potion",         1647),
    (104,  "Sky Stilettos",        1582),
    (65,   "Mad Pumpkin",          1534),
    (68,   "Trapped Heart",        1423),
    (138,  "Vinyl Player",         1403),
    (139,  "UFC Box",              1385),
    (36,   "Crystal Ball",         1335),
    (96,   "Eternal Candle",       1319),
    (97,   "Sakura Flower",        1195),
    (140,  "Purple Flower",        1174),
    (141,  "Joint",                1174),  
    (69,   "Flying Broom",         1145),
    (142,  "Jingle Bell",          1116),
    (1,    "Victory Medal",        580),
    (10,   "Stellar Rocket",       350),
    (11,   "Jack In The Box",      599),
    (13,   "Jolly Chimp",          768),
    (14,   "Happy Brownie",        650),
    (23,   "Bling Blinky",         500),   
    (26,   "Loot Bag",             671),
    (48,   "Clover Pin",           287),
    (50,   "Cupid Charm",          743),   
    (51,   "Nail Bracelet",        900),
    (55,   "Hypno Lollipop",       600),
    (62,   "Fresh Socks",          598),
    (67,   "Witch Hat",            671),
    (70,   "Sharp Tongue",         450),   
    (73,   "Input Key",            671),
    (74,   "Evil Eye",             788),
    (75,   "Top Hat",              1392),
    (78,   "Loot Bag II",          400),
    (85,   "Light Sword",          671),
    (86,   "Lol Pop",              280),
    (87,   "Restless Jar",         671),
    (91,   "Jester Hat",           500),
    (92,   "Moon Pendant",         635),
    (93,   "Faith Amulet",         287),
    (94,   "Homemade Cake",        400),
    (99,   "Whip Cupcake",         370),
    (100,  "Bow Tie",              666),
    (109,  "Snow Mittens",         650),
    (111,  "Desk Calendar",        320),
    (114,  "Santa Hat",            555),
    (115,  "Instant Ramen",        250),
    (116,  "B-Day Candle",         300),
    (117,  "Ginger Cookie",        649),
    (120,  "Tama Gadget",          570),
    (121,  "Goblet",               100),
    (122,  "Heart",                150),
    (123,  "Diamond",              100),
    (124,  "Ring",                 100),
    (125,  "Champagne",            50),
    (143,  "Cool Dog",             372),
    (144,  "Ice Cream",            375),
    (145,  "Poop",                 300),
    (146,  "Xmas Stocking",        300),
    (147,  "Candy Cane",           433),
    (148,  "Pot of Gold",          590),
    (149,  "White Bunny",          750),
    (150,  "Hot Cocoa",            500),
    (151,  "Mulled Wine",          550),
    (152,  "Year 2025",            400),
    (153,  "Piano Keys",           549),
    (154,  "Xmas Wreath",          515),
    (155,  "Diary Book",           671),
    (156,  "Golden Egg",           588),
    (157,  "Mushroom Eye",         671),
    (158,  "Strawberry Box",       863),
    (159,  "Mosque Moon",          380),
    (160,  "White Snake",          300),
    (161,  "Happy B-Day",          199),
    (162,  "Easter Basket",        639),
    (163,  "Sparkler",             569),
    (164,  "Flower Pot",           671),
    (165,  "Golden Bells",         805),

    # ── ПАКИ ЗВЕЗД ──
    (200,  "Stars 10",             10),
    (201,  "Stars 50",             50),
    (202,  "Stars 100",            100),
    (203,  "Stars 250",            250),
    (204,  "Stars 500",            500),
    (205,  "Stars 1000",           1000),
    (206,  "Stars 5000",           5000),
]

PENDING_GIFTS = [
    ("pet_snake",     "Pet Snake",      1500),
    ("lunar_snake",   "Lunar Snake",    1400),
    ("snake_box",     "Snake Box",      1200),
    ("snow_globe",    "Snow Globe",     625),
    ("pink_cupcake",  "Pink Cupcake",   795),
]

# ──────────────────────────────────────────────────────────────────
# НАСТРОЙКА КЕЙСОВ И ШАНСОВ (Теперь все шансы в процентах прямо тут!)
# ──────────────────────────────────────────────────────────────────
CASES_CONFIG = [
    {
        "name": "Бесплатный кейс",
        "description": "Открывай раз в 24 часа бесплатно!",
        "price": 0,
        "is_free": True,
        "image_url": "/static/images/free-stars-case.png",
        "items": [
            # ID гифта/ключа : Шанс выпадения (Сумма не обязательно 100, но так удобнее)
            {"key": 200, "chance": 89.8}, # 10 звезд (Частый дроп)
            {"key": 201, "chance": 3.0}, # 50 звезд
            {"key": 202, "chance": 3.0}, # 100 звезд
            {"key": 125, "chance": 2.0}, # Champagne (Цена 50)
            {"key": 124, "chance": 2.0},  # Ring (Цена 100)
            {"key": 205, "chance": 0.1},  # 1000 звезд (Редкий)
            {"key": 22,  "chance": 0.1},  # Plush Pepe (Невероятно редкий, джекпот)
        ]
    },
    {
        "name": "Кейс Подарков",
        "description": "Эксклюзивные подарки Telegram!",
        "price": 150,
        "is_free": False,
        "image_url": "/static/images/premium-gifts-case.png",
        "items": [
            {"key": 122, "chance": 40.0}, # Heart (Цена 150 - Окуп 1х)
            {"key": 145, "chance": 30.0}, # Poop (Цена 300 - Окуп 2х)
            {"key": 99,  "chance": 20.0}, # Whip Cupcake (Цена 370)
            {"key": 13,  "chance": 8.0},  # Jolly Chimp (Цена 768)
            {"key": 81,  "chance": 0.01},  # Heart Locket (Цена 2203 - Редкий)
            {"key": 18,  "chance": 0.01},  # Durov's Cap (Цена 80к - Супер редкий)
        ]
    },
    {
        "name": "Премиум кейс",
        "description": "Максимальные шансы на жирный дроп!",
        "price": 500,
        "is_free": False,
        "image_url": "/static/images/premium-gifts-case.png",
        "items": [
            {"key": 114, "chance": 45.0}, # Santa Hat (Цена 555 - Окуп 1х)
            {"key": 26,  "chance": 30.0}, # Loot Bag (Цена 671)
            {"key": 65,  "chance": 15.0}, # Mad Pumpkin (Цена 1534)
            {"key": 136, "chance": 8.0},  # Engagement Ring (Цена 2960)
            {"key": 46,  "chance": 1.9},  # Scared Cat (Цена 9775)
            {"key": 22,  "chance": 0.01},  # Plush Pepe (Цена 1М - Джекпот)
        ]
    }
]

async def populate_db():
    async with async_session() as session:
        # Сохранение юзеров
        users_data = []
        try:
            users_result = await session.execute(select(User))
            for user in users_result.scalars().all():
                users_data.append({
                    'telegram_id': user.telegram_id, 'username': user.username,
                    'first_name': user.first_name, 'last_name': user.last_name,
                    'photo_url': user.photo_url, 'balance': user.balance,
                    'free_case_available': user.free_case_available,
                    'last_free_case': user.last_free_case.isoformat() if user.last_free_case else None,
                })
        except Exception:
            await session.rollback()
        
        # Обновление гифтов
        gift_objs = {}
        for num, name, value in GIFTS_CATALOG:
            is_stars = num >= 200
            image_url = "/static/images/star.png" if is_stars else f"/static/images/gift_limited_{num}.tgs"
            try:
                result = await session.execute(select(Gift).where(Gift.gift_number == num))
                gift = result.scalar_one_or_none()
                if gift:
                    gift.name = name; gift.value = value; gift.image_url = image_url; gift.rarity = 'unique'
                else:
                    gift = Gift(name=name, gift_id=f"gift_{num}", rarity='unique', value=value, gift_number=num, image_url=image_url)
                    session.add(gift)
                await session.flush() # Сразу записываем в базу, чтобы получить ID
                gift_objs[num] = gift.id # Храним только ЧИСЛО (ID), чтобы избежать ошибки greenlet
            except Exception: await session.rollback()
        
        for key, name, value in PENDING_GIFTS:
            try:
                result = await session.execute(select(Gift).where(Gift.gift_id == key))
                gift = result.scalar_one_or_none()
                if gift:
                    gift.name = name; gift.value = value; gift.rarity = 'unique'
                else:
                    gift = Gift(name=name, gift_id=key, rarity='unique', value=value, gift_number=None, image_url="/static/images/star.png")
                    session.add(gift)
                await session.flush() # Сразу записываем в базу, чтобы получить ID
                gift_objs[key] = gift.id # Храним только ЧИСЛО (ID)
            except Exception: await session.rollback()
        
        await session.commit()
        
        # Пересоздание кейсов
        try:
            await session.execute(delete(CaseItem))
            await session.execute(delete(Case))
            await session.commit()
        except Exception: await session.rollback()
        
        # Создание кейсов из конфига
        for case_data in CASES_CONFIG:
            try:
                case = Case(
                    name=case_data["name"], description=case_data["description"],
                    price=case_data["price"], is_free=case_data["is_free"],
                    image_url=case_data["image_url"]
                )
                session.add(case)
                await session.flush()
                
                for item_data in case_data["items"]:
                    key = item_data["key"]
                    if key in gift_objs:
                        session.add(CaseItem(
                            case_id=case.id,
                            gift_id=gift_objs[key], # Здесь теперь подставляется готовое число
                            drop_chance=item_data["chance"]
                        ))
                await session.commit()
                print(f"✅ Кейс '{case_data['name']}' успешно создан")
            except Exception as e:
                print(f"⚠️ Ошибка создания кейса {case_data['name']}: {e}")
                await session.rollback()

        # Восстановление юзеров
        if users_data:
            try:
                for u in users_data:
                    result = await session.execute(select(User).where(User.telegram_id == u['telegram_id']))
                    user = result.scalar_one_or_none()
                    if not user:
                        session.add(User(
                            telegram_id=u['telegram_id'], username=u['username'], first_name=u['first_name'],
                            last_name=u['last_name'], photo_url=u['photo_url'], balance=u['balance'],
                            free_case_available=u['free_case_available'],
                            last_free_case=datetime.fromisoformat(u['last_free_case']) if u['last_free_case'] else None,
                        ))
                    else:
                        user.balance = u['balance']
                await session.commit()
            except Exception: await session.rollback()
            
async def main():
    print("🔄 Инициализация таблиц...")
    from database.models import init_db as create_tables, engine
    await create_tables()
    await populate_db()
    print("✅ База данных готова и кейсы настроены!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())