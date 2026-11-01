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

type Mail = { to: string; subject: string; html: string; text: string }

type Provider = {
  name: string
  send: (mail: Mail) => Promise<void>
}

/* 寄信供應商：依序嘗試，前一家失敗（額度用完、金鑰失效、5xx）就換下一家。
   目前只有 Resend；之後在 Secrets 加上 BREVO_API_KEY 就會自動啟用 Brevo。 */
function buildProviders(): Provider[] {
  const list: Provider[] = []

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (resendKey) {
    list.push({
      name: 'resend',
      send: async (mail) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('MAIL_FROM') || 'BX2AOV QSL <no-reply@bx2aov.top>',
            to: [mail.to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            reply_to: Deno.env.get('MAIL_REPLY_TO') || undefined,
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          const err = new Error(`resend ${res.status}: ${body.slice(0, 200)}`)
          ;(err as Error & { status?: number }).status = res.status
          throw err
        }
      },
    })
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (brevoKey) {
    list.push({
      name: 'brevo',
      send: async (mail) => {
        const from = Deno.env.get('MAIL_FROM') || 'BX2AOV QSL <no-reply@bx2aov.top>'
        const m = from.match(/^(.*)<(.+)>$/)
        const sender = m
          ? { name: m[1].trim() || 'BX2AOV QSL', email: m[2].trim() }
          : { name: 'BX2AOV QSL', email: from.trim() }

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender,
            to: [{ email: mail.to }],
            replyTo: Deno.env.get('MAIL_REPLY_TO') ? { email: Deno.env.get('MAIL_REPLY_TO')! } : undefined,
            subject: mail.subject,
            htmlContent: mail.html,
            textContent: mail.text,
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          const err = new Error(`brevo ${res.status}: ${body.slice(0, 200)}`)
          ;(err as Error & { status?: number }).status = res.status
          throw err
        }
      },
    })
  }

  return list
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
}

