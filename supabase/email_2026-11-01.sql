-- ------------------------------------------------------------
-- 2026-11-01：申請單加入 Email（寄確認信用）
--   1. 新增 8 參數版 submit_qsl_request（多 p_ship_email）
--   2. 保留原本 7 參數版，讓舊快取頁面仍可送出（只是不會寄信）
--   3. Email 必填、格式檢查、長度上限
--   4. 申請單 jsonb 新增 shipEmail；寄信後由 Edge Function 寫入
--      mailSentAt / mailProvider / mailError
-- ------------------------------------------------------------

create or replace function public.submit_qsl_request(
    p_record_id  bigint,
    p_user_call  text,
    p_ship_name  text,
    p_ship_phone text,
    p_ship_zip   text,
    p_ship_addr  text,
    p_ship_note  text,
    p_ship_email text
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
  v_clean_mail text;
  c_daily_limit constant int := 20;
begin
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

  v_clean_mail := lower(trim(coalesce(p_ship_email, '')));
  if v_clean_mail = '' then
    raise exception 'INVALID_EMAIL' using hint = '請填寫 Email，才能寄送確認信';
  end if;
  if v_clean_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using hint = 'Email 格式不正確';
  end if;
  if length(v_clean_mail) > 200 then
    raise exception 'EMAIL_TOO_LONG' using hint = 'Email 太長';
  end if;

  if length(p_ship_name) > 100 then raise exception 'NAME_TOO_LONG'; end if;
  if length(p_ship_addr) > 500 then raise exception 'ADDR_TOO_LONG'; end if;
  if length(coalesce(p_ship_phone, '')) > 30 then raise exception 'PHONE_TOO_LONG'; end if;
  if length(coalesce(p_ship_zip,   '')) > 20 then raise exception 'ZIP_TOO_LONG'; end if;
  if length(coalesce(p_ship_note,  '')) > 500 then raise exception 'NOTE_TOO_LONG'; end if;

  select * into v_record
  from public.qsl_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'RECORD_NOT_FOUND';
  end if;

  if upper(v_record.call) <> v_clean_call then
    raise exception 'CALL_MISMATCH' using hint = '只能對自己的通聯記錄申請';
  end if;

  v_requests := coalesce(v_record.requests, '[]'::jsonb);

  select count(*) into v_same_cnt
  from jsonb_array_elements(v_requests) as e
  where upper(e->>'userCall') = v_clean_call;

  if v_same_cnt > 0 then
    raise exception 'ALREADY_REQUESTED';
  end if;

  select count(*) into v_call_today
  from public.qsl_records r
  cross join lateral jsonb_array_elements(coalesce(r.requests, '[]'::jsonb)) as e
  where upper(e->>'userCall') = v_clean_call
    and (e->>'requestDate')::date = current_date;

  if v_call_today >= c_daily_limit then
    raise exception 'RATE_LIMITED'
      using hint = '同一呼號每日申請筆數已達上限，請明天再試';
  end if;

  v_new_req := jsonb_build_object(
    'userCall',    v_clean_call,
    'requestDate', to_char(current_date, 'YYYY-MM-DD'),
    'status',      'pending',
    'shipName',    trim(p_ship_name),
    'shipPhone',   coalesce(p_ship_phone, '未提供'),
    'shipZip',     coalesce(p_ship_zip, ''),
    'shipAddress', coalesce(p_ship_addr, ''),
    'shipNote',    coalesce(p_ship_note, ''),
    'shipEmail',   v_clean_mail,
    'mailSentAt',  null
  );

  update public.qsl_records
  set requests = v_requests || jsonb_build_array(v_new_req)
  where id = p_record_id;

  return jsonb_build_object('ok', true, 'record_id', p_record_id);
end;
$function$;

grant execute on function public.submit_qsl_request(
    bigint, text, text, text, text, text, text, text
) to anon, authenticated;

notify pgrst, 'reload schema';
