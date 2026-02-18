"""
update_free_case.py — обновляет состав бесплатного кейса в существующей БД.

Запуск: python update_free_case.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database.models import init_db, async_session, Gift, Case, CaseItem
from sqlalchemy import select, delete


# ── Stars: gift_number 200-209, зачисляются автоматически на баланс ──
STARS_GIFTS = [
    (200, "Stars x1",  1),
    (201, "Stars x2",  2),
    (202, "Stars x3",  3),
    (203, "Stars x4",  4),
    (204, "Stars x5",  5),
    (205, "Stars x6",  6),
    (206, "Stars x7",  7),
    (207, "Stars x8",  8),
    (208, "Stars x9",  9),
    (209, "Stars x10", 10),
]

# ── Дополнительные призы без TGS (gift_id как ключ) ──
EXTRA_GIFTS = [
    # gift_id       name             rarity    value
    ("pet_snake",   "Pet Snake",     "epic",   5000),
    ("lunar_snake", "Lunar Snake",   "epic",   7500),
    ("snake_box",   "Snake Box",     "rare",   3000),
]

# ── Состав бесплатного кейса ──
# Stars x1-x10: по 9.5% = 95% суммарно
# Остальные 8 предметов: по 0.625% = 5% суммарно
FREE_CASE_RARE = [
    # gift_number или gift_id
    86,           # Lol Pop
    99,           # Whip Cupcake
    121,          # Кубок
    122,          # Heart
    123,          # Diamond
    124,          # Ring
    125,          # Champagne
    "pet_snake",  # Pet Snake (нет TGS пока)
]


async def main():
    print("🔄 Подключение к БД...")
    await init_db()

    async with async_session() as session:

        # ── 1. Добавляем Stars гифты если нет ──
        print("\n📦 Синхронизация Stars гифтов...")
        stars_gift_objs = {}
        for num, name, value in STARS_GIFTS:
            result = await session.execute(select(Gift).where(Gift.gift_number == num))
            gift = result.scalar_one_or_none()
            if gift:
                gift.name = name; gift.value = value
                gift.image_url = "/static/images/star.png"
                print(f"  UPDATE [{num}] {name}")
            else:
                gift = Gift(
                    name=name,
                    gift_id=f"stars_{num}",
                    rarity="common",
                    value=value,
                    gift_number=num,
                    image_url="/static/images/star.png",
                )
                session.add(gift)
                print(f"  INSERT [{num}] {name}")
            stars_gift_objs[num] = gift

        # ── 2. Добавляем кастомные гифты без TGS если нет ──
        print("\n📦 Синхронизация кастомных гифтов...")
        extra_gift_objs = {}
        for gift_id_key, name, rarity, value in EXTRA_GIFTS:
            result = await session.execute(select(Gift).where(Gift.gift_id == gift_id_key))
            gift = result.scalar_one_or_none()
            if gift:
                gift.name = name; gift.rarity = rarity; gift.value = value
                print(f"  UPDATE [{gift_id_key}] {name}")
            else:
                gift = Gift(
                    name=name,
                    gift_id=gift_id_key,
                    rarity=rarity,
                    value=value,
                    gift_number=None,
                    image_url="/static/images/star.png",
                )
                session.add(gift)
                print(f"  INSERT [{gift_id_key}] {name}")
            extra_gift_objs[gift_id_key] = gift

        await session.commit()

        # Рефрешим чтобы получить id
        for g in stars_gift_objs.values():
            await session.refresh(g)
        for g in extra_gift_objs.values():
            await session.refresh(g)

        # ── 3. Находим бесплатный кейс ──
        result = await session.execute(select(Case).where(Case.is_free == True))
        free_case = result.scalar_one_or_none()
        if not free_case:
            print("\n❌ Бесплатный кейс не найден в БД!")
            return

        print(f"\n🎁 Обновляем бесплатный кейс (id={free_case.id})...")

        # ── 4. Удаляем старые items ──
        await session.execute(delete(CaseItem).where(CaseItem.case_id == free_case.id))
        await session.commit()
        print("  Старые предметы удалены")

        # ── 5. Добавляем Stars (9.5% каждый) ──
        for num, gift in stars_gift_objs.items():
            session.add(CaseItem(
                case_id=free_case.id,
                gift_id=gift.id,
                drop_chance=9.5,
            ))
        print("  Stars x1-x10 добавлены (9.5% каждый)")

        # ── 6. Добавляем редкие призы (0.625% каждый) ──
        for key in FREE_CASE_RARE:
            if isinstance(key, int):
                # gift_number — ищем в обычных гифтах
                result = await session.execute(select(Gift).where(Gift.gift_number == key))
                gift = result.scalar_one_or_none()
            else:
                # gift_id строка — из extra
                gift = extra_gift_objs.get(key)

            if gift:
                session.add(CaseItem(
                    case_id=free_case.id,
                    gift_id=gift.id,
                    drop_chance=0.625,
                ))
                print(f"  [{key}] {gift.name} — 0.625%")
            else:
                print(f"  ⚠️  [{key}] не найден, пропускаю")

        await session.commit()

        # ── 7. Проверка ──
        result = await session.execute(
            select(CaseItem).where(CaseItem.case_id == free_case.id)
        )
        items = result.scalars().all()
        total = sum(i.drop_chance for i in items)
        print(f"\n✅ Готово! Предметов: {len(items)}, суммарный шанс: {total:.2f}%")
        print(f"   Stars: 95% | Редкие: {total - 95:.2f}%")


if __name__ == "__main__":
    asyncio.run(main())
