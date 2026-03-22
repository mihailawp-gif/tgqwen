import asyncio
import sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).parent.parent))
from database.models import init_db, async_session, Case, Gift, CaseItem, User, CaseOpening, Withdrawal, MinesGame, CrashBet, DiceGame, PromoCode, PromoCodeUsage, Payment, PlinkoGame
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
    (4,    "Gem Signet",           14906), 
    #(128,  "Krypton Gem",          11167), 
    (42,   "Mini Oscar",           11077),
    #(129,  "Victory Hand",         10631), 
    (66,   "Parfume Bottle",       10429),
    (46,   "Scared Cat",           9775),
    (130,  "Jade Token",           9586),  
    (12,   "Artisan Brick",        9585),
    (77,   "Diamond Ring",         7851),
    (56,   "Kissed Frog",          6231),
    (20,  "Bonded Ring",         6229),  
    (88,   "Swiss Watch",          5654),
    (84,   "Genie Lamp",           5438),
    (103,  "Red Lips",             4707),
    (102,  "Toy Bear",             4677),
    #(132,  "Snoop Car",            4621),  
    (58,   "Neko Helmet",          4129),
    (53,   "Vintage Cigar",        3729),
    (59,   "Electric Skull",       3623),
    (64,   "Skull Flower",         1174),
    (72,   "Voodoo Doll",          3331),
    (63,   "Eternal Rose",         2632),
    (105,  "Ionic Dryer",          1916),
    (52,   "Magic Potion",         1647),
    (104,  "Sky Stilettos",        1582),
    (65,   "Mad Pumpkin",          1534),
    (68,   "Trapped Heart",        1423),
    (36,   "Crystal Ball",         1335),
    (96,   "Eternal Candle",       1319),
    (97,   "Sakura Flower",        1195),
    (69,   "Flying Broom",         1145),
    (1,    "Victory Medal",        580),
    (10,   "Stellar Rocket",       350),
    (11,   "Jack In The Box",      599),
    (13,   "Jolly Chimp",          768),
    (14,   "Happy Brownie",        650),
    (23,   "Bling Blinky",         500),   
    (26,   "Private bag",             671),
    (48,   "Clover Pin",           622),
    (50,   "Cupid Charm",          2043),   
    (51,   "Nail Bracelet",        900),
    (55,   "Hypno Lollipop",       600),
    (62,   "Fresh Socks",          598),
    (67,   "Witch Hat",            671),
    (70,   "Sharp Tongue",         450),   
    (73,   "Input Key",            671),
    (74,   "Evil Eye",             788),
    (75,   "Top Hat",              1392),
    (78,   "Loot Bag",          15000),
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
    (111,  "Desk Calendar",        550),
    (114,  "Santa Hat",            555),
    (115,  "Instant Ramen",        250),
    (116,  "B-Day Candle",         550),
    (117,  "Ginger Cookie",        649),
    (120,  "Tama Gadget",          570),
    (121,  "Goblet",               100),
    (122,  "Heart",                15),
    (123,  "Diamond",              100),
    (124,  "Ring",                 100),
    (125,  "Champagne",            50),
    # (143,  "Cool Dog",             372),
    # (144,  "Ice Cream",            375),
    # (146,  "Xmas Stocking",        300),
    # (147,  "Candy Cane",           433),
    # (148,  "Pot of Gold",          590),
    # (149,  "White Bunny",          750),
    # (150,  "Hot Cocoa",            500),
    # (151,  "Mulled Wine",          550),
    # (152,  "Year 2025",            400),
    # (153,  "Piano Keys",           549),
    # (154,  "Xmas Wreath",          515),
    # (155,  "Diary Book",           671),
    # (156,  "Golden Egg",           588),
    # (157,  "Mushroom Eye",         671),
    # (158,  "Strawberry Box",       863),
    # (159,  "Mosque Moon",          380),
    # (160,  "White Snake",          300),
    # (162,  "Easter Basket",        639),
    # (163,  "Sparkler",             569),
    # (164,  "Flower Pot",           671),
    # (165,  "Golden Bells",         805),

    # ── ПАКИ ЗВЕЗД ──
    (200,  "Stars 10",             10),
    (201,  "Stars 50",             50),
    (202,  "Stars 100",            100),
    (203,  "Stars 250",            250),
    (204,  "Stars 500",            500),
    (205,  "Stars 1000",           1000),
    (206,  "Stars 5000",           5000),
    (207,  "Stars 1",                 1),
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
        "image_url": "/assets/images/cases/free.png",
        "items": [
            # ID гифта/ключа : Шанс выпадения (Сумма не обязательно 100, но так удобнее)
            {"key": 200, "chance": 89.8}, # 10 звезд (Частый дроп)
            {"key": 201, "chance": 3.0}, # 50 звезд
            {"key": 202, "chance": 3.0}, # 100 звезд
            {"key": 125, "chance": 1.0}, # Champagne (Цена 50)
            {"key": 124, "chance": 1},  # Ring (Цена 100)
            {"key": 205, "chance": 0.01},  # 1000 звезд 
            {"key": 22,  "chance": 0.0001},  # Plush Pepe 
            {"key": 123,  "chance": 2.0},  #     (123,  "Diamond",              100),
            {"key": 111,  "chance": 0.8},  #     (111,  "Desk Calendar",        320),
            {"key": 116,  "chance": 0.9},  #     (116,  "B-Day Candle",         550),
        ]
    },
    {
        "name": "Кейс Подарков",
        "description": "Эксклюзивные подарки Telegram!",
        "price": 350,
        "is_free": False,
        "image_url": "/assets/images/cases/case_2.png",
        "items": [
            {"key": 122, "chance": 40.0}, # Heart (Цена 150 - Окуп 1х)
            {"key": 14, "chance": 4.0}, # HappyBrownie
            {"key": 124, "chance":20.0}, # Ring
            {"key": 144, "chance":10.0}, # Ice Cream
            {"key": 99,  "chance": 7.0}, # Whip Cupcake (Цена 370)
            {"key": 13,  "chance": 2.0},  # Jolly Chimp (Цена 768)
            {"key": 121,  "chance": 30.0},  # Goblet
            {"key": 81,  "chance": 0.01},  # Heart Locket (Цена 2203 - Редкий)
            {"key": 22,  "chance": 0.01},  # pepe 
        ]
    },
    {
        "name": "Премиум кейс",
        "description": "Максимальные шансы на жирный дроп!",
        "price": 777,
        "is_free": False,
        "image_url": "/assets/images/cases/case_3.png",
        "items": [
            {"key": 114, "chance": 45.0}, # Santa Hat (Цена 555 - Окуп 1х)
            {"key": 78,  "chance": 1.0}, # Loot Bag (Цена 671)
            #{"key": 65,  "chance": 15.0}, # Mad Pumpkin (Цена 1534)
            #{"key": 136, "chance": 8.0},  # Engagement Ring (Цена 2960)
            {"key": 46,  "chance": 0.9},  # Scared Cat (Цена 9775)
            {"key": 59,  "chance": 9.9},  #  Electric Skull
            {"key": 55,  "chance": 43.0}, #     (55,   "Hypno Lollipop",       600),
            {"key": 48,  "chance": 22.0},  #     (48,   "Clover Pin",           622),
            {"key": 124,  "chance": 3.0},  #     (124,  "Ring",                 100),
            {"key": 123,  "chance": 3.0},  #     (123,  "Diamond",              100),
            {"key": 111,  "chance": 30.0},  #     (111,  "Desk Calendar",        320),
            {"key": 116,  "chance": 44.0},  #     (116,  "B-Day Candle",         550),
            {"key": 50,  "chance": 4.0},  #     (50,   "Cupid Charm",          2043), 
            {"key": 75,  "chance": 2.00},  #   (75,   "Top Hat",              1392),
            {"key": 104,  "chance": 12.0},  #     (104,  "Sky Stilettos",        1582),
            {"key": 65,  "chance": 7.00},  #     (65,   "Mad Pumpkin",          1534),
            {"key": 18,  "chance": 0.01},  #durov 


            
        ]
    },
    {
        "name": "Дорогой кейс",
        "description": "Испытай удачу",
        "price": 5000,
        "is_free": False,
        "image_url": "/assets/images/cases/bigboom.jpg",
        "items": [
            {"key": 114, "chance": 25.0}, # Santa Hat 
            {"key": 78,  "chance": 1.0}, # Loot Bag 
            {"key": 65,  "chance": 15.0}, # Mad Pumpkin (Цена 1534)
            {"key": 46,  "chance": 3.9},  # Scared Cat (Цена 9775)
            {"key": 64,  "chance": 13.01},  #     (64,   "Skull Flower",         1174),
            {"key": 72,  "chance": 55.01},  #    (72,   "Voodoo Doll",          3331),
            {"key": 56,  "chance": 22.01},  # (56,   "Kissed Frog",          6231),
            {"key": 15,  "chance": 2.0},  # (15,   "Mighty Arm",           19647),
            {"key": 22,  "chance": 0.01},  # Plush Pepe (Цена 1М - Джекпот)
            
        ]
    },
        {
        "name": "Фарм",
        "description": "Да да нет нет да будет свет",
        "price": 100,
        "is_free": False,
        "image_url": "/assets/images/dadanetner.gif",
        "items": [
            {"key": 207, "chance": 99.0}, # 1 star
            {"key": 22,  "chance": 0.01},  # Plush Pepe 
            
        ]
    },
        {
        "name": "Приватный кейс",
        "description": "Проверь свой уровень гойства",
        "price": 19000,
        "is_free": False,
        "image_url": "/assets/images/borov.gif",
        "items": [
            {"key": 56,  "chance": 33.0},  # (56,   "Kissed Frog",          6231)   - Частый дроп (минус)
            {"key": 12,  "chance": 20.0},  # (12,   "Artisan Brick",        9585)   - Частый дроп (минус)
            {"key": 66,  "chance": 16.0},  # (66,   "Parfume Bottle",       10429)  - Частый дроп (минус)
            {"key": 128, "chance": 10.0},  # (128,  "Krypton Gem",          11167)  - Средний дроп (минус)
            {"key": 4,   "chance": 7.0},   # (4,    "Gem Signet",           14906)  - Средний дроп (небольшой минус)
            {"key": 78,  "chance": 6.0},   # (78,   "Loot Bag",             15000)  - Средний дроп (небольшой минус)
            {"key": 15,  "chance": 4.0},   # (15,   "Mighty Arm",           19647)  - Окупаемость (в ноль)
            {"key": 47,  "chance": 2.0},   # (47,   "Heroic Helmet",        28662)  - Редкий дроп (плюс х1.5)
            {"key": 39,  "chance": 1.0},   # (39,   "Precious Peach",       47259)  - Эпический дроп (плюс х2.5)
            {"key": 18,  "chance": 0.6},   # (18,   "Durov's Cap",          80043)  - Мифический дроп (плюс х4.2)
            {"key": 81,  "chance": 0.3},   # (81,   "Heart Locket",         210892) - Легендарный дроп (плюс х11)
            {"key": 22,  "chance": 0.1},   # Plush Pepe (Цена 1М - Джекпот)         - Джекпот (плюс х52)   - Джекпот (х52)
            
        ]
    },
    {
            "name": "Коробка Модника",
            "description": "Люкс в каждой коробке. Почти.",
            "price": 2500,
            "is_free": False,
            "image_url": "/assets/images/pushkin.png",
            "items": [
                {"key": 51,  "chance": 35.0}, # (51,  "Nail Bracelet",   900)  - Частый дроп (минус)
                {"key": 75,  "chance": 25.0}, # (75,  "Top Hat",         1392) - Частый дроп (минус)
                {"key": 104, "chance": 16.0}, # (104, "Sky Stilettos",   1582) - Средний дроп (минус)
                {"key": 105, "chance": 10.0}, # (105, "Ionic Dryer",     1916) - Средний дроп (небольшой минус)
                {"key": 63,  "chance": 7.0},  # (63,  "Eternal Rose",    2632) - Окупаемость (в ноль)
                {"key": 53,  "chance": 4.0},  # (53,  "Vintage Cigar",   3729) - Редкий дроп (плюс х1.5)
                {"key": 103, "chance": 2.0},  # (103, "Red Lips",        4707) - Эпический дроп (плюс х1.8)
                {"key": 88,  "chance": 0.8},  # (88,  "Swiss Watch",     5654) - Мифический дроп (плюс х2.2)
                {"key": 77,  "chance": 0.2},  # (77,  "Diamond Ring",    7851) - Легендарный дроп (плюс х3.1)
            ]
        },
        {
            "name": "Сокровище Элиты",
            "description": "Только для тех, кто знает толк в роскоши",
            "price": 16000,
            "is_free": False,
            "image_url": "/assets/images/elite.gif",
            "items": [
                {"key": 130, "chance": 45.0}, # (130, "Jade Token",      9586) - Частый дроп (минус)
                {"key": 46,  "chance": 25.0}, # (46,  "Scared Cat",      9775) - Частый дроп (минус)
                {"key": 12, "chance": 12.0}, # (12, "Artisan Brick",    9585)- Средний дроп (минус)
                {"key": 42,  "chance": 10.0}, # (42,  "Mini Oscar",      11077)- Средний дроп (минус)
                {"key": 78, "chance": 5.0},  # (78, "Loot Bag",      15000)- Окупаемость (плюс)
                {"key": 49,  "chance": 2.0},  # (49,  "Astral Shard",    21195)- Редкий дроп (плюс х1.3)
                {"key": 47,  "chance": 0.7},  # (47,  "Heroic Helmet",   28662)- Эпический дроп (плюс х1.8)
                {"key": 39,  "chance": 0.2},  # (39,  "Precious Peach",  47259)- Мифический дроп (плюс х2.9)
                {"key": 18,  "chance": 0.1},  # (18,  "Durov's Cap",     80043)- Легендарный дроп (плюс х5)
            ]
        },
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
            image_url = "/assets/images/star.png" if is_stars else f"/assets/images/gift_limited_{num}.tgs"
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
                    gift = Gift(name=name, gift_id=key, rarity='unique', value=value, gift_number=None, image_url="/assets/images/star.png")
                    session.add(gift)
                await session.flush() # Сразу записываем в базу, чтобы получить ID
                gift_objs[key] = gift.id # Храним только ЧИСЛО (ID)
            except Exception: await session.rollback()
        
        await session.commit()
        
        # Пересоздание кейсов
