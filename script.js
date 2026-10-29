/* ============================================================
   BX2AOV QSL confirm - 主邏輯（分頁版）
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
let currentTab = 'dashboard';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

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
    const toastEl = $('toast');
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
    $('lightboxImg').src = src;
    $('lightbox').classList.add('show');
}

function closeLightbox() {
    $('lightbox').classList.remove('show');
    $('lightboxImg').src = '';
}

// ============================================================
// 分頁切換
// ============================================================
function switchTab(tabName) {
    currentTab = tabName;

    // 更新導航 active
    document.querySelectorAll('.nav-tab').forEach(a => {
        a.classList.toggle('active', a.dataset.tab === tabName);
    });

    // 顯示對應分頁
    document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.remove('active');
    });
    const target = $('page-' + tabName);
    if (target) target.classList.add('active');

    // 切到管理員分頁時，渲染管理員表格
    if (tabName === 'admin-panel') {
        adminSectionVisible(true);
    }

    // 重新渲染當前頁資料
    renderCurrentTab();
}

function adminSectionVisible(show) {
    // 依登入狀態顯示登入框或管理內容
    if (show) {
        $('adminLoginBox').style.display = isAdmin ? 'none' : 'flex';
        $('adminContent').style.display = isAdmin ? 'block' : 'none';
    }
}

// ============================================================
// 用戶呼號
// ============================================================
function setUserCallsign() {
    const input = $('userCallsignInput');
    const v = input.value.trim().toUpperCase();
    if (!v) { showToast('請輸入呼號'); return; }
    userCallsign = v;
    localStorage.setItem(USER_CALLSIGN_KEY, userCallsign);
    updateUserCallsignDisplay();
    renderCurrentTab();
    showToast(`✅ 已設定呼號：${userCallsign}`);
}

function updateUserCallsignDisplay() {
    const display = $('currentCallsignDisplay');
    if (userCallsign) {
        display.innerHTML = `<span class="callsign-tag">目前呼號：${escapeHtml(userCallsign)}</span>`;
        $('userCallsignInput').value = userCallsign;
    } else {
        display.innerHTML = '<span style="color:#b8cee4;">尚未設定呼號</span>';
    }
}

// ============================================================
// 管理員登入 / 登出
// ============================================================
function loginAdmin() {
    const pwd = $('adminPassword').value.trim();
    if (pwd === ADMIN_PASSWORD) {
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
    } else if (currentTab === 'my-requests') {
        renderMyRequests();
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
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">請先設定您的呼號</div></td></tr>`;
        return;
    }

    const list = [];
    qslRecords.forEach(r => {
        (r.requests || []).forEach(req => {
            if (req.userCall === userCallsign) list.push({ ...req, record: r });
        });
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">尚無申請紀錄</div></td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(req => {
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
    const tbody = $('adminManageBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#7e96af;">無紀錄</td></tr>`;
        return;
    }

    tbody.innerHTML = qslRecords.map(r => {
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
                        <button class="btn btn-outline btn-sm" style="margin-left:4px;" onclick="approveRequest(${r.id}, ${idx})">核准</button>
                        <button class="btn btn-outline btn-sm" onclick="rejectRequest(${r.id}, ${idx})">拒絕</button>`;
                } else if (req.status === 'approved') {
                    statusHtml = `<span class="badge-approved">已核准</span>`;
                } else if (req.status === 'rejected') {
                    statusHtml = `<span class="badge-rejected">已拒絕</span>`;
                }
                return `<div style="margin-bottom:4px; font-size:0.8rem;">
                    <span style="color:#5a6e85;">${escapeHtml(req.userCall)}</span>
                    ${statusHtml}
                </div>`;
            }).join('');
        }

        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.call)}</td>
            <td>${escapeHtml(r.band)}</td>
            <td>${escapeHtml(r.mode)}</td>
            <td>${recvHtml}</td>
            <td>${sentHtml}</td>
            <td>${reqHtml}</td>
            <td><button class="btn btn-outline btn-sm" onclick="deleteRecord(${r.id})" style="padding:6px 14px; font-size:0.8rem;">刪除</button></td>
        </tr>`;
    }).join('');
}

// ============================================================
// 用戶操作
// ============================================================
function requestQSL(recordId) {
    if (!userCallsign) {
        showToast('請先設定您的呼號');
        return;
    }
    const record = qslRecords.find(r => r.id === recordId);
    if (!record) return;

    if ((record.requests || []).some(req => req.userCall === userCallsign)) {
        showToast('您已申請過此通聯的 QSL 換卡');
        return;
    }

    if (!record.requests) record.requests = [];
    record.requests.push({
        userCall: userCallsign,
        requestDate: new Date().toISOString().slice(0, 10),
        status: 'pending'
    });

    saveData(qslRecords);
    showToast(`✅ 已送出 ${record.call} 的 QSL 換卡申請`);
    renderCurrentTab();
}

// ============================================================
// 管理員操作
// ============================================================
function handleQslImageUpload(recordId, type, event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('⚠️ 請上傳圖片檔案');
        event.target.value = '';
        return;
    }

    if (file.size > 800 * 1024) {
        showToast('⚠️ 圖片超過 800KB，請壓縮後再上傳');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        const record = qslRecords.find(r => r.id === recordId);
        if (!record) return;

        if (type === 'received') {
            record.receivedImg = base64;
        } else if (type === 'sent') {
            record.sentImg = base64;
        }

        saveData(qslRecords);
        renderAdminTable();
        showToast(`✅ 已上傳 ${type === 'received' ? '收到' : '發出'} QSL 圖片`);
        event.target.value = '';
    };
    reader.readAsDataURL(file);
}

function approveRequest(recordId, reqIndex) {
    const record = qslRecords.find(r => r.id === recordId);
    if (!record || !record.requests || !record.requests[reqIndex]) return;
    record.requests[reqIndex].status = 'approved';
    saveData(qslRecords);
    renderAdminTable();
    showToast('✅ 已核准申請');
}

function rejectRequest(recordId, reqIndex) {
    const record = qslRecords.find(r => r.id === recordId);
    if (!record || !record.requests || !record.requests[reqIndex]) return;
    record.requests[reqIndex].status = 'rejected';
    saveData(qslRecords);
    renderAdminTable();
    showToast('已拒絕申請');
}

function deleteRecord(id) {
    if (!confirm('確定要刪除此筆通聯紀錄嗎？')) return;
    qslRecords = qslRecords.filter(r => r.id !== id);
    saveData(qslRecords);
    renderAdminTable();
    showToast('🗑️ 紀錄已刪除');
}

function clearAllRecords() {
    if (!confirm('⚠️ 確定要清除所有通聯紀錄嗎？此操作無法復原。')) return;
    qslRecords = [];
    saveData(qslRecords);
    renderAdminTable();
    showToast('所有紀錄已清除');
}

function resetToDemo() {
    if (!confirm('將重置為預設示範資料，確定嗎？')) return;
    qslRecords = JSON.parse(JSON.stringify(defaultRecords));
    saveData(qslRecords);
    renderAdminTable();
    showToast('已重置為示範資料');
}

function addManualRecord() {
    const date = $('manualDate').value.trim();
    const call = $('manualCall').value.trim();
    const band = $('manualBand').value.trim();
    const mode = $('manualMode').value.trim();
    const note = $('manualNote').value.trim();

    if (!date || !call || !band || !mode) {
        showToast('請填寫日期、呼號、頻段、模式');
        return;
    }

    qslRecords.push({
        id: Date.now(),
        date: date,
        call: call.toUpperCase(),
        band: band,
        mode: mode.toUpperCase(),
        note: note,
        receivedImg: null,
        sentImg: null,
        requests: []
    });

    saveData(qslRecords);
    renderAdminTable();

    $('manualDate').value = '';
    $('manualCall').value = '';
    $('manualBand').value = '';
    $('manualMode').value = '';
    $('manualNote').value = '';

    showToast(`✅ 已新增通聯紀錄 ${call.toUpperCase()}`);
}

// ---------- ADIF ----------
function handleAdifSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedAdifFile = file;
        $('adifFileNameDisplay').textContent = `已選擇：${file.name}`;
    } else {
        selectedAdifFile = null;
        $('adifFileNameDisplay').textContent = '';
    }
}

function parseADIF(content) {
    const records = [];
    let current = {};
    let pos = 0;
    const len = content.length;

    const headerEnd = content.toUpperCase().indexOf('<EOH>');
    if (headerEnd !== -1) pos = headerEnd + 5;

    while (pos < len) {
        const tagStart = content.indexOf('<', pos);
        if (tagStart === -1) break;
        const tagEnd = content.indexOf('>', tagStart);
        if (tagEnd === -1) break;

        const tagFull = content.substring(tagStart + 1, tagEnd).trim();
        const parts = tagFull.split(':');
        const fieldName = parts[0].trim().toUpperCase();
        let fieldLen = parts.length > 1 ? parseInt(parts[1].trim(), 10) : null;

        pos = tagEnd + 1;

        let value = '';
        if (fieldLen !== null && !isNaN(fieldLen)) {
            value = content.substring(pos, pos + fieldLen).trim();
            pos += fieldLen;
        } else {
            if (fieldName === 'EOR') {
                if (Object.keys(current).length > 0) {
                    records.push({ ...current });
                    current = {};
                }
            }
            continue;
        }

        if (fieldName === 'EOR') {
            if (Object.keys(current).length > 0) {
                records.push({ ...current });
                current = {};
            }
        } else if (fieldName === 'QSO_DATE') {
            let d = value;
            if (d.length === 8) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
            current.date = d;
        } else if (fieldName === 'CALL') {
            current.call = value.toUpperCase();
        } else if (fieldName === 'BAND') {
            current.band = value;
        } else if (fieldName === 'MODE') {
            current.mode = value.toUpperCase();
        } else if (fieldName === 'FREQ') {
            if (!current.band) {
                const freq = parseFloat(value);
                if (!isNaN(freq)) {
                    if (freq >= 1.8 && freq <= 2.0) current.band = '160m';
                    else if (freq >= 3.5 && freq <= 4.0) current.band = '80m';
                    else if (freq >= 7.0 && freq <= 7.3) current.band = '40m';
                    else if (freq >= 10.1 && freq <= 10.15) current.band = '30m';
                    else if (freq >= 14.0 && freq <= 14.35) current.band = '20m';
                    else if (freq >= 18.068 && freq <= 18.168) current.band = '17m';
                    else if (freq >= 21.0 && freq <= 21.45) current.band = '15m';
                    else if (freq >= 24.89 && freq <= 24.99) current.band = '12m';
                    else if (freq >= 28.0 && freq <= 29.7) current.band = '10m';
                    else if (freq >= 50 && freq <= 54) current.band = '6m';
                    else if (freq >= 144 && freq <= 148) current.band = '2m';
                    else if (freq >= 430 && freq <= 440) current.band = '70cm';
                }
            }
        } else if (fieldName === 'COMMENT' || fieldName === 'NOTES') {
            current.note = (current.note || '') + value;
        }
    }

    if (Object.keys(current).length > 0) records.push({ ...current });
    return records;
}

function uploadADIF() {
    if (!selectedAdifFile) {
        showToast('請先選擇 ADIF 檔案');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const parsed = parseADIF(content);
        let newRecords = [];
        let errorCount = 0;

        for (const p of parsed) {
            if (!p.call) { errorCount++; continue; }
            newRecords.push({
                id: Date.now() + Math.random(),
                date: p.date || '—',
                call: p.call,
                band: p.band || '—',
                mode: p.mode || '—',
                note: p.note || '',
                receivedImg: null,
                sentImg: null,
                requests: []
            });
        }

        if (newRecords.length > 0) {
            qslRecords = [...qslRecords, ...newRecords];
            saveData(qslRecords);
            renderAdminTable();
            showToast(`✅ 成功匯入 ${newRecords.length} 筆紀錄${errorCount > 0 ? `，${errorCount} 筆格式錯誤已跳過` : ''}`);
        } else {
            showToast('⚠️ 未找到有效資料，請確認 ADIF 格式');
        }

        $('adifFile').value = '';
        $('adifFileNameDisplay').textContent = '';
        selectedAdifFile = null;
    };
    reader.readAsText(selectedAdifFile);
}

// ============================================================
// 事件綁定（初始化）
// ============================================================
function init() {
    // 分頁切換
    document.querySelectorAll('.nav-tab').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(a.dataset.tab);
        });
    });

    // 用戶呼號
    $('btnSetCallsign').addEventListener('click', setUserCallsign);
    $('userCallsignInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') setUserCallsign();
    });

    // 管理員登入
    $('btnLogin').addEventListener('click', loginAdmin);
    $('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginAdmin();
    });
    $('btnLogout').addEventListener('click', logoutAdmin);

    // ADIF
    $('adifFile').addEventListener('change', handleAdifSelect);
    $('btnUploadADIF').addEventListener('click', uploadADIF);

    // 手動新增
    $('btnAddManual').addEventListener('click', addManualRecord);

    // 清除 / 重置
    $('btnClearAll').addEventListener('click', clearAllRecords);
    $('btnResetDemo').addEventListener('click', resetToDemo);

    // 燈箱
    $('lightbox').addEventListener('click', closeLightbox
