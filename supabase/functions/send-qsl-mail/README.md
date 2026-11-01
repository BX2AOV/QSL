# send-qsl-mail

申請送出後，寄一封「已收到你的 QSL 換卡申請」確認信給申請人。

## 呼叫方式

前端在 `submit_qsl_request` 成功後呼叫：

```js
await SB.function('send-qsl-mail', { recordId: 216 })
```

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/send-qsl-mail" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"recordId":216}'
```

## 行為

1. 讀出該筆通聯的 `requests` jsonb，找「最新一筆、有 `shipEmail`、`mailSentAt` 為空、狀態 pending」的申請。
2. 只寄 **今天建立** 的申請（避免舊資料被重複觸發）。
3. 依序嘗試寄信供應商：
   - `RESEND_API_KEY` → Resend
   - `BREVO_API_KEY` → Brevo（有設定才會啟用）
   前一家失敗（額度用完、金鑰失效、5xx）就換下一家。
4. 成功後在該筆申請寫入 `mailSentAt`、`mailProvider`；失敗寫入 `mailError`（不會擋住申請結果）。

## Secrets

| 名稱 | 說明 |
| --- | --- |
| `RESEND_API_KEY` | Resend 的 Sending access API key（`re_...`） |
| `BREVO_API_KEY` | 選用。Brevo v3 API key（`xkeysib-...`） |
| `MAIL_FROM` | 寄件人，例如 `BX2AOV QSL <no-reply@bx2aov.top>` |
| `MAIL_REPLY_TO` | 選用。回覆地址，例如站長的 Gmail |

## 寄件網域

寄件網域必須在寄信服務完成驗證：

- Resend → Domains → 加 `bx2aov.top`，DNS 需有：
  - TXT `resend._domainkey`
  - CNAME `rsend` → `rsend-apne1.forge.rmta.net`（DNS only）
  - CNAME `send` → `send.forge.rmta.net`（DNS only）
  - TXT `_dmarc`（建議）
- Brevo → Senders, Domains & Dedicated IPs → 驗證同一個網域

## 注意

- Edge Function 的「Verify JWT」保持開啟，前端用 anon key 即可呼叫。
- 同一筆申請只會寄一次；要重寄就把該筆的 `mailSentAt` 清掉再呼叫。
- 目前沒有記錄每天的寄送量；要加「Resend 用完自動跳 Brevo」的每日計數，可再擴充。
