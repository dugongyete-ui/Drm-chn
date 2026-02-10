# Drama China Telegram Bot

## Overview
Bot Telegram untuk streaming drama China, Korea & Asia. Terintegrasi dengan DramaBox API dan sistem pembayaran Saweria.

## Current State
- Production-ready dengan gunicorn
- Bot Telegram aktif menggunakan aiogram (polling mode)
- Web app Flask sebagai backend API + dashboard
- Database PostgreSQL (Neon-backed via Replit)

## Project Architecture

### Files
- `app.py` - Main application: Flask web server + bot logic + all API endpoints
- `bot.py` - Standalone bot module (not used in production, app.py has integrated bot)
- `wsgi.py` - WSGI entry point for gunicorn (production)
- `keep_alive.py` - Self-ping keep-alive utility
- `templates/index.html` - Web dashboard template
- `static/` - CSS, JS, images

### Key Features
- DramaBox API proxy for streaming
- User management (registration, profiles, avatars)
- Favorites & watch history
- Referral system with rewards (3 refs = 24h, 10 refs = 2 weeks access)
- Saweria webhook for VIP payments
- Admin dashboard with monthly stats
- Episode access control (free 10 eps, VIP all eps)

### Environment Variables
- `TELEGRAM_BOT_TOKEN` (secret) - Bot token
- `TELEGRAM_ADMIN_ID` (secret) - Admin Telegram ID
- `DATABASE_URL` (secret) - PostgreSQL connection string
- `WEBAPP_URL` - Web app URL (different for dev/production)
- `SAWERIA_STREAM_KEY` - Saweria webhook signature key

### Deployment
- Target: Autoscale
- Run command: `gunicorn --bind=0.0.0.0:5000 --workers=1 --threads=4 --timeout=120 wsgi:app`
- Development: `python app.py` on port 5000

## Recent Changes
- 2026-02-10: Added auto-play next episode feature (5-second countdown with cancel/play now buttons)
- 2026-02-10: Fixed deployment build errors (removed nodejs-20, vercel-pkg, unnecessary deps)
- 2026-02-10: Configured gunicorn for production deployment
- 2026-02-10: Fixed WEBAPP_URL trailing slash issue
- 2026-02-10: Removed Koyeb-specific files (Dockerfile, start.sh, DEPLOY_KOYEB.md)
- 2026-02-10: Set separate WEBAPP_URL for dev and production environments
