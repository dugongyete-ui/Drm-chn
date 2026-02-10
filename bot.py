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
GROUP_URL = os.environ.get('GROUP_URL', 'https://t.me/dramaboxchannel')

if not BOT_TOKEN:
    logger.warning("TELEGRAM_BOT_TOKEN not set. Bot will not start.")

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()

@dp.message(CommandStart())
async def start_handler(message: types.Message):
    args = message.text.split()
    ref_code = args[1] if len(args) > 1 else None

    welcome_text = (
        "🎬 <b>Welcome to DramaBox!</b>\n\n"
        "Nikmati ribuan drama China, Korea & Asia lainnya "
        "langsung dari Telegram!\n\n"
        "📺 Tap <b>Open App</b> untuk mulai menonton.\n"
        "💎 Dapatkan poin dengan mengundang teman!"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🎬 Open App",
            web_app=WebAppInfo(url=WEBAPP_URL) if WEBAPP_URL else None
        )] if WEBAPP_URL else [],
        [InlineKeyboardButton(text="👥 Official Group", url=GROUP_URL)],
        [
            InlineKeyboardButton(text="💎 TopUp", callback_data="topup"),
            InlineKeyboardButton(text="❓ Help/OSINT", callback_data="help")
        ]
    ])

    if WEBAPP_URL:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎬 Open App", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton(text="👥 Official Group", url=GROUP_URL)],
            [
                InlineKeyboardButton(text="💎 TopUp", callback_data="topup"),
                InlineKeyboardButton(text="❓ Help/OSINT", callback_data="help")
            ]
        ])
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="👥 Official Group", url=GROUP_URL)],
            [
                InlineKeyboardButton(text="💎 TopUp", callback_data="topup"),
                InlineKeyboardButton(text="❓ Help/OSINT", callback_data="help")
            ]
        ])

    await message.answer(welcome_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)

    if ref_code and ref_code.startswith('ref_'):
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                await session.post(f"{WEBAPP_URL}/api/referral", json={
                    "telegram_id": message.from_user.id,
                    "ref_code": ref_code
                })
        except Exception as e:
            logger.error(f"Referral error: {e}")

@dp.callback_query(lambda c: c.data == "topup")
async def topup_callback(callback: types.CallbackQuery):
    text = (
        "💎 <b>TopUp Points</b>\n\n"
        "🔹 <b>Lifetime VIP</b> - Akses semua drama selamanya\n"
        "🔹 <b>1 Year VIP</b> - Akses selama 1 tahun\n\n"
        "Buka aplikasi untuk melihat detail harga dan upgrade membership."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)
    await callback.answer()

@dp.callback_query(lambda c: c.data == "help")
async def help_callback(callback: types.CallbackQuery):
    text = (
        "❓ <b>Help Center</b>\n\n"
        "Jika kamu mengalami masalah, silakan buka aplikasi "
        "dan gunakan fitur <b>Help Center</b> di halaman Profile.\n\n"
        "Atau hubungi admin di grup official kami."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)
    await callback.answer()

async def main():
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set. Cannot start bot.")
        return
    logger.info("Starting bot...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
