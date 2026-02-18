"""
Скрипт для добавления gift_number к существующим подаркам
Запустите один раз после обновления структуры базы данных
"""

import sqlite3
import random

def add_gift_numbers(db_path='database/cases.db'):
    """
    Добавляет gift_number ко всем подаркам в базе данных
    
    Args:
        db_path: Путь к базе данных SQLite
    """
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Проверяем есть ли колонка gift_number
        cursor.execute("PRAGMA table_info(gifts)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'gift_number' not in columns:
            print("Adding gift_number column...")
            cursor.execute("ALTER TABLE gifts ADD COLUMN gift_number INTEGER")
            conn.commit()
            print("✅ Column added")
        else:
            print("Column gift_number already exists")
        
        # 2. Получаем все подарки без gift_number
        cursor.execute("SELECT id, name FROM gifts WHERE gift_number IS NULL")
        gifts_without_number = cursor.fetchall()
        
        if not gifts_without_number:
            print("✅ All gifts already have gift_number")
            return
        
        print(f"Found {len(gifts_without_number)} gifts without gift_number")
        
        # 3. Создаем маппинг имён на номера (можно настроить)
        # Или автоматически распределяем номера
        
        # Вариант 1: Автоматическое распределение
        available_numbers = list(range(1, 121))  # 1-120
        random.shuffle(available_numbers)
        
        for i, (gift_id, gift_name) in enumerate(gifts_without_number):
            if i < len(available_numbers):
                gift_number = available_numbers[i]
                cursor.execute(
                    "UPDATE gifts SET gift_number = ? WHERE id = ?",
                    (gift_number, gift_id)
                )
                print(f"✅ {gift_name} -> gift_limited_{gift_number}.tgs")
        
        # Вариант 2: Ручной маппинг (раскомментируйте если нужно)
        """
        gift_mapping = {
            'Rare Bird': 1,
            'Artisan Brick': 2,
            'Victory Medal': 3,
            "Durov's Cap": 4,
            'Heart Locket': 5,
            'Astral Shard': 6,
            'B-Day Candle': 7,
            'Plush Pepe': 8,
        }
        
        for gift_name, gift_number in gift_mapping.items():
            cursor.execute(
                "UPDATE gifts SET gift_number = ? WHERE name = ?",
                (gift_number, gift_name)
            )
            print(f"✅ {gift_name} -> gift_limited_{gift_number}.tgs")
        """
        
        conn.commit()
        
        # 4. Проверяем результат
        cursor.execute("SELECT COUNT(*) FROM gifts WHERE gift_number IS NOT NULL")
        count_with_number = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM gifts")
        total_count = cursor.fetchone()[0]
        
        print(f"\n{'='*50}")
        print(f"Migration completed!")
        print(f"Total gifts: {total_count}")
        print(f"Gifts with gift_number: {count_with_number}")
        print(f"{'='*50}\n")
        
        # 5. Показываем несколько примеров
        print("Sample gifts:")
        cursor.execute("""
            SELECT id, name, gift_number, value, rarity 
            FROM gifts 
            WHERE gift_number IS NOT NULL 
            LIMIT 10
        """)
        
        for row in cursor.fetchall():
            gift_id, name, gift_num, value, rarity = row
            print(f"  {gift_id}: {name:30} -> gift_limited_{gift_num}.tgs ({rarity})")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        conn.close()


def verify_tgs_files(gifts_db_path='database/cases.db', tgs_dir='static/images'):
    """
    Проверяет наличие TGS файлов для всех подарков
    """
    import os
    
    conn = sqlite3.connect(gifts_db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT DISTINCT gift_number FROM gifts WHERE gift_number IS NOT NULL")
    used_numbers = [row[0] for row in cursor.fetchall()]
    
    print(f"\nVerifying TGS files for {len(used_numbers)} gifts...")
    
    missing_files = []
    for number in used_numbers:
        file_path = os.path.join(tgs_dir, f'gift_limited_{number}.tgs')
        if not os.path.exists(file_path):
            missing_files.append(f'gift_limited_{number}.tgs')
    
    if missing_files:
        print(f"\n⚠️  Missing {len(missing_files)} TGS files:")
        for file in missing_files[:10]:  # Показываем первые 10
            print(f"  - {file}")
        if len(missing_files) > 10:
            print(f"  ... and {len(missing_files) - 10} more")
    else:
        print("✅ All TGS files are present!")
    
    conn.close()


if __name__ == '__main__':
    import sys
    
    # Путь к базе данных
    db_path = 'database/cases.db'
    
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    
    print(f"Using database: {db_path}\n")
    
    # Запускаем миграцию
    add_gift_numbers(db_path)
    
    # Проверяем наличие файлов
    # verify_tgs_files(db_path)
    
    print("\n✅ Migration complete!")
    print("\nNext steps:")
    print("1. Убедитесь, что TGS файлы загружены в /static/images/")
    print("2. Перезапустите сервер")
    print("3. Откройте приложение и проверьте анимации")
