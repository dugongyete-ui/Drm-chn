# Drama China

## Overview
Drama China is a Telegram Mini App for streaming Chinese and Asian dramas. It features drama browsing, search, video playback, favorites, watch history, VIP membership via Saweria payments, and a referral system.

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
├── bot.py                  # Standalone bot (not used when app.py runs)
├── templates/
│   └── index.html          # Single-page app HTML
├── static/
│   ├── css/style.css       # All styles (Netflix dark theme)
│   ├── js/app.js           # Frontend logic
│   └── images/
│       ├── welcome_banner.png  # Bot /start welcome photo
│       └── bot_profile.png     # Bot profile picture (for manual upload)
└── replit.md               # This file
```

## Key Features
1. **Drama Browsing** - For You, Latest, Trending, Dub Indo tabs
2. **Search** - Real-time search with popular suggestions
3. **Video Playback** - In-app video player with episode list
4. **Favorites & History** - Saved in PostgreSQL per user
5. **Episode Locking** - Free members: episodes 1-10, VIP/referral: all episodes, Admin: unrestricted
6. **VIP Membership** - Via Saweria payment (3 days/2 weeks/1 month/1 year)
7. **Referral System** - Two tiers: every 3 referrals = 24-hour access, reaching 10 referrals = 2-week access. Notifications sent on each successful referral with progress updates.
8. **Admin Detection** - Via TELEGRAM_ADMIN_ID env variable
9. **Reports** - Users can report issues, forwarded to admin via Telegram

## Environment Variables
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_ADMIN_ID` - Admin's Telegram user ID (full access)
- `WEBAPP_URL` - Public URL of the web app (auto-detected from REPLIT_DEV_DOMAIN if not set)
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
- **Bot /start with photo**: Bot now sends a welcome banner image when user hits /start, with description and inline keyboard
- **Bot profile picture**: Generated profile picture available at static/images/bot_profile.png for manual upload to BotFather
- **Monthly statistics dashboard**: Admin-only page showing total users, new users, active users, VIP users, watches, favorites, referrals, revenue, transactions, reports, and daily signup chart. API: GET /api/stats/monthly
- **Saweria test endpoint**: Admin-only endpoint POST /api/stats/test-saweria to simulate Saweria webhook payments without real money
- **Saweria webhook logging**: Added signature verification logging for debugging
- **Netflix-style UI overhaul**: Dark background (#0a0a0a), red accent (#e50914), gold VIP accents, smooth animations, skeleton loaders
- **Fixed API 405 errors**: /api/user and /api/referral now accept both GET and POST methods
- **Enhanced referral system**: Processes referrals from URL params (?ref=ref_xxx) and Telegram start_param. Sends notification to referrer on every successful invite (not just every 3rd).
- **Two-tier referral system**: 3 friends = 24h access, 10 friends = 2 weeks access, with dual progress bars on profile page
- **Monthly stats page fix**: Added dedicated stats page with proper navigation instead of broken page-content reference
- **Mobile responsive fix**: Removed max-width constraint so web app fills full phone screen width
- **Fixed pricing selection**: Clear visual distinction between selected vs recommended items with proper border/background/shadow states
- **Page transitions**: Smooth enter/exit animations between pages
- **Card animations**: Staggered card entrance animations with scale/opacity effects
- **Modern navigation**: Bottom nav with active indicator animations

## User Preferences
- Language: Indonesian (Bahasa Indonesia) for all UI text
- Netflix-style dark theme: #0a0a0a background, #e50914 red accent, #f5c518 gold VIP
- Mobile-first design for Telegram Mini App
- Referral notifications on every successful referral to keep users engaged
