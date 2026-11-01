-- ------------------------------------------------------------
-- 2026-11-01：新增「開放申請新卡」開關
--   情境：同一個人已經寄過卡片（status = sent / completed），
--   之後又有第二次通聯。管理員做好新卡後，可以針對那一筆
--   打開 applyOpen，讓對方再申請一次。
-- ------------------------------------------------------------

alter table public.qsl_records
  add column if not exists "applyOpen" boolean not null default false;

create or replace view public.qsl_public
with (security_invoker = false) as
select
  id, date, time, call, band, mode, note,
  "receivedImg", "sentImg", status,
  (coalesce(jsonb_array_length(requests), 0) > 0) as has_requests,
  "lotwConfirmed",
  "lotwDate",
  "applyOpen"
from public.qsl_records;

notify pgrst, 'reload schema';
