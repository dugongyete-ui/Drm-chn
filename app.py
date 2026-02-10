import os
import time
import json
import hmac
import hashlib
import asyncio
import threading
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, render_template
import psycopg2
from psycopg2.extras import RealDictCursor
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dramabox-secret-key-2026')

DATABASE_URL = os.environ.get('DATABASE_URL')
API_BASE = 'https://api.sansekai.my.id/api/dramabox'
SAWERIA_STREAM_KEY = os.environ.get('SAWERIA_STREAM_KEY', '')
WEBAPP_DOMAIN = os.environ.get('WEBAPP_URL', f"https://{os.environ.get('REPLIT_DEV_DOMAIN', 'localhost:5000')}")

def get_admin_id():
    admin_id = os.environ.get('TELEGRAM_ADMIN_ID', '')
    try:
        return int(admin_id) if admin_id else None
    except:
        return None

def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def init_db():
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set. Database features won't work.")
        return
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                avatar_url TEXT,
                membership VARCHAR(50) DEFAULT 'Free',
                membership_expires_at TIMESTAMP,
                points INTEGER DEFAULT 0,
                commission INTEGER DEFAULT 0,
                referral_count INTEGER DEFAULT 0,
                referred_by BIGINT,
                language VARCHAR(10) DEFAULT 'id',
                notifications_enabled BOOLEAN DEFAULT TRUE,
                referral_access_expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                saweria_transaction_id VARCHAR(255) UNIQUE,
                plan_type VARCHAR(100),
                amount INTEGER,
                donator_name VARCHAR(255),
                donator_email VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                activated_at TIMESTAMP,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                book_id VARCHAR(255) NOT NULL,
                title VARCHAR(500),
                cover_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(telegram_id, book_id)
            );
            CREATE TABLE IF NOT EXISTS watch_history (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                book_id VARCHAR(255) NOT NULL,
                title VARCHAR(500),
                cover_url TEXT,
                episode_number VARCHAR(100),
                watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(telegram_id, book_id)
            );
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                issue_type VARCHAR(255),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS referral_logs (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(referrer_id, referred_id)
            );
        """)
        try:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_access_expires_at TIMESTAMP")
        except:
            pass
        conn.commit()
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Database init error: {e}")
    finally:
        cur.close()
        conn.close()

@app.after_request
def add_headers(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

@app.route('/')
def index():
    return render_template('index.html', cache_bust=int(time.time()))

@app.route('/api/proxy/<path:endpoint>')
def proxy_api(endpoint):
    import requests as req
    params = dict(request.args)
    url = f"{API_BASE}/{endpoint}"
    try:
        resp = req.get(url, params=params, timeout=15)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        logger.error(f"API proxy error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/user', methods=['POST'])
def upsert_user():
    data = request.json
    telegram_id = data.get('telegram_id')
    if not telegram_id:
        return jsonify({"error": "telegram_id required"}), 400

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO users (telegram_id, username, first_name, last_name, avatar_url)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (telegram_id) DO UPDATE SET
                username = EXCLUDED.username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                avatar_url = EXCLUDED.avatar_url
            RETURNING *
        """, (telegram_id, data.get('username'), data.get('first_name'), data.get('last_name'), data.get('avatar_url')))
        user = cur.fetchone()
        conn.commit()
        user_dict = dict(user)
        admin_id = get_admin_id()
        user_dict['is_admin'] = (admin_id is not None and int(telegram_id) == admin_id)
        return jsonify(user_dict)
    except Exception as e:
        conn.rollback()
        logger.error(f"User upsert error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/user/<int:telegram_id>')
def get_user(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if user:
            user_dict = dict(user)
            admin_id = get_admin_id()
            user_dict['is_admin'] = (admin_id is not None and telegram_id == admin_id)
            now = datetime.now()
            if user_dict.get('referral_access_expires_at') and user_dict['referral_access_expires_at'] > now:
                user_dict['has_referral_access'] = True
            else:
                user_dict['has_referral_access'] = False
            return jsonify(user_dict)
        return jsonify({"error": "User not found"}), 404
    finally:
        cur.close()
        conn.close()

@app.route('/api/favorites', methods=['POST'])
def add_favorite():
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO favorites (telegram_id, book_id, title, cover_url)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (telegram_id, book_id) DO NOTHING
            RETURNING *
        """, (data['telegram_id'], data['book_id'], data.get('title'), data.get('cover_url')))
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/favorites/<int:telegram_id>')
def get_favorites(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM favorites WHERE telegram_id = %s ORDER BY created_at DESC", (telegram_id,))
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        cur.close()
        conn.close()

@app.route('/api/favorites', methods=['DELETE'])
def remove_favorite():
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM favorites WHERE telegram_id = %s AND book_id = %s",
                     (data['telegram_id'], data['book_id']))
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/history', methods=['POST'])
def add_history():
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO watch_history (telegram_id, book_id, title, cover_url, episode_number)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (telegram_id, book_id) DO UPDATE SET
                episode_number = EXCLUDED.episode_number,
                watched_at = CURRENT_TIMESTAMP
            RETURNING *
        """, (data['telegram_id'], data['book_id'], data.get('title'), data.get('cover_url'), data.get('episode_number', 1)))
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/history/<int:telegram_id>')
def get_history(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM watch_history WHERE telegram_id = %s ORDER BY watched_at DESC", (telegram_id,))
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        cur.close()
        conn.close()

@app.route('/api/history/<int:telegram_id>', methods=['DELETE'])
def clear_history(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM watch_history WHERE telegram_id = %s", (telegram_id,))
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/report', methods=['POST'])
def submit_report():
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO reports (telegram_id, issue_type, description)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (data['telegram_id'], data['issue_type'], data['description']))
        conn.commit()

        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
        admin_id = os.environ.get('TELEGRAM_ADMIN_ID')
        if bot_token and admin_id:
            import requests as req
            msg = f"📩 New Report\nFrom: {data['telegram_id']}\nType: {data['issue_type']}\n\n{data['description']}"
            req.post(f"https://api.telegram.org/bot{bot_token}/sendMessage",
                     json={"chat_id": admin_id, "text": msg})

        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/bot/info')
def get_bot_info():
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        return jsonify({"username": ""})
    try:
        import requests as req
        resp = req.get(f"https://api.telegram.org/bot{bot_token}/getMe", timeout=10)
        data = resp.json()
        if data.get('ok'):
            return jsonify({"username": data['result'].get('username', '')})
        return jsonify({"username": ""})
    except:
        return jsonify({"username": ""})

@app.route('/api/user/photo/<int:telegram_id>')
def get_user_photo(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT avatar_url FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if user and user['avatar_url']:
            return jsonify({"avatar_url": user['avatar_url']})
        return jsonify({"avatar_url": ""})
    finally:
        cur.close()
        conn.close()

@app.route('/api/referral', methods=['POST'])
def handle_referral():
    data = request.json
    ref_code = data.get('ref_code')
    telegram_id = data.get('telegram_id')
    if not ref_code or not telegram_id:
        return jsonify({"error": "missing params"}), 400

    try:
        referrer_id = int(ref_code.replace('ref_', ''))
    except:
        return jsonify({"error": "invalid ref code"}), 400

    if referrer_id == telegram_id:
        return jsonify({"error": "cannot refer yourself"}), 400

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT referred_by FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if user and user['referred_by']:
            return jsonify({"status": "already_referred"})

        cur.execute("SELECT telegram_id FROM users WHERE telegram_id = %s", (referrer_id,))
        referrer = cur.fetchone()
        if not referrer:
            return jsonify({"error": "referrer not found"}), 404

        cur.execute("UPDATE users SET referred_by = %s WHERE telegram_id = %s", (referrer_id, telegram_id))

        try:
            cur.execute("""
                INSERT INTO referral_logs (referrer_id, referred_id)
                VALUES (%s, %s)
                ON CONFLICT (referrer_id, referred_id) DO NOTHING
            """, (referrer_id, telegram_id))
        except:
            pass

        cur.execute("""
            UPDATE users SET referral_count = referral_count + 1, points = points + 100
            WHERE telegram_id = %s
            RETURNING referral_count
        """, (referrer_id,))
        updated = cur.fetchone()
        new_count = updated['referral_count'] if updated else 0

        if new_count > 0 and new_count % 3 == 0:
            expires = datetime.now() + timedelta(hours=24)
            cur.execute("""
                UPDATE users SET referral_access_expires_at = %s
                WHERE telegram_id = %s
            """, (expires, referrer_id))

            bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
            if bot_token:
                try:
                    import requests as req
                    msg = (
                        "🎉 <b>Selamat!</b>\n\n"
                        f"Kamu berhasil mengundang {new_count} teman!\n"
                        "🔓 Akses penuh 24 jam telah diaktifkan.\n"
                        f"⏰ Berlaku hingga: {expires.strftime('%d %B %Y %H:%M')}\n\n"
                        "Terus undang teman untuk mendapatkan akses gratis!"
                    )
                    req.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": referrer_id, "text": msg, "parse_mode": "HTML"}
                    )
                except Exception as e:
                    logger.error(f"Failed to send referral notification: {e}")

        conn.commit()
        return jsonify({"status": "ok", "referral_count": new_count})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/referral/status/<int:telegram_id>')
def referral_status(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT referral_count, referral_access_expires_at, points FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404

        now = datetime.now()
        has_access = False
        expires_at = user.get('referral_access_expires_at')
        if expires_at and expires_at > now:
            has_access = True

        next_reward = 3 - (user['referral_count'] % 3) if user['referral_count'] % 3 != 0 else 3

        return jsonify({
            "referral_count": user['referral_count'],
            "points": user['points'],
            "has_referral_access": has_access,
            "referral_access_expires_at": expires_at.isoformat() if expires_at else None,
            "referrals_until_next_reward": next_reward
        })
    finally:
        cur.close()
        conn.close()

@app.route('/api/episode/access', methods=['POST'])
def check_episode_access():
    data = request.json
    telegram_id = data.get('telegram_id')
    episode_index = data.get('episode_index', 0)

    if not telegram_id:
        return jsonify({"allowed": episode_index < 10, "reason": "login_required"})

    admin_id = get_admin_id()
    if admin_id and int(telegram_id) == admin_id:
        return jsonify({"allowed": True, "reason": "admin"})

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT membership, membership_expires_at, referral_access_expires_at FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"allowed": episode_index < 10, "reason": "user_not_found"})

        now = datetime.now()

        if user['membership'] == 'VIP':
            if user['membership_expires_at'] is None or user['membership_expires_at'] > now:
                return jsonify({"allowed": True, "reason": "vip"})
            else:
                cur.execute("UPDATE users SET membership = 'Free', membership_expires_at = NULL WHERE telegram_id = %s", (telegram_id,))
                conn.commit()

        if user.get('referral_access_expires_at') and user['referral_access_expires_at'] > now:
            return jsonify({"allowed": True, "reason": "referral_access"})

        if episode_index < 10:
            return jsonify({"allowed": True, "reason": "free_episode"})

        return jsonify({"allowed": False, "reason": "premium_required"})
    finally:
        cur.close()
        conn.close()

@app.route('/api/subscription/check/<int:telegram_id>')
def check_subscription(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT membership, membership_expires_at, referral_access_expires_at FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404

        membership = user['membership'] or 'Free'
        expires_at = user['membership_expires_at']
        is_active = False
        now = datetime.now()

        admin_id = get_admin_id()
        if admin_id and telegram_id == admin_id:
            is_active = True
            membership = 'Admin'

        elif membership == 'VIP':
            if expires_at is None:
                is_active = True
            elif expires_at > now:
                is_active = True
            else:
                cur.execute("UPDATE users SET membership = 'Free', membership_expires_at = NULL WHERE telegram_id = %s", (telegram_id,))
                conn.commit()
                membership = 'Free'
                expires_at = None

        has_referral_access = False
        ref_expires = user.get('referral_access_expires_at')
        if ref_expires and ref_expires > now:
            has_referral_access = True
            if not is_active:
                is_active = True

        return jsonify({
            "telegram_id": telegram_id,
            "membership": membership,
            "is_active": is_active,
            "has_referral_access": has_referral_access,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "referral_access_expires_at": ref_expires.isoformat() if ref_expires else None
        })
    finally:
        cur.close()
        conn.close()

@app.route('/api/settings/<int:telegram_id>', methods=['GET'])
def get_settings(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT language, notifications_enabled, membership FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify(dict(user))
    finally:
        cur.close()
        conn.close()

@app.route('/api/settings/<int:telegram_id>', methods=['PUT'])
def update_settings(telegram_id):
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    try:
        updates = []
        values = []
        if 'language' in data:
            updates.append("language = %s")
            values.append(data['language'])
        if 'notifications_enabled' in data:
            updates.append("notifications_enabled = %s")
            values.append(data['notifications_enabled'])

        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400

        values.append(telegram_id)
        cur.execute(f"UPDATE users SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = %s RETURNING language, notifications_enabled", values)
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        conn.commit()
        return jsonify(dict(user))
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

def determine_plan(amount):
    if amount >= 250000:
        return "1 Year VIP", timedelta(days=365)
    elif amount >= 35000:
        return "1 Month VIP", timedelta(days=30)
    elif amount >= 10000:
        return "2 Weeks VIP", timedelta(days=14)
    elif amount >= 5000:
        return "3 Days VIP", timedelta(days=3)
    return None, None

def send_telegram_notification(telegram_id, text):
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        return
    try:
        import requests as req
        req.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": telegram_id, "text": text, "parse_mode": "HTML"}
        )
    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")

@app.route('/webhook/saweria', methods=['POST'])
def saweria_webhook():
    signature = request.headers.get('Saweria-Callback-Signature', '')
    raw_body = request.get_data()

    if SAWERIA_STREAM_KEY:
        expected_sig = hmac.new(
            SAWERIA_STREAM_KEY.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            logger.warning("Saweria webhook signature mismatch")
            return jsonify({"error": "Invalid signature"}), 403

    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400

    transaction_id = data.get('id', '')
    amount = int(data.get('amount_raw', 0))
    donator_name = data.get('donator_name', '')
    donator_email = data.get('donator_email', '')
    message = data.get('message', '').strip()
    created_at = data.get('created_at', '')

    try:
        telegram_id = int(message)
    except (ValueError, TypeError):
        logger.warning(f"Saweria webhook: invalid telegram_id in message: {message}")
        return jsonify({"error": "Invalid telegram_id in message"}), 400

    plan_type, duration = determine_plan(amount)
    if not plan_type:
        logger.info(f"Saweria payment amount {amount} too low for any plan")
        return jsonify({"error": "Amount too low for any plan"}), 400

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM subscriptions WHERE saweria_transaction_id = %s", (transaction_id,))
        if cur.fetchone():
            return jsonify({"status": "already_processed"})

        now = datetime.now()
        expires_at = (now + duration) if duration else None

        cur.execute("""
            INSERT INTO subscriptions (telegram_id, saweria_transaction_id, plan_type, amount, donator_name, donator_email, status, activated_at, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'active', %s, %s)
            RETURNING *
        """, (telegram_id, transaction_id, plan_type, amount, donator_name, donator_email, now, expires_at))

        cur.execute("""
            UPDATE users SET membership = 'VIP', membership_expires_at = %s, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = %s
        """, (expires_at, telegram_id))

        conn.commit()

        expires_text = expires_at.strftime('%d %B %Y') if expires_at else 'Selamanya (Lifetime)'
        notification = (
            "✅ <b>Pembayaran Berhasil!</b>\n\n"
            f"💎 Plan: <b>{plan_type}</b>\n"
            f"💰 Jumlah: Rp {amount:,}\n"
            f"📅 Berlaku sampai: <b>{expires_text}</b>\n\n"
            "Terima kasih telah berlangganan TG-DramaChina VIP! 🎬"
        )
        send_telegram_notification(telegram_id, notification)

        admin_id = os.environ.get('TELEGRAM_ADMIN_ID')
        if admin_id:
            admin_msg = (
                f"💰 <b>New Payment</b>\n"
                f"User: {telegram_id}\n"
                f"Plan: {plan_type}\n"
                f"Amount: Rp {amount:,}\n"
                f"Donator: {donator_name}"
            )
            send_telegram_notification(int(admin_id), admin_msg)

        return jsonify({"status": "ok", "plan": plan_type})

    except Exception as e:
        conn.rollback()
        logger.error(f"Saweria webhook error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

def run_bot():
    BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
    if not BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set. Bot will not start.")
        return

    from aiogram import Bot, Dispatcher, types as aitypes
    from aiogram.filters import CommandStart
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
    from aiogram.enums import ParseMode

    WEBAPP_URL = os.environ.get('WEBAPP_URL', '')

    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def start_handler(message: aitypes.Message):
        args = message.text.split()
        ref_code = args[1] if len(args) > 1 else None

        user = message.from_user
        avatar_url = ''
        try:
            photos = await bot.get_user_profile_photos(user.id, limit=1)
            if photos.total_count > 0:
                file_info = await bot.get_file(photos.photos[0][-1].file_id)
                avatar_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info.file_path}"
        except Exception as e:
            logger.error(f"Failed to get profile photo: {e}")

        if WEBAPP_URL:
            try:
                import aiohttp as aio
                async with aio.ClientSession() as session:
                    await session.post(f"{WEBAPP_URL}/api/user", json={
                        "telegram_id": user.id,
                        "username": user.username or '',
                        "first_name": user.first_name or '',
                        "last_name": user.last_name or '',
                        "avatar_url": avatar_url
                    })
            except Exception as e:
                logger.error(f"User register error: {e}")

        welcome_text = (
            "🎬 <b>Selamat datang di TG-DramaChina!</b>\n\n"
            "Nikmati ribuan drama China & Asia lainnya "
            "langsung dari Telegram!\n\n"
            "📺 Tap <b>Buka Aplikasi</b> untuk mulai menonton.\n"
            "💎 Undang 3 teman untuk akses penuh 24 jam GRATIS!\n"
            "👑 Atau upgrade ke VIP untuk akses tanpa batas."
        )

        rows = []
        if WEBAPP_URL:
            webapp_url = WEBAPP_URL
            if ref_code and ref_code.startswith('ref_'):
                webapp_url = f"{WEBAPP_URL}?ref={ref_code}"
            rows.append([InlineKeyboardButton(text="🎬 Buka Aplikasi", web_app=WebAppInfo(url=webapp_url))])
        keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

        await message.answer(welcome_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)

        if ref_code and ref_code.startswith('ref_') and WEBAPP_URL:
            try:
                import aiohttp as aio
                async with aio.ClientSession() as session:
                    await session.post(f"{WEBAPP_URL}/api/referral", json={
                        "telegram_id": user.id,
                        "ref_code": ref_code
                    })
            except Exception as e:
                logger.error(f"Referral error: {e}")

    async def bot_main():
        logger.info("Bot started successfully!")
        await dp.start_polling(bot, handle_signals=False)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(bot_main())

if __name__ == '__main__':
    init_db()
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    logger.info("Starting web server on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)
