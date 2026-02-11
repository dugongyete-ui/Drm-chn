import os
import threading
import logging
import time
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app import app, init_db, _start_bot_with_retry
from keep_alive import start_keep_alive

init_db()

bot_thread = threading.Thread(target=_start_bot_with_retry, args=(5,), daemon=True)
bot_thread.start()
logger.info("Bot thread scheduled (starts after 5s delay)")

start_keep_alive()
