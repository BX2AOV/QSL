# BX2AOV QSL confirm

業餘無線電通聯紀錄與 QSL 卡交換狀態查詢網站。
線上版本：<https://qsl-web.pages.dev>

## 功能

| 頁面 | 說明 |
|---|---|
| `/` | 通聯紀錄總覽，支援呼號搜尋、分頁、QSL 卡縮圖燈箱 |
| `/apply` | 用呼號查詢自己的通聯，勾選後線上送出換卡申請，並顯示處理狀態 |
| `/manage` | 管理員後台（需 Supabase Auth 登入）：上傳卡片、審核／刪除申請、ADIF 匯入 |

四語介面：繁中 / 简中 / English / 日本語（選擇存在 `localStorage.site_lang`）。

## 技術架構

- **前端**：純靜態 HTML/CSS/JS，部署於 Cloudflare Pages
- **後端**：Supabase（PostgREST + Auth + Storage）
- **資料**：`qsl_records`（RLS 鎖定）、公開檢視 `qsl_public`、Storage bucket `qsl-images`

## 目錄

```
index.html / apply.html / manage.html   頁面
css/style.css                           共用樣式
css/apply.css                           申請頁專用樣式
js/script.js                            首頁邏輯
js/apply.js                             申請頁邏輯
js/manage.js                            管理頁邏輯
vendor/supabase-js.min.js               自架的 supabase-js（避免依賴 CDN）
_headers                                CSP 與安全／快取標頭
_redirects                              /supabase/* 導回首頁，避免 SQL 被公開
404.html / robots.txt / sitemap.xml     SEO 與錯誤頁
supabase/                               資料庫修復與加固 SQL（僅供手動執行）
```

## 安全性

- 全站 CSP（`script-src 'self'`）、X-Frame-Options `DENY`、HSTS、COOP/CORP
- `qsl_records` 對 `anon` 完全無權限（RLS），前端只讀 `qsl_public`
- `my_qsl_requests` 對非管理員一律遮罩姓名／電話／郵遞區號／地址
- `submit_qsl_request` 內建去重、長度上限與「同呼號每日 20 筆」限流
- 資料庫變更一律以 SQL 檔記錄在 `supabase/`，由人工在 SQL Editor 執行

## 部署

推送 `main` 分支即自動部署。沒有任何建置步驟。

```bash
git push origin main
```

> **改了 CSS / JS 之後**：把三個 HTML 裡 `?v=` 的版本號一起換掉（例如改成當下的 commit 短碼），
> 否則瀏覽器會照 `Cache-Control` 繼續用舊檔最多一小時。
> ```bash
> # 一次換掉全部（Windows PowerShell）
> Get-ChildItem *.html | ForEach-Object {
>   (Get-Content $_.FullName -Raw -Encoding UTF8) -replace '\?v=[0-9a-f]+', '?v=新版本號' |
>     Set-Content $_.FullName -Encoding UTF8 -NoNewline
> }
> ```

## 維運

- **佈景主題**：右上角 🌗 按鈕可切換「跟隨系統 → 淺色 → 深色」，設定存在 `localStorage.site_theme`。
  `js/theme.js` 必須**同步**載入於 `<head>`（不能 `defer`），否則深色模式會先閃白畫面。
- **列印**：`/manage` 登入後按「🖨️ 列印」即可輸出收件資訊（導覽列、按鈕、上傳區會自動隱藏，表格不跨頁切割）。
- **列表縮圖**：上傳 QSL 圖片時會自動另存一份 `*_thumb.jpg`（寬 160px），首頁只抓縮圖；
  舊圖若還沒有縮圖，前端會自動退回原圖。到 `/manage` 登入後按一次「🖼️ 補產生列表縮圖」即可補齊。
- **自動檢查**：每次 push 到 `main` 會跑 `.github/workflows/checks.yml`：
  `node --check` 檢查所有 JS 語法，再用 `scripts/check-site.js` 檢查引用檔案、標籤配對、必要 meta 與 `?v=` 一致性。
  本機沒有 Node 也能推，CI 會在 GitHub 上回報結果。
- **流量分析**：`index.html` / `apply.html` 底部已預留 Cloudflare Web Analytics 的 beacon 註解，
  到 Dashboard → Web Analytics 取得 token 後填入並取消註解即可（CSP 已放行）。
- **Edge Function**：`clever-responder` 請在 Dashboard 開啟 Enforce JWT Verification。

## 注意

`風險*.html` 這類本機報告已列入 `.gitignore`，不要 commit——Cloudflare Pages 會把 repo 內容公開。
