# TG-DramaChina

## Overview
TG-DramaChina is a Telegram Mini App for streaming Chinese and Asian dramas. It features drama browsing, search, video playback, favorites, watch history, VIP membership via Saweria payments, and a referral system.

## Tech Stack
- **Backend**: Python/Flask
- **Frontend**: Vanilla HTML/CSS/JS (Telegram Mini App)
- **Database**: PostgreSQL (Replit built-in)
- **Bot**: aiogram (Telegram Bot API)
- **API**: Proxied from api.sansekai.my.id/api/dramabox
- **Payment**: Saweria webhook integration

## Project Structure
```
.
├── app.py                  # Main Flask app + Telegram bot
├── templates/
│   └── index.html          # Single-page app HTML
├── static/
│   ├── css/style.css       # All styles (dark theme)
│   └── js/app.js           # Frontend logic
└── replit.md               # This file
```

## Key Features
1. **Drama Browsing** - For You, Latest, Trending, Dub Indo tabs
2. **Search** - Real-time search with popular suggestions
3. **Video Playback** - In-app video player with episode list
4. **Favorites & History** - Saved in PostgreSQL per user
5. **Episode Locking** - Free members: episodes 1-10, VIP/referral: all episodes, Admin: unrestricted
6. **VIP Membership** - Via Saweria payment (3 days/2 weeks/1 month/1 year)
7. **Referral System** - Every 3 referrals = 24-hour full access. Progress bar in profile.
8. **Admin Detection** - Via TELEGRAM_ADMIN_ID env variable
9. **Reports** - Users can report issues, forwarded to admin via Telegram

## Environment Variables
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_ADMIN_ID` - Admin's Telegram user ID (full access)
- `WEBAPP_URL` - Public URL of the web app
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `SAWERIA_STREAM_KEY` - Saweria webhook signature verification key

## Database Tables
- `users` - User profiles, membership, referral tracking
- `subscriptions` - Saweria payment records
- `favorites` - User favorite dramas
- `watch_history` - User watch history
- `reports` - User bug reports
- `referral_logs` - Referral tracking log

## Recent Changes (Feb 2026)
- Renamed from DramaBox to TG-DramaChina across all files
- Fixed drama detail/description display (expanded field checks)
- Implemented episode locking: free=ep 1-10, premium=ep 11+
- Fixed video player stopping on navigation
- Fixed random drama button using foryou endpoint
- Enhanced referral system with 24-hour access rewards (every 3 referrals)
- Added referral progress bar in profile
- Updated bot welcome text with TG-DramaChina branding
- All UI text now in Indonesian (Bahasa Indonesia)

## User Preferences
- Language: Indonesian (Bahasa Indonesia) for all UI text
- Dark theme with accent gradient
- Mobile-first design for Telegram Mini App
