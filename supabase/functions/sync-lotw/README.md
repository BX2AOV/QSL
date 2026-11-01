# sync-lotw（Edge Function slug：`swift-task`）

後台「🔄 從 LoTW 自動同步確認狀態」按鈕呼叫的函式。

## 用途

1. 用 `LOTW_USER` / `LOTW_PASS` 以 **POST 表單** 向
   `https://lotw.arrl.org/lotwuser/lotwreport.adi` 取得已確認 QSL 的 ADIF。
   （用 GET 把帳密放在 query string 只會回登入頁，解析不到任何紀錄。）
2. 解析 `<CALL>` / `<QSO_DATE>` / `<TIME_ON>` / `<BAND>` / `<QSL_RCVD>`，
   只有 `QSL_RCVD: Y`（或 `LOTW_QSL_RCVD: Y`）才算 LoTW 已確認。
3. 用「呼號＋日期」比對 `qsl_records`，同一天多筆時挑時間最接近的；
   同時間多筆時優先挑頻段相同的。
4. 把對到的紀錄標記 `"lotwConfirmed" = true`，`"lotwDate"` 寫入 LoTW 的確認日期
   （`QSLRDATE`，沒有就用同步當天）。
   **不會更動 `status`**：LoTW 確認只代表通聯已被 LoTW 確認，不代表已交換卡片。
5. 以前標過、但這次 LoTW 沒有的紀錄會自動取消標記（`lotwConfirmed = false`），
   讓網站結果跟 LoTW 保持一致。
6. LoTW 有確認、網站卻完全沒有的通聯，若是**最近 30 天**的會自動補進
   `qsl_records`（`status = none`、`lotwConfirmed = true`），避免「今天通的沒同步」。
   超過 30 天的只會在回報訊息裡列出，不會自動新增（避免使用者刪掉的舊資料一直被加回來）。

## 效能

- 一次讀出全部紀錄在記憶體比對。
- 更新改成批次（每批 200 筆）＋ 有限併發（同時 8 組），不再逐筆 UPDATE。
- 實測 194 筆確認、201 筆資料：約 6～8 秒（大部分時間花在等 LoTW 回應）。

## 安全性

- 只允許**已登入的使用者**呼叫：用 `admin.auth.getUser(token)` 驗證 JWT，
  anon key 一律回 401。前端用 `supabase.functions.invoke()` 會自動帶上 session token。
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 繞過 RLS 寫入，金鑰只存在 Edge Function Secrets。

## 除錯

POST body 帶 `{ "debugCall": "BD4JN" }` 時，只回傳該呼號在 LoTW 的原始解析結果
（含 `qslRcvd`、`rxQsl`、`qslDate`），**不會寫入資料庫**。

```bash
curl -X POST "$SUPABASE_URL/functions/v1/swift-task" \
  -H "Authorization: Bearer <管理員 JWT>" \
  -H "Content-Type: application/json" \
  -d '{"debugCall":"BD4JN"}'
```

## Secrets

| 名稱 | 說明 |
| --- | --- |
| `LOTW_USER` | LoTW 帳號 |
| `LOTW_PASS` | LoTW 密碼（不是 ARRL 網站密碼） |
| `LOTW_SINCE` | 選用。起始日期 `YYYY-MM-DD`。實際會取「這個日期」與「資料庫最早日期」兩者較早的，確保抓完整歷史 |

`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自動提供。

## 注意

- 一定要帶 `qso_qslsince`。不帶的話 LoTW 只回「上次下載之後」的新確認，
  會出現「只同步到幾筆」的假象。
- 只更新 `lotwConfirmed` / `lotwDate`，`status` 完全不動，也不會覆寫你手動標的狀態。
- 部署：`npx supabase functions deploy sync-lotw`（slug 會沿用 `swift-task`）。
