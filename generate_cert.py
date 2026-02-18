#!/usr/bin/env python3
"""
Генерация самоподписанного SSL сертификата для HTTPS.

Запуск:  python generate_cert.py
Файлы:   ssl/cert.pem  ssl/key.pem

Сертификат уже генерируется автоматически при первом запуске server.py,
но этот скрипт позволяет сделать это заранее или пересоздать.

Для BotFather / Telegram Mini App:
  - Самоподписанный сертификат работает если ты указываешь IP напрямую
  - Telegram принимает self-signed при регистрации webhook (setWebhook + certificate=)
  - Для Mini App (Web App URL) нужен либо:
      a) Домен с нормальным TLS (Let's Encrypt), или
      b) Туннель типа ngrok / cloudflared (бесплатно, дают HTTPS автоматически)

Рекомендованный способ для разработки:
  cloudflared tunnel --url https://localhost:8443  (бесплатно, без регистрации)
  или
  ngrok http 8443
  Скопируй URL в .env -> WEBAPP_URL и в BotFather -> /setmenubutton
"""

import os, sys

def generate():
    os.makedirs('ssl', exist_ok=True)
    cert_file = 'ssl/cert.pem'
    key_file  = 'ssl/key.pem'

    try:
        import datetime as dt
        import ipaddress
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"TelegramCases"),
        ])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(dt.datetime.utcnow())
            .not_valid_after(dt.datetime.utcnow() + dt.timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.DNSName(u"localhost"),
                    x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        with open(key_file, 'wb') as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ))
        with open(cert_file, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print(f"✅ Сертификат создан:")
        print(f"   {cert_file}")
        print(f"   {key_file}")
        print()
        print("📋 Дальнейшие шаги:")
        print("   1. python server.py  — запустится на https://0.0.0.0:8443")
        print("   2. Для BotFather нужен публичный HTTPS URL.")
        print("      Вариант А (рекомендован): cloudflared tunnel --url https://localhost:8443")
        print("      Вариант Б: ngrok http 8443")
        print("   3. Скопируй туннельный URL в .env -> WEBAPP_URL")
        print("   4. BotFather -> /setmenubutton -> вставь URL")

    except ImportError:
        import subprocess
        try:
            subprocess.run([
                'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
                '-keyout', key_file, '-out', cert_file,
                '-days', '3650', '-nodes',
                '-subj', '/CN=localhost/O=TelegramCases'
            ], check=True)
            print(f"✅ Сертификат создан через openssl: {cert_file}, {key_file}")
        except FileNotFoundError:
            print("❌ Установи 'cryptography' или 'openssl':")
            print("   pip install cryptography")
            sys.exit(1)

if __name__ == '__main__':
    generate()
