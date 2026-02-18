# Telegram Mini App - Кейсы (Улучшенная версия)

## 🎨 Что нового?

### UI/UX Улучшения:
- ✨ Современный градиентный дизайн с темной темой
- 🎯 Плавные анимации и переходы
- 📱 Адаптивная верстка для всех устройств
- 🎪 Карусель с автопрокруткой предметов в предпросмотре кейса
- 💫 Улучшенные модальные окна
- 🎭 Haptic feedback при взаимодействии
- 🌟 Анимированные индикаторы и эффекты свечения

### Функциональные улучшения:
- ⭐ **Интеграция Telegram Stars** для пополнения баланса
- 💳 Модальное окно с выбором суммы пополнения
- 📦 Улучшенная анимация открытия кейсов
- 🎁 Более детальный предпросмотр кейсов
- 📊 Живая история выигрышей
- 🔄 Автоматическое обновление данных

## 📁 Структура файлов

```
improved_telegram_app/
├── templates/
│   └── index.html          # Обновленный HTML с новым UI
├── static/
│   ├── css/
│   │   └── style.css       # Современные стили с градиентами
│   └── js/
│       └── app.js          # JavaScript с интеграцией Stars
└── README.md
```

## 🚀 Установка

### 1. Замена файлов

Скопируйте обновленные файлы в ваш проект:

```bash
# Замените старые файлы новыми
cp improved_telegram_app/templates/index.html telegram-case-fix/templates/
cp improved_telegram_app/static/css/style.css telegram-case-fix/static/css/
cp improved_telegram_app/static/js/app.js telegram-case-fix/static/js/
```

### 2. Настройка Telegram Stars

Для работы пополнения через Telegram Stars нужно обновить бэкенд API:

#### В `server.py` добавьте эндпоинт для создания invoice:

```python
@app.route('/api/payment/create-invoice', methods=['POST'])
def create_invoice():
    """Создание Telegram Stars invoice"""
    data = request.get_json()
    user_id = data.get('user_id')
    stars = data.get('stars')
    
    # Создаем invoice через Bot API
    invoice_link = create_telegram_stars_invoice(
        title=f"Пополнение на {stars} звёзд",
        description=f"Пополнение баланса на {stars} ⭐",
        payload=f"topup_{user_id}_{stars}",
        currency="XTR",  # Telegram Stars currency
        prices=[{"label": f"{stars} Stars", "amount": stars}]
    )
    
    return jsonify({
        'success': True,
        'invoice_link': invoice_link
    })
```

#### Функция создания invoice через Bot API:

```python
import requests

def create_telegram_stars_invoice(title, description, payload, currency, prices):
    """Создание invoice через Telegram Bot API"""
    bot_token = "YOUR_BOT_TOKEN"  # Замените на токен вашего бота
    
    url = f"https://api.telegram.org/bot{bot_token}/createInvoiceLink"
    
    data = {
        "title": title,
        "description": description,
        "payload": payload,
        "provider_token": "",  # Пустой для Stars
        "currency": currency,
        "prices": prices
    }
    
    response = requests.post(url, json=data)
    result = response.json()
    
    if result.get('ok'):
        return result['result']
    else:
        raise Exception(f"Failed to create invoice: {result}")
```

#### Webhook для обработки успешных платежей:

