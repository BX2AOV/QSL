# BX2AOV QSL confirm

> 把 QSL 換卡從「紙本黑箱」變成一個公開可查的狀態頁。
> A zero-server QSL card exchange site for amateur radio — public log with QSL status, online card requests, and an admin panel for mailing and archiving cards.

| | |
|---|---|
| **線上版本** | <https://bx2aov.top>（備用：<https://qsl-web.pages.dev>） |
| **狀態** | 尚未以開源專案形式發布（repo 目前公開，僅供部署與檢視）；本文件是開源介紹稿 |
| **技術形態** | 純靜態前端 + Supabase（Postgres / PostgREST / Auth / Storage） |
| **部署** | Cloudflare Pages，`git push` 即上線，無建置步驟 |
| **規模** | 199 筆通聯 / 185 個呼號 / 41 筆已發出卡片圖 |

---

## 一句話

這是一個**不需要伺服器**的 QSL 換卡管理網站：對方用呼號就能查到自己的通聯與卡片狀態、線上申請換卡；站方在同一個後台審核、寄卡、上傳卡片照片。

## 它解決什麼問題

QSL 卡是業餘無線電的紙本通聯憑證。傳統流程是：

> 對方寄卡＋回郵信封 → 站方手寫回卡 → 寄出 → 雙方各自記錄

整段過程離線進行，**申請人無法得知自己的卡片到底收到了沒、回了沒**；站方則要靠 Excel 或紙本對帳。

| | 傳統做法 | 這個網站 |
|---|---|---|
| 查自己的通聯 | 等對方回信 | 呼號即時查詢 |
| 申請換卡 | 寄紙本＋回郵信封 | 線上勾選送出，免註冊 |
| 知道進度 | 無法得知 | 狀態膠囊：待處理／已核准／已拒絕 |
| 站方對帳 | Excel、紙本 | 單一後台，含卡片圖與寄送狀態 |
| 卡片圖保存 | 抽屜裡的紙本 | 上傳後自動壓縮＋縮圖 |

## 給誰用

- **個人電台 / 小型 DX 台**：想讓對方自己查 QSL 狀態，但不想租 VPS、不想管資料庫
- **剛開始發 QSL 卡的人**：需要一個「申請 → 審核 → 寄出 → 存檔」的流程，而不是一堆散落的信件
- **想改成自己站的人**（開源後）：把呼號、Supabase 專案、站名換掉就能用

不適合：需要完整日誌功能（競賽、獎狀追蹤、多操作員權限）的團隊——那應該用 Cloudlog / Wavelog。

## 功能

### 公開端

| 功能 | 說明 |
|---|---|
| 通聯紀錄總覽 | 日期、UTC 時間、呼號、頻段、模式、QSL 狀態、備註 |
| 呼號搜尋 | 即時過濾、部分比對（輸入 `AOV` 會列出所有含 AOV 的呼號） |
| QSL 卡瀏覽 | 縮圖點擊放大；鍵盤可操作（Tab 聚焦、Enter 開啟、Esc 關閉、焦點鎖定） |
| 換卡申請 | 勾選通聯 → 填收件資訊 → 送出，**免註冊、免密碼** |
| 申請進度 | 「我的申請紀錄」只顯示狀態，不顯示收件人欄位 |
| 多語介面 | 繁中／简中／English／日本語 |
| 深色模式 | 跟隨系統 → 淺色 → 深色，三段切換 |

### 管理端（需登入）

| 功能 | 說明 |
|---|---|
| 通聯管理 | 新增、刪除、修改狀態、上傳收到／發出的卡片照片 |
| ADIF 匯入 | 一次匯入整份日誌；以「呼號＋日期＋時間＋頻率」去重 |
| LoTW 同步 | 從 Logbook of The World 抓取已確認的通聯 |
| 申請審核 | 檢視姓名／電話／地址，核准、拒絕或刪除 |
| 容量監控 | 資料庫文字量與圖片空間使用率 |
| 列印 | 一鍵列印收件資訊（自動隱藏導覽列、按鈕、上傳區） |

## 技術架構

```
瀏覽器
  │
  ├── Cloudflare Pages ── 純靜態，無建置
  │     ├── index.html    公開通聯紀錄
  │     ├── apply.html    查詢與換卡申請
  │     ├── manage.html   管理後台
  │     └── 404.html
  │
  └── Supabase
        ├── PostgREST   資料表 / 公開檢視 / RPC
        ├── Auth        Email + 密碼（僅管理員有帳號）
        └── Storage     公開讀取的 qsl-images bucket
```

**公開頁不載入 supabase-js。** 只有 1.5 KB 的 `js/api.js`（兩個函式：`select`、`rpc`），把 213 KB 的完整客戶端留給真正需要的管理後台。

## 申請流程

