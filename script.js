/* ============================================================
   BX2AOV QSL confirm - 主邏輯
   ============================================================ */

// ---------- 常數 ----------
const STORAGE_KEY = 'qsl_manager_data_v4';
const USER_CALLSIGN_KEY = 'qsl_user_callsign';
const ADMIN_PASSWORD = 'admin123';

const defaultRecords = [
    { id: 1, date: '2025-01-10', call: 'BM2ABC', band: '20m', mode: 'SSB', note: '等待回卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 2, date: '2025-01-12', call: 'JP1XYZ', band: '15m', mode: 'FT8', note: '已收到紙卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 3, date: '2025-01-15', call: 'VK3DEF', band: '40m', mode: 'CW', note: '已寄出', receivedImg: null, sentImg: null, requests: [] },
    { id: 4, date: '2025-01-18', call: 'W6GHI', band: '10m', mode: 'SSB', note: '透過 Bureau', receivedImg: null, sentImg: null, requests: [] },
    { id: 5, date: '2025-01-20', call: 'BV2JKL', band: '2m', mode: 'FM', note: '本地交換', receivedImg: null, sentImg: null, requests: [] },
];

// ---------- 狀態 ----------
let qslRecords = loadData();
let userCallsign = localStorage.getItem(USER_CALLSIGN_KEY) || '';
let isAdmin = false;
let selectedAdifFile = null;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const qsoTableBody = $('qsoTableBody');
const adminManageBody = $('adminManageBody');
const myRequestsBody = $('myRequestsBody');
const loginStatus = $('loginStatus');
const adminHint = $('adminHint');
const adminSection = $('admin-panel');
const adminContent = $('adminContent');
const adminLoginBox = $('adminLoginBox');
const adminLoginHint = $('adminLoginHint');
const toastEl = $('toast');
const lightbox = $('lightbox');
const lightboxImg = $('lightboxImg');
const lightboxClose = $('lightboxClose');
const currentCallsignDisplay = $('currentCallsignDisplay');
const userCallsignInput = $('userCallsignInput');

// ============================================================
// 資料存取
// ============================================================
function loadData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try { return JSON.parse(stored); }
        catch (e) { return JSON.parse(JSON.stringify(defaultRecords)); }
    }
    return JSON.parse(JSON.stringify(defaultRecords));
}

function saveData(records) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
    catch (e) { showToast('⚠️ 儲存空間不足，圖片可能過大'); }
}

// ============================================================
// 工具
// ============================================================
function showToast(msg) {
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
    lightboxImg.src = src;
    lightbox.classList.add('show');
}

function closeLightbox() {
    lightbox.classList.remove('show');
    lightboxImg.src = '';
}

// ============================================================
// 用戶呼號
// ============================================================
function setUserCallsign() {
    const v = userCallsignInput.value.trim().toUpperCase();
    if (!v) { showToast('請輸入呼號'); return; }
    userCallsign = v;
    localStorage.setItem(USER_CALLSIGN_KEY, userCallsign);
    updateUserCallsignDisplay();
    renderTables();
    showToast(`✅ 已設定呼號：${userCallsign}`);
}

function updateUserCallsignDisplay() {
    if (userCallsign) {
        currentCallsignDisplay.innerHTML = `<span class="callsign-tag">目前呼號：${escapeHtml(userCallsign)}</span>`;
        userCallsignInput.value = userCallsign;
    } else {
        currentCallsignDisplay.innerHTML = '<span style="color:#b8cee4;">尚未設定呼號</span>';
    }
}

// ============================================================
// 管理員登入 / 登出
// ============================================================
function loginAdmin() {
    const pwd = $('adminPassword').value.trim();
    if (pwd === ADMIN_PASSWORD) {
        isAdmin = true;
        adminLoginBox.style.display = 'none';
        adminContent.style.display = 'block';
        loginStatus.innerHTML = '<span class="role-badge admin">管理員</span>';
        adminHint.textContent = '✅ 管理模式';
        adminLoginHint.textContent = '';
        $('adminPassword').value = '';
        showToast('✅ 管理員登入成功');
        renderTables();
    } else {
        adminLoginHint.textContent = '❌ 密碼錯誤，請再試一次';
        showToast('❌ 密碼錯誤');
    }
}

function logoutAdmin() {
    isAdmin = false;
    adminLoginBox.style.display = 'flex';
    adminContent.style.display = 'none';
    loginStatus.innerHTML = '<span class="role-badge">訪客</span>';
    adminHint.textContent = '';
    $('adminPassword').value = '';
    adminLoginHint.textContent = '';
    showToast('👋 已登出管理員');
    renderTables();
}

// ============================================================
// 渲染
// ============================================================
function renderTables() {
    renderMainTable();
    renderMyRequests();
    if (isAdmin) renderAdminTable();
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
    if (qslRecords.length === 0) {
        qsoTableBody.innerHTML = `<tr><td colspan="9"><div class="empty-state">📭 目前沒有通聯紀錄</div></td></tr>`;
        return;
    }
    qsoTableBody.innerHTML = qslRecords.map(r => {
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
    if (!userCallsign) {
        myRequestsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">請先設定您的呼號</div></td></tr>`;
        return;
    }
    const list = [];
    qslRecords.forEach(r => (r.requests || []).forEach(req => {
        if (req.userCall === userCallsign) list.push({ ...req, record: r });
    }));
    if (list.length === 0) {
        myRequestsBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">尚無申請紀錄</div></td></tr>`;
        return;
    }
    myRequestsBody.innerHTML = list.map(req => {
        let cls = 'badge-pending', txt = '待處理';
        if (req.status === 'approved') { cls = 'badge-approved'; txt = '已核准'; }
        else if (req.status === 'rejected') { cls = 'badge-rejected'; txt = '已拒絕'; }
        return `<tr>
            <td>${escapeHtml(req.requestDate)}</td>
            <td><strong>${escapeHtml(req.record.call)}</strong></td>
            <td>${escapeHtml(req.record.date)}</td>
            <td>${escapeHtml(req.record.band)} / ${escapeHtml(req.record.mode)}</td>
            <td><span class="${cls}">${txt}</span></td>
        </tr>`;
    }).join('');
}

function renderAdminTable() {
    if (qslRecords.length === 0) {
        adminManageBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#7e96af;">無紀錄</td></tr>`;
        return;
    }
    adminManageBody.innerHTML = qslRecords.map(r => {
        // 收到上傳
        const recvHtml = `
            <div class="upload-btns">
                <label for="recv-${r.id}">📥 上傳</label>
                <input type="file" id="recv-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'received', event)">
                ${r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.receivedImg.replace(/'/g, "\\'")}')">` : '<span style="color:#b8cee4;">—</span>'}
            </div>`;
        // 發出上傳
        const sentHtml = `
            <div class="upload-btns">
                <label for="sent-${r.id}">📤 上傳</label>
                <input type="file" id="sent-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'sent', event)">
                ${r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.sentImg.replace(/'/g, "\\'")}')">` : '<span style="color:#b8cee4;">—</span>'}
            </div>`;

        // 申請處理
        let reqHtml = '—';
        if (r.requests && r.requests.length > 0) {
            reqHtml = r.requests.map((req, idx) => {
                let statusHtml = '';
                if (req.status === 'pending') {
                    statusHtml = `<span class="badge-pending">待處理</span>
                        <button class="btn btn-outline btn-sm" style="margin
