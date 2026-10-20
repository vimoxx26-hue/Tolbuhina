# Tolbuhina — «Свой ритм»

Посадочная страница с тестом подбора витаминов и БАДов, регистрацией и информационной программой. Telegram-бот проводит тот же тест и поддерживает уведомления о регистрациях.

## Публикация на Vercel

- Репозиторий: vimoxx26-hue/Tolbuhina, ветка main
- Root Directory: **site**
- Framework: Next.js
- Node.js: 24.x
- Install Command: npm ci
- Build Command: npm run build

Серверное хранилище на Vercel: LEAD_STORAGE=supabase. SUPABASE_URL и SUPABASE_SECRET_KEY задаются в закрытых настройках проекта. Также требуются SITE_OWNER_NAME и SITE_OWNER_CONTACT; для подписи доступа рекомендуется отдельный REGISTRATION_SECRET. SITE_URL — итоговый HTTPS-адрес сайта. Telegram-уведомления: TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID, только серверные переменные.

Инструкции: [Vercel + Supabase](site/deploy/VERCEL_SUPABASE.md), [сайт и локальный запуск](site/README.md), [Telegram-бот](site/bot/README.md). SQL таблицы контактов: [supabase/leads.sql](supabase/leads.sql).

Токены, локальная база и .env.local не входят в репозиторий. Telegram long polling запускается отдельным процессом вне Vercel. Тест не ставит диагнозы и не назначает лечение.
