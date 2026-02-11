import os
import threading
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app import app, init_db, _start_bot_with_retry

_db_initialized = False

def _background_init():
    global _db_initialized
    try:
        init_db()
        _db_initialized = True
        logger.info("Database initialized for production")
    except Exception as e:
        logger.error(f"Database init error: {e}")
        _db_initialized = True

    time.sleep(5)
    logger.info("Starting bot thread in WEBHOOK mode for production...")
    _start_bot_with_retry(0, use_webhook=True)

bg_thread = threading.Thread(target=_background_init, daemon=True)
bg_thread.start()
logger.info("Background init thread started (db + bot webhook)")