```python
@app.route('/webhook/telegram', methods=['POST'])
def telegram_webhook():
    """Обработка обновлений от Telegram (включая платежи)"""
    update = request.get_json()
    
    # Проверяем успешный платеж
    if 'pre_checkout_query' in update:
        # Подтверждаем платеж
        query_id = update['pre_checkout_query']['id']
        answer_pre_checkout_query(query_id, ok=True)
        
    elif 'message' in update and 'successful_payment' in update['message']:
        # Платеж успешно завершен
        payment = update['message']['successful_payment']
        user_id = update['message']['from']['id']
        
        # Парсим payload для получения суммы
        payload = payment['invoice_payload']
        _, uid, stars = payload.split('_')
        
        # Добавляем звёзды на баланс пользователя
        add_stars_to_balance(int(uid), int(stars))
        
    return jsonify({'ok': True})

def answer_pre_checkout_query(query_id, ok=True):
    """Ответ на pre-checkout запрос"""
    bot_token = "YOUR_BOT_TOKEN"
    url = f"https://api.telegram.org/bot{bot_token}/answerPreCheckoutQuery"
    
    data = {"pre_checkout_query_id": query_id, "ok": ok}
    requests.post(url, json=data)

def add_stars_to_balance(user_id, stars):
    """Добавление звёзд на баланс пользователя"""
    cursor = get_db().cursor()
    cursor.execute("""
        UPDATE users 
        SET balance = balance + ? 
        WHERE telegram_id = ?
    """, (stars, user_id))
    get_db().commit()
```

### 3. Настройка бота для приема платежей

1. Убедитесь, что ваш бот поддерживает Telegram Stars
2. Настройте webhook для получения уведомлений о платежах:

```python
import requests

def set_webhook(webhook_url):
    bot_token = "YOUR_BOT_TOKEN"
    url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
    
    data = {
        "url": webhook_url,
        "allowed_updates": ["pre_checkout_query", "message"]
    }
    
    response = requests.post(url, json=data)
    print(response.json())

# Вызовите один раз при настройке
set_webhook("https://your-domain.com/webhook/telegram")
```

## 🎨 Кастомизация дизайна

### Цветовая схема

В `style.css` вы можете изменить цвета в секции `:root`:

```css
:root {
    /* Основные градиенты */
    --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    --warning-gradient: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    
    /* Цвета фона */
    --bg-primary: #0f0f1e;
    --bg-secondary: #1a1a2e;
    --card-bg: #16213e;
}
```

### Анимация карусели

Скорость прокрутки карусели настраивается в CSS:

```css
@keyframes scroll-carousel {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
}

.items-carousel {
    animation: scroll-carousel 20s linear infinite;  /* Измените 20s */
}
```

## 🔧 Дополнительные настройки

### Суммы пополнения

В `index.html` можно изменить доступные суммы для пополнения:

```html
<div class="amounts-grid" id="topupAmounts">
    <button class="amount-card" onclick="createStarsInvoice(200)">
        <div class="amount-stars">200 ⭐</div>
    </button>
    <!-- Добавьте свои суммы -->
</div>
```

### Haptic Feedback

Тактильная обратная связь включена по умолчанию. Чтобы отключить, закомментируйте в `app.js`:

```javascript
// document.addEventListener('click', (e) => {
//     if (e.target.closest('button') || e.target.closest('.case-card')) {
//         if (tg.HapticFeedback) {
//             tg.HapticFeedback.impactOccurred('light');
//         }
//     }
// });
```

## 🐛 Устранение неполадок

### Проблема: Invoice не открывается

**Решение**: Убедитесь, что:
1. Токен бота правильный
2. Webhook настроен корректно
3. Бот поддерживает Telegram Stars
4. URL invoice возвращается корректно

### Проблема: Карусель не прокручивается

**Решение**: Убедитесь, что предметов достаточно (минимум 6-8), и они дублируются в JavaScript.

### Проблема: Стили не применяются

**Решение**: Очистите кэш браузера или добавьте версию к CSS:
```html
<link rel="stylesheet" href="/static/css/style.css?v=2">
```

## 📝 Важные заметки

1. **Безопасность**: Не храните токен бота в клиентском коде
2. **Валидация**: Всегда проверяйте платежи на сервере
3. **Тестирование**: Используйте тестовый режим Telegram для отладки платежей
4. **Webhook**: Убедитесь, что ваш сервер доступен по HTTPS

## 📞 Поддержка

Если возникли вопросы:
1. Проверьте логи сервера
2. Используйте console.log() для отладки в браузере
3. Проверьте Network tab в DevTools для API запросов

## 🎉 Готово!

Приложение готово к использованию с современным UI и полной интеграцией Telegram Stars!
