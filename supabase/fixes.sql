-- ============================================================
-- QSL 網站資安修復 SQL
-- 執行位置：Supabase Dashboard → SQL Editor → 貼上 → Run
-- 執行前請先看「使用說明」
-- ============================================================
--
-- 使用說明
--   1. 先只跑「第一部分」，跑完打開 https://qsl-web.pages.dev/ 確認首頁
--      表格還有資料。若首頁正常，再跑第二部分。
--   2. 第二部分有一個 TODO，請把 'CHANGE_ME@example.com' 改成你自己的
--      Supabase 管理員登入 Email（manage 頁面登入用的那個）。
--   3. 全部都是可逆的，沒有 DROP TABLE。
--
-- 這份 SQL 修的是：
--   [嚴重] qsl_records 匿名可讀，含姓名/電話/地址
--   [嚴重] admins 匿名可讀可寫可刪，且存明文密碼
-- ============================================================


-- ============================================================
-- 第一部分：關閉匿名存取（先跑這段）
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1-1. 讓 qsl_public 檢視表以「擁有者權限」執行
--      這樣底下 qsl_records 收回權限後，首頁仍然讀得到資料
-- ------------------------------------------------------------
alter view public.qsl_public set (security_invoker = false);


-- ------------------------------------------------------------
-- 1-2. qsl_records：收回匿名角色的所有權限
--      前端公開頁面只用 qsl_public，不需要直接讀這張表
-- ------------------------------------------------------------
revoke all on table public.qsl_records from anon;

-- 開啟 RLS（沒有 policy 就等於「誰都讀不到」）
alter table public.qsl_records enable row level security;


-- ------------------------------------------------------------
-- 1-3. admins：這張表前端完全沒用到，直接上鎖
--      收回匿名與一般登入使用者的所有權限
-- ------------------------------------------------------------
revoke all on table public.admins from anon;
revoke all on table public.admins from authenticated;
alter table public.admins enable row level security;

-- 如果你確認這張表已經沒用了，可以改成直接刪掉（比較乾淨）：
-- drop table public.admins;

commit;


-- ------------------------------------------------------------
-- 1-4. 驗證（跑完這段看結果）
--      預期：anon 對這兩張表都應該失敗 / 回傳空
-- ------------------------------------------------------------
-- 用下面的指令在 PowerShell 測（把 <ANON_KEY> 換成 script.js 裡的金鑰）：
--
--   curl.exe -sS -H "apikey: <ANON_KEY>" "https://btcsstbtbnejuyexwbpn.supabase.co/rest/v1/qsl_records?select=requests"
--   → 應該回 401 permission denied
--
--   curl.exe -sS -H "apikey: <ANON_KEY>" "https://btcsstbtbnejuyexwbpn.supabase.co/rest/v1/admins?select=*"
--   → 應該回 [] 或 401


-- ============================================================
-- 第二部分：開放管理員存取（填好 Email 再跑）
-- ============================================================

-- 前提：Supabase 的「開放註冊」必須是關閉的
--       (Authentication → Sign In / Providers → Allow new users to sign up = OFF)
--       關閉後，authenticated 只會是你在 Dashboard 手動建立的帳號，
--       所以直接給 authenticated 權限是安全的。
--
-- ⚠️ 如果你之後重新開啟註冊，請改成綁定 Email：
--    using ( (auth.jwt() ->> 'email') = '你的管理員Email' )

begin;

drop policy if exists "admin full access" on public.qsl_records;

create policy "admin full access"
  on public.qsl_records
  for all
  to authenticated
  using      ( true )
  with check ( true );

-- 管理員需要這張表的完整權限
grant select, insert, update, delete on table public.qsl_records to authenticated;

commit;


-- ============================================================
-- 第三部分：PIN 暴力破解防護（選用）
-- ============================================================
--
-- 目前 verify_qsl_password 沒有次數限制，4 碼 PIN 幾分鐘就能破完。
-- 前端已改成最少 8 碼，但真正的防線要在資料庫做。
--
-- 做法：新增一張記錄失敗次數的表，然後在 verify_qsl_password 裡
--       每次呼叫前檢查 / 失敗後累加。
--
-- 因為需要修改你現有的函式內容，請先把函式定義貼給我，我幫你改寫。
-- 查詢函式定義的方式：
--
--   select prosrc from pg_proc where proname = 'verify_qsl_password';
--
-- ------------------------------------------------------------
-- 暫時可用的簡易版（獨立於原函式，需搭配前端呼叫）：
-- ------------------------------------------------------------

create table if not exists public.pin_attempts (
  record_id  bigint      not null,
  user_call  text        not null,
  fails      int         not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (record_id, user_call)
);

alter table public.pin_attempts enable row level security;
revoke all on table public.pin_attempts from anon, authenticated;


-- ============================================================
-- 第四部分：無法用 SQL 完成，要去 Dashboard 手動關
-- ============================================================
--
-- [1] 關閉註冊（重要）
--     Supabase Dashboard → Authentication → Sign In / Providers
--     → 關掉 "Allow new users to sign up"
--
-- [2] 改掉管理員密碼
--     Authentication → Users → 選 admin → Reset password
--     不要再使用 123456 這種密碼
--
-- [3] TLS 最低版本
--     Cloudflare Dashboard → SSL/TLS → Edge Certificates
--     → Minimum TLS Version 設成 TLS 1.2
--
-- [4] 檢查 Edge Function 是否可被任意觸發
--     clever-responder 目前任何人開首頁就會被呼叫，
--     建議改成 Cron 排程執行，不要由前端觸發。
-- ============================================================
