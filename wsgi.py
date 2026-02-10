import os
import threading
import logging

logger = logging.getLogger(__name__)

from app import app, init_db, run_bot

init_db()

bot_thread = threading.Thread(target=run_bot, daemon=True)
bot_thread.start()
logger.info("Bot thread started via gunicorn")
