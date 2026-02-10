# DramaBox - Telegram Mini App

## Overview
A Telegram Bot with integrated Mini App (Web App) for streaming Chinese & Asian dramas (Dramabox style). Features a dark-themed modern dashboard with drama browsing, search, video playback, favorites, watch history, user profiles, VIP membership via Saweria payments, and full settings.

## Architecture
- **Backend:** Python Flask (web server + API proxy) + aiogram (Telegram bot)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA)
- **Database:** PostgreSQL (users, subscriptions, favorites, watch history, reports)
- **External API:** DramaBox API at `https://api.sansekai.my.id/api/dramabox`
- **Payment:** Saweria webhook integration for VIP subscriptions

## Project Structure
```
app.py              - Main entry point (Flask server + Telegram bot + Saweria webhook)
bot.py              - Standalone bot script (backup)
install.sh          - Auto dependency installer (uses uv/pip)
templates/
  index.html        - Main SPA template (all pages)
static/
  css/style.css     - Dark theme styling
  js/app.js         - Frontend SPA logic
```

## Key Features
- Home page with tabs: For You, Latest, Trending, Dub Indo
- Real-time search with popular suggestions
- Drama detail with synopsis, tags, episodes
- HTML5 video player
- Favorites & watch history (database-backed)
- User profile with Telegram avatar, stats, membership, referral system
- VIP Membership upgrade via Saweria payment (auto-activated via webhook)
- Settings page (language, notifications, clear history)
- About page (app info, features list)
- Help center with report form
- Pagination (Load More) on all content pages
- Telegram Bot with /start and Open App button only (clean UI)

## Saweria Integration
- Payment URL: `https://saweria.co/dugongyete`
- Webhook endpoint: `/webhook/saweria`
- User puts their Telegram ID in the Saweria message field
- Pricing tiers (IDR):
  - Rp 5.000+ = 3 Hari VIP
  - Rp 10.000+ = 2 Minggu VIP
  - Rp 35.000+ = 1 Bulan VIP
  - Rp 250.000+ = 1 Tahun VIP
- Webhook verifies HMAC SHA256 signature using SAWERIA_STREAM_KEY
- Auto-activates VIP and sends Telegram notification on successful payment

## Database Tables
- `users` - User profiles, membership status, points, referrals, settings, avatar_url
- `subscriptions` - Payment/subscription records from Saweria
- `favorites` - Saved drama favorites
- `watch_history` - Drama watch history
- `reports` - User issue reports

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `WEBAPP_URL` - URL of the deployed web app
- `TELEGRAM_ADMIN_ID` - Admin chat ID for receiving reports
- `SAWERIA_STREAM_KEY` - Stream key from Saweria webhook settings

## Running
- `python app.py` starts both web server (port 5000) and Telegram bot
- Database tables are auto-created on startup
- `bash install.sh` installs all dependencies via uv or pip

## Deployment
- Uses gunicorn for production: `gunicorn --bind=0.0.0.0:5000 --workers=2 --timeout=120 app:app`
- Bot runs in a background thread within the same process

## Recent Changes
- 2026-02-10: Fixed install.sh - now supports both python3 and python commands, uv and pip
- 2026-02-10: Removed Official Group, TopUp, Help/OSINT buttons from bot (only Open App button remains)
- 2026-02-10: Added Telegram profile photo support - bot fetches actual avatar from Telegram API
- 2026-02-10: Profile page now shows real Telegram avatar with fallback to initial letter
- 2026-02-10: Added auto database initialization on startup (CREATE TABLE IF NOT EXISTS)
- 2026-02-10: Fixed hardcoded WEBAPP_DOMAIN to use environment variable
- 2026-02-10: Added /api/user/photo endpoint for avatar retrieval
- 2026-02-10: Settings API now returns membership status
- 2026-02-10: Configured deployment with gunicorn autoscale
