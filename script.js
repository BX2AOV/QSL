/* ============================================================
   script.js - 首頁（總覽）專用邏輯 (精準切換語言版)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let qslRecords = [];
let currentLang = localStorage.getItem('site_lang') || 'zh'; 

// ============================================================
// 🌟 核心：精準點擊哪個語言就切換
// ============================================================
window.changeLang = function(lang) {
    currentLang = lang;
    localStorage.setItem('site_lang', currentLang);
    applyLanguage();
};

function applyLanguage() {
    // 1. 切換文字
    document.querySelectorAll('[data-zh]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}`)) {
            el.textContent = el.getAttribute(`data-${currentLang}`);
        }
    });

    // 2. 切換 Placeholder
    document.querySelectorAll('[data-zh-placeholder]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}-placeholder`)) {
            el.placeholder = el.getAttribute(`data-${currentLang}-placeholder`);
        }
    });

    // 3. 驅動滑塊位置
    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.setAttribute('data-active', currentLang);

    // 4. 更新 HTML lang
    const langMap = { zh: 'zh-Hant', cn: 'zh-Hans', en: 'en', ja: 'ja' };
    document.documentElement.lang = langMap[currentLang] || 'zh-Hant';

    // 5. 如果資料已載入，重新渲染表格
    if (qslRecords.length > 0) renderMainTable();
}

function computeQslStatus(r) {
    const t = {
        zh: { none: '未申請', pending: '待處理', paper: '已收到紙卡', eqsl: '已收到電子卡', sent: '已發出紙卡', completed: '已交換完成', not_needed: '無需換卡', both: '雙向完成', rcvd: '已收到', snt: '已發出' },
        cn: { none: '未申请', pending: '待处理', paper: '已收到纸卡', eqsl: '已收到电子卡', sent: '已发出纸卡', completed: '已交换完成', not_needed: '无需换卡', both: '双向完成', rcvd: '已收到', snt: '已发出' },
        en: { none: 'Not Requested', pending: 'Pending', paper: 'Paper QSL Rcvd', eqsl: 'eQSL Rcvd', sent: 'Paper QSL Sent', completed: 'Completed', not_needed: 'No QSL Needed', both: 'Both Completed', rcvd: 'Received', snt: 'Sent' },
        ja: { none: '未申請', pending: '処理待ち', paper: '紙QSL受取済', eqsl: 'eQSL受取済', sent: '紙QSL発送済', completed: '交換完了', not_needed: 'QSL不要', both: '双方完了', rcvd: '受取済', snt: '発送済' }
    };
    const lang = currentLang;

    if (r.status === 'completed') return { cls: 'badge-completed-dark', text: t[lang].completed };
    if (r.status === 'received_eqsl') return { cls: 'badge-received', text: t[lang].eqsl };
    if (r.status === 'not_needed') return { cls: 'badge-not-needed', text: t[lang].not_needed }; 
    if (r.status === 'received_paper') return { cls: 'badge-received', text: t[lang].paper };
    if (r.status === 'sent') return { cls: 'badge-sent', text: t[lang].sent };
    if (r.status === 'pending') return { cls: 'badge-pending', text: t[lang].pending };

    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: t[lang].both };
    if (r.receivedImg) return { cls: 'badge-received', text: t[lang].rcvd };
    if (r.sentImg) return { cls: 'badge-sent', text: t[lang].snt };
    
    if (r.requests && r.requests.length > 0) return { cls: 'badge-pending', text: t[lang].pending };
    
    return { cls: 'badge-none', text: t[lang].none };
}

function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function openLightbox(src) {
    if (!src) return;
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() {
    document.getElementById('lightbox').classList.remove('show');
    document.getElementById('lightboxImg').src = '';
}

async function fetchData() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    const emptyText = { zh: '⏳ 資料載入中...', cn: '⏳ 数据载入中...', en: '⏳ Loading data...', ja: '⏳ データ読み込み中...' };
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText[currentLang]}</div></td></tr>`;

    const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false }).order('time', { ascending: false });

    if (error) { 
        const errText = { zh: '資料載入失敗', cn: '数据载入失败', en: 'Data load failed', ja: 'データの読み込みに失敗しました' };
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${errText[currentLang]}</div></td></tr>`;
        return; 
    }

    qslRecords = data.map(r => { if (!r.requests) r.requests = []; return r; });
    renderMainTable();
}

function renderMainTable() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        const emptyText = { zh: '📭 目前沒有通聯紀錄', cn: '📭 目前没有通联记录', en: '📭 No QSO records found', ja: '📭 交信記録がありません' };
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText[currentLang]}</div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = qslRecords.map(r => {
        const st = computeQslStatus(r);
        const recvImg = r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" onclick="openLightbox('${r.receivedImg}')">` : '<div class="qsl-thumb-empty">—</div>';
        const sentImg = r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" onclick="openLightbox('${r.sentImg}')">` : '<div class="qsl-thumb-empty">—</div>';
        
        let displayBand = r.band;
        let displayMode = r.mode;
        let displayNote = r.note || '—';
        let displayTime = r.time || '—';

        if (r.note) {
            const timeMatch = r.note.match(/\[([0-9]{2}:[0-9]{2})\]/);
            if (timeMatch && timeMatch[1]) {
                if (!r.time || r.time === '—') displayTime = timeMatch[1];
                displayNote = displayNote.replace(/\[([0-9]{2}:[0-9]{2})\]\s*/, '');
            }

            const satMatch = r.note.match(/^\[(.*?)\]/);
            if (satMatch && satMatch[1] && !satMatch[1].includes(':')) {
                displayBand = satMatch[1]; 
                displayMode = 'SAT';       
                displayNote = displayNote.replace(/^\[.*?\]\s*/, '');
            }
            
            const satText = { zh: '衛星通聯', cn: '卫星通联', en: 'SAT QSO', ja: '衛星交信' };
            displayNote = displayNote.replace('衛星通聯', satText[currentLang]).trim() || '—';
        }

        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(displayTime)}</strong></td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td><strong style="color:#0066cc;">${escapeHtml(displayBand)}</strong></td>
            <td><span style="font-weight:bold; color:#7b3fa0;">${escapeHtml(displayMode)}</span></td>
            <td>${recvImg}</td>
            <td>${sentImg}</td>
            <td><span class="${st.cls}">${st.text}</span></td>
            <td>${escapeHtml(displayNote)}</td>
        </tr>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('qsoTableBody')) return;

    applyLanguage();

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    fetchData();
});