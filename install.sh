#!/bin/bash
echo "========================================="
echo "  DramaBox - Auto Install Dependencies"
echo "========================================="
echo ""

PYTHON_CMD=""
for cmd in python3 python python3.11 python3.12; do
    if command -v "$cmd" &> /dev/null; then
        PYTHON_CMD="$cmd"
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    NIX_PYTHON=$(find /nix/store -maxdepth 2 -name "python3" -type f 2>/dev/null | head -1)
    if [ -n "$NIX_PYTHON" ]; then
        PYTHON_CMD="$NIX_PYTHON"
    fi
fi

if [ -z "$PYTHON_CMD" ]; then
    echo "[ERROR] Python not found."
    echo "[INFO] Jika di Replit, Python sudah terinstall otomatis."
    echo "[INFO] Coba jalankan: python3 --version"
    echo "[INFO] Atau install Python melalui menu Tools > Packages"
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
echo "[INFO] Using $PYTHON_VERSION"

if command -v uv &> /dev/null; then
    echo "[1/3] Installing Python dependencies with uv..."
    uv add aiogram aiohttp flask psycopg2-binary gunicorn requests
elif command -v pip3 &> /dev/null; then
    echo "[1/3] Installing Python dependencies with pip3..."
    pip3 install aiogram aiohttp flask psycopg2-binary gunicorn requests
elif command -v pip &> /dev/null; then
    echo "[1/3] Installing Python dependencies with pip..."
    pip install aiogram aiohttp flask psycopg2-binary gunicorn requests
else
    echo "[ERROR] No package manager found (uv, pip3, or pip)."
    echo "[INFO] Di Replit, gunakan 'uv add <package>' untuk install."
    exit 1
fi
echo ""

echo "[2/3] Verifying installations..."
$PYTHON_CMD -c "
packages = {
    'aiogram': 'aiogram',
    'aiohttp': 'aiohttp',
    'flask': 'flask',
    'psycopg2': 'psycopg2',
    'gunicorn': 'gunicorn',
    'requests': 'requests'
}
all_ok = True
for name, module in packages.items():
    try:
        __import__(module)
        print(f'  [OK] {name}')
    except ImportError:
        print(f'  [FAIL] {name}')
        all_ok = False

if all_ok:
    print()
    print('All dependencies installed successfully!')
else:
    print()
    print('Some dependencies failed to install. Please check errors above.')
"
echo ""

echo "[3/3] Checking environment variables..."
missing=0
if [ -z "$DATABASE_URL" ]; then
    echo "  [WARN] DATABASE_URL not set - Database features won't work"
    missing=1
fi
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "  [WARN] TELEGRAM_BOT_TOKEN not set - Bot won't start"
    missing=1
fi
if [ -z "$SAWERIA_STREAM_KEY" ]; then
    echo "  [WARN] SAWERIA_STREAM_KEY not set - Saweria webhook verification disabled"
    missing=1
fi
if [ $missing -eq 0 ]; then
    echo "  [OK] All required environment variables are set"
fi

echo ""
echo "========================================="
echo "  Installation Complete!"
echo "========================================="
echo ""
echo "To run the app:  python app.py"
echo ""
