#!/bin/bash
# First login as carrier to get token
echo "Logging in as carrier..."
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carrier@test.com","password":"password123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token. Trying ahmed@test.com..."
  TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ahmed@test.com","password":"123456"}' \
    | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

echo "Token: $TOKEN"
echo ""
echo "Fetching carrier stats..."
curl -X GET http://localhost:3000/api/shipments/carrier-stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
echo ""
