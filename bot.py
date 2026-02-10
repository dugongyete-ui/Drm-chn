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

    rows = []
    if WEBAPP_URL:
        rows.append([InlineKeyboardButton(text="🎬 Open App", web_app=WebAppInfo(url=WEBAPP_URL))])
    rows.append([InlineKeyboardButton(text="👥 Official Group", url=GROUP_URL)])
    rows.append([
        InlineKeyboardButton(text="💎 TopUp", callback_data="topup"),
        InlineKeyboardButton(text="❓ Help/OSINT", callback_data="help")
    ])
    keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

    await message.answer(welcome_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)

    if ref_code and ref_code.startswith('ref_') and WEBAPP_URL:
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
    user_id = callback.from_user.id
    text = (
        "💎 <b>TopUp VIP DramaBox</b>\n\n"
        "Bayar melalui Saweria untuk aktivasi otomatis:\n"
        "🔗 <b>https://saweria.co/dugongyete</b>\n\n"
        "📋 <b>PENTING:</b> Masukkan Telegram ID kamu di kolom pesan/message saat donasi.\n"
        f"Telegram ID kamu: <code>{user_id}</code>\n\n"
        "💰 <b>Daftar Harga:</b>\n"
        "├ Rp 5.000+ → 3 Hari VIP\n"
        "├ Rp 10.000+ → 2 Minggu VIP\n"
        "├ Rp 35.000+ → 1 Bulan VIP\n"
        "└ Rp 250.000+ → 1 Tahun VIP\n\n"
        "⚡ Langganan akan aktif otomatis setelah pembayaran dikonfirmasi."
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
