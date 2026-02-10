import os
import time
import json
import asyncio
import threading
import logging
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
    GROUP_URL = os.environ.get('GROUP_URL', 'https://t.me/dramaboxchannel')

    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def start_handler(message: aitypes.Message):
        args = message.text.split()
        ref_code = args[1] if len(args) > 1 else None

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
        rows.append([InlineKeyboardButton(text="👥 Official Group", url=GROUP_URL)])
        rows.append([
            InlineKeyboardButton(text="💎 TopUp", callback_data="topup"),
            InlineKeyboardButton(text="❓ Help/OSINT", callback_data="help")
        ])
        keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

        await message.answer(welcome_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)

        if ref_code and ref_code.startswith('ref_') and WEBAPP_URL:
            try:
                import aiohttp as aio
                async with aio.ClientSession() as session:
                    await session.post(f"{WEBAPP_URL}/api/referral", json={
                        "telegram_id": message.from_user.id,
                        "ref_code": ref_code
                    })
            except Exception as e:
                logger.error(f"Referral error: {e}")

    @dp.callback_query(lambda c: c.data == "topup")
    async def topup_callback(callback: aitypes.CallbackQuery):
        text = (
            "💎 <b>TopUp Points</b>\n\n"
            "🔹 <b>Lifetime VIP</b> - Akses semua drama selamanya\n"
            "🔹 <b>1 Year VIP</b> - Akses selama 1 tahun\n\n"
            "Buka aplikasi untuk melihat detail harga dan upgrade membership."
        )
        await callback.message.answer(text, parse_mode=ParseMode.HTML)
        await callback.answer()

    @dp.callback_query(lambda c: c.data == "help")
    async def help_callback(callback: aitypes.CallbackQuery):
        text = (
            "❓ <b>Help Center</b>\n\n"
            "Jika kamu mengalami masalah, silakan buka aplikasi "
            "dan gunakan fitur <b>Help Center</b> di halaman Profile.\n\n"
            "Atau hubungi admin di grup official kami."
        )
        await callback.message.answer(text, parse_mode=ParseMode.HTML)
        await callback.answer()

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
