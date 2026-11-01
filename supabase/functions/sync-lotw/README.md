# sync-lotw（Edge Function slug：`swift-task`）

後台「🔄 從 LoTW 自動同步已確認卡片」按鈕呼叫的函式。

## 用途

1. 用 `LOTW_USER` / `LOTW_PASS` 以 **POST 表單** 向
   `https://lotw.arrl.org/lotwuser/lotwreport.adi` 取得已確認 QSL 的 ADIF。
   （用 GET 把帳密放在 query string 只會回登入頁，解析不到任何紀錄。）
2. 解析 `<CALL>` / `<QSO_DATE>` / `<TIME_ON>` / `<BAND>`，只留 `QSL_RCVD: Y`。
3. 用「呼號＋日期」比對 `qsl_records`，同一天多筆時挑時間最接近的；
   同時間多筆時優先挑頻段相同的。
4. 把對到的紀錄改成 `status = 'completed'` 並寫入 `completedDate`。

## 安全性

- 只允許**已登入的使用者**呼叫：用 `admin.auth.getUser(token)` 驗證 JWT，
  anon key 一律回 401。前端用 `supabase.functions.invoke()` 會自動帶上 session token。
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 繞過 RLS 寫入，金鑰只存在 Edge Function Secrets。

## Secrets

| 名稱 | 說明 |
| --- | --- |
| `LOTW_USER` | LoTW 帳號 |
| `LOTW_PASS` | LoTW 密碼（不是 ARRL 網站密碼） |
| `LOTW_SINCE` | 選用。起始日期 `YYYY-MM-DD`；未設定時自動用資料庫最早的一筆日期 |

`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自動提供。

## 注意

- 一定要帶 `qso_qslsince`。不帶的話 LoTW 只回「上次下載之後」的新確認，
  會出現「只同步到幾筆」的假象。
- 已是 `completed` 或使用者標為 `not_needed` 的紀錄不會被覆寫。
- 部署：`npx supabase functions deploy sync-lotw`（slug 會沿用 `swift-task`）。
