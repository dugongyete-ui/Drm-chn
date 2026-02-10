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

def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

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
        return jsonify(dict(user))
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
            return jsonify(dict(user))
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

        cur.execute("UPDATE users SET referred_by = %s WHERE telegram_id = %s", (referrer_id, telegram_id))
        cur.execute("""
            UPDATE users SET referral_count = referral_count + 1, points = points + 100
            WHERE telegram_id = %s
        """, (referrer_id,))
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/subscription/check/<int:telegram_id>')
def check_subscription(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT membership, membership_expires_at FROM users WHERE telegram_id = %s", (telegram_id,))
        user = cur.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404

        membership = user['membership'] or 'Free'
        expires_at = user['membership_expires_at']
        is_active = False

        if membership == 'VIP':
            if expires_at is None:
                is_active = True
            elif expires_at > datetime.now():
                is_active = True
            else:
                cur.execute("UPDATE users SET membership = 'Free', membership_expires_at = NULL WHERE telegram_id = %s", (telegram_id,))
                conn.commit()
                membership = 'Free'
                expires_at = None

        return jsonify({
            "telegram_id": telegram_id,
            "membership": membership,
            "is_active": is_active,
            "expires_at": expires_at.isoformat() if expires_at else None
        })
    finally:
        cur.close()
        conn.close()

@app.route('/api/settings/<int:telegram_id>', methods=['GET'])
def get_settings(telegram_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT language, notifications_enabled FROM users WHERE telegram_id = %s", (telegram_id,))
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
            "Terima kasih telah berlangganan DramaBox VIP! 🎬"
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
            "🎬 <b>Welcome to DramaBox!</b>\n\n"
            "Nikmati ribuan drama China, Korea & Asia lainnya "
            "langsung dari Telegram!\n\n"
            "📺 Tap <b>Open App</b> untuk mulai menonton.\n"
            "💎 Dapatkan poin dengan mengundang teman!"
        )

        rows = []
        if WEBAPP_URL:
            rows.append([InlineKeyboardButton(text="🎬 Open App", web_app=WebAppInfo(url=WEBAPP_URL))])
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
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    logger.info("Starting web server on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)
