import os
import threading
import logging
import time
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app import app, init_db, _start_bot_with_retry

init_db()
logger.info("Database initialized for production")

bot_thread = threading.Thread(target=_start_bot_with_retry, args=(10,), daemon=True)
bot_thread.start()
logger.info("Bot thread scheduled (starts after 10s delay)")
