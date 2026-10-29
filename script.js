/* ============================================================
   BX2AOV QSL confirm - 互動範例
   資料只存在記憶體，重新整理即重置
   ============================================================ */

// ---------- 示範資料（記憶體） ----------
const demoRecords = [
    { id: 1, date: '2025-01-10', call: 'BM2ABC', band: '20m', mode: 'SSB', note: '等待回卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 2, date: '2025-01-12', call: 'JP1XYZ', band: '15m', mode: 'FT8', note: '已收到紙卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 3, date: '2025-01-15', call: 'VK3DEF', band: '40m', mode: 'CW', note: '已寄出', receivedImg: null, sentImg: null, requests: [] },
    { id: 4, date: '2025-01-18', call: 'W6GHI', band: '10m', mode: 'SSB', note: '透過 Bureau', receivedImg: null, sentImg: null, requests: [] },
    { id: 5, date: '2025-01-20', call: 'BV2JKL', band: '2m', mode: 'FM', note: '本地交換', receivedImg: null, sentImg: null, requests: [] },
];

// ---------- 狀態（純記憶體，不寫入 localStorage） ----------
let qslRecords = JSON.parse(JSON.stringify(demoRecords));
let userCallsign = '';          // 從 index.html 設定
let isAdmin = false;
let selectedAdifFile = null;
let currentTab = 'dashboard';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

// ============================================================
// 工具
// ============================================================
function showToast(msg) {
    const toastEl = $('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openLightbox(src) {
    if (!src) return;
    const lb = $('lightbox');
    const img = $('lightboxImg');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('show');
}

function closeLightbox() {
    const lb = $('lightbox');
    const img = $('lightboxImg');
    if (lb) lb.classList.remove('show');
    if (img) img.src = '';
}

// ============================================================
// 分頁切換（index.html 內）
// ============================================================
function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(a => {
        a.classList.toggle('active', a.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.remove('active');
    });
    const target = $('page-' + tabName);
    if (target) target.classList.add('active');

    if (tabName === 'admin-panel') {
        adminSectionVisible(true);
    }
    renderCurrentTab();
}

function adminSectionVisible(show) {
    if (show) {
        const loginBox = $('adminLoginBox');
        const content = $('adminContent');
        if (loginBox) loginBox.style.display = isAdmin ? 'none' : 'flex';
        if (content) content.style.display = isAdmin ? 'block' : 'none';
    }
}

// ============================================================
// 用戶呼號
// ============================================================
function setUserCallsign() {
    const input = $('userCallsignInput');
    if (!input) return;
    const v = input.value.trim().toUpperCase();
    if (!v) { showToast('請輸入呼號'); return; }
    userCallsign = v;
    updateUserCallsignDisplay();
    renderCurrentTab();
    showToast(`✅ 已設定呼號：${userCallsign}`);
}

function updateUserCallsignDisplay() {
    const display = $('currentCallsignDisplay');
    if (!display) return;
    if (userCallsign) {
        display.innerHTML = `<span class="callsign-tag">目前呼號：${escapeHtml(userCallsign)}</span>`;
        const input = $('userCallsignInput');
        if (input) input.value = userCallsign;
    } else {
        display.innerHTML = '<span style="color:#b8cee4;">尚未設定呼號</span>';
    }
}

// ============================================================
// 管理員登入 / 登出
// ============================================================
function loginAdmin() {
    const pwd = $('adminPassword').value.trim();
    if (pwd === 'admin123') {
        isAdmin = true;
        $('adminLoginBox').style.display = 'none';
        $('adminContent').style.display = 'block';
        $('loginStatus').innerHTML = '<span class="role-badge admin">管理員</span>';
        $('adminLoginHint').textContent = '';
        $('adminPassword').value = '';
        showToast('✅ 管理員登入成功');
        renderAdminTable();
    } else {
        $('adminLoginHint').textContent = '❌ 密碼錯誤，請再試一次';
        showToast('❌ 密碼錯誤');
    }
}

function logoutAdmin() {
    isAdmin = false;
    $('adminLoginBox').style.display = 'flex';
    $('adminContent').style.display = 'none';
    $('loginStatus').innerHTML = '<span class="role-badge">訪客</span>';
    $('adminPassword').value = '';
    $('adminLoginHint').textContent = '';
    showToast('👋 已登出管理員');
}

// ============================================================
// 渲染
// ============================================================
function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderMainTable();
    } else if (currentTab === 'admin-panel' && isAdmin) {
        renderAdminTable();
    }
}

function imgCellHtml(imgData, altText) {
    if (imgData) {
        const safe = imgData.replace(/'/g, "\\'");
        return `<img src="${imgData}" class="qsl-thumb" alt="${altText}" onclick="openLightbox('${safe}')">`;
    }
    return `<div class="qsl-thumb-empty">—</div>`;
}

function computeQslStatus(r) {
    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: '雙向完成' };
    if (r.receivedImg) return { cls: 'badge-received', text: '已收到' };
    if (r.sentImg) return { cls: 'badge-sent', text: '已發出' };
    return { cls: 'badge-pending', text: '待處理' };
}

function renderMainTable() {
    const tbody = $('qsoTableBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">📭 目前沒有通聯紀錄</div></td></tr>`;
        return;
    }
    tbody.innerHTML = qslRecords.map(r => {
        const st = computeQslStatus(r);
        let reqHtml = '—';
        if (userCallsign && userCallsign === r.call) {
            const already = (r.requests || []).some(req => req.userCall === userCallsign);
            reqHtml = already
                ? `<span class="badge-requested">已申請</span>`
                : `<button class="btn-request" onclick="requestQSL(${r.id})">申請換卡</button>`;
        } else if (userCallsign && userCallsign !== r.call) {
            reqHtml = `<span style="color:#b8cee4; font-size:0.85rem;">非本人通聯</span>`;
        } else {
            reqHtml = `<span style="color:#b8cee4; font-size:0.85rem;">請先設定呼號</span>`;
        }
        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td>${escapeHtml(r.band)}</td>
            <td>${escapeHtml(r.mode)}</td>
            <td>${imgCellHtml(r.receivedImg, r.call + ' 收到')}</td>
            <td>${imgCellHtml(r.sentImg, r.call + ' 發出')}</td>
            <td><span class="${st.cls}">${st.text}</span></td>
            <td>${reqHtml}</td>
            <td>${escapeHtml(r.note || '—')}</td>
        </tr>`;
    }).join('');
}

function renderMyRequests() {
    const tbody = $('myRequestsBody');
    if (!tbody) return;

    if (!userCallsign) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">請先在總覽設定您的呼號</div></td></tr>`;
        return;
    }

    const list = [];
    qslRecords.forEach(r => {
        (r.requests || []).forEach(req => {
            if (req.userCall === userCallsign) list.push({ ...req, record: r });
        });
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state
