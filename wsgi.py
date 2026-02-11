import os
import threading
import logging
import time

logger = logging.getLogger(__name__)

from app import app, init_db, run_bot
from keep_alive import start_keep_alive

init_db()

def delayed_bot_start():
    time.sleep(10)
    retry_count = 0
    while True:
        retry_count += 1
        try:
            logger.info(f"Starting bot (attempt #{retry_count})...")
            run_bot()
        except Exception as e:
            logger.error(f"Bot crashed: {e}")
        wait = min(30, 5 * retry_count)
        logger.info(f"Restarting bot in {wait}s...")
        time.sleep(wait)

bot_thread = threading.Thread(target=delayed_bot_start, daemon=True)
bot_thread.start()
logger.info("Bot thread scheduled (starts after 10s delay for health check)")

start_keep_alive()
