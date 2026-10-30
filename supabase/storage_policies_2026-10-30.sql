-- ============================================================
-- QSL 網站：Storage 上傳權限修復（2026-10-30）
-- 執行位置：Supabase Dashboard → SQL Editor
--
-- 症狀：管理員登入後上傳 QSL 圖片，回
--       403 "new row violates row-level security policy"
-- 原因：舊的匿名 policy 已刪除，但「authenticated 可寫」的 policy 沒建立
--       （＝ fixes.sql 第五部分的 5-1 跑了、5-2 沒跑）
--
-- ⚠️ SQL Editor 按 Run 只會執行「游標所在的那一條語句」，
--    請一段一段跑，看到 Success 再跑下一段。
-- ============================================================


-- ------------------------------------------------------------
-- 第 1 段：先看目前有哪些 policy（唯讀）
-- 預期：qsl-images 相關的 policy 數量應該是 0 或只有 anon 的
-- ------------------------------------------------------------
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;


-- ------------------------------------------------------------
-- 第 2 段：建立管理員的讀寫 policy（可重複執行）
-- 只針對 qsl-images 這個 bucket，只有 authenticated 角色
-- ------------------------------------------------------------
begin;

-- 上傳（含 upsert 的新增）
drop policy if exists "qsl-images admin insert" on storage.objects;
create policy "qsl-images admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'qsl-images');

-- 覆寫
drop policy if exists "qsl-images admin update" on storage.objects;
create policy "qsl-images admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'qsl-images')
  with check (bucket_id = 'qsl-images');

-- 刪除
drop policy if exists "qsl-images admin delete" on storage.objects;
create policy "qsl-images admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'qsl-images');

commit;


-- ------------------------------------------------------------
-- 第 3 段：驗證（唯讀）
-- 預期：看到 3 筆，cmd 分別是 INSERT / UPDATE / DELETE，
--       roles 是 {authenticated}，且都跟 qsl-images 有關
-- ------------------------------------------------------------
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'qsl-images%'
order by policyname;
