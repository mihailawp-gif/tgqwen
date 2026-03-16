# Изображения

## Требуемые изображения

Добавьте следующие изображения в эту папку:

### Кейсы
- `free-case.png` - Бесплатный кейс (рекомендуемый размер: 512x512)
- `starter-case.png` - Стартовый кейс
- `premium-case.png` - Премиум кейс
- `legendary-case.png` - Легендарный кейс
- `default-case.png` - Изображение по умолчанию

### Гифты
- `cake.png` - Торт
- `star.png` - Звезда
- `premium.png` - Премиум гифт
- `crown.png` - Корона
- `default-gift.png` - Изображение по умолчанию

## Альтернатива

Вместо локальных файлов можно использовать URL в базе данных:

```python
Case(
    name="Кейс",
    image_url="https://i.imgur.com/image.png"
)
```

## Рекомендации

- Формат: PNG с прозрачностью
- Размер: 512x512 пикселей
- Вес: менее 100 KB
- Квадратное соотношение сторон

## Источники бесплатных иконок

- [Flaticon](https://www.flaticon.com/)
- [Icons8](https://icons8.com/)
- [Freepik](https://www.freepik.com/)
- [Noun Project](https://thenounproject.com/)

## Генерация через AI

Можно использовать:
- DALL-E
- Midjourney
- Stable Diffusion

Примерные промпты:
- "Colorful gift box icon, flat design, transparent background"
- "Golden crown icon, gaming style, PNG"
- "Delicious cake emoji style icon"
