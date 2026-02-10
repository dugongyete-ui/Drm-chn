import os
import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.enums import ParseMode

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
WEBAPP_URL = os.environ.get('WEBAPP_URL', '')

if not BOT_TOKEN:
    logger.warning("TELEGRAM_BOT_TOKEN not set. Bot will not start.")

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()

@dp.message(CommandStart())
async def start_handler(message: types.Message):
    args = message.text.split()
    ref_code = args[1] if len(args) > 1 else None

    user = message.from_user
    avatar_url = ''
    try:
        if bot:
            photos = await bot.get_user_profile_photos(user.id, limit=1)
            if photos.total_count > 0:
                file_info = await bot.get_file(photos.photos[0][-1].file_id)
                avatar_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info.file_path}"
    except Exception as e:
        logger.error(f"Failed to get profile photo: {e}")

    if WEBAPP_URL:
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                await session.post(f"{WEBAPP_URL}/api/user", json={
                    "telegram_id": user.id,
                    "username": user.username or '',
                    "first_name": user.first_name or '',
                    "last_name": user.last_name or '',
                    "avatar_url": avatar_url
                })
        except Exception as e:
            logger.error(f"User register error: {e}")

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
    keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

    await message.answer(welcome_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)

    if ref_code and ref_code.startswith('ref_') and WEBAPP_URL:
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                await session.post(f"{WEBAPP_URL}/api/referral", json={
                    "telegram_id": user.id,
                    "ref_code": ref_code
                })
        except Exception as e:
            logger.error(f"Referral error: {e}")

async def main():
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set. Cannot start bot.")
        return
    logger.info("Starting bot...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
