/* ============================================================
   script.js - 首頁（總覽）專用邏輯 (包含搜尋與多語系分頁)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let qslRecords = [];
let filteredRecords = []; 
let currentLang = localStorage.getItem('site_lang') || 'zh'; 

// 🌟 分頁專用變數
let currentPage = 1;
const itemsPerPage = 10;

// ============================================================
// 語言切換核心邏輯
// ============================================================
window.changeLang = function(lang) {
    currentLang = lang;
    localStorage.setItem('site_lang', currentLang);
    applyLanguage();
    // 🌟 切換語言時，如果已經有表格，重新渲染以更新分頁文字
    if (qslRecords.length > 0) renderMainTable();
};

function applyLanguage() {
    document.querySelectorAll('[data-zh]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}`)) {
            el.textContent = el.getAttribute(`data-${currentLang}`);
        }
    });

    document.querySelectorAll('[data-zh-placeholder]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}-placeholder`)) {
            el.placeholder = el.getAttribute(`data-${currentLang}-placeholder`);
        }
    });

    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.setAttribute('data-active', currentLang);

    const langMap = { zh: 'zh-Hant', cn: 'zh-Hans', en: 'en', ja: 'ja' };
    document.documentElement.lang = langMap[currentLang] || 'zh-Hant';
}

// ============================================================
// 狀態判斷與翻譯
// ============================================================
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

// ============================================================
// 取得資料與渲染
// ============================================================
async function fetchData() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    const emptyText = { zh: '⏳ 資料載入中...', cn: '⏳ 数据载入中...', en: '⏳ Loading data...', ja: '⏳ データ読み込み中...' };
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText[currentLang]}</div></td></tr>`;

    _supabase.functions.invoke('clever-responder').then(({ data, error }) => {
        if (data && data.success && data.message !== '已清理 0 筆過期紀錄的圖片。') {
            console.log("🧹 背景清理通知：", data.message);
        }
    });

    const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false }).order('time', { ascending: false });

    if (error) { 
        const errText = { zh: '資料載入失敗', cn: '数据载入失败', en: 'Data load failed', ja: 'データの読み込みに失敗しました' };
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${errText[currentLang]}</div></td></tr>`;
        return; 
    }

    qslRecords = data.map(r => { if (!r.requests) r.requests = []; return r; });
    filteredRecords = [...qslRecords]; 
    currentPage = 1;
    renderMainTable();
}

function renderMainTable() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    const recordsToShow = filteredRecords.filter(r => r.status !== 'not_needed');

    if (recordsToShow.length === 0) {
        const emptyText = { zh: '📭 目前沒有通聯紀錄', cn: '📭 目前没有通联记录', en: '📭 No QSO records found', ja: '📭 交信記録がありません' };
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText[currentLang]}</div></td></tr>`;
        updatePagination(0, 1); 
        return;
    }

    const totalPages = Math.ceil(recordsToShow.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRecords = recordsToShow.slice(startIndex, endIndex);

    tbody.innerHTML = paginatedRecords.map(r => {
        const st = computeQslStatus(r);
        
        const recvImg = r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" onclick="openLightbox('${r.receivedImg}')">` : '';
        const sentImg = r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" onclick="openLightbox('${r.sentImg}')">` : '';
        
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
            } else {
                const freqMatch = r.note.match(/FREQ:([\d.]+)/);
                if (freqMatch && freqMatch[1]) {
                    displayBand = freqMatch[1]; 
                }
            }
            
            const satText = { zh: '衛星通聯', cn: '卫星通联', en: 'SAT QSO', ja: '衛星通信' };
            displayNote = displayNote.replace('衛星通聯', satText[currentLang]).trim() || '—';
            displayNote = displayNote.replace('[LoTW]', 'LoTW ');
            displayNote = displayNote.replace(/FREQ:[\d.]+\s*/, ''); 
        }

        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(displayTime)}</strong></td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td><strong style="color:#0066cc;">${escapeHtml(displayBand)}</strong></td>
            <td><span style="font-weight:bold; color:#7b3fa0;">${escapeHtml(displayMode)}</span></td>
            <td style="text-align:center;">${recvImg}</td>
            <td style="text-align:center;">${sentImg}</td>
            <td><span class="${st.cls}">${st.text}</span></td>
            <td>${escapeHtml(displayNote)}</td>
        </tr>`;
    }).join('');

    updatePagination(recordsToShow.length, totalPages);
}

// 🌟 動態生成多語系分頁按鈕
function updatePagination(totalItems, totalPages) {
    let paginationContainer = document.getElementById('paginationContainer');
    
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginationContainer';
        paginationContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px;';
        
        const tableWrapper = document.querySelector('.table-wrapper');
        if (tableWrapper) {
            tableWrapper.parentNode.insertBefore(paginationContainer, tableWrapper.nextSibling);
        }
    }

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    const btnStyle = 'padding: 8px 16px; border-radius: 40px; border: 1px solid #cbdae8; background: #fff; color: #1f3a5f; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: 0.2s;';
    const disabledStyle = 'opacity: 0.5; cursor: not-allowed;';

    // 🌟 分頁多語系字典
    const paginationText = {
        zh: { prev: '上一頁', next: '下一頁', page: '頁' },
        cn: { prev: '上一页', next: '下一页', page: '页' },
        en: { prev: 'Prev', next: 'Next', page: 'Page' },
        ja: { prev: '前へ', next: '次へ', page: 'ページ' }
    };
    const t = paginationText[currentLang] || paginationText['zh'];

    paginationContainer.innerHTML = `
        <button id="btnPrevPage" style="${btnStyle} ${currentPage === 1 ? disabledStyle : ''}" ${currentPage === 1 ? 'disabled' : ''}>${t.prev}</button>
        <span style="font-size: 0.9rem; color: #5a6e85; font-weight: bold;">${t.page} ${currentPage} / ${totalPages}</span>
        <button id="btnNextPage" style="${btnStyle} ${currentPage === totalPages ? disabledStyle : ''}" ${currentPage === totalPages ? 'disabled' : ''}>${t.next}</button>
    `;

    document.getElementById('btnPrevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderMainTable();
            document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
        }
    });

    document.getElementById('btnNextPage').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderMainTable();
            document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('qsoTableBody')) return;

    applyLanguage();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const keyword = this.value.trim().toUpperCase();
            if (!keyword) {
                filteredRecords = [...qslRecords];
            } else {
                filteredRecords = qslRecords.filter(r => r.call.includes(keyword));
            }
            currentPage = 1;
            renderMainTable();
        });
    }

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    fetchData();
});