# --- УМНОЕ ОБНОВЛЕНИЕ КЕЙСОВ (ФИКС ДУБЛИКАТОВ) ---
        # 1. Отключаем вообще все кейсы (прячем дубликаты)
        existing_cases = (await session.execute(select(Case))).scalars().all()
        for c in existing_cases:
            c.is_active = False
        await session.commit()
        
        # 2. Обновляем оригиналы или создаем новые
        for case_data in CASES_CONFIG:
            try:
                # Ищем кейс по имени (берем самый первый, чтобы игнорировать дубли)
                result = await session.execute(select(Case).where(Case.name == case_data["name"]).order_by(Case.id))
                case = result.scalars().first()
                
                if case:
                    # Обновляем старый кейс
                    case.description = case_data["description"]
                    case.price = case_data["price"]
                    case.is_free = case_data["is_free"]
                    case.image_url = case_data["image_url"]
                    case.is_active = True
                else:
                    # Если такого кейса еще нет - создаем
                    case = Case(
                        name=case_data["name"], description=case_data["description"],
                        price=case_data["price"], is_free=case_data["is_free"],
                        image_url=case_data["image_url"], is_active=True
                    )
                    session.add(case)
                
                await session.flush()
                
                # Удаляем старые шансы/предметы только для этого кейса
                await session.execute(delete(CaseItem).where(CaseItem.case_id == case.id))
                
                # Добавляем новые предметы с правильными шансами из конфига
                for item_data in case_data["items"]:
                    key = item_data["key"]
                    if key in gift_objs:
                        session.add(CaseItem(
                            case_id=case.id,
                            gift_id=gift_objs[key],
                            drop_chance=item_data["chance"]
                        ))
                await session.commit()
                print(f"✅ Кейс '{case_data['name']}' успешно обновлен!")
            except Exception as e:
                print(f"⚠️ Ошибка кейса {case_data['name']}: {e}")
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