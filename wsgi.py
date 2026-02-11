import os
import threading
import logging
import time

logger = logging.getLogger(__name__)

from app import app, init_db, run_bot
from keep_alive import start_keep_alive

init_db()

def resilient_bot():
    max_retries = 0
    while True:
        max_retries += 1
        try:
            logger.info(f"Starting bot (attempt #{max_retries})...")
            run_bot()
        except Exception as e:
            logger.error(f"Bot crashed: {e}")
        wait = min(10, max_retries * 2)
        logger.info(f"Restarting bot in {wait}s...")
        time.sleep(wait)

bot_thread = threading.Thread(target=resilient_bot, daemon=True)
bot_thread.start()
logger.info("Bot thread started via gunicorn")

start_keep_alive()
