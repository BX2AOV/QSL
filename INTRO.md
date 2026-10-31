# BX2AOV QSL confirm

> 一個給業餘無線電台使用的 **QSL 換卡管理網站**：公開展示通聯紀錄與 QSL 卡，讓對方線上申請換卡，站方在後台審核、寄卡、上傳卡片照片。

線上版本：<https://bx2aov.top>（備用：<https://qsl-web.pages.dev>）

<sub>English: A zero-server QSL card exchange site for amateur radio — public log with QSL status, online card requests, and an admin panel for reviewing, mailing, and archiving cards. Built as a static site on Cloudflare Pages with Supabase as the backend.</sub>

---

## 為什麼做這個

QSL 卡是業餘無線電的紙本通聯憑證。傳統流程是：對方寄卡片＋回郵信封 → 站方手寫回卡 → 寄出 → 雙方各自記錄。整段過程完全離線，對方**無法得知自己的卡片到底寄到沒、回了沒**。

這個專案把那段黑箱變成一個公開頁面：

- 對方用呼號查詢 → 看到自己的通聯與 QSL 狀態
- 勾選要換卡的通聯 → 線上填收件資訊送出
- 站方在後台看到申請 → 核准、寄卡、上傳卡片照片
- 對方重新整理就能看到「已發出紙卡」

同時也解決站方自己的痛點：**卡片照片、通聯紀錄、申請單、寄送狀態全部集中在一個後台**，不用再開 Excel 對帳。

## 功能

### 公開端

| 功能 | 說明 |
|---|---|
| 通聯紀錄總覽 | 日期、時間（UTC）、呼號、頻段、模式、QSL 狀態、備註 |
| 呼號搜尋 | 即時過濾，支援部分比對（輸入 `AOV` 可列出所有含 AOV 的呼號） |
| QSL 卡瀏覽 | 縮圖點擊放大，鍵盤可操作（Tab 聚焦 + Enter 開啟、Esc 關閉） |
| 換卡申請 | 勾選通聯 → 填收件資訊 → 送出，**免註冊、免密碼** |
| 申請進度 | 「我的申請紀錄」只顯示狀態膠囊：待處理／已核准／已拒絕 |
| 多語介面 | 繁中／简中／English／日本語，選擇存在瀏覽器 |
| 深色模式 | 跟隨系統 → 淺色 → 深色，三段切換 |

### 管理端（需登入）

| 功能 | 說明 |
|---|---|
| 通聯管理 | 新增、刪除、修改狀態、上傳收到／發出的卡片照片 |
| ADIF 匯入 | 一次匯入整份日誌，自動去重（比對呼號＋日期＋時間＋頻率） |
| LoTW 同步 | 從 Logbook of The World 抓取已確認的卡片 |
| 申請審核 | 看到收件人姓名／電話／地址，核准或拒絕，可直接刪除 |
| 容量監控 | 資料庫文字量與圖片空間使用率 |
| 列印 | 一鍵列印收件資訊（自動隱藏導覽列、按鈕、上傳區） |

## 技術架構

```
瀏覽器
  │
  ├── Cloudflare Pages（純靜態 HTML / CSS / JS，無建置步驟）
  │      ├── index.html   公開通聯紀錄
  │      ├── apply.html   查詢與換卡申請
  │      ├── manage.html  管理後台
  │      └── 404.html
  │
  └── Supabase
         ├── PostgREST   資料表 / 公開檢視 / RPC
         ├── Auth        Email + 密碼（只有管理員有帳號）
         └── Storage     公開讀取的 qsl-images bucket
```

**公開頁不載入 supabase-js。** 只有 1.5 KB 的 `js/api.js`（兩個函式：`select`、`rpc`），把 213 KB 的完整客戶端留給真正需要的管理後台。

## 幾個刻意的設計決策

