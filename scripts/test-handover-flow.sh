#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
PASSWORD="Password!123"
RESPONSE_STATUS=""
RESPONSE_BODY=""

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

json_query() {
  local expression="$1"

  node -e '
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(input);
  const result = Function("payload", `return (${process.argv[1]});`)(payload);
  if (result === undefined) {
    process.exit(2);
  }
  process.stdout.write(typeof result === "object" ? JSON.stringify(result) : String(result));
});
' "$expression"
}

request() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local raw
  local curl_args=(
    -sS
    -X "$method"
    "${BASE_URL}${path}"
    -H "Content-Type: application/json"
  )

  if [[ -n "$token" ]]; then
    curl_args+=( -H "Authorization: Bearer ${token}" )
  fi

  if [[ -n "$body" ]]; then
    curl_args+=( -d "$body" )
  fi

  if ! raw=$(curl "${curl_args[@]}" -w $'\n%{http_code}'); then
    fail "Request failed: ${method} ${path}"
  fi

  RESPONSE_STATUS="${raw##*$'\n'}"
  RESPONSE_BODY="${raw%$'\n'*}"
}

assert_status() {
  local expected="$1"
  local context="$2"

  if [[ "$RESPONSE_STATUS" != "$expected" ]]; then
    echo "$RESPONSE_BODY" >&2
    fail "${context}: expected HTTP ${expected}, got ${RESPONSE_STATUS}"
  fi
}

assert_json_equals() {
  local body="$1"
  local expression="$2"
  local expected="$3"
  local context="$4"
  local actual

  if ! actual=$(printf '%s' "$body" | json_query "$expression"); then
    echo "$body" >&2
    fail "${context}: failed to evaluate JSON expression ${expression}"
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "$body" >&2
    fail "${context}: expected ${expected}, got ${actual}"
  fi
}

assert_json_true() {
  local body="$1"
  local expression="$2"
  local context="$3"

  assert_json_equals "$body" "$expression" "true" "$context"
}

register_user() {
  local role="$1"
  local email="$2"
  local first_name="$3"
  local last_name="$4"
  local phone="$5"
  local extra_fields="${6:-}"
  local payload

  payload=$(cat <<EOF
{"email":"${email}","password":"${PASSWORD}","firstName":"${first_name}","lastName":"${last_name}","phone":"${phone}","role":"${role}"${extra_fields}}
EOF
)

  request POST "/auth/register" "" "$payload"
  assert_status "201" "register ${email}"
  assert_json_true "$RESPONSE_BODY" 'payload.success === true' "register ${email} success"

  local user_id
  local token
  user_id=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data.user.id')
  token=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data.token')

  echo "${user_id}|${token}"
}

suffix="$(date +%s)"
sender_email="handover.sender.${suffix}@transporti.test"
carrier_email="handover.carrier.${suffix}@transporti.test"

echo "1. Registering sender and carrier"
IFS='|' read -r sender_id sender_token <<< "$(register_user sender "$sender_email" "Sender" "Handover" "23123456")"
IFS='|' read -r carrier_id carrier_token <<< "$(register_user carrier "$carrier_email" "Carrier" "Handover" "24123456" ',"gouvernerat":"Tunis","vehicleType":"VAN"')"

echo "2. Creating a shipment as sender"
request POST "/shipments" "$sender_token" '{"from":"Tunis","to":"Sousse","itemName":"Colis handover test","cargo":"Colis fragile","pickupCity":"Tunis","deliveryCity":"Sousse"}'
assert_status "201" "create shipment"
shipment_id=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data.id')

echo "3. Having the carrier apply to the shipment"
request POST "/shipments/${shipment_id}/request" "$carrier_token" '{"proposedPrice":120}'
assert_status "200" "carrier request shipment"

echo "4. Accepting the carrier application as sender"
request GET "/shipments/${shipment_id}/applications" "$sender_token"
assert_status "200" "fetch shipment applications"
application_id=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data[0].id')

request POST "/shipments/${shipment_id}/accept-carrier" "$sender_token" "{\"applicationId\":\"${application_id}\"}"
assert_status "200" "accept carrier application"
assert_json_equals "$RESPONSE_BODY" 'payload.data.status' 'CONFIRMED' 'shipment status after accepting carrier'

echo "5. Having the carrier request pickup handover"
request PUT "/missions/${shipment_id}/status" "$carrier_token" '{"status":"IN_TRANSIT"}'
assert_status "200" "carrier request handover"
assert_json_equals "$RESPONSE_BODY" 'payload.mission.status' 'HANDOVER_PENDING' 'mission status after carrier handover request'

request GET "/shipments/${shipment_id}" "$sender_token"
assert_status "200" "fetch shipment after handover request"
assert_json_equals "$RESPONSE_BODY" 'payload.data.status' 'HANDOVER_PENDING' 'shipment status after handover request'

request GET "/notifications" "$sender_token"
assert_status "200" "fetch sender notifications after handover request"
assert_json_true "$RESPONSE_BODY" "payload.data.some((notification) => notification.type === 'HANDOVER_REQUESTED' && notification.shipmentId === '${shipment_id}')" 'sender handover notification exists'

echo "6. Confirming handover as sender"
request POST "/shipments/${shipment_id}/confirm-handover" "$sender_token"
assert_status "200" "confirm handover"
assert_json_true "$RESPONSE_BODY" 'payload.success === true' 'confirm handover success'
assert_json_equals "$RESPONSE_BODY" 'payload.data.status' 'IN_TRANSIT' 'shipment status after handover confirmation'
delivery_code=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data.deliveryCode')

if [[ ${#delivery_code} -ne 6 ]]; then
  echo "$RESPONSE_BODY" >&2
  fail "delivery code should be 6 digits, got ${delivery_code}"
fi

echo "7. Verifying carrier and sender notifications after handover confirmation"
request GET "/notifications" "$carrier_token"
assert_status "200" "fetch carrier notifications after handover confirmation"
assert_json_true "$RESPONSE_BODY" "payload.data.some((notification) => notification.type === 'HANDOVER_CONFIRMED' && notification.shipmentId === '${shipment_id}' && notification.data.deliveryCode === '${delivery_code}')" 'carrier handover confirmation notification exists'

request GET "/notifications" "$sender_token"
assert_status "200" "fetch sender notifications after handover confirmation"
assert_json_true "$RESPONSE_BODY" "payload.data.some((notification) => notification.type === 'SHIPMENT_IN_TRANSIT' && notification.shipmentId === '${shipment_id}' && notification.data.deliveryCode === '${delivery_code}')" 'sender in-transit notification with delivery code exists'

echo "PASS: sender receives handover request and can confirm shipment transition to IN_TRANSIT"