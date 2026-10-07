#!/bin/sh
# Written for Debian/Ubuntu. Other systems work if python3 ships with venv/ensurepip.
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 not found. Install it with: sudo apt install python3" >&2
    exit 1
fi

if ! python3 -c "import venv, ensurepip" >/dev/null 2>&1; then
    echo "Error: python3 venv support is missing. Install it with: sudo apt install python3-venv" >&2
    exit 1
fi

python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

[ -f .env ] || cp .env.example .env

echo "Installation complete."
echo "All settings are provided via environment variables, edit `.env` to set them"
echo "After that run: set -a && . ./.env && set +a && .venv/bin/python mqtt_bridge.py"
