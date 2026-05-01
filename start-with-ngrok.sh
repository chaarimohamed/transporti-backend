#!/usr/bin/env bash

# Start backend + ngrok and write EXPO_PUBLIC_API_URL for mobile.
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/transporti-backend"
MOBILE_ENV="$ROOT_DIR/transporti-mobile/.env"
NGROK_API_HOST="localhost"
NGROK_API_PORT="4041"
NGROK_BASE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/ngrok/ngrok.yml"
NGROK_OVERRIDE_CONFIG="$(mktemp)"

cleanup() {
    if [ -n "$NGROK_PID" ]; then
        kill "$NGROK_PID" 2>/dev/null || true
    fi
    rm -f "$NGROK_OVERRIDE_CONFIG"
}
trap cleanup EXIT INT TERM

echo "🔧 Starting backend API on port 3000..."
EXISTING_BACKEND_PID=$(ss -ltnp 2>/dev/null | sed -n 's/.*:3000 .*pid=\([0-9]\+\).*/\1/p' | head -1)
if [ -n "$EXISTING_BACKEND_PID" ]; then
    echo "ℹ️ Backend already running on port 3000 (pid ${EXISTING_BACKEND_PID}), reusing it."
    BACKEND_PID=""
else
    (
        cd "$BACKEND_DIR"
        npm run dev
    ) &
    BACKEND_PID=$!
fi

echo "⏳ Waiting for backend to boot..."
sleep 3

echo "🌐 Starting ngrok tunnel for backend..."
cat > "$NGROK_OVERRIDE_CONFIG" <<EOF
version: "3"
agent:
    web_addr: ${NGROK_API_HOST}:${NGROK_API_PORT}
EOF

if command -v ngrok >/dev/null 2>&1; then
    if [ -f "$NGROK_BASE_CONFIG" ]; then
        ngrok http --config "$NGROK_BASE_CONFIG" --config "$NGROK_OVERRIDE_CONFIG" localhost:3000 --log=stdout > /tmp/transporti-ngrok.log 2>&1 &
    else
        ngrok http --config "$NGROK_OVERRIDE_CONFIG" localhost:3000 --log=stdout > /tmp/transporti-ngrok.log 2>&1 &
    fi
else
    echo "❌ ngrok is not installed. Install it and run: ngrok config add-authtoken YOUR_TOKEN"
    exit 1
fi
NGROK_PID=$!

echo "⏳ Waiting for ngrok URL..."
attempt=0
NGROK_URL=""
while [ $attempt -lt 20 ]; do
    NGROK_URL=$(curl -s "http://${NGROK_API_HOST}:${NGROK_API_PORT}/api/tunnels" | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1 || true)
    if [ -n "$NGROK_URL" ]; then
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL."
    echo "Check ngrok auth: ngrok config add-authtoken YOUR_TOKEN"
    echo "ngrok logs: /tmp/transporti-ngrok.log"
    exit 1
fi

PUBLIC_API_URL="${NGROK_URL}/api"
echo "$PUBLIC_API_URL" > "$ROOT_DIR/.backend-public-url"

if [ -f "$MOBILE_ENV" ]; then
    if sed --version >/dev/null 2>&1; then
        sed -i "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${PUBLIC_API_URL}|" "$MOBILE_ENV"
    else
        sed -i '' "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${PUBLIC_API_URL}|" "$MOBILE_ENV"
    fi
fi

echo "✅ Backend public URL: $NGROK_URL"
echo "✅ Mobile API URL set to: $PUBLIC_API_URL"
echo ""
echo "Now run in another terminal:"
echo "  npm run start:mobile:tunnel"
echo ""

if [ -n "$BACKEND_PID" ]; then
    wait "$BACKEND_PID"
else
    # Keep script alive while ngrok runs when backend is reused.
    wait "$NGROK_PID"
fi
