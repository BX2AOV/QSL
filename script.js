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

    // 依照日期和時間排序
    const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false }).order('time', { ascending: false });

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
        
        // 預設顯示資料庫的原始內容
        let displayBand = r.band;
        let displayMode = r.mode;
        let displayNote = r.note || '—';
        let displayTime = r.time || '—'; // 抓取獨立的時間欄位

        // 如果資料庫的備註欄位還有殘留的 [ARISS] 等字眼，自動替換頻段與模式
        if (r.note) {
            const satMatch = r.note.match(/^\[(.*?)\]/);
            if (satMatch && satMatch[1]) {
                displayBand = satMatch[1];
                displayMode = 'SAT';
                displayNote = r.note.replace(/^\[.*?\]\s*/, '') || '—';
            }
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