import os
import time
import threading
import requests
import logging

logger = logging.getLogger(__name__)

PING_INTERVAL = 240

def ping_self():
    webapp_url = os.environ.get('WEBAPP_URL', '')
    if not webapp_url:
        logger.warning("WEBAPP_URL not set, keep-alive disabled")
        return

    url = f"{webapp_url}/health"
    logger.info(f"Keep-alive started: pinging {url} every {PING_INTERVAL}s")

    while True:
        try:
            resp = requests.get(url, timeout=30)
            logger.debug(f"Keep-alive ping: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Keep-alive ping failed: {e}")
        time.sleep(PING_INTERVAL)

def start_keep_alive():
    t = threading.Thread(target=ping_self, daemon=True)
    t.start()
    logger.info("Keep-alive thread started")
