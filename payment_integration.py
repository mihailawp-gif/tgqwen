"""
Пример серверного кода для интеграции Telegram Stars
Добавьте эти функции в ваш server.py
"""

import requests
from flask import Flask, request, jsonify
from datetime import datetime

# Настройки
BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"  # Замените на токен вашего бота
TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ==================== PAYMENT ENDPOINTS ====================

@app.route('/api/payment/create-invoice', methods=['POST'])
def create_invoice():
    """
    Создание Telegram Stars invoice
    
    Request body:
    {
        "user_id": 123456789,
        "stars": 200
    }
    
    Response:
    {
        "success": true,
        "invoice_link": "https://t.me/..."
    }
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        stars = data.get('stars')
        
        if not user_id or not stars:
            return jsonify({
                'success': False,
                'error': 'Missing user_id or stars'
            }), 400
        
        # Создаем invoice через Bot API
        invoice_link = create_telegram_stars_invoice(
            title=f"Пополнение на {stars} звёзд",
            description=f"Пополнение баланса в приложении Кейсы",
            payload=f"topup_{user_id}_{stars}_{int(datetime.now().timestamp())}",
            stars=stars
        )
        
        return jsonify({
            'success': True,
            'invoice_link': invoice_link
        })
        
    except Exception as e:
        print(f"Error creating invoice: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def create_telegram_stars_invoice(title, description, payload, stars):
    """
    Создание invoice через Telegram Bot API
    
    Args:
        title: Название платежа
        description: Описание платежа
        payload: Уникальный идентификатор платежа
        stars: Количество Telegram Stars
        
    Returns:
        str: URL invoice для открытия в Telegram
    """
    url = f"{TELEGRAM_API_URL}/createInvoiceLink"
    
    # Данные для invoice
    data = {
        "title": title,
        "description": description,
        "payload": payload,
        "provider_token": "",  # Пустой для Telegram Stars
        "currency": "XTR",  # Telegram Stars currency code
        "prices": [
            {
                "label": f"{stars} Stars",
                "amount": stars  # Цена в Telegram Stars
            }
        ]
    }
    
    # Отправляем запрос к Telegram API
    response = requests.post(url, json=data, timeout=10)
    result = response.json()
    
    if result.get('ok'):
        return result['result']
    else:
        error_description = result.get('description', 'Unknown error')
        raise Exception(f"Failed to create invoice: {error_description}")


# ==================== WEBHOOK ENDPOINT ====================

@app.route('/webhook/telegram', methods=['POST'])
def telegram_webhook():
    """
    Обработка обновлений от Telegram
    Получает уведомления о платежах и других событиях
    """
    try:
        update = request.get_json()
        
        # Обработка pre-checkout запроса (перед оплатой)
        if 'pre_checkout_query' in update:
            handle_pre_checkout(update['pre_checkout_query'])
            
        # Обработка успешного платежа
        elif 'message' in update and 'successful_payment' in update['message']:
            handle_successful_payment(update['message'])
            
        return jsonify({'ok': True})
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


def handle_pre_checkout(pre_checkout_query):
    """
    Обработка pre-checkout запроса
    Здесь можно провести дополнительные проверки перед оплатой
    """
    query_id = pre_checkout_query['id']
    
    # Можно добавить проверки:
    # - Валидность payload
    # - Существование пользователя
    # - Другие бизнес-правила
    
    # Подтверждаем платеж
    answer_pre_checkout_query(query_id, ok=True)


def handle_successful_payment(message):
    """
    Обработка успешного платежа
    Добавляем звёзды на баланс пользователя
    """
    payment = message['successful_payment']
    user_id = message['from']['id']
    
    # Парсим payload
    payload = payment['invoice_payload']
    parts = payload.split('_')
    
    if len(parts) >= 3 and parts[0] == 'topup':
        _, uid, stars_str = parts[:3]
        stars = int(stars_str)
        
        # Добавляем звёзды на баланс
        success = add_stars_to_balance(int(uid), stars)
        
        if success:
            # Отправляем подтверждение пользователю
            send_payment_confirmation(user_id, stars)
        else:
            print(f"Failed to add stars for user {uid}")


def answer_pre_checkout_query(query_id, ok=True, error_message=None):
    """
    Ответ на pre-checkout запрос
    
    Args:
        query_id: ID запроса
        ok: Подтверждение (True) или отклонение (False)
        error_message: Сообщение об ошибке (если ok=False)
    """
    url = f"{TELEGRAM_API_URL}/answerPreCheckoutQuery"
    
    data = {
        "pre_checkout_query_id": query_id,
        "ok": ok
    }
    
    if not ok and error_message:
        data["error_message"] = error_message
    
    response = requests.post(url, json=data, timeout=10)
    return response.json()


def add_stars_to_balance(user_id, stars):
    """
    Добавление звёзд на баланс пользователя
    
    Args:
        user_id: Telegram ID пользователя
        stars: Количество звёзд для добавления
        
    Returns:
        bool: True если успешно, False если ошибка
    """
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Обновляем баланс
        cursor.execute("""
            UPDATE users 
            SET balance = balance + ? 
            WHERE telegram_id = ?
        """, (stars, user_id))
        
        # Записываем транзакцию
        cursor.execute("""
            INSERT INTO transactions (user_id, type, amount, created_at)
            VALUES (?, 'topup', ?, ?)
        """, (user_id, stars, datetime.now()))
        
        db.commit()
        
        print(f"Added {stars} stars to user {user_id}")
        return True
        
    except Exception as e:
        print(f"Error adding stars to balance: {e}")
        db.rollback()
        return False


def send_payment_confirmation(user_id, stars):
    """
    Отправка подтверждения пользователю о пополнении
    
    Args:
        user_id: Telegram ID пользователя
        stars: Количество пополненных звёзд
    """
    url = f"{TELEGRAM_API_URL}/sendMessage"
    
    data = {
        "chat_id": user_id,
        "text": f"✅ Баланс успешно пополнен на {stars} ⭐\n\nСпасибо за покупку!",
        "parse_mode": "HTML"
    }
    
    try:
        requests.post(url, json=data, timeout=10)
    except Exception as e:
        print(f"Error sending confirmation: {e}")


# ==================== WEBHOOK SETUP ====================

def setup_webhook(webhook_url):
    """
    Настройка webhook для получения обновлений от Telegram
    
    Args:
        webhook_url: URL вашего сервера (должен быть HTTPS)
        
    Example:
        setup_webhook("https://your-domain.com/webhook/telegram")
    """
    url = f"{TELEGRAM_API_URL}/setWebhook"
    
    data = {
        "url": webhook_url,
        "allowed_updates": ["pre_checkout_query", "message"]
    }
    
    response = requests.post(url, json=data, timeout=10)
    result = response.json()
    
    if result.get('ok'):
        print(f"Webhook set successfully: {webhook_url}")
    else:
        print(f"Failed to set webhook: {result}")
    
    return result


def delete_webhook():
    """Удаление webhook"""
    url = f"{TELEGRAM_API_URL}/deleteWebhook"
    response = requests.post(url, timeout=10)
    return response.json()


def get_webhook_info():
    """Получение информации о текущем webhook"""
    url = f"{TELEGRAM_API_URL}/getWebhookInfo"
    response = requests.get(url, timeout=10)
    return response.json()


# ==================== DATABASE SCHEMA ====================

"""
Добавьте эту таблицу в вашу базу данных для хранения транзакций:

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 'topup', 'purchase', 'withdrawal'
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);
"""


# ==================== USAGE EXAMPLE ====================

if __name__ == "__main__":
    # Пример настройки webhook (запустите один раз)
    webhook_url = "https://your-domain.com/webhook/telegram"
    
    # Установка webhook
    # setup_webhook(webhook_url)
    
    # Проверка webhook
    # info = get_webhook_info()
    # print(info)
    
    # Удаление webhook (если нужно)
    # delete_webhook()
    
    pass