```
申請人                          Supabase                     站方
  │                               │                          │
  ├─ 輸入呼號查詢 ───────────────▶│ qsl_public（唯讀檢視）    │
  │◀── 自己的通聯與 QSL 狀態 ──────┤                          │
  │                               │                          │
  ├─ 勾選通聯、填收件資訊 ────────▶│ submit_qsl_request()     │
  │                               │  ├ 驗證呼號與紀錄相符     │
  │                               │  ├ 同筆通聯僅能申請一次   │
  │                               │  ├ 同呼號每日上限 20 筆   │
  │                               │  └ 寫入 requests (JSONB)  │
  │                               │                          │
  │                               │◀── 後台看到申請 ─────────┤
  │                               │                          ├─ 核准／拒絕
  │                               │                          ├─ 寄出紙卡
  │                               │                          └─ 上傳卡片照片
  │                               │                          │
  ├─ 重新整理 ───────────────────▶│ 狀態變為「已發出紙卡」    │
  │◀──────────────────────────────┤                          │
```

## 刻意的設計取捨

| 決策 | 理由 | 代價 |
|---|---|---|
| **靜態前端 + Supabase** | 沒有伺服器要顧、沒有憑證要更新，免費額度足夠個人站用很久 | 綁定 Supabase；要換後端得改 RPC 與 REST 呼叫 |
| **公開資料只走 View** | `qsl_public` 只露出 11 個非敏感欄位，`qsl_records` 對匿名角色完全封鎖 | 每加一個公開欄位都要改 view |
| **申請放在 `requests` JSONB** | 一筆通聯可能有多筆申請，查詢永遠是「某呼號的全部申請」 | 不能用 SQL 直接對收件地址建索引 |
| **免登入申請** | 要求對方註冊會勸退多數使用者；改用人工核准把關 | 無法完全排除冒用，靠人工核准與頻率限制降低風險 |
| **移除密碼解鎖** | 原本讓申請人自訂 4 碼 PIN 查詳情，幾分鐘就能暴力破解 | 非管理員一律看不到收件資訊 |
| **上傳時就壓縮＋產縮圖** | 表格縮圖只顯示 40×28，沒有理由下載 700 KB 原圖 | 舊圖需要補產生縮圖 |
| **沒有建置流程** | 改一行推上去就生效 | 沒有 bundler，檔案必須自己保持在可讀大小 |

## 安全性與隱私

| 層 | 做法 |
|---|---|
| 資料表 | `qsl_records` 開 RLS，匿名角色零權限（實測回 `42501`） |
| 公開資料 | 只透過 `qsl_public` 檢視表，不含姓名／電話／地址 |
| 函式 | `SECURITY DEFINER` + 固定 `search_path`；呼叫前驗證呼叫者與紀錄的呼號是否相符 |
| 個資 | 非管理員查詢一律回 `***`（姓名、電話、郵遞區號、地址） |
| 濫用防護 | 同筆通聯同呼號僅能申請一次；同呼號跨所有紀錄每日上限 20 筆；所有欄位有長度上限 |
| 儲存 | `qsl-images` 公開讀取；寫入僅限已登入管理員（insert / update / delete / select 四條 policy） |
| 傳輸 | 全站 CSP（`script-src 'self'`）、HSTS、X-Frame-Options `DENY`、COOP/CORP、Referrer-Policy |
| 前端 | 輸出經 `escapeHtml` / `escAttr`；無內聯事件處理器；提示訊息用 `textContent` |
| 部署 | `/supabase/*` 一律 302 導回首頁，SQL 不會被公開讀取；`/manage` 加 `noindex` 與 `no-store` |

> 這個站會儲存申請人的姓名、電話與地址。**營運者對這些資料負法律責任**，開源版必須附隱私聲明範本，且 repo 內不得有任何真實個資。

## 實測數據

| 指標 | 數值 |
|---|---|
| Lighthouse（首頁） | **100 / 100 / 100**（Accessibility / Best Practices / SEO） |
| 公開頁 JavaScript | 213 KB → **1.5 KB**（+ 約 17 KB 頁面邏輯） |
| 列表縮圖 | 79 KB → **4.2 KB**（約 20 倍） |
| 首頁 10 張縮圖合計 | 約 790 KB → **約 42 KB** |
| 深色模式最低對比度 | **5.86:1**（WCAG AA 需 4.5:1） |
| 資料量 | 199 筆通聯 / 185 個呼號（2025-12 ～ 2026-10） |
| 卡片圖 | 41 筆紀錄有「已發出」卡片照片 |

## 資料模型（主要部分）

```sql
qsl_records
  id              bigint  pk
  date / time     text           -- 通聯日期與 UTC 時間
  call            text           -- 對方呼號
  band / mode     text
  note            text           -- 含 [衛星名稱]、FREQ:xxx 等標記
  receivedImg     text           -- 收到的卡片圖 URL
  sentImg         text           -- 發出的卡片圖 URL
  sentDate        timestamptz
  status          text           -- none / pending / sent / received_paper / completed …
  completedDate   timestamptz
  requests        jsonb          -- 換卡申請陣列（含收件資訊）

qsl_public                        -- 公開檢視（11 欄，無個資）
```

RPC：