| 決策 | 理由 |
|---|---|
| **靜態前端 + Supabase** | 沒有伺服器要顧，沒有憑證要更新，免費額度足夠個人站用十年 |
| **公開資料走 View，不開表權限** | `qsl_public` 只露出 11 個非敏感欄位；`qsl_records` 對匿名角色完全封鎖 |
| **換卡申請放在 `requests` JSONB** | 一筆通聯可能有多筆申請，但查詢永遠是「某呼號的全部申請」，JSONB 比正規化更省事 |
| **免登入申請** | 要求對方註冊會直接勸退九成使用者；改用「人工核准」把關 |
| **密碼機制整個移除** | 原本讓申請人自訂密碼解鎖詳情，但 4 碼 PIN 幾分鐘就能破，改成一律遮罩、只有管理員看得到 |
| **圖片上傳時就壓縮 + 產生縮圖** | 表格縮圖只顯示 40×28，沒有理由下載 700 KB 的原圖 |
| **沒有建置流程** | 改一行推上去就生效；代價是沒有 bundler，所以刻意把檔案保持在可讀大小 |

## 實測數據

| 指標 | 數值 |
|---|---|
| Lighthouse（首頁） | **100 / 100 / 100**（Accessibility / Best Practices / SEO） |
| 公開頁 JavaScript | 213 KB → **1.5 KB**（+ 17 KB 頁面邏輯） |
| 列表縮圖 | 79 KB → **4.2 KB**（約 20 倍） |
| 首頁 10 張縮圖合計 | 約 790 KB → **約 42 KB** |
| 深色模式最低對比度 | **5.86:1**（WCAG AA 需 4.5:1） |
| 資料量 | 199 筆通聯 / 185 個呼號（2025-12 ～ 2026-10） |
| 卡片圖 | 41 筆紀錄有「已發出」卡片照片 |

## 安全設計

| 層 | 做法 |
|---|---|
| 資料表 | `qsl_records` 開啟 RLS，匿名角色零權限（實測 `42501`） |
| 公開資料 | 只透過 `qsl_public` 檢視表，不含姓名／電話／地址 |
| 函式 | `SECURITY DEFINER` + 固定 `search_path`；呼叫前先驗證呼叫者與紀錄的呼號是否相符 |
| 個資 | 非管理員查詢一律回 `***`；姓名、電話、郵遞區號、地址都遮罩 |
| 濫用防護 | 同一通聯同呼號僅能申請一次；同呼號每日上限 20 筆；所有欄位有長度上限 |
| 儲存 | `qsl-images` 公開讀取，寫入僅限已登入管理員（insert / update / delete / select 四條 policy） |
| 傳輸 | 全站 CSP（`script-src 'self'`）、HSTS、X-Frame-Options `DENY`、COOP/CORP、Referrer-Policy |
| 前端 | 所有輸出經 `escapeHtml` / `escAttr`，無內聯事件處理器；`showToast` 使用 `textContent` |
| 部署 | `/supabase/*` 一律 302 導回首頁，SQL 不會被公開讀取 |

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

## 部署

1. Fork／複製到自己的 GitHub
2. Cloudflare Pages 連接該 repo（無建置指令，輸出目錄 `/`）
3. 建立 Supabase 專案，執行 `supabase/` 內的 SQL
4. 把 `js/api.js` 與 `js/manage.js` 開頭的專案網址與 anon key 換成自己的
5. 在 Supabase Authentication 建立管理員帳號，關閉註冊

## 已知限制

- **申請無法撤銷**：送出後只能由管理員在後台刪除
- **免登入申請可被冒用**：知道呼號與紀錄 ID 就能替別人送申請（已用每日上限＋人工核准緩解）
- **圖片轉換未啟用**：Supabase 免費方案的 `/render/image` 不可用，所以縮圖是上傳時自行產生的
- **沒有單元測試**：目前只有 CI 的語法與連結檢查
- **介面字串寫在 HTML 屬性裡**，新增語言需要改所有 `data-*`

## 狀態

本專案目前為**私有專案**，暫不開源。若之後公開，會先補上完整的建表 migration、假資料 seed、設定檔抽離與授權條款。

---

<sub>本站不含任何真實個資；文件中的數據皆為 2026-10-31 實測。</sub>
