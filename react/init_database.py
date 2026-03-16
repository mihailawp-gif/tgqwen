"""
Инициализация базы данных - Windows friendly версия
Запускать из корневой папки проекта: python database/init_db.py
"""
import asyncio
import os
import sys

# Переходим в корневую папку проекта
project_root = os.path.dirname(os.path.abspath(__file__))
os.chdir(project_root)
sys.path.insert(0, project_root)

# Создаем папку database если её нет
os.makedirs('database', exist_ok=True)

from database.models import init_db, async_session, Case, Gift, CaseItem


async def populate_sample_data():
    """Заполнение БД примерными данными"""
    
    async with async_session() as session:
        # Создаем гифты (используем реальные ID из Telegram)
        gifts_data = [
            # Гифты из скриншота
            {"name": "Plush Pepe", "gift_id": "plush_pepe", "rarity": "common", "value": 2800, 
             "image_url": "/static/images/plush_pepe.png"},
            {"name": "Heart Locket", "gift_id": "heart_locket", "rarity": "common", "value": 1900,
             "image_url": "/static/images/heart_locket.png"},
            {"name": "Durov's Cap", "gift_id": "durovs_cap", "rarity": "rare", "value": 4700,
             "image_url": "/static/images/durovs_cap.png"},
            {"name": "Victory Medal", "gift_id": "victory_medal", "rarity": "epic", "value": 89000,
             "image_url": "/static/images/victory_medal.png"},
            {"name": "Rare Bird", "gift_id": "rare_bird", "rarity": "epic", "value": 11200,
             "image_url": "/static/images/rare_bird.png"},
            {"name": "Artisan Brick", "gift_id": "artisan_brick", "rarity": "legendary", "value": 9200,
             "image_url": "/static/images/artisan_brick.png"},
            {"name": "Astral Shard", "gift_id": "astral_shard", "rarity": "rare", "value": 5600,
             "image_url": "/static/images/astral_shard.png"},
            {"name": "B-Day Candle", "gift_id": "bday_candle", "rarity": "legendary", "value": 262800,
             "image_url": "/static/images/bday_candle.png"},
            # Telegram Stars для бесплатного кейса
            {"name": "1 Star", "gift_id": "star_1", "rarity": "common", "value": 1,
             "image_url": "/static/images/star.png"},
            {"name": "2 Stars", "gift_id": "star_2", "rarity": "common", "value": 2,
             "image_url": "/static/images/star.png"},
            {"name": "3 Stars", "gift_id": "star_3", "rarity": "common", "value": 3,
             "image_url": "/static/images/star.png"},
            {"name": "5 Stars", "gift_id": "star_5", "rarity": "rare", "value": 5,
             "image_url": "/static/images/star.png"},
            {"name": "7 Stars", "gift_id": "star_7", "rarity": "rare", "value": 7,
             "image_url": "/static/images/star.png"},
            {"name": "10 Stars", "gift_id": "star_10", "rarity": "epic", "value": 10,
             "image_url": "/static/images/star.png"},
        ]
        
        gifts = []
        for gift_data in gifts_data:
            gift = Gift(**gift_data)
            session.add(gift)
            gifts.append(gift)
        
        await session.commit()
        
        # Перезагружаем гифты с их ID
        for gift in gifts:
            await session.refresh(gift)
        
        # Создаем кейсы
        # НОВЫЙ: Бесплатный кейс с Telegram s
        case_free_stars = Case(
            name="⭐ Free Stars Case",
            description="Получай от 1 до 10 звезд бесплатно каждый день!",
            price=0,
            is_free=True,
            image_url="/static/images/free-stars-case.png"
        )
        session.add(case_free_stars)
        
        # НОВЫЙ: Premium Gifts Case
        case_premium_gifts = Case(
            name="🎁 Premium Gifts",
            description="Эксклюзивные подарки Telegram!",
            price=50,
            is_free=False,
            image_url="/static/images/premium-gifts-case.png"
        )
        session.add(case_premium_gifts)
        
        await session.commit()
        await session.refresh(case_free_stars)
        await session.refresh(case_premium_gifts)
        
        # Добавляем предметы в Free Stars Case
        free_stars_items = [
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[8].id, drop_chance=30.0),   # 1 Star
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[9].id, drop_chance=25.0),   # 2 Stars
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[10].id, drop_chance=20.0),  # 3 Stars
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[11].id, drop_chance=15.0),  # 5 Stars
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[12].id, drop_chance=7.0),   # 7 Stars
            CaseItem(case_id=case_free_stars.id, gift_id=gifts[13].id, drop_chance=3.0),   # 10 Stars
        ]
        
        # Добавляем предметы в Premium Gifts Case
        premium_gifts_items = [
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[0].id, drop_chance=25.0),  # Plush Pepe
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[1].id, drop_chance=25.0),  # Heart Locket
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[2].id, drop_chance=20.0),  # Durov's Cap
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[3].id, drop_chance=10.0),  # Victory Medal
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[4].id, drop_chance=10.0),  # Rare Bird
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[5].id, drop_chance=5.0),   # Artisan Brick
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[6].id, drop_chance=3.0),   # Astral Shard
            CaseItem(case_id=case_premium_gifts.id, gift_id=gifts[7].id, drop_chance=2.0),   # B-Day Candle
        ]
        
        
        for item in free_stars_items + premium_gifts_items:
            session.add(item)
        
        await session.commit()
        print("✅ База данных успешно заполнена!")


async def main():
    print("🔄 Инициализация базы данных...")
    await init_db()
    print("✅ Таблицы созданы!")
    
    print("🔄 Заполнение примерными данными...")
    await populate_sample_data()


if __name__ == "__main__":
    asyncio.run(main())
