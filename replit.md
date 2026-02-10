# DramaBox - Telegram Mini App

## Overview
A Telegram Bot with integrated Mini App (Web App) for streaming Chinese & Asian dramas (Dramabox style). Features a dark-themed modern dashboard with drama browsing, search, video playback, favorites, watch history, and user profiles.

## Architecture
- **Backend:** Python Flask (web server + API proxy) + aiogram (Telegram bot)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA)
- **Database:** PostgreSQL (users, favorites, watch history, reports)
- **External API:** DramaBox API at `https://api.sansekai.my.id/api/dramabox`

## Project Structure
```
app.py              - Main entry point (Flask server + Telegram bot)
bot.py              - Standalone bot script (backup)
install.sh          - Auto dependency installer
templates/
  index.html        - Main SPA template
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
- Help center with report form
- Pagination (Load More) on all content pages
- Telegram Bot with /start, TopUp, Help callbacks

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `WEBAPP_URL` - URL of the deployed web app
- `TELEGRAM_ADMIN_ID` - Admin chat ID for receiving reports
- `GROUP_URL` - Official Telegram group URL

## Running
- `python app.py` starts both web server (port 5000) and Telegram bot
- `bash install.sh` installs all dependencies

## Deployment
- Uses gunicorn for production: `gunicorn --bind=0.0.0.0:5000 --workers=2 app:app`
- Bot runs in a background thread within the same process

## Recent Changes
- 2026-02-10: Initial build - full SPA with all pages
- 2026-02-10: Added pagination (Load More) to Home and Search
- 2026-02-10: Integrated bot into main app.py for single-process deployment
- 2026-02-10: Added cache busting for static assets
