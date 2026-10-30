/* ============================================================
   api.js — 公開頁專用的極簡 Supabase REST 客戶端
   只做兩件事：讀資料表 / 呼叫 RPC。
   公開頁不需要 Auth、Storage、Realtime，因此不必載入 213 KB 的 supabase-js。
   （管理後台 manage.html 仍然使用完整的 supabase-js）
   ============================================================ */
window.SB = (function () {
    const URL = 'https://btcsstbtbnejuyexwbpn.supabase.co/rest/v1/';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';

    async function call(path, options) {
        const res = await fetch(URL + path, Object.assign({}, options, {
            headers: Object.assign({
                apikey: KEY,
                Authorization: 'Bearer ' + KEY,
                'Content-Type': 'application/json'
            }, (options && options.headers) || {})
        }));

        const text = await res.text();
        let data = null;
        if (text) {
            try { data = JSON.parse(text); } catch (_) { data = text; }
        }

        if (!res.ok) {
            // 讓呼叫端能沿用 supabase-js 的 error 形狀（message / hint / details / code）
            const err = new Error((data && (data.message || data.hint)) || ('HTTP ' + res.status));
            err.status = res.status;
            if (data && typeof data === 'object') {
                err.code = data.code;
                err.details = data.details;
                err.hint = data.hint;
            }
            throw err;
        }
        return data;
    }

    return {
        /* SB.select('qsl_public', 'select=id,call&order=date.desc') */
        select: function (table, query) {
            return call(table + (query ? '?' + query : ''), { method: 'GET' });
        },
        /* SB.rpc('my_qsl_requests', { p_user_call: 'BX2AOV' }) */
        rpc: function (fn, args) {
            return call('rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
        }
    };
})();
