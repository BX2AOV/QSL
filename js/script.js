/* ============================================================
   script.js - 首頁（總覽）專用邏輯 (包含搜尋與多語系分頁)
   資料存取走 api.js 的 SB（不載入 supabase-js）
   ============================================================ */

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
    // 切換語言時，如果已經有表格，重新渲染以更新分頁文字
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
    if (toggle) {
        toggle.setAttribute('data-active', currentLang);
        toggle.querySelectorAll('.lang-option').forEach(opt => {
            const isActive = opt.dataset.lang === currentLang;
            opt.setAttribute('role', 'radio');
            opt.setAttribute('aria-checked', isActive ? 'true' : 'false');
            opt.tabIndex = isActive ? 0 : -1;
        });
    }

    const langMap = { zh: 'zh-Hant', cn: 'zh-Hans', en: 'en', ja: 'ja' };
    document.documentElement.lang = langMap[currentLang] || 'zh-Hant';
}

// ============================================================
// 轉義工具（兩種上下文分工）
// ============================================================
// 文字上下文：轉義 & < >（現有邏輯保留）
function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

// 屬性上下文：額外轉義引號，防屬性逃逸（C-2 修復核心）
function escAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 列表用縮圖：上傳時會額外存一份 *_thumb.jpg（寬 160px）
// 舊圖沒有縮圖時，靠 error 事件退回原圖
function thumbOf(url) {
    if (!url) return '';
    return /\.(jpe?g|png)$/i.test(url) ? url.replace(/\.(jpe?g|png)$/i, '_thumb.jpg') : url;
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
    
    // H-1 連動：公開視圖不再回傳 requests 陣列，改用 has_requests 布林值
    if (r.has_requests) return { cls: 'badge-pending', text: t[lang].pending };
    
    return { cls: 'badge-none', text: t[lang].none };
}

let lastFocusedThumb = null;

function openLightbox(src) {
    if (!src) return;
    lastFocusedThumb = document.activeElement;
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('show');
    const closeBtn = document.getElementById('lightboxClose');
    if (closeBtn) closeBtn.focus();
}
function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (!lb || !lb.classList.contains('show')) return;
    lb.classList.remove('show');
    document.getElementById('lightboxImg').src = '';
    if (lastFocusedThumb && typeof lastFocusedThumb.focus === 'function') lastFocusedThumb.focus();
    lastFocusedThumb = null;
}

// ============================================================
// 取得資料與渲染
// ============================================================
async function fetchData() {
    const tbody = document.getElementById('qsoTableBody');
    if (!tbody) return;

    const emptyText = { zh: '⏳ 資料載入中...', cn: '⏳ 数据载入中...', en: '⏳ Loading data...', ja: '⏳ データ読み込み中...' };
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${emptyText[currentLang]}</div></td></tr>`;

    // 資安：原本每次開首頁都會呼叫 clever-responder（無鑑權的邊緣函式），
    // 任何人只要狂刷首頁就能無限觸發。已移到管理後台登入後才執行。

    // H-1 修復：改讀公開視圖，requests 欄位根本不下發
    const fields = 'id,date,time,call,band,mode,note,receivedImg,sentImg,status,has_requests';
    let data = null;
    try {
        data = await SB.select('qsl_public', 'select=' + fields + '&order=date.desc,time.desc');
    } catch (error) {
        const errText = { zh: '資料載入失敗', cn: '数据载入失败', en: 'Data load failed', ja: 'データの読み込みに失敗しました' };
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${errText[currentLang]}</div></td></tr>`;
        console.error('載入通聯紀錄失敗:', error);
        return;
    }

    // qsl_public 已不含 requests，不需再補空陣列
    qslRecords = data || [];
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
        
        // C-2 修復：屬性值用 escAttr 轉義；移除內聯 onclick，改 data-src 由事件委託處理
        const recvImg = r.receivedImg 
            ? `<img src="${escAttr(thumbOf(r.receivedImg))}" data-src="${escAttr(r.receivedImg)}" class="qsl-thumb" alt="收到的 QSL 卡" loading="lazy" decoding="async" width="40" height="28" tabindex="0" role="button" aria-label="放大檢視收到的 QSL 卡">` 
            : '';
        const sentImg = r.sentImg 
            ? `<img src="${escAttr(thumbOf(r.sentImg))}" data-src="${escAttr(r.sentImg)}" class="qsl-thumb" alt="發出的 QSL 卡" loading="lazy" decoding="async" width="40" height="28" tabindex="0" role="button" aria-label="放大檢視發出的 QSL 卡">` 
            : '';
        
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

    // C-2 配套：語言切換改事件委託（index.html 已移除內聯 onclick）
    document.getElementById('langToggle')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.lang-option');
        if (!opt) return;
        const lang = opt.dataset.lang;
        if (lang && typeof changeLang === 'function') changeLang(lang);
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const keyword = this.value.trim().toUpperCase();
            if (!keyword) {
                filteredRecords = [...qslRecords];
            } else {
                // L-2 修復：call 為 null 時不拋錯
                filteredRecords = qslRecords.filter(r => (r.call || '').toUpperCase().includes(keyword));
            }
            currentPage = 1;
            renderMainTable();
        });
    }

    // C-2 配套：圖片燈箱改事件委託（原本是內聯 onclick）
    document.getElementById('qsoTableBody')?.addEventListener('click', (e) => {
        const img = e.target.closest('.qsl-thumb');
        if (!img) return;
        const src = img.dataset.src || img.getAttribute('src');
        if (src) openLightbox(src);
    });

    // 縮圖載入失敗（舊圖沒有 _thumb 檔）就退回原圖
    document.getElementById('qsoTableBody')?.addEventListener('error', (e) => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || img.dataset.thumbFallback === '1') return;
        const full = img.dataset.src;
        if (full && img.getAttribute('src') !== full) {
            img.dataset.thumbFallback = '1';
            img.src = full;
        }
    }, true);

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });

    // 鍵盤操作：縮圖以 Enter / Space 開啟燈箱
    document.getElementById('qsoTableBody')?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const img = e.target.closest('.qsl-thumb');
        if (!img) return;
        e.preventDefault();
        const src = img.dataset.src || img.getAttribute('src');
        if (src) openLightbox(src);
    });

    // 鍵盤操作：語言切換（Enter / Space 選擇，左右鍵切換）
    document.getElementById('langToggle')?.addEventListener('keydown', (e) => {
        const opt = e.target.closest('.lang-option');
        if (!opt) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            changeLang(opt.dataset.lang);
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const opts = [...document.querySelectorAll('#langToggle .lang-option')];
            const idx = opts.indexOf(opt);
            if (idx < 0) return;
            const next = opts[(idx + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length];
            next.focus();
            changeLang(next.dataset.lang);
        }
    });

    fetchData();
});
