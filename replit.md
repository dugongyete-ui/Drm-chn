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
install.sh          - Auto dependency installer (uses uv)
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
- User profile with stats, membership, referral system
- VIP Membership upgrade via Saweria payment (auto-activated via webhook)
- Settings page (language, notifications, clear history)
- About page (app info, features list)
- Help center with report form
- Pagination (Load More) on all content pages
- Telegram Bot with /start, TopUp (Saweria link), Help callbacks

## Saweria Integration
- Payment URL: `https://saweria.co/dugongyete`
- Webhook endpoint: `/webhook/saweria`
- User puts their Telegram ID in the Saweria message field
- Pricing tiers (IDR):
  - Rp 15.000+ = 1 Month VIP
  - Rp 50.000+ = 6 Months VIP
  - Rp 85.000+ = 1 Year VIP
  - Rp 150.000+ = Lifetime VIP
- Webhook verifies HMAC SHA256 signature using SAWERIA_STREAM_KEY
- Auto-activates VIP and sends Telegram notification on successful payment

## Database Tables
- `users` - User profiles, membership status, points, referrals, settings
- `subscriptions` - Payment/subscription records from Saweria
- `favorites` - Saved drama favorites
- `watch_history` - Drama watch history
- `reports` - User issue reports

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `WEBAPP_URL` - URL of the deployed web app
- `TELEGRAM_ADMIN_ID` - Admin chat ID for receiving reports
- `GROUP_URL` - Official Telegram group URL
- `SAWERIA_STREAM_KEY` - Stream key from Saweria webhook settings

## Running
- `python app.py` starts both web server (port 5000) and Telegram bot
- `bash install.sh` installs all dependencies via uv

## Deployment
- Uses gunicorn for production: `gunicorn --bind=0.0.0.0:5000 --workers=2 app:app`
- Bot runs in a background thread within the same process

## Recent Changes
- 2026-02-10: Initial build - full SPA with all pages
- 2026-02-10: Added pagination (Load More) to Home and Search
- 2026-02-10: Integrated bot into main app.py for single-process deployment
- 2026-02-10: Added cache busting for static assets
- 2026-02-10: Added Saweria webhook for VIP subscription auto-activation
- 2026-02-10: Built VIP Upgrade page with pricing tiers and Saweria payment link
- 2026-02-10: Built Settings page (language, notifications, clear history)
- 2026-02-10: Built About page (app info, features, version)
- 2026-02-10: Updated bot TopUp to show Saweria link and pricing
- 2026-02-10: Fixed install.sh to use uv instead of pip
- 2026-02-10: Added subscription check API and settings API endpoints
