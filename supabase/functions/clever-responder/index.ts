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

// 從 JWT 取出 payload（不驗簽，驗簽由 Supabase Gateway 的 verify_jwt 負責）
function decodeJwt(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ---- 鑑權：只允許「已登入的使用者」，anon key 一律拒絕 ----
  // 沒有這段的話，任何人拿網頁裡公開的 anon key 就能無限觸發這個函式。
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'unauthorized' }, 401)
  }

  const payload = decodeJwt(token)
  const nowSec = Math.floor(Date.now() / 1000)
  const isExpired = typeof payload?.exp === 'number' && payload.exp < nowSec

  if (!payload || payload.role !== 'authenticated' || isExpired) {
    return json({ error: 'forbidden' }, 403)
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 計算 30 天前的時間
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateLimit = thirtyDaysAgo.toISOString()

    // 找出「狀態為 completed」且「完成時間小於 30 天前」的紀錄
    const { data: oldRecords, error: fetchError } = await supabaseClient
      .from('qsl_records')
      .select('id, receivedImg, sentImg')
      .eq('status', 'completed')
      .lt('completedDate', dateLimit)
      .or('receivedImg.not.is.null,sentImg.not.is.null')

    if (fetchError) throw fetchError

    let deletedCount = 0
    const filesToRemove: string[] = []

    // 收集要從 Storage 刪除的檔案路徑，並清空資料庫網址
    for (const record of oldRecords ?? []) {
      if (record.receivedImg) {
        const fileName = record.receivedImg.split('/').pop()
        if (fileName) filesToRemove.push(fileName)
      }
      if (record.sentImg) {
        const fileName = record.sentImg.split('/').pop()
        if (fileName) filesToRemove.push(fileName)
      }

      await supabaseClient
        .from('qsl_records')
        .update({ receivedImg: null, sentImg: null })
        .eq('id', record.id)

      deletedCount++
    }

    // 從 Storage 刪除實體檔案
    if (filesToRemove.length > 0) {
      const { error: storageError } = await supabaseClient
        .storage
        .from('qsl-images')
        .remove(filesToRemove)

      if (storageError) console.error("Storage 刪除失敗:", storageError)
    }

    return json({
      success: true,
      message: `已清理 ${deletedCount} 筆過期紀錄的圖片。`,
    })
  } catch (error) {
    console.error("clever-responder error:", error)
    return json({ error: 'internal error' }, 400)
  }
})
