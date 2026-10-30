-- ============================================================
-- QSL 網站：殘餘資料清理（2026-10-30）
-- 執行位置：Supabase Dashboard → SQL Editor → 貼上 → Run
--
-- 對應風險評估報告的 P2 項：
--   1. 清掉舊版申請單裡殘留的 bcrypt 密碼欄位
--   2. 移除已無人使用的 admins 表（舊版存明文密碼）
--
-- 注意：SQL Editor 按 Run 只會執行「游標所在的那一條語句」，
--       請一次跑一段，看到 Success 再跑下一段。
-- ============================================================


-- ------------------------------------------------------------
-- 第 1 段：先看看有幾筆申請單還帶著 password 欄位（唯讀）
-- 預期：1 列，數字是殘留的申請單數量
-- ------------------------------------------------------------
select count(*) as 殘留筆數
from public.qsl_records
where jsonb_typeof(requests) = 'array'
  and requests::text like '%"password"%';


-- ------------------------------------------------------------
-- 第 2 段：清除 password 欄位（保留其他所有欄位與順序）
-- 已經沒有 password 的申請單不會被動到
-- ------------------------------------------------------------
begin;

update public.qsl_records
set requests = sub.cleaned
from (
  select id,
         coalesce(jsonb_agg(e - 'password' order by ord), '[]'::jsonb) as cleaned
  from public.qsl_records r
  cross join lateral jsonb_array_elements(r.requests) with ordinality as t(e, ord)
  where jsonb_typeof(r.requests) = 'array'
    and r.requests::text like '%"password"%'
  group by id
) as sub
where public.qsl_records.id = sub.id;

commit;


-- ------------------------------------------------------------
-- 第 3 段：確認 admins 表真的沒在用（唯讀）
-- 預期：value 欄位是 0 或很小的數字；前端程式碼完全沒引用這張表
-- ------------------------------------------------------------
select count(*) as 管理員表筆數 from public.admins;

select p.proname as 有引用到的函式
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ilike '%admins%';


-- ------------------------------------------------------------
-- 第 4 段：刪除 admins 表
-- ⚠️ 第 3 段確認「0 筆」且「沒有函式引用」後，再取消下面兩行的註解執行。
--    這一步無法復原；若想留備份，先在 Dashboard → Database → Backups 確認有備份。
-- ------------------------------------------------------------
-- drop table if exists public.admins;
