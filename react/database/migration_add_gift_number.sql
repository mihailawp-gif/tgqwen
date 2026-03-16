-- Migration: Add gift_number column to gifts table
-- Для использования TGS анимаций

-- 1. Добавляем колонку gift_number
ALTER TABLE gifts ADD COLUMN gift_number INTEGER;

-- 2. Обновляем существующие записи случайными номерами (1-120)
-- Замените это на реальные соответствия между подарками и номерами анимаций

-- Пример обновления конкретных подарков:
UPDATE gifts SET gift_number = 1 WHERE name = 'Rare Bird';
UPDATE gifts SET gift_number = 2 WHERE name = 'Artisan Brick';
UPDATE gifts SET gift_number = 3 WHERE name = 'Victory Medal';
UPDATE gifts SET gift_number = 4 WHERE name = "Durov's Cap";
UPDATE gifts SET gift_number = 5 WHERE name = 'Heart Locket';
UPDATE gifts SET gift_number = 6 WHERE name = 'Astral Shard';
UPDATE gifts SET gift_number = 7 WHERE name = 'B-Day Candle';
UPDATE gifts SET gift_number = 8 WHERE name = 'Plush Pepe';

-- Если хотите автоматически присвоить номера всем подаркам:
-- UPDATE gifts SET gift_number = (id % 120) + 1 WHERE gift_number IS NULL;

-- 3. Проверка
SELECT id, name, gift_number, value, rarity FROM gifts LIMIT 10;

-- 4. Создание индекса для оптимизации (опционально)
CREATE INDEX idx_gifts_gift_number ON gifts(gift_number);

-- 5. Добавление constraint для валидации (опционально)
-- ALTER TABLE gifts ADD CONSTRAINT check_gift_number 
-- CHECK (gift_number IS NULL OR (gift_number >= 1 AND gift_number <= 120));