- `my_qsl_requests(p_user_call, p_password)` — 查某呼號的申請紀錄，個資遮罩
- `submit_qsl_request(p_record_id, p_user_call, p_ship_*)` — 送出申請，含去重與每日上限

## 專案結構

```
index.html / apply.html / manage.html   三個頁面 + 404
css/style.css                           共用樣式（含深色模式、列印）
css/apply.css                           申請頁專用
js/api.js                               公開頁用的極簡 Supabase REST 客戶端
js/script.js                            首頁邏輯（搜尋、分頁、燈箱）
js/apply.js                             申請頁邏輯
js/manage.js                            管理後台邏輯
js/theme.js                             佈景主題（必須同步載入，避免閃白）
vendor/supabase-js.min.js               自架客戶端（只有管理頁載入）
_headers                                CSP 與安全／快取標頭
_redirects                              /supabase/* 導回首頁
supabase/*.sql                          資料庫修復與加固腳本（手動執行）
scripts/check-site.js                   CI 用的結構與連結檢查
.github/workflows/checks.yml            push 時自動檢查
```

## 開源前的缺口

**這一段是「要開源還缺什麼」，不是功能清單。** 目前 repo 可以直接部署成 BX2AOV 的站，但別人 fork 之後跑不起來。

### P0 — 沒做這些，別人 clone 下來無法使用

| # | 項目 | 現況 |
|---|---|---|
| 1 | 抽出 `js/config.js`（Supabase URL / anon key / 呼號 / 站名） | 未完成，設定硬編碼在 `js/api.js`、`js/manage.js`、HTML |
| 2 | `supabase/migrations/001_schema.sql`（建表 + RLS + 函式 + 檢視） | 未完成，目前只有修復腳本 |
| 3 | `supabase/seed.sql`（**假資料**） | 未完成 |
| 4 | 補上 `swift-task` Edge Function，或把 LoTW 同步改為選用 | 未完成（repo 只有 `clever-responder`） |
| 5 | `LICENSE`（建議 MIT） | 未完成 |

### P1 — 讓別人願意用

| # | 項目 |
|---|---|
| 6 | 一鍵部署（Deploy to Cloudflare Pages）＋ Supabase 建庫步驟 |
| 7 | 拆 `js/manage.js`（44.5 KB 單檔，邏輯與 HTML 模板混在一起） |
| 8 | README 改成「5 分鐘上手」，維運筆記移到 `docs/` |
| 9 | 隱私聲明與服務條款範本 |

### P2 — 可選

| # | 項目 |
|---|---|
| 10 | Playwright 冒煙測試（申請流程 + 管理員登入） |
| 11 | 公開安全評估（RLS 與 RPC 的設計本身就是教材） |

## 開源後的授權與治理（建議）

- **授權：MIT。** 這類小工具用 GPL 只會嚇跑想客製的人。
- **定位：模板，不是產品。** 目標是「別人 10 分鐘內能改成自己的站」，不是功能路線圖與 issue 管理。
- **隱私紅線：** repo 內不得有真實通聯、地址、卡片圖、ADIF 檔或任何金鑰。
- **維護預期：** 華語 ham 圈很小，能有 10～20 個實際部署就算成功。

## 常見問題

**Q：這跟 Cloudlog / Wavelog 有什麼不同？**
它們是完整日誌軟體（PHP + MySQL，功能齊全）。這個專案只做「公開 QSL 狀態頁 + 換卡申請」，可以跟任何日誌軟體並存，不需要額外主機。

**Q：一定要用 Supabase 嗎？**
目前是。資料層只用 PostgREST + RPC + Storage，抽象程度不高；要換成其他 BaaS 需要改寫 `js/api.js` 與 RPC。

**Q：為什麼公開頁不用 supabase-js？**
公開頁只需要兩個呼叫（讀 view、呼叫 RPC），完整客戶端 213 KB 不值得。自己寫的 `api.js` 只有 1.5 KB。

**Q：申請人不註冊，怎麼防止亂送？**
同筆通聯只能申請一次、同呼號每日 20 筆、所有欄位有長度上限，最後由站方人工核准。

**Q：卡片圖會不會外流？**
卡片圖放在公開 bucket（任何知道網址的人都能看），但 bucket 內不含個資；姓名、電話、地址只存在資料庫，且對非管理員遮罩。

## 名詞

| 名詞 | 說明 |
|---|---|
| **QSL** | 無線電通聯的書面確認卡 |
| **QSO** | 一次無線電通聯 |
| **ADIF** | 業餘無線電日誌的標準交換格式 |
| **LoTW** | Logbook of The World，ARRL 的線上通聯確認系統 |
| **UTC** | 協調世界時；本站時間欄位皆為 UTC |

## 授權

尚未開源，尚無授權條款。開源時預計採用 **MIT License**。

## 免責

本文件為開源介紹稿，數據為 2026-10-31 實測。專案尚未以開源形式發布（repo 目前公開）；正式開源前會先補齊 P0 項目，並移除所有真實資料。
