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
  qslRcvd: string
  lotwQslRcvd: string
  rxQsl: string
  qslDate: string
  confirmed: boolean
}

/* 只把「LoTW 已確認」的 QSO 算進來。
   LoTW 的 ADIF 用 QSL_RCVD=Y 表示已收到 QSL；
   若同時有 APP_LoTW_RXQSL（LoTW 配對時間）才是真正的 LoTW 電子確認。
   紙卡補登也可能出現 QSL_RCVD=Y，所以兩者都要看。 */
function parseAdif(txt: string): LotwQso[] {
  const out: LotwQso[] = []
  for (const block of txt.split(/<eor>/i)) {
    if (!/<call:/i.test(block)) continue
    const date = field(block, 'QSO_DATE')
    if (date.length < 8) continue

    const qslRcvd = field(block, 'QSL_RCVD').toUpperCase()
    const lotwQslRcvd = (field(block, 'LOTW_QSL_RCVD') || field(block, 'APP_LOTW_QSL_RCVD')).toUpperCase()
    const rxQsl = field(block, 'APP_LoTW_RXQSL')
    const qslDate = field(block, 'QSLRDATE')

    out.push({
      call: field(block, 'CALL').toUpperCase(),
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      time: field(block, 'TIME_ON'),
      band: field(block, 'BAND').toUpperCase(),
      mode: field(block, 'MODE').toUpperCase(),
      qslRcvd,
      lotwQslRcvd,
      rxQsl,
      qslDate: qslDate.length >= 8
        ? `${qslDate.slice(0, 4)}-${qslDate.slice(4, 6)}-${qslDate.slice(6, 8)}`
        : '',
      // 有 QSL_RCVD=Y 才算確認；若只有 LoTW 專用欄位也是確認
      confirmed: qslRcvd === 'Y' || lotwQslRcvd === 'Y',
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

/* 有限併發：一次跑 limit 個工作，避免逐筆等待 */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers: Promise<void>[] = []
  const count = Math.min(limit, items.length)
  for (let w = 0; w < count; w++) {
    workers.push((async () => {
      while (true) {
        const i = next++
        if (i >= items.length) return
        await fn(items[i])
      }
    })())
  }
  await Promise.all(workers)
}

type Row = {
  id: number
  call: string
  date: string
  time: string
  band: string
  mode: string
  status: string
  lotwConfirmed: boolean | null
  lotwDate: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const startedAt = Date.now()
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

    let payload: Record<string, unknown> = {}
    try { payload = await req.json() } catch { /* 沒有 body 也沒關係 */ }
    const debugCall = String(payload?.debugCall ?? '').toUpperCase()

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

    const oldestDate = (oldest && oldest[0] && oldest[0].date) as string | undefined
    const envSince = Deno.env.get('LOTW_SINCE')
    // 取兩者較早的日期，確保每次都抓完整歷史（否則舊確認會被漏掉）
    const since = [envSince, oldestDate]
      .filter((d): d is string => !!d)
      .sort()[0] || '1990-01-01'

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

    const parsed = parseAdif(text)
    const adi = parsed.filter(x => x.confirmed)

    /* ---- 除錯模式：只回傳指定呼號在 LoTW 的原始資料，不寫入資料庫 ---- */
    if (debugCall) {
      const hits = parsed.filter(x => x.call === debugCall)
      return json({
        debug: true,
        since,
        adifTotal: parsed.length,
        confirmedTotal: adi.length,
        call: debugCall,
        hits,
      })
    }

    /* ---- 一次讀出全部紀錄，在記憶體比對（避免 maybeSingle 遇到重複就失敗） ---- */
    const { data: rows, error: dbErr } = await admin
      .from('qsl_records')
      .select('id, call, date, time, band, mode, status, "lotwConfirmed", "lotwDate"')
      .limit(5000)
    if (dbErr) throw dbErr

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

    const matchedIds = new Set<number>()
    const qslDateById = new Map<number, string>()
    const unmatched: LotwQso[] = []
    const unmatchedKeys = new Set<string>()
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

      if (candidates.length === 0) {
        const key = `${a.call}|${a.date}|${normTime(a.time)}|${a.band}`
        if (!unmatchedKeys.has(key)) {
          unmatchedKeys.add(key)
          unmatched.push(a)
        }
        continue
      }

      // 同一時間有多個頻段時，優先用頻段相同的那筆
      const sameBand = candidates.filter(r => r.band.toUpperCase() === a.band)
      const pick = sameBand.length > 0 ? sameBand : candidates

      matched++
      for (const r of pick) {
        matchedIds.add(r.id)
        if (!qslDateById.has(r.id)) qslDateById.set(r.id, a.qslDate)
      }
    }

    /* ---- 批次更新（每批 200 筆、多組並行），避免逐筆 UPDATE 造成幾十秒延遲 ---- */
    const nowDate = new Date().toISOString().slice(0, 10)
    const idsByDate = new Map<string, number[]>()
    for (const id of matchedIds) {
      const d = qslDateById.get(id) || nowDate
      if (!idsByDate.has(d)) idsByDate.set(d, [])
      idsByDate.get(d)!.push(id)
    }

    let updated = 0
    const updateJobs: Array<{ ids: number[]; date: string }> = []
    for (const [d, ids] of idsByDate) {
      for (let i = 0; i < ids.length; i += 200) {
        updateJobs.push({ date: d, ids: ids.slice(i, i + 200) })
      }
    }

    await runPool(updateJobs, 8, async (job) => {
      const { error } = await admin
        .from('qsl_records')
        .update({ lotwConfirmed: true, lotwDate: `${job.date}T00:00:00Z` })
        .in('id', job.ids)
      if (error) throw error
      updated += job.ids.length
    })

    /* ---- LoTW 有確認、網站卻沒有的通聯：自動補進資料庫（狀態維持「未申請」） ----
       只補最近 30 天的通聯，避免使用者刻意刪除的舊紀錄每次同步又被加回來。 */
    let added = 0
    const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const toInsert = unmatched.filter(a => a.date >= recentCutoff)
    const insertedKeys = new Set<string>()
    if (toInsert.length > 0 && payload?.insertMissing !== false) {
      const inserts = toInsert.map(a => {
        insertedKeys.add(`${a.call}|${a.date}|${normTime(a.time)}|${a.band}`)
        return {
          date: a.date,
          time: a.time ? `${a.time.slice(0, 2)}:${a.time.slice(2, 4)}` : '',
          call: a.call,
          band: a.band,
          mode: a.mode,
          note: '',
          requests: [],
          lotwConfirmed: true,
          lotwDate: `${a.qslDate || nowDate}T00:00:00Z`,
        }
      })
      const { data: inserted, error } = await admin
        .from('qsl_records')
        .insert(inserts)
        .select('id')
      if (error) throw error
      added = (inserted ?? []).length
    }
    const notAdded = unmatched.filter(a => !insertedKeys.has(`${a.call}|${a.date}|${normTime(a.time)}|${a.band}`))

    /* ---- 把「以前標過、但這次 LoTW 沒有」的清掉，讓結果跟 LoTW 一致 ---- */
    const clearIds = ((rows ?? []) as Row[])
      .filter(r => r.lotwConfirmed && !matchedIds.has(r.id))
      .map(r => r.id)

    let cleared = 0
    const clearJobs: number[][] = []
    for (let i = 0; i < clearIds.length; i += 200) clearJobs.push(clearIds.slice(i, i + 200))

    await runPool(clearJobs, 8, async (chunk) => {
      const { error } = await admin
        .from('qsl_records')
        .update({ lotwConfirmed: false, lotwDate: null })
        .in('id', chunk)
      if (error) throw error
      cleared += chunk.length
    })

    return json({
      success: true,
      message: `LoTW 已確認 ${adi.length} 筆，對到 ${matched} 筆，標記 ${updated} 筆`
        + (added > 0 ? `，自動新增 ${added} 筆` : '')
        + (cleared > 0 ? `，取消 ${cleared} 筆` : '')
        + (notAdded.length > 0 ? `；另有 ${notAdded.length} 筆在網站找不到（未自動新增）。` : '。'),
      lotw: adi.length,
      matched,
      updated,
      added,
      cleared,
      unmatched: notAdded.map(a => ({
        call: a.call, date: a.date, time: a.time, band: a.band, mode: a.mode,
      })),
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error) {
    return json({ error: (error as Error).message }, 400)
  }
})
