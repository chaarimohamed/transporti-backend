#!/bin/bash

# Start ngrok and backend server together
# This script starts ngrok in the background and updates the mobile app config

echo "🔧 Starting ngrok tunnel on port 3000..."

# Start ngrok in the background and capture output
ngrok http 3000 --log=stdout > /tmp/ngrok.log &
NGROK_PID=$!

echo "⏳ Waiting for ngrok to start..."
sleep 3

# Get the ngrok public URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL. Make sure ngrok is authenticated."
    echo "Run: ngrok config add-authtoken YOUR_TOKEN"
    echo "Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo "✅ ngrok tunnel created: $NGROK_URL"
echo ""
echo "📱 Updating mobile app configuration..."

# Update the mobile app config
CONFIG_FILE="../mobile-app/config/api.config.ts"
sed -i "s|return 'http://.*:3000/api';|return '${NGROK_URL}/api';|g" "$CONFIG_FILE"
sed -i "s|return 'https://.*\\.ngrok-free\\.app/api';|return '${NGROK_URL}/api';|g" "$CONFIG_FILE"

echo "✅ Mobile app config updated!"
echo ""
echo "🚀 Your backend URL is: $NGROK_URL"
echo "📱 Mobile app will connect to: ${NGROK_URL}/api"
echo ""
echo "Now starting the backend server..."
echo ""

# Start the backend server
npm run dev
