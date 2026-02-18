#!/usr/bin/env python3
"""
resync_gifts.py — синхронизирует gift_number в cases.db по маппингу имён.
Запустить ОДИН РАЗ если БД уже существует и подарки рендерятся неправильно:
    python3 resync_gifts.py
"""
import sqlite3, os, sys

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'cases.db')

# ПОЛНЫЙ МАППИНГ: название -> номер файла gift_limited_N.tgs
NAME_TO_TGS = {
    "victory medal":    1,
    "gem signet":       4,
    "stellar rocket":   10,
    "jack in the box":  11,
    "artisan brick":    12,
    "jolly chimp":      13,
    "happy brownie":    14,
    "mighty arm":       15,
    "durov's cap":      18,
    "durov cap":        18,
    "durovs cap":       18,
    "bonded ring":      20,
    "plush pepe":       22,
    "bling blinky":     23,
    "loot bag":         26,
    "loot bag ii":      78,
    "crystal ball":     36,
    "precious peach":   39,
    "precious peack":   39,
    "ion gem":          41,
    "mini oscar":       42,
    "scared cat":       46,
    "heroic helmet":    47,
    "clover pin":       48,
    "astral shard":     49,
    "cupid charm":      50,
    "nail bracelet":    51,
    "magic potion":     52,
    "vintage cigar":    53,
    "hex pot":          54,
    "hypno lollipop":   55,
    "kissed frog":      56,
    "neko helmet":      58,
    "electric skull":   59,
    "fresh socks":      62,
    "eternal rose":     63,
    "skull flower":     64,
    "mad pumpkin":      65,
    "parfume bottle":   66,
    "witch hat":        67,
    "trapped heart":    68,
    "flying broom":     69,
    "sharp tongue":     70,
    "voodoo doll":      72,
    "input key":        73,
    "evil eye":         74,
    "top hat":          75,
    "signet ring":      76,
    "diamond ring":     77,
    "heart locket":     81,
    "genie lamp":       84,
    "light sword":      85,
    "lol pop":          86,
    "restless jar":     87,
    "swiss watch":      88,
    "jester hat":       91,
    "moon pendant":     92,
    "faith amulet":     93,
    "homemade cake":    94,
    "spy agaric":       95,
    "eternal candle":   96,
    "sakura flower":    97,
    "sakura flower":    97,
    "whip cupcake":     99,
    "bow tie":          100,
    "toy bear":         102,
    "sky stilettos":    104,
    "ionic dryer":      105,
    "love potion":      106,
    "snow mittens":     109,
    "desk calendar":    111,
    "santa hat":        114,
    "instant ramen":    115,
    "b-day candle":     116,
    "bday candle":      116,
    "ginger cookie":    117,
    "tama gadget":      120,
}

if not os.path.exists(DB_PATH):
    print(f"❌ БД не найдена: {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

cur.execute("SELECT id, name, gift_number FROM gifts")
gifts = cur.fetchall()

updated = 0
skipped = 0

for gid, name, current_num in gifts:
    key    = name.lower().strip()
    new_num = NAME_TO_TGS.get(key)

    if new_num is None:
        # Попробуем частичное совпадение
        for k, n in NAME_TO_TGS.items():
            if k in key or key in k:
                new_num = n
                break

    if new_num and new_num != current_num:
        cur.execute(
            "UPDATE gifts SET gift_number=?, image_url=? WHERE id=?",
            (new_num, f"/static/images/gift_limited_{new_num}.tgs", gid)
        )
        print(f"  ✅ [{gid}] {name!r}: {current_num} → gift_limited_{new_num}.tgs")
        updated += 1
    elif new_num and new_num == current_num:
        print(f"  ✓  [{gid}] {name!r} = gift_limited_{new_num}.tgs (уже верно)")
    else:
        print(f"  ⚠️  [{gid}] {name!r} — нет маппинга (gift_number={current_num})")
        skipped += 1

conn.commit()
conn.close()
print(f"\n{'='*40}")
print(f"Обновлено: {updated}, без маппинга: {skipped}")
print("Готово! Перезапусти сервер.")
