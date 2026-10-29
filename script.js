/* ============================================================
   script.js - 首頁（總覽）專用邏輯
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let qslRecords = [];

// 共用工具
function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(!t) return; 
    t.textContent = msg; t.classList.add('show'); 
    clearTimeout(window.tt); 
    window.tt = setTimeout(() => t.classList.remove('show'), 2500); 
}
function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

// 計算 QSL 狀態
function computeQslStatus(r) {
    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: '雙向完成' };
    if (r.receivedImg) return { cls: 'badge-received', text: '已收到' };
    if (r.sentImg) return { cls: 'badge-sent', text: '已發出' };
    if (r.requests && r.requests.length > 0) return { cls: 'badge-pending', text: '待處理' };
    return { cls: 'badge-none', text: '未申請' };
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

// 從資料庫獲取資料
async function fetchData() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">⏳ 資料載入中...</div></td></tr>`;

    // 依照日期排序
    const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false });

    if (error) { 
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">資料載入失敗</div></td></tr>`;
        return; 
    }

    qslRecords = data.map(r => { if (!r.requests) r.requests = []; return r; });
    renderMainTable();
}

// 渲染首頁表格
function renderMainTable() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">📭 目前沒有通聯紀錄</div></td></tr>`;
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

        // 🔍 智慧判斷區：如果資料庫沒有獨立時間，就去備註裡面撈
        if (r.note) {
            // 1. 抓取備註裡的時間格式，例如 [15:10]
            const timeMatch = r.note.match(/\[([0-9]{2}:[0-9]{2})\]/);
            if (timeMatch && timeMatch[1]) {
                // 如果 time 欄位是空的，就借用抓到的時間
                if (!r.time || r.time === '—') displayTime = timeMatch[1];
                // 從備註字串中把時間刪掉，保持畫面乾淨
                displayNote = displayNote.replace(/\[([0-9]{2}:[0-9]{2})\]\s*/, '');
            }

            // 2. 抓取備註裡的衛星名稱，例如 [ARISS]
            const satMatch = r.note.match(/^\[(.*?)\]/);
            // 避免抓錯（確認括號裡不是時間格式）
            if (satMatch && satMatch[1] && !satMatch[1].includes(':')) {
                displayBand = satMatch[1]; 
                displayMode = 'SAT';       
                displayNote = displayNote.replace(/^\[.*?\]\s*/, '');
            }
            
            // 清理備註裡多餘的空白或字眼
            displayNote = displayNote.replace('衛星通聯', '').trim() || '—';
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('qsoTableBody')) return;

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    fetchData();
});