function buildMail(opts: {
  call: string
  date: string
  time: string
  band: string
  mode: string
  req: Record<string, unknown>
}): Mail {
  const { call, date, time, band, mode, req } = opts
  const name = String(req.shipName ?? '')
  const addr = `${String(req.shipZip ?? '')} ${String(req.shipAddress ?? '')}`.trim()
  const reqDate = String(req.requestDate ?? '')
  const note = String(req.shipNote ?? '')

  const subject = `已收到你的 QSL 換卡申請 — ${call}`
  const text = [
    `${name} 你好，`,
    '',
    `我們已收到你對 ${call} 的 QSL 換卡申請。`,
    '',
    `通聯日期：${date} ${time || ''} UTC`,
    `頻段／模式：${band} / ${mode}`,
    `收件地址：${addr}`,
    note ? `備註：${note}` : '',
    '',
    `申請日期：${reqDate}`,
    '',
    '卡片寄出後會再更新狀態，你也可以回到網站「我的申請」查看。',
    `BX2AOV QSL confirm — https://bx2aov.top/apply?call=${encodeURIComponent(call)}`,
  ].filter((l) => l !== '').join('\n')

  const html = `<!doctype html>
<html lang="zh-Hant"><body style="margin:0;padding:24px;background:#eef3f9;font-family:'Segoe UI',Roboto,'Noto Sans TC',sans-serif;color:#2b4056;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 26px;border:1px solid #dbe7f3;">
    <h2 style="margin:0 0 6px;font-size:1.2rem;color:#0b2a4a;">已收到你的 QSL 換卡申請</h2>
    <p style="margin:0 0 18px;color:#5a6e85;font-size:.92rem;">BX2AOV QSL confirm</p>
    <p style="margin:0 0 16px;">${escapeHtml(name)} 你好，</p>
    <p style="margin:0 0 16px;">我們已收到你對 <strong>${escapeHtml(call)}</strong> 的換卡申請，資料如下：</p>
    <table style="width:100%;border-collapse:collapse;font-size:.92rem;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#5a6e85;width:96px;">通聯日期</td><td style="padding:6px 0;">${escapeHtml(date)} ${escapeHtml(time || '')} UTC</td></tr>
      <tr><td style="padding:6px 0;color:#5a6e85;">頻段／模式</td><td style="padding:6px 0;">${escapeHtml(band)} / ${escapeHtml(mode)}</td></tr>
      <tr><td style="padding:6px 0;color:#5a6e85;">收件地址</td><td style="padding:6px 0;">${escapeHtml(addr)}</td></tr>
      ${note ? `<tr><td style="padding:6px 0;color:#5a6e85;">備註</td><td style="padding:6px 0;">${escapeHtml(note)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#5a6e85;">申請日期</td><td style="padding:6px 0;">${escapeHtml(reqDate)}</td></tr>
    </table>
    <p style="margin:0 0 18px;color:#5a6e85;font-size:.9rem;">卡片寄出後會更新狀態，你也可以回到網站「我的申請」查看。</p>
    <a href="https://bx2aov.top/apply?call=${encodeURIComponent(call)}" style="display:inline-block;background:#0b2a4a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:40px;font-weight:600;font-size:.9rem;">查看我的申請</a>
    <p style="margin:20px 0 0;color:#93a4bf;font-size:.8rem;">這封是系統自動寄出的通知信，請勿直接回覆。</p>
  </div>
</body></html>`

  return { to: String(req.shipEmail ?? ''), subject, html, text }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceKey)

    let payload: Record<string, unknown> = {}
    try { payload = await req.json() } catch { /* ignore */ }

    const recordId = Number(payload?.recordId)
    if (!recordId) return json({ error: '缺少 recordId' }, 400)

    const { data: rec, error } = await admin
      .from('qsl_records')
      .select('id, call, date, time, band, mode, requests')
      .eq('id', recordId)
      .single()

    if (error || !rec) return json({ error: '找不到通聯紀錄' }, 404)

    const requests: Record<string, unknown>[] = Array.isArray(rec.requests) ? rec.requests : []

    // 找「最新一筆、有 email、還沒寄過、狀態 pending」的申請
    let idx = -1
    for (let i = requests.length - 1; i >= 0; i--) {
      const r = requests[i]
      if (!r || !r.shipEmail) continue
      if (r.mailSentAt) continue
      if (r.status !== 'pending') continue
      idx = i
      break
    }
    if (idx < 0) return json({ ok: true, skipped: '沒有需要寄信的申請' })

    const reqObj = requests[idx]
    const email = String(reqObj.shipEmail || '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'Email 格式不正確' }, 400)
    }

    const providers = buildProviders()
    if (providers.length === 0) {
      return json({ error: '沒有設定任何寄信服務（缺少 RESEND_API_KEY）' }, 500)
    }

    const mail = buildMail({
      call: rec.call, date: rec.date, time: rec.time || '',
      band: rec.band, mode: rec.mode, req: reqObj,
    })

    let sentProvider = ''
    const failures: string[] = []
    for (const p of providers) {
      try {
        await p.send(mail)
        sentProvider = p.name
        break
      } catch (e) {
        failures.push(`${p.name}: ${(e as Error).message}`)
      }
    }

    if (!sentProvider) {
      // 寄不出去也不要讓前端卡住，記錄失敗原因
      requests[idx] = { ...reqObj, mailError: failures.join(' | ').slice(0, 400), mailAttemptAt: new Date().toISOString() }
      await admin.from('qsl_records').update({ requests }).eq('id', recordId)
      return json({ error: '寄信失敗', details: failures }, 502)
    }

    requests[idx] = {
      ...reqObj,
      mailSentAt: new Date().toISOString(),
      mailProvider: sentProvider,
      mailError: null,
    }
    const { error: upErr } = await admin.from('qsl_records').update({ requests }).eq('id', recordId)
    if (upErr) return json({ ok: true, warning: '已寄出但標記失敗：' + upErr.message, provider: sentProvider })

    return json({ ok: true, provider: sentProvider, to: email })
  } catch (error) {
    return json({ error: (error as Error).message }, 400)
  }
})
