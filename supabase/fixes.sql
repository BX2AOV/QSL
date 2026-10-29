-- ============================================================
-- QSL 網站資安修復 SQL
-- 執行位置：Supabase Dashboard → SQL Editor → 貼上 → Run
-- 執行前請先看「使用說明」
-- ============================================================
--
-- 使用說明
--   1. 先只跑「第一部分」，跑完打開 https://qsl-web.pages.dev/ 確認首頁
--      表格還有資料。若首頁正常，再跑第二部分。
--   2. 第二部分直接給 authenticated 權限（前提：註冊已關閉）。
--   3. 全部都是可逆的，沒有 DROP TABLE。
--
-- 這份 SQL 修的是：
--   [嚴重] qsl_records 匿名可讀，含姓名/電話/地址
--   [嚴重] admins 匿名可讀可寫可刪，且存明文密碼
--   [嚴重] qsl-images 儲存桶匿名可寫入（第五部分）
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
--     clever-responder 目前任何人開首頁就會被呼叫。前端已改成管理員登入後
--     才呼叫，但函式本身仍無鑑權，任何人直接打 API 還是能觸發。
--     最徹底的做法：在 Dashboard → Edge Functions 把該函式的 JWT 驗證打開
--     （Enforce JWT Verification = ON），並改由 Cron 定時執行。
-- ============================================================


-- ============================================================
-- 第五部分：Storage 匿名寫入（qsl-images 儲存桶）
-- ============================================================
--
-- 問題：anon key 可以直接對 qsl-images 上傳檔案（實測回 409 Duplicate，
--       代表「檔案已存在」的檢查有跑到，也就代表 INSERT policy 沒擋）。
--       任何人都能用你的儲存空間放任意檔案，佔頻寬、也可能被拿來托管惡意內容。
--
-- 修法：把 storage.objects 上「roles 含 anon」且跟 qsl-images 有關的 policy
--       全部刪掉，只留 authenticated（管理員）可以寫。
--       公開讀取不受影響（bucket 是 public，QSL 卡圖片本來就要公開展示）。
--
-- ⚠️ 建議先跑 5-3 診斷，把結果貼給我確認，再跑 5-1 / 5-2。

begin;

-- ------------------------------------------------------------
-- 5-1. 刪除匿名角色的寫入 policy
-- ------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and (roles::text ilike '%anon%' or roles::text ilike '%public%')
      and (
            coalesce(qual, '')          ilike '%qsl-images%'
         or coalesce(with_check, '')    ilike '%qsl-images%'
         or (qual is null and with_check is null)   -- 完全開放型 policy
         or qual = 'true'
         or with_check = 'true'
      )
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
    raise notice 'dropped policy: %', p.policyname;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5-2. 只給登入後的管理員寫入權限
-- ------------------------------------------------------------
drop policy if exists "qsl-images admin insert" on storage.objects;
create policy "qsl-images admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'qsl-images');

drop policy if exists "qsl-images admin update" on storage.objects;
create policy "qsl-images admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'qsl-images')
  with check (bucket_id = 'qsl-images');

drop policy if exists "qsl-images admin delete" on storage.objects;
create policy "qsl-images admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'qsl-images');

commit;


-- ------------------------------------------------------------
-- 5-3. 診斷：跑完後執行這段，看還剩哪些 policy
-- ------------------------------------------------------------
-- select policyname, cmd, roles::text, qual, with_check
-- from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
-- order by policyname;
--
-- 預期：qsl-images 相關的 policy 只剩上面三個 admin 開頭、roles = {authenticated}
--       如果還看到 roles 含 anon 的，把那行貼給我。

