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
sender_email="sender.${suffix}@transporti.test"
carrier_a_email="carrier.a.${suffix}@transporti.test"
carrier_b_email="carrier.b.${suffix}@transporti.test"

echo "1. Registering fresh sender and carrier accounts"
IFS='|' read -r sender_id sender_token <<< "$(register_user sender "$sender_email" "Sender" "Flow" "20123456")"
IFS='|' read -r carrier_a_id carrier_a_token <<< "$(register_user carrier "$carrier_a_email" "Carrier" "Invite" "21123456" ',"gouvernerat":"Tunis","vehicleType":"VAN"')"
IFS='|' read -r carrier_b_id carrier_b_token <<< "$(register_user carrier "$carrier_b_email" "Carrier" "Request" "22123456" ',"gouvernerat":"Sfax","vehicleType":"VAN"')"

echo "2. Creating a shipment as sender"
request POST "/shipments" "$sender_token" '{"from":"Tunis","to":"Sousse","itemName":"Palette test","cargo":"Marchandise","pickupCity":"Tunis","deliveryCity":"Sousse"}'
assert_status "201" "create shipment"
shipment_id=$(printf '%s' "$RESPONSE_BODY" | json_query 'payload.data.id')

echo "3. Inviting carrier A"
request POST "/shipments/${shipment_id}/invite-carrier" "$sender_token" "{\"carrierId\":\"${carrier_a_id}\"}"
assert_status "200" "invite carrier A"

echo "4. Having carrier B apply so the shipment becomes REQUESTED"
request POST "/shipments/${shipment_id}/request" "$carrier_b_token" '{"proposedPrice":175}'
assert_status "200" "carrier B request shipment"

request GET "/shipments/${shipment_id}" "$sender_token"
assert_status "200" "fetch shipment after request"
assert_json_equals "$RESPONSE_BODY" 'payload.data.status' 'REQUESTED' 'shipment status after carrier B request'

echo "5. Accepting the invitation as carrier A while shipment is REQUESTED"
request POST "/shipments/${shipment_id}/accept-invitation" "$carrier_a_token" '{"proposedPrice":190}'
assert_status "200" "carrier A accept invitation"

echo "6. Verifying final shipment state and notifications"
request GET "/shipments/${shipment_id}" "$sender_token"
assert_status "200" "fetch final shipment"
assert_json_equals "$RESPONSE_BODY" 'payload.data.status' 'CONFIRMED' 'final shipment status'
assert_json_equals "$RESPONSE_BODY" 'payload.data.carrierId' "$carrier_a_id" 'final confirmed carrier'
assert_json_equals "$RESPONSE_BODY" 'String(payload.data.price)' '190' 'final accepted invitation price'
assert_json_equals "$RESPONSE_BODY" 'String(payload.data.requestedCarrierId === null)' 'true' 'requestedCarrierId cleared'

request GET "/shipments/${shipment_id}/applications" "$sender_token"
assert_status "200" "fetch applications after acceptance"
assert_json_equals "$RESPONSE_BODY" "payload.data.find((app) => app.carrierId === '${carrier_b_id}').status" 'REJECTED' 'carrier B application rejected'

request GET "/notifications" "$carrier_b_token"
assert_status "200" "fetch carrier B notifications"
assert_json_true "$RESPONSE_BODY" "payload.data.some((notification) => notification.type === 'REQUEST_REJECTED' && notification.shipmentId === '${shipment_id}')" 'carrier B rejection notification exists'

request GET "/notifications" "$carrier_a_token"
assert_status "200" "fetch carrier A notifications"
assert_json_equals "$RESPONSE_BODY" "String(payload.data.some((notification) => notification.type === 'SHIPMENT_INVITATION' && notification.shipmentId === '${shipment_id}'))" 'false' 'stale invitation notification removed for carrier A'

echo "PASS: invited carrier can accept after another carrier moves the shipment to REQUESTED"