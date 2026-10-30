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

## 注意

`風險*.html` 這類本機報告已列入 `.gitignore`，不要 commit——Cloudflare Pages 會把 repo 內容公開。
