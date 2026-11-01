import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

/* 解析 ADIF 單一欄位：<TAG:len>value 或 <TAG:len:type>value */
function field(block: string, tag: string): string {
  const m = block.match(new RegExp('<' + tag + ':(\\d+)(?::[A-Z])?>([^<\\r\\n]*)', 'i'))
  return m ? m[2].trim() : ''
}

type LotwQso = {
  call: string
  date: string
  time: string
  band: string
  mode: string
}

function parseAdif(txt: string): LotwQso[] {
  const out: LotwQso[] = []
  for (const block of txt.split(/<eor>/i)) {
    if (!/<call:/i.test(block)) continue
    const date = field(block, 'QSO_DATE')
    if (date.length < 8) continue
    // 只留 LoTW 已確認的
    if (field(block, 'QSL_RCVD').toUpperCase() !== 'Y') continue
    out.push({
      call: field(block, 'CALL').toUpperCase(),
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      time: field(block, 'TIME_ON'),
      band: field(block, 'BAND').toUpperCase(),
      mode: field(block, 'MODE').toUpperCase(),
    })
  }
  return out
}

/* 15:58 / 155800 / 15:58:00 → 155800 */
function normTime(t: string): string {
  const d = (t || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  return (d + '000000').slice(0, 6)
}

function toSeconds(t: string): number {
  const n = normTime(t)
  if (!n) return NaN
  return Number(n.slice(0, 2)) * 3600 + Number(n.slice(2, 4)) * 60 + Number(n.slice(4, 6))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey)

    /* ---- 只允許已登入的管理員呼叫（anon key 一律拒絕） ---- */
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: '未登入' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return json({ error: '登入狀態無效，請重新登入' }, 401)
    }

    const lotwUser = Deno.env.get('LOTW_USER')
    const lotwPass = Deno.env.get('LOTW_PASS')
    if (!lotwUser || !lotwPass) {
      throw new Error('未設定 LoTW 帳號密碼 Secrets')
    }

    /* ---- 向 LoTW 取得已確認 QSL 的 ADIF ----
       LoTW 的報表端點是 POST 表單；用 GET 帶 login/password 只會回登入頁。
       不帶 qso_qslsince 時，LoTW 只會回「上次下載之後」的新確認，
       所以這裡固定從資料庫最早的那筆日期開始抓，確保每次都完整比對。 */
    const { data: oldest } = await admin
      .from('qsl_records')
      .select('date')
      .order('date', { ascending: true })
      .limit(1)

    const since = Deno.env.get('LOTW_SINCE')
      || (oldest && oldest[0] && oldest[0].date) // YYYY-MM-DD
      || '1990-01-01'

    const form = new URLSearchParams({
      login: lotwUser,
      password: lotwPass,
      qso_query: '1',
      qso_qsl: 'yes',
      qso_qslsince: since,
      thisForm: 'login',
    })

    const res = await fetch('https://lotw.arrl.org/lotwuser/lotwreport.adi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const text = await res.text()

    if (!/<eoh>/i.test(text) || !/<call:/i.test(text)) {
      const hint = /Username\/password incorrect/i.test(text)
        ? 'LoTW 帳號或密碼錯誤（要填 LoTW 密碼，不是 ARRL 網站密碼）'
        : 'LoTW 沒有回傳 ADIF（網站改版或被擋）'
      return json({
        error: hint,
        httpStatus: res.status,
        contentType: res.headers.get('content-type'),
      }, 400)
    }

    const adi = parseAdif(text)

    /* ---- 一次讀出全部紀錄，在記憶體比對（避免 maybeSingle 遇到重複就失敗） ---- */
    const { data: rows, error: dbErr } = await admin
      .from('qsl_records')
      .select('id, call, date, time, band, mode, status')
      .limit(5000)
    if (dbErr) throw dbErr

    type Row = {
      id: number
      call: string
      date: string
      time: string
      band: string
      mode: string
      status: string
    }

    const byCallDate = new Map<string, Row[]>()
    const byCallDateTime = new Map<string, Row[]>()

    for (const r of (rows ?? []) as Row[]) {
      const cd = r.call.toUpperCase() + '|' + r.date
      const cdt = cd + '|' + normTime(r.time)
      if (!byCallDate.has(cd)) byCallDate.set(cd, [])
      byCallDate.get(cd)!.push(r)
      if (!byCallDateTime.has(cdt)) byCallDateTime.set(cdt, [])
      byCallDateTime.get(cdt)!.push(r)
    }

    const toUpdate = new Set<number>()
    let matched = 0

    for (const a of adi) {
      const cd = a.call + '|' + a.date
      const cdt = cd + '|' + normTime(a.time)

      let candidates = byCallDateTime.get(cdt) ?? []

      if (candidates.length === 0) {
        const sameDay = byCallDate.get(cd) ?? []
        if (sameDay.length === 1) {
          candidates = sameDay
        } else if (sameDay.length > 1 && a.time) {
          // 同呼號同日多筆：挑時間最接近的那筆
          const target = toSeconds(a.time)
          let best = sameDay[0]
          let bestDiff = Infinity
          for (const r of sameDay) {
            const diff = Math.abs(toSeconds(r.time) - target)
            if (diff < bestDiff) {
              bestDiff = diff
              best = r
            }
          }
          candidates = [best]
        } else {
          candidates = sameDay
        }
      }

      if (candidates.length === 0) continue

      // 同一時間有多個頻段時，優先用頻段相同的那筆
      const sameBand = candidates.filter(r => r.band.toUpperCase() === a.band)
      const pick = sameBand.length > 0 ? sameBand : candidates

      matched++
      for (const r of pick) {
        // 已是 completed 或使用者標為「不需 QSL」的，不要覆寫
        if (r.status === 'completed' || r.status === 'not_needed') continue
        toUpdate.add(r.id)
      }
    }

    let updated = 0
    const now = new Date().toISOString()

    for (const id of toUpdate) {
      const { error } = await admin
        .from('qsl_records')
        .update({ status: 'completed', completedDate: now })
        .eq('id', id)
      if (!error) updated++
    }

    return json({
      success: true,
      message: `LoTW 已確認 ${adi.length} 筆，對到 ${matched} 筆，更新 ${updated} 筆。`,
      lotw: adi.length,
      matched,
      updated,
    })
  } catch (error) {
    return json({ error: (error as Error).message }, 400)
  }
})
