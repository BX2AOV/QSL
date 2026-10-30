-- ============================================================
-- QSL 網站：RPC 加固（2026-10-30）
-- 執行位置：Supabase Dashboard → SQL Editor → 貼上 → Run
--
-- 這份 SQL 修三件事：
--   1. my_qsl_requests 洩漏 ship_name（收件人姓名）明文
--   2. my_qsl_requests 有 (text) 與 (text,text) 兩版並存
--      → 只傳 1 個參數呼叫時回 PGRST203 / 300
--   3. submit_qsl_request 的每日上限算的是「單筆記錄」而不是「單一呼號」
--      → 形同無效，改成同呼號跨所有記錄累計
--
-- 另外順手：
--   * 刪掉已無人使用的 8 參數 submit_qsl_request（舊的密碼版）
--   * 補上 7 參數版缺少的 p_ship_phone / p_ship_zip / p_ship_note 長度檢查
--
-- 全部包在一個交易裡，任何一步失敗都會整批回滾，不會留下半套。
-- 還原方式：把 pg_get_functiondef 匯出的原始定義貼回執行即可。
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 刪掉舊的單參數版本（PGRST203 的元凶）
--    (text,text) 版的 p_password 有 DEFAULT ''，所以 1 個參數時兩版都符合
-- ------------------------------------------------------------
drop function if exists public.my_qsl_requests(text);


