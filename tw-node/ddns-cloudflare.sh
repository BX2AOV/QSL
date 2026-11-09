#!/data/data/com.termux/files/usr/bin/bash
# Cloudflare DDNS：把 tw.bx2aov.top 的 A 記錄更新成目前公共 IP
# 用法： export CF_TOKEN="..." ; bash ddns-cloudflare.sh
set -euo pipefail

CF_TOKEN="${CF_TOKEN:?請先 export CF_TOKEN（Cloudflare API Token，需 Zone.DNS Edit）}"
ZONE_NAME="bx2aov.top"
RECORD_NAME="tw.bx2aov.top"
API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer ${CF_TOKEN}"

IP="$(curl -fsS https://api.ipify.org)"
ZONE_ID="$(curl -fsS -H "$AUTH" "$API/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')"

if [ -z "$ZONE_ID" ]; then
  echo "找不到 zone：${ZONE_NAME}（檢查 token 權限）" >&2
  exit 1
fi

REC="$(curl -fsS -H "$AUTH" "$API/zones/${ZONE_ID}/dns_records?name=${RECORD_NAME}&type=A")"
REC_ID="$(echo "$REC" | jq -r '.result[0].id // empty')"
OLD_IP="$(echo "$REC" | jq -r '.result[0].content // empty')"

if [ -z "$REC_ID" ]; then
  curl -fsS -X POST "$API/zones/${ZONE_ID}/dns_records" \
    -H "$AUTH" -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${RECORD_NAME}\",\"content\":\"${IP}\",\"proxied\":false,\"ttl\":120}" > /dev/null
  echo "$(date '+%F %T') created ${RECORD_NAME} -> ${IP}"
elif [ "$OLD_IP" != "$IP" ]; then
  curl -fsS -X PATCH "$API/zones/${ZONE_ID}/dns_records/${REC_ID}" \
    -H "$AUTH" -H "Content-Type: application/json" \
    --data "{\"content\":\"${IP}\",\"proxied\":false}" > /dev/null
  echo "$(date '+%F %T') updated ${RECORD_NAME}: ${OLD_IP} -> ${IP}"
else
  echo "$(date '+%F %T') unchanged ${IP}"
fi
