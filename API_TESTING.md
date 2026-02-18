# API Примеры и тестирование

## Тестирование API через curl

### 1. Инициализация пользователя

```bash
curl -X POST http://localhost:8080/api/user/init \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123456789,
    "username": "testuser",
    "first_name": "Test",
    "last_name": "User"
  }'
```

Ответ:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "telegram_id": 123456789,
    "first_name": "Test",
    "balance": 0,
    "free_case_available": true
  }
}
```

### 2. Получить список кейсов

```bash
curl http://localhost:8080/api/cases/list
```

Ответ:
```json
{
  "success": true,
  "cases": [
    {
      "id": 1,
      "name": "🎁 Бесплатный кейс",
      "description": "Открывай каждый день бесплатно!",
      "price": 0,
      "is_free": true,
      "image_url": "..."
    },
    {
      "id": 2,
      "name": "⭐ Стартовый кейс",
      "price": 50,
      "is_free": false,
      "image_url": "..."
    }
  ]
}
```

### 3. Получить предметы кейса

```bash
curl http://localhost:8080/api/cases/1/items
```

Ответ:
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "drop_chance": 70.0,
      "gift": {
        "id": 1,
        "name": "Delicious Cake",
        "rarity": "common",
        "value": 5,
        "image_url": "..."
      }
    },
    {
      "id": 2,
      "drop_chance": 25.0,
      "gift": {
        "id": 2,
        "name": "Green Star",
        "rarity": "common",
        "value": 10,
        "image_url": "..."
      }
    }
  ]
}
```

### 4. Открыть кейс

```bash
curl -X POST http://localhost:8080/api/cases/open \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": 1,
    "user_id": 123456789
  }'
```

Ответ (успех):
```json
{
  "success": true,
  "opening_id": 1,
  "gift": {
    "id": 1,
    "name": "Delicious Cake",
    "rarity": "common",
    "value": 5,
    "image_url": "..."
  },
  "balance": 0
}
```

Ответ (недостаточно звезд):
```json
{
  "success": false,
  "error": "Insufficient balance"
}
```

### 5. Получить инвентарь

```bash
curl http://localhost:8080/api/inventory/123456789
```

Ответ:
```json
{
  "success": true,
  "items": [
    {
      "opening_id": 1,
      "is_withdrawn": false,
      "created_at": "2024-02-13T10:30:00",
      "gift": {
        "id": 1,
        "name": "Delicious Cake",
        "rarity": "common",
        "value": 5,
        "image_url": "..."
      }
    }
  ]
}
```

### 6. Вывести предмет

```bash
curl -X POST http://localhost:8080/api/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "opening_id": 1,
    "user_id": 123456789
  }'
```

Ответ:
```json
{
  "success": true,
  "message": "Withdrawal request created"
}
```

### 7. Получить историю

```bash
curl http://localhost:8080/api/history/recent
```

Ответ:
```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "created_at": "2024-02-13T10:30:00",
      "user": {
        "first_name": "Test",
        "username": "testuser"
      },
      "gift": {
        "id": 1,
        "name": "Delicious Cake",
        "rarity": "common",
        "value": 5,
        "image_url": "..."
      }
    }
  ]
}
```

### 8. Проверить бесплатный кейс

```bash
curl http://localhost:8080/api/user/123456789/free-case-check
```

Ответ (доступен):
```json
{
  "available": true,
  "remaining_seconds": 0
}
```

Ответ (недоступен):
```json
{
  "available": false,
  "remaining_seconds": 43200
}
```

## Тестирование через Python

```python
import requests

BASE_URL = "http://localhost:8080/api"

# 1. Инициализация пользователя
response = requests.post(f"{BASE_URL}/user/init", json={
    "telegram_id": 123456789,
    "username": "testuser",
    "first_name": "Test"
})
print(response.json())

# 2. Получить кейсы
response = requests.get(f"{BASE_URL}/cases/list")
cases = response.json()["cases"]
print(f"Доступно кейсов: {len(cases)}")

# 3. Открыть бесплатный кейс
response = requests.post(f"{BASE_URL}/cases/open", json={
    "case_id": 1,  # Бесплатный кейс
    "user_id": 123456789
})
result = response.json()
if result["success"]:
    print(f"Выиграл: {result['gift']['name']}")
else:
    print(f"Ошибка: {result['error']}")

# 4. Проверить инвентарь
response = requests.get(f"{BASE_URL}/inventory/123456789")
inventory = response.json()["items"]
print(f"В инвентаре: {len(inventory)} предметов")

# 5. Вывести первый предмет
if inventory:
    opening_id = inventory[0]["opening_id"]
    response = requests.post(f"{BASE_URL}/withdraw", json={
        "opening_id": opening_id,
        "user_id": 123456789
    })
    print(response.json())
```

## Тестирование через JavaScript (браузер)

```javascript
const API_URL = 'http://localhost:8080/api';

// 1. Инициализация
async function initUser() {
  const response = await fetch(`${API_URL}/user/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test'
    })
  });
  const data = await response.json();
  console.log('User:', data.user);
}

// 2. Получить кейсы
async function getCases() {
  const response = await fetch(`${API_URL}/cases/list`);
  const data = await response.json();
  console.log('Cases:', data.cases);
  return data.cases;
}

// 3. Открыть кейс
async function openCase(caseId, userId) {
  const response = await fetch(`${API_URL}/cases/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_id: caseId,
      user_id: userId
    })
  });
  const data = await response.json();
  if (data.success) {
    console.log('Won:', data.gift.name);
  } else {
    console.error('Error:', data.error);
  }
  return data;
}

// Запуск
(async () => {
  await initUser();
  const cases = await getCases();
  await openCase(1, 123456789); // Открыть бесплатный кейс
})();
```

## Автоматизированное тестирование

### test_api.py

```python
#!/usr/bin/env python3
import requests
import time

BASE_URL = "http://localhost:8080/api"
TEST_USER_ID = 999999999

def test_user_init():
    print("🧪 Тест: Инициализация пользователя...")
    response = requests.post(f"{BASE_URL}/user/init", json={
        "telegram_id": TEST_USER_ID,
        "username": "testuser",
        "first_name": "Test"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    print("✅ Пользователь создан")
    return data["user"]

def test_list_cases():
    print("🧪 Тест: Получение списка кейсов...")
    response = requests.get(f"{BASE_URL}/cases/list")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert len(data["cases"]) > 0
    print(f"✅ Найдено кейсов: {len(data['cases'])}")
    return data["cases"]

def test_get_case_items(case_id):
    print(f"🧪 Тест: Получение предметов кейса {case_id}...")
    response = requests.get(f"{BASE_URL}/cases/{case_id}/items")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert len(data["items"]) > 0
    print(f"✅ Найдено предметов: {len(data['items'])}")
    return data["items"]

def test_open_free_case():
    print("🧪 Тест: Открытие бесплатного кейса...")
    response = requests.post(f"{BASE_URL}/cases/open", json={
        "case_id": 1,
        "user_id": TEST_USER_ID
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    print(f"✅ Выиграл: {data['gift']['name']}")
    return data

def test_get_inventory():
    print("🧪 Тест: Получение инвентаря...")
    response = requests.get(f"{BASE_URL}/inventory/{TEST_USER_ID}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert len(data["items"]) > 0
    print(f"✅ В инвентаре: {len(data['items'])} предметов")
    return data["items"]

def test_withdraw_item(opening_id):
    print(f"🧪 Тест: Вывод предмета {opening_id}...")
    response = requests.post(f"{BASE_URL}/withdraw", json={
        "opening_id": opening_id,
        "user_id": TEST_USER_ID
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    print("✅ Предмет выведен")

def test_free_case_cooldown():
    print("🧪 Тест: Проверка кулдауна бесплатного кейса...")
    response = requests.post(f"{BASE_URL}/cases/open", json={
        "case_id": 1,
        "user_id": TEST_USER_ID
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == False
    assert "24 час" in data["error"]
    print("✅ Кулдаун работает")

def test_get_history():
    print("🧪 Тест: Получение истории...")
    response = requests.get(f"{BASE_URL}/history/recent")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    print(f"✅ История: {len(data['history'])} записей")

def run_all_tests():
    print("\n🚀 Запуск тестов API...\n")
    
    try:
        # 1. Инициализация
        user = test_user_init()
        time.sleep(0.5)
        
        # 2. Список кейсов
        cases = test_list_cases()
        time.sleep(0.5)
        
        # 3. Предметы кейса
        items = test_get_case_items(1)
        time.sleep(0.5)
        
        # 4. Открытие кейса
        opening = test_open_free_case()
        time.sleep(0.5)
        
        # 5. Инвентарь
        inventory = test_get_inventory()
        time.sleep(0.5)
        
        # 6. Вывод
        test_withdraw_item(opening["opening_id"])
        time.sleep(0.5)
        
        # 7. Кулдаун
        test_free_case_cooldown()
        time.sleep(0.5)
        
        # 8. История
        test_get_history()
        
        print("\n✅ Все тесты пройдены успешно!\n")
        
    except AssertionError as e:
        print(f"\n❌ Тест провален: {e}\n")
    except Exception as e:
        print(f"\n❌ Ошибка: {e}\n")

if __name__ == "__main__":
    run_all_tests()
```

Запуск:
```bash
python test_api.py
```

## Нагрузочное тестирование

### load_test.py

```python
#!/usr/bin/env python3
import requests
import asyncio
import aiohttp
import time
from concurrent.futures import ThreadPoolExecutor

BASE_URL = "http://localhost:8080/api"

async def open_case_async(session, user_id):
    async with session.post(f"{BASE_URL}/cases/open", json={
        "case_id": 2,  # Платный кейс
        "user_id": user_id
    }) as response:
        return await response.json()

async def load_test(num_requests=100):
    print(f"🔥 Нагрузочный тест: {num_requests} запросов...")
    
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        tasks = [
            open_case_async(session, 1000000 + i)
            for i in range(num_requests)
        ]
        results = await asyncio.gather(*tasks)
    
    end_time = time.time()
    duration = end_time - start_time
    
    print(f"✅ Завершено за {duration:.2f} сек")
    print(f"📊 Скорость: {num_requests/duration:.2f} req/sec")
    
    successful = sum(1 for r in results if r.get("success"))
    print(f"✅ Успешных: {successful}/{num_requests}")

if __name__ == "__main__":
    asyncio.run(load_test(100))
```

## Мониторинг API

### monitor.sh

```bash
#!/bin/bash

echo "📊 Мониторинг API..."
echo ""

while true; do
    # Проверка доступности
    if curl -s http://localhost:8080/api/cases/list > /dev/null; then
        echo "✅ API доступен"
    else
        echo "❌ API недоступен!"
    fi
    
    # Статистика из БД
    echo "📈 Статистика:"
    sqlite3 database/cases.db "SELECT COUNT(*) FROM users;" | xargs echo "  Пользователей:"
    sqlite3 database/cases.db "SELECT COUNT(*) FROM case_openings;" | xargs echo "  Открытий:"
    sqlite3 database/cases.db "SELECT COUNT(*) FROM withdrawals WHERE status='pending';" | xargs echo "  Ожидает вывода:"
    
    echo ""
    sleep 5
done
```

Запуск:
```bash
chmod +x monitor.sh
./monitor.sh
```