-- ------------------------------------------------------------
-- 2. 重建兩參數版本
--    變更點：
--      * ship_name 也一併遮罩（原本是明文）
--      * 移除已廢棄的密碼解鎖邏輯（前端不再送密碼）
--      * 保留 is_locked 欄位，避免前端舊版報錯
-- ------------------------------------------------------------
create or replace function public.my_qsl_requests(
    p_user_call text,
    p_password  text default ''::text
)
returns table(
    record_id    bigint,
    record_call  text,
    record_date  text,
    record_band  text,
    record_mode  text,
    request_date text,
    status       text,
    ship_name    text,
    ship_phone   text,
    ship_zip     text,
    ship_addr    text,
    is_locked    boolean
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    r.id,
    r.call,
    r.date,
    r.band,
    r.mode,
    e->>'requestDate',
    e->>'status',
    -- 只有登入的管理員看得到真實收件資料，其他人一律 ***
    case when auth.role() = 'authenticated' then e->>'shipName'    else '***' end,
    case when auth.role() = 'authenticated' then e->>'shipPhone'   else '***' end,
    case when auth.role() = 'authenticated' then e->>'shipZip'     else '***' end,
    case when auth.role() = 'authenticated' then e->>'shipAddress' else '***' end,
    (coalesce(auth.role(), 'anon') <> 'authenticated')
  from public.qsl_records r
  cross join lateral jsonb_array_elements(coalesce(r.requests, '[]'::jsonb)) as e
  where upper(e->>'userCall') = upper(trim(p_user_call))
  order by (e->>'requestDate') desc;
$function$;


-- ------------------------------------------------------------
-- 3. 重建 7 參數 submit_qsl_request
--    變更點：
--      * 每日上限改為「同一呼號、跨所有通聯記錄」累計
--        （原本只算同一筆記錄，而去重規則已讓單筆記錄最多 1 筆，等於沒有限制）
--      * 補上 phone / zip / note 長度檢查
--      * 上限值集中在 c_daily_limit，要調整只改這一行
-- ------------------------------------------------------------
create or replace function public.submit_qsl_request(
    p_record_id  bigint,
    p_user_call  text,
    p_ship_name  text,
    p_ship_phone text,
    p_ship_zip   text,
    p_ship_addr  text,
    p_ship_note  text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_record     public.qsl_records%rowtype;
  v_new_req    jsonb;
  v_requests   jsonb;
  v_same_cnt   int;
  v_call_today int;
  v_clean_call text;
  c_daily_limit constant int := 20;   -- ← 同呼號每日最多幾筆（要更嚴就改小）
begin
  -- 基本校驗
  v_clean_call := upper(trim(p_user_call));
  if v_clean_call is null or v_clean_call = '' then
    raise exception 'INVALID_CALL' using hint = '呼號不可為空';
  end if;
  if p_ship_name is null or trim(p_ship_name) = '' then
    raise exception 'INVALID_NAME' using hint = '姓名不可為空';
  end if;
  if p_ship_addr is null or trim(p_ship_addr) = '' then
    raise exception 'INVALID_ADDR' using hint = '地址不可為空';
  end if;

  -- 長度上限（避免塞爆 jsonb）
  if length(p_ship_name) > 100 then raise exception 'NAME_TOO_LONG'; end if;
  if length(p_ship_addr) > 500 then raise exception 'ADDR_TOO_LONG'; end if;
  if length(coalesce(p_ship_phone, '')) > 30 then raise exception 'PHONE_TOO_LONG'; end if;
  if length(coalesce(p_ship_zip,   '')) > 20 then raise exception 'ZIP_TOO_LONG'; end if;
  if length(coalesce(p_ship_note,  '')) > 500 then raise exception 'NOTE_TOO_LONG'; end if;

  -- 行鎖，避免競態
  select * into v_record
  from public.qsl_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'RECORD_NOT_FOUND';
  end if;

  -- 只能對「自己的呼號」那筆記錄申請
  if upper(v_record.call) <> v_clean_call then
    raise exception 'CALL_MISMATCH' using hint = '只能對自己的通聯記錄申請';
  end if;

  v_requests := coalesce(v_record.requests, '[]'::jsonb);

  -- 去重：同一呼號同一記錄只能申請一次
  select count(*) into v_same_cnt
  from jsonb_array_elements(v_requests) as e
  where upper(e->>'userCall') = v_clean_call;

  if v_same_cnt > 0 then
    raise exception 'ALREADY_REQUESTED';
  end if;

  -- 限流：同一呼號「當天」在所有記錄上加起來最多 c_daily_limit 筆
  select count(*) into v_call_today
  from public.qsl_records r
  cross join lateral jsonb_array_elements(coalesce(r.requests, '[]'::jsonb)) as e
  where upper(e->>'userCall') = v_clean_call
    and (e->>'requestDate')::date = current_date;

  if v_call_today >= c_daily_limit then
    raise exception 'RATE_LIMITED'
      using hint = '同一呼號每日申請筆數已達上限，請明天再試';
  end if;

  -- 組裝新申請單
  v_new_req := jsonb_build_object(
    'userCall',    v_clean_call,
    'requestDate', to_char(current_date, 'YYYY-MM-DD'),
    'status',      'pending',
    'shipName',    trim(p_ship_name),
    'shipPhone',   coalesce(p_ship_phone, '未提供'),
    'shipZip',     coalesce(p_ship_zip, ''),
    'shipAddress', coalesce(p_ship_addr, ''),
    'shipNote',    coalesce(p_ship_note, '')
  );

  -- 追加（不覆蓋現有申請）
  update public.qsl_records
  set requests = v_requests || jsonb_build_array(v_new_req)
  where id = p_record_id;

  return jsonb_build_object('ok', true, 'record_id', p_record_id);
end;
$function$;


-- ------------------------------------------------------------
-- 4. 刪掉已無人使用的 8 參數版（舊的密碼機制，前端已不再送密碼）
-- ------------------------------------------------------------
drop function if exists public.submit_qsl_request(
    bigint, text, text, text, text, text, text, text
);


-- ------------------------------------------------------------
-- 5. 權限（create or replace 會保留原權限，這裡明示一次）
-- ------------------------------------------------------------
grant execute on function public.my_qsl_requests(text, text) to anon, authenticated;
grant execute on function public.submit_qsl_request(
    bigint, text, text, text, text, text, text
) to anon, authenticated;

-- 讓 PostgREST 立刻重載 schema cache（否則可能還看到舊的函式簽名）
notify pgrst, 'reload schema';

commit;


-- ============================================================
-- 6. 驗證（跑完這段，把結果貼回聊天）
-- ============================================================

-- 6-1. 預期只剩 2 個函式：
--      my_qsl_requests(p_user_call text, p_password text)
--      submit_qsl_request(7 個參數)
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)            as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('my_qsl_requests', 'submit_qsl_request')
order by 1, 2;

-- 6-2. 確認 ship_name 已遮罩（用你自己的測試呼號）
--      預期：ship_name / ship_phone / ship_zip / ship_addr 全部 ***
select record_id, record_call, request_date, status, ship_name, ship_phone, ship_zip, ship_addr
from public.my_qsl_requests('VR2XAB');

-- 6-3. 確認 1 個參數也能呼叫（修好 PGRST203 後不會再回 300）
select count(*) as rows_returned from public.my_qsl_requests('VR2XAB');
