import os
import threading
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

os.environ['REPLIT_DEPLOYMENT'] = '1'

from app import app, init_db, _start_bot_with_retry

_init_lock = threading.Lock()
_initialized = False

def _background_init():
    global _initialized
    with _init_lock:
        if _initialized:
            return
        _initialized = True

    try:
        init_db()
        logger.info("Database initialized for production")
    except Exception as e:
        logger.error(f"Database init error: {e}")

    if not os.environ.get('WEBAPP_URL'):
        domains = os.environ.get('REPLIT_DOMAINS', '')
        if domains:
            os.environ['WEBAPP_URL'] = f"https://{domains.split(',')[0]}"
            logger.info(f"Set WEBAPP_URL to {os.environ['WEBAPP_URL']}")

    time.sleep(3)
    logger.info("Starting bot in WEBHOOK mode for production...")
    _start_bot_with_retry(0, use_webhook=True)

bg_thread = threading.Thread(target=_background_init, daemon=True)
bg_thread.start()
logger.info("Background init thread started (db + bot webhook)")
