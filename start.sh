#!/bin/bash
# Выполняем инициализацию базы данных
python database/init_db.py

# Запускаем бота в фоновом режиме
python bot/main.py &

# Запускаем веб-сервер
python server.py
