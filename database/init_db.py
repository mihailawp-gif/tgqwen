"""
init_db.py — инициализация БД с правильными TGS-маппингами.
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).parent.parent))
from database.models import init_db, async_session, Case, Gift, CaseItem, User, CaseOpening, Withdrawal, MinesGame, CrashBet, DiceGame, PromoCode, PromoCodeUsage, Payment
from sqlalchemy import select, delete

# ──────────────────────────────────────────────────────────────────
# ПОЛНЫЙ КАТАЛОГ ГИФТОВ (реальные цены с рынка Telegram Gifts)
# Основано на вторичном рынке Getgems / Tonnel
# 
# gift_number >= 200 = "Stars" — зачисляются на баланс автоматически
# gift_number = None  = кастомный подарок без TGS-файла
# ──────────────────────────────────────────────────────────────────
GIFTS_CATALOG = [
    # num   name                   rarity         value(⭐)
    # ── LEGENDARY (> 50k) ──
    (22,   "Plush Pepe",           "legendary",   1006500), # 1M+ звёзд
    (18,   "Durov's Cap",          "legendary",   80043),
    (126,  "Heart Locket",         "legendary",   210892),  # Sailor Moon style
    
    # ── EPIC (5k - 50k) ──
    (39,   "Precious Peach",       "epic",        47259),
    (47,   "Heroic Helmet",        "epic",        28662),
    (49,   "Astral Shard",         "epic",        21195),
    (15,   "Mighty Arm",           "epic",        19647),
    (127,  "Luxury Bag",           "epic",        18098), # Hermes style
    (4,    "Gem Signet",           "epic",        14906), # Gold Halo Ring
    (128,  "Krypton Gem",          "epic",        11167), # Green Crystals
    (42,   "Mini Oscar",           "epic",        11077),
    (129,  "Victory Hand",         "epic",        10631), # Gold Hand
    (66,   "Parfume Bottle",       "epic",        10429),
    (46,   "Scared Cat",           "epic",        9775),
    (130,  "Jade Token",           "epic",        9586),  # Green Circle
    (12,   "Artisan Brick",        "epic",        9585),
    (77,   "Diamond Ring",         "epic",        7851),
    (56,   "Kissed Frog",          "epic",        6231),
    (131,  "Eclipse Ring",         "epic",        6229),  # Black/Gold Ring
    (88,   "Swiss Watch",          "epic",        5654),
    (84,   "Genie Lamp",           "epic",        5438),

    # ── RARE (1k - 5k) ──
    (103,  "Red Lips",             "rare",        4707),
    (102,  "Toy Bear",             "rare",        4677),
    (132,  "Retro Car",            "rare",        4621),  # Blue Car
    (58,   "Neko Helmet",          "rare",        4129),
    (133,  "Ice Eagle",            "rare",        3954),  # Crystal Eagle
    (134,  "Signet Ring II",       "rare",        3753),  # Square Gold Ring
    (53,   "Vintage Cigar",        "rare",        3729),
    (135,  "Golden Pacifier",      "rare",        3643),
    (59,   "Electric Skull",       "rare",        3623),
    (64,   "Skull Flower",         "rare",        1174),
    (72,   "Voodoo Doll",          "rare",        3331),
    (136,  "Engagement Ring",      "rare",        2960),  # Ring in Box
    (137,  "Winter Hat",           "rare",        2663),  # Ushanka
    (63,   "Eternal Rose",         "rare",        2632),
    (81,   "Heart Locket",         "rare",        2203),  # Gold Key Heart
    (105,  "Ionic Dryer",          "rare",        1916),
    (52,   "Magic Potion",         "rare",        1647),
    (104,  "Sky Stilettos",        "rare",        1582),
    (65,   "Mad Pumpkin",          "rare",        1534),
    (68,   "Trapped Heart",        "rare",        1423),
    (138,  "Vinyl Player",         "rare",        1403),
    (139,  "UFC Box",              "rare",        1385),
    (36,   "Crystal Ball",         "rare",        1335),
    (96,   "Eternal Candle",       "rare",        1319),
    (97,   "Sakura Flower",        "rare",        1195),
    (140,  "Purple Flower",        "rare",        1174),
    (141,  "Joint",                "rare",        1174),  # Сигарета
    (69,   "Flying Broom",         "rare",        1145),
    (142,  "Jingle Bell",          "rare",        1116),

    # ── COMMON (< 1k) ──
    (1,    "Victory Medal",        "common",      580),
    (10,   "Stellar Rocket",       "common",      350),
    (11,   "Jack In The Box",      "common",      599),
    (13,   "Jolly Chimp",          "common",      768),
    (14,   "Happy Brownie",        "common",      650),
    (23,   "Bling Blinky",         "common",      500),   # Jester Hat
    (26,   "Loot Bag",             "common",      671),
    (48,   "Clover Pin",           "common",      287),
    (50,   "Cupid Charm",          "common",      743),   # Dog in bag
    (51,   "Nail Bracelet",        "common",      900),
    (55,   "Hypno Lollipop",       "common",      600),
    (62,   "Fresh Socks",          "common",      598),
    (67,   "Witch Hat",            "common",      671),
    (70,   "Sharp Tongue",         "common",      450),   # Green Snake
    (73,   "Input Key",            "common",      671),
    (74,   "Evil Eye",             "common",      788),
    (75,   "Top Hat",              "common",      1392),
    (78,   "Loot Bag II",          "common",      400),
    (85,   "Light Sword",          "common",      671),
    (86,   "Lol Pop",              "common",      280),
    (87,   "Restless Jar",         "common",      671),
    (91,   "Jester Hat",           "common",      500),
    (92,   "Moon Pendant",         "common",      635),
    (93,   "Faith Amulet",         "common",      287),
    (94,   "Homemade Cake",        "common",      400),
    (99,   "Whip Cupcake",         "common",      370),
    (100,  "Bow Tie",              "common",      666),
    (109,  "Snow Mittens",         "common",      650),
    (111,  "Desk Calendar",        "common",      320),
    (114,  "Santa Hat",            "common",      555),
    (115,  "Instant Ramen",        "common",      250),
    (116,  "B-Day Candle",         "common",      300),
    (117,  "Ginger Cookie",        "common",      649),
    (120,  "Tama Gadget",          "common",      570),
    (121,  "Goblet",               "common",      100),
    (122,  "Heart",                "common",      150),
    (123,  "Diamond",              "common",      100),
    (124,  "Ring",                 "common",      100),
    (125,  "Champagne",            "common",      50),
    
    # Новые предметы
    (143,  "Cool Dog",             "common",      372),
    (144,  "Ice Cream",            "common",      375),
    (145,  "Poop",                 "common",      300),
    (146,  "Xmas Stocking",        "common",      300),
    (147,  "Candy Cane",           "common",      433),
    (148,  "Pot of Gold",          "common",      590),
    (149,  "White Bunny",          "common",      750),
    (150,  "Hot Cocoa",            "common",      500),
    (151,  "Mulled Wine",          "common",      550),
    (152,  "Year 2025",            "common",      400),
    (153,  "Piano Keys",           "common",      549),
    (154,  "Xmas Wreath",          "common",      515),
    (155,  "Diary Book",           "common",      671),
    (156,  "Golden Egg",           "common",      588),
    (157,  "Mushroom Eye",         "common",      671),
    (158,  "Strawberry Box",       "common",      863),
    (159,  "Mosque Moon",          "common",      380),
    (160,  "White Snake",          "common",      300),
    (161,  "Happy B-Day",          "common",      199),
    (162,  "Easter Basket",        "common",      639),
    (163,  "Sparkler",             "common",      569),
    (164,  "Flower Pot",           "common",      671),
    (165,  "Golden Bells",         "common",      805),

    # ── Stars (ID 200+) ──
    (200,  "Stars x1",             "common",        1),
    (201,  "Stars x2",             "common",        2),
    (202,  "Stars x3",             "common",        3),
    (203,  "Stars x4",             "common",        4),
    (204,  "Stars x5",             "common",        5),
    (205,  "Stars x6",             "common",        6),
    (206,  "Stars x7",             "common",        7),
    (207,  "Stars x8",             "common",        8),
    (208,  "Stars x9",             "common",        9),
    (209,  "Stars x10",            "common",       10),
]

# Обновленный список PENDING (для товаров без точного ID или новых)
PENDING_GIFTS = [
    # (unique_key,    name,             rarity,    value)
    ("pet_snake",     "Pet Snake",      "rare",     1500),
    ("lunar_snake",   "Lunar Snake",    "rare",     1400),
    ("snake_box",     "Snake Box",      "rare",     1200),
    ("snow_globe",    "Snow Globe",     "common",   625),
    ("pink_cupcake",  "Pink Cupcake",   "common",   795),
]


async def populate_db():
    async with async_session() as session:
        # ── СОХРАНЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЕЙ ──
        users_data = []
        
        try:
            # Сохраняем пользователей
            users_result = await session.execute(select(User))
            for user in users_result.scalars().all():
                users_data.append({
                    'telegram_id': user.telegram_id,
                    'username': user.username,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'photo_url': user.photo_url,
                    'balance': user.balance,
                    'free_case_available': user.free_case_available,
                    'last_free_case': user.last_free_case.isoformat() if user.last_free_case else None,
                })
            
            print(f"💾 Сохранено {len(users_data)} пользователей")
        except Exception as e:
            print(f"⚠️ No existing users to preserve: {e}")
            users_data = []
            await session.rollback()  # Откатываем ошибку чтобы продолжить
        
        # ── UPSERT обычных гифтов по gift_number ──
        gift_objs = {}
        for num, name, rarity, value in GIFTS_CATALOG:
            is_stars = num >= 200
            image_url = (
                "/static/images/star.png"
                if is_stars
                else f"/static/images/gift_limited_{num}.tgs"
            )
            try:
                result = await session.execute(select(Gift).where(Gift.gift_number == num))
                gift = result.scalar_one_or_none()
                if gift:
                    gift.name = name; gift.rarity = rarity
                    gift.value = value; gift.image_url = image_url
                    print(f"  UPDATE [{num}] {name}")
                else:
                    gift = Gift(
                        name=name, gift_id=f"gift_{num}",
                        rarity=rarity, value=value,
                        gift_number=num, image_url=image_url,
                    )
                    session.add(gift)
                    print(f"  INSERT [{num}] {name}")
                gift_objs[num] = gift
            except Exception as e:
                print(f"  ⚠️ Error on gift {num}: {e}")
                await session.rollback()
        
        # ── UPSERT подарков без TGS (по gift_id) ──
        for key, name, rarity, value in PENDING_GIFTS:
            try:
                result = await session.execute(select(Gift).where(Gift.gift_id == key))
                gift = result.scalar_one_or_none()
                if gift:
                    gift.name = name; gift.rarity = rarity; gift.value = value
                    print(f"  UPDATE [{key}] {name}")
                else:
                    gift = Gift(
                        name=name, gift_id=key,
                        rarity=rarity, value=value,
                        gift_number=None,
                        image_url="/static/images/star.png",
                    )
                    session.add(gift)
                    print(f"  INSERT [{key}] {name}")
                gift_objs[key] = gift
            except Exception as e:
                print(f"  ⚠️ Error on gift {key}: {e}")
                await session.rollback()
        
        await session.commit()
        
        for k in gift_objs:
            try:
                await session.refresh(gift_objs[k])
            except:
                pass
        
        # ── ПЕРЕСОЗДАНИЕ КЕЙСОВ ──
        # print("🔄 Пересоздание кейсов...")
        # try:
        #     await session.execute(delete(CaseItem))
        #     await session.execute(delete(Case))
        #     await session.commit()
        # except Exception as e:
            print(f"⚠️ Error deleting cases: {e}")
            await session.rollback()
        
        # ── Бесплатный кейс ─────────────────────────────────────────────
        try:
            case_free = Case(
                name="Бесплатный кейс",
                description="Открывай раз в 24 часа бесплатно!",
                price=0, is_free=True,
                image_url="/static/images/free-stars-case.png"
            )
            session.add(case_free)
            await session.flush()
            
            # Stars — 9.5% каждый
            for num in range(200, 210):
                if num in gift_objs:
                    session.add(CaseItem(
                        case_id=case_free.id,
                        gift_id=gift_objs[num].id,
                        drop_chance=9.5
                    ))
            
            # Редкие призы — 0.625% каждый (итого 5% на 8 предметов)
            rare_free = [86, 99, 121, 122, 123, 124, 125, "pet_snake"]
            for k in rare_free:
                if k in gift_objs:
                    session.add(CaseItem(
                        case_id=case_free.id,
                        gift_id=gift_objs[k].id,
                        drop_chance=0.625
                    ))
            
            await session.commit()
            print("✅ Бесплатный кейс создан!")
        except Exception as e:
            print(f"⚠️ Error creating free case: {e}")
            await session.rollback()
        
        # ── Кейс подарков ──
        try:
            gifts_nums = [49, 22, 81, 18, 50, 55, 48, 23, 91, 54, 52, 94, 51, 102, 117]
            case_gifts = Case(
                name="Кейс Подарков",
                description="Эксклюзивные подарки Telegram!",
                price=150,
                image_url="/static/images/premium-gifts-case.png"
            )
            session.add(case_gifts)
            await session.flush()
            for i, num in enumerate(gifts_nums):
                if num in gift_objs:
                    chance = 15.0 if i < 5 else 8.0 if i < 10 else 3.0
                    session.add(CaseItem(case_id=case_gifts.id, gift_id=gift_objs[num].id, drop_chance=chance))
            
            await session.commit()
            print("✅ Кейс подарков создан!")
        except Exception as e:
            print(f"⚠️ Error creating gifts case: {e}")
            await session.rollback()
        
        # ── Премиум кейс ──
        try:
            prem_nums = [76, 20, 75, 63, 68, 72, 93, 47, 41, 58, 104, 36, 53, 42, 77, 85, 88, 84, 1, 116]
            case_prem = Case(
                name="Премиум кейс",
                description="Максимальные шансы на легендарки!",
                price=500,
                image_url="/static/images/premium-gifts-case.png"
            )
            session.add(case_prem)
            await session.flush()
            for i, num in enumerate(prem_nums):
                if num in gift_objs:
                    chance = 10.0 if i < 6 else 5.0 if i < 12 else 2.0 if i < 16 else 0.5
                    session.add(CaseItem(case_id=case_prem.id, gift_id=gift_objs[num].id, drop_chance=chance))
            
            await session.commit()
            print("✅ Премиум кейс создан!")
        except Exception as e:
            print(f"⚠️ Error creating premium case: {e}")
            await session.rollback()
        
        print("✅ Кейсы созданы!")
        
        # ── ВОССТАНОВЛЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ──
        if users_data:
            try:
                print(f"💾 Восстановление {len(users_data)} пользователей...")
                for u in users_data:
                    result = await session.execute(select(User).where(User.telegram_id == u['telegram_id']))
                    user = result.scalar_one_or_none()
                    if not user:
                        user = User(
                            telegram_id=u['telegram_id'],
                            username=u['username'],
                            first_name=u['first_name'],
                            last_name=u['last_name'],
                            photo_url=u['photo_url'],
                            balance=u['balance'],
                            free_case_available=u['free_case_available'],
                            last_free_case=datetime.fromisoformat(u['last_free_case']) if u['last_free_case'] else None,
                        )
                        session.add(user)
                    else:
                        user.username = u['username']
                        user.first_name = u['first_name']
                        user.last_name = u['last_name']
                        user.photo_url = u['photo_url']
                        user.balance = u['balance']
                        user.free_case_available = u['free_case_available']
                        user.last_free_case = datetime.fromisoformat(u['last_free_case']) if u['last_free_case'] else None
                
                await session.commit()
                print(f"✅ Восстановлено {len(users_data)} пользователей")
            except Exception as e:
                print(f"⚠️ Error restoring users: {e}")
                await session.rollback()


async def main():
    print("🔄 Инициализация таблиц...")
    
    from database.models import init_db as create_tables, engine, DATABASE_URL
    
    # ДИАГНОСТИКА
    print(f"📌 DATABASE_URL: {DATABASE_URL[:50]}...")
    
    await create_tables()
    await engine.dispose()
    
    print("✅ Таблицы созданы")
    
    # ПРОВЕРКА что таблицы реально существуют
    from sqlalchemy import text
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
        ))
        tables = [r[0] for r in result]
        print(f"📋 Таблицы в БД: {tables}")
    
    print("🔄 Синхронизация гифтов...")
    try:
        await populate_db()
        print("\n✅ База данных готова!")
    except Exception as e:
        print(f"⚠️ Populate error: {e}")
        print("✅ База данных готова!")
        
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE users ALTER COLUMN telegram_id TYPE BIGINT"))
            print("✅ Колонка telegram_id успешно расширена до BIGINT")
    except Exception as e:
        print(f"⚠️ Ошибка изменения колонки (возможно уже обновлена): {e}")
    # -----------------------------

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
