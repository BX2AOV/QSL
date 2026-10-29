/* ============================================================
   script.js - 首頁（總覽）專用邏輯 (包含中英切換與完整顯示)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let qslRecords = [];
let currentLang = localStorage.getItem('site_lang') || 'zh'; // 預設中文

// ============================================================
// 語言切換核心邏輯
// ============================================================
function applyLanguage() {
    // 1. 切換所有有 data-zh 與 data-en 的元素文字
    document.querySelectorAll('[data-zh]').forEach(el => {
        if (currentLang === 'en') {
            el.textContent = el.getAttribute('data-en');
        } else {
            el.textContent = el.getAttribute('data-zh');
        }
    });

    // 2. 讓滑動開關的白色滑塊移動到正確位置
    const toggle = document.getElementById('langToggle');
    if (toggle) {
        toggle.setAttribute('data-active', currentLang);
    }

    // 3. 更新 HTML 的 lang 屬性
    document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-Hant';

    // 4. 重新渲染表格，讓狀態標籤與備註也跟著切換語言
    if (qslRecords.length > 0) renderMainTable();
}

// 綁定滑動開關的點擊事件
document.getElementById('langToggle')?.addEventListener('click', () => {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('site_lang', currentLang);
    applyLanguage();
});

// ============================================================
// 共用工具與狀態判斷
// ============================================================
function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function computeQslStatus(r) {
    // 狀態翻譯字典
    const t = {
        zh: { none: '未申請', pending: '待處理', paper: '已收到紙卡', eqsl: '已收到電子卡', sent: '已發出紙卡', completed: '已交換完成', not_needed: '無需換卡', both: '雙向完成', rcvd: '已收到', snt: '已發出' },
        en: { none: 'Not Requested', pending: 'Pending', paper: 'Paper QSL Rcvd', eqsl: 'eQSL Rcvd', sent: 'Paper QSL Sent', completed: 'Completed', not_needed: 'No QSL Needed', both: 'Both Completed', rcvd: 'Received', snt: 'Sent' }
    };
    const lang = currentLang;

    // 優先顯示管理員手動設定的狀態
    if (r.status === 'completed') return { cls: 'badge-completed-dark', text: t[lang].completed };
    if (r.status === 'received_eqsl') return { cls: 'badge-received', text: t[lang].eqsl };
    if (r.status === 'not_needed') return { cls: 'badge-not-needed', text: t[lang].not_needed }; 
    if (r.status === 'received_paper') return { cls: 'badge-received', text: t[lang].paper };
    if (r.status === 'sent') return { cls: 'badge-sent', text: t[lang].sent };
    if (r.status === 'pending') return { cls: 'badge-pending', text: t[lang].pending };

    // 如果沒有手動狀態，判斷圖片與申請
    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: t[lang].both };
    if (r.receivedImg) return { cls: 'badge-received', text: t[lang].rcvd };
    if (r.sentImg) return { cls: 'badge-sent', text: t[lang].snt };
    
    if (r.requests && r.requests.length > 0) return { cls: 'badge-pending', text: t[lang].pending };
    
    return { cls: 'badge-none', text: t[lang].none };
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

// ============================================================
// 取得資料與渲染表格
// ============================================================
async function fetchData() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    const emptyText = currentLang === 'en' ? '⏳ Loading data...' : '⏳ 資料載入中...';
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText}</div></td></tr>`;

    const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false }).order('time', { ascending: false });

    if (error) { 
        const errText = currentLang === 'en' ? 'Data load failed' : '資料載入失敗';
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${errText}</div></td></tr>`;
        return; 
    }

    qslRecords = data.map(r => { if (!r.requests) r.requests = []; return r; });
    renderMainTable();
}

function renderMainTable() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        const emptyText = currentLang === 'en' ? '📭 No QSO records found' : '📭 目前沒有通聯紀錄';
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText}</div></td></tr>`;
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

        // 解析備註中的衛星與時間資訊
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
            // 翻譯備註裡的「衛星通聯」
            displayNote = displayNote.replace('衛星通聯', currentLang === 'en' ? 'SAT QSO' : '衛星通聯').trim() || '—';
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

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('qsoTableBody')) return;

    // 先套用語言設定（包含初始化滑動開關的位置）
    applyLanguage();

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    // 抓取資料
    fetchData();
});