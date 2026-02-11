import os
import threading
import logging
import time
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app import app, init_db, run_bot
from keep_alive import start_keep_alive

init_db()

_bot_started = False

def delayed_bot_start():
    global _bot_started
    if _bot_started:
        logger.warning("Bot already started, skipping duplicate start")
        return
    _bot_started = True

    time.sleep(5)
    retry_count = 0
    max_retries = 100
    while retry_count < max_retries:
        retry_count += 1
        try:
            logger.info(f"Starting bot (attempt #{retry_count})...")
            run_bot()
        except Exception as e:
            logger.error(f"Bot crashed (attempt #{retry_count}): {e}")
            traceback.print_exc()
        wait = min(60, 5 * retry_count)
        logger.info(f"Bot stopped. Restarting in {wait}s...")
        time.sleep(wait)
    logger.error(f"Bot failed after {max_retries} attempts, giving up")

bot_thread = threading.Thread(target=delayed_bot_start, daemon=True)
bot_thread.start()
logger.info("Bot thread scheduled (starts after 5s delay)")

start_keep_alive()
