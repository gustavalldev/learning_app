# Мобильное приложение для доступа студентов к учебным материалам и интерактивным заданиям

Учебный проект по теме ВКР: React Native мобильный клиент, Node.js/Express REST API и PostgreSQL база данных.

## Структура

- `mobile` - Expo/React Native приложение.
- `backend` - REST API с подключением к PostgreSQL.
- `backend/db/schema.sql` - физическая модель PostgreSQL из ВКР.
- `backend/db/seed.sql` - демо-данные для проверки ролей и сценариев.

## Быстрый запуск

```bash
npm run install:all
npm run db:reset
npm run dev:backend
npm run dev:mobile
```

Backend использует переменные из `backend/.env`. По умолчанию ожидается локальная база PostgreSQL через Unix socket:

```env
PGHOST=/tmp
PGPORT=5432
PGDATABASE=vkr_learning_app
PGUSER=kirill
```

Если база еще не создана:

```bash
createdb vkr_learning_app
npm run db:reset
```

Демо-пользователи:

- student@example.com / password
- teacher@example.com / password
- admin@example.com / password

По умолчанию мобильное приложение обращается к `http://localhost:4000/api`.
Для запуска на реальном телефоне укажите IP компьютера в Wi-Fi сети в `mobile/src/api.ts`, например `http://192.168.3.241:4000/api`.
