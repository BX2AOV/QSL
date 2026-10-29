/* ============================================================
   BX2AOV QSL confirm - 主邏輯 (包含首頁總覽與管理員後台)
   ============================================================ */

// ---------- 全域資料庫 ----------
let qslRecords = [
    { id: 1, date: '2025-01-10', call: 'BM2ABC', band: '20m', mode: 'SSB', note: '等待回卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 2, date: '2025-01-12', call: 'JP1XYZ', band: '15m', mode: 'FT8', note: '已收到紙卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 3, date: '2025-01-15', call: 'BM2ABC', band: '40m', mode: 'CW', note: '已寄出', receivedImg: null, sentImg: null, requests: [] },
    { id: 4, date: '2025-01-18', call: 'W6GHI', band: '10m', mode: 'SSB', note: '透過 Bureau', receivedImg: null, sentImg: null, requests: [] },
    { id: 5, date: '2025-01-20', call: 'JP1XYZ', band: '2m', mode: 'FM', note: '本地交換', receivedImg: null, sentImg: null, requests: [] }
];

// ---------- 全域狀態 ----------
let isAdmin = false;
let selectedAdifFile = null;
let currentTab = 'dashboard';

// ---------- 全域 DOM 選取器 ----------
const $ = (id) => document.getElementById(id);

// ============================================================
// 全域共用工具函式
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

function computeQslStatus(r) {
    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: '雙向完成' };
    if (r.receivedImg) return { cls: 'badge-received', text: '已收到' };
    if (r.sentImg) return { cls: 'badge-sent', text: '已發出' };
    return { cls: 'badge-pending', text: '待處理' };
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
// 分頁切換與管理員登入
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

function loginAdmin() {
    const pwd = $('adminPassword').value.trim();
    // 預設密碼為 admin123
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
// 渲染邏輯
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

// 渲染首頁總覽表格
function renderMainTable() {
    const tbody = $('qsoTableBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">📭 目前沒有通聯紀錄</div></td></tr>`;
        return;
    }
    tbody.innerHTML = qslRecords.map(r => {
        const st = computeQslStatus(r);
        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td>${escapeHtml(r.band)}</td>
            <td>${escapeHtml(r.mode)}</td>
            <td>${imgCellHtml(r.receivedImg, r.call + ' 收到')}</td>
            <td>${imgCellHtml(r.sentImg, r.call + ' 發出')}</td>
            <td><span class="${st.cls}">${st.text}</span></td>
            <td>${escapeHtml(r.note || '—')}</td>
        </tr>`;
    }).join('');
}

// 渲染管理員後台表格
function renderAdminTable() {
    const tbody = $('adminManageBody');
    if (!tbody) return;

    if (qslRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#7e96af;">無紀錄</td></tr>`;
        return;
    }

    tbody.innerHTML = qslRecords.map(r => {
        // 收到 QSL 上傳區塊
        const recvHtml = `
            <div class="upload-btns">
                <label for="recv-${r.id}">📥 上傳</label>
                <input type="file" id="recv-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'received', event)">
                ${r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.receivedImg.replace(/'/g, "\\'")}')">` : '<span style="color:#b8cee4;">—</span>'}
            </div>`;

        // 發出 QSL 上傳區塊
        const sentHtml = `
            <div class="upload-btns">
                <label for="sent-${r.id}">📤 上傳</label>
                <input type="file" id="sent-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'sent', event)">
                ${r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.sentImg.replace(/'/g, "\\'")}')">` : '<span style="color:#b8cee4;">—</span>'}
            </div>`;

        // 申請處理區塊
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
                
                // 如果有收件資訊，可以顯示在 Tooltip 或直接寫出來
                let shipDetail = '';
                if (req.shipName) {
                    shipDetail = `<div style="font-size:0.7rem; color:#888; margin-top:2px;">${escapeHtml(req.shipName)} / ${escapeHtml(req.shipPhone)}</div>`;
                }

                return `<div style="margin-bottom:8px; font-size:0.8rem; padding-bottom:6px; border-bottom:1px dashed #eee;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                        <strong style="color:#7b3fa0;">${escapeHtml(req.userCall)}</strong>
                        ${statusHtml}
                    </div>
                    ${shipDetail}
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
// 管理員操作：上傳圖片、核准申請、刪除、新增
// ============================================================
function handleQslImageUpload(recordId, type, event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('⚠️ 請上傳圖片檔案');
        event.target.value = '';
        return;
    }

    // 限制 800KB 以防 localStorage 爆掉，但這裡是記憶體暫存，稍微限制一下比較好
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
    renderAdminTable();
    showToast('✅ 已核准申請');
}

function rejectRequest(recordId, reqIndex) {
    const record = qslRecords.find(r => r.id === recordId);
    if (!record || !record.requests || !record.requests[reqIndex]) return;
    record.requests[reqIndex].status = 'rejected';
    renderAdminTable();
    showToast('已拒絕申請');
}

function deleteRecord(id) {
    if (!confirm('確定要刪除此筆通聯紀錄嗎？')) return;
    qslRecords = qslRecords.filter(r => r.id !== id);
    renderAdminTable();
    showToast('🗑️ 紀錄已刪除');
}

function clearAllRecords() {
    if (!confirm('⚠️ 確定要清除所有通聯紀錄嗎？')) return;
    qslRecords = [];
    renderAdminTable();
    showToast('所有紀錄已清除');
}

function resetToDemo() {
    if (!confirm('將重置為預設示範資料，確定嗎？')) return;
    qslRecords = [
        { id: 1, date: '2025-01-10', call: 'BM2ABC', band: '20m', mode: 'SSB', note: '等待回卡', receivedImg: null, sentImg: null, requests: [] },
        { id: 2, date: '2025-01-12', call: 'JP1XYZ', band: '15m', mode: 'FT8', note: '已收到紙卡', receivedImg: null, sentImg: null, requests: [] },
        { id: 3, date: '2025-01-15', call: 'BM2ABC', band: '40m', mode: 'CW', note: '已寄出', receivedImg: null, sentImg: null, requests: [] },
        { id: 4, date: '2025-01-18', call: 'W6GHI', band: '10m', mode: 'SSB', note: '透過 Bureau', receivedImg: null, sentImg: null, requests: [] },
        { id: 5, date: '2025-01-20', call: 'JP1XYZ', band: '2m', mode: 'FM', note: '本地交換', receivedImg: null, sentImg: null, requests: [] }
    ];
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

    renderAdminTable();
    $('manualDate').value = '';
    $('manualCall').value = '';
    $('manualBand').value = '';
    $('manualMode').value = '';
    $('manualNote').value = '';
    showToast(`✅ 已新增通聯紀錄 ${call.toUpperCase()}`);
}

// ============================================================
// ADIF 檔案解析與匯入
// ============================================================
function handleAdifSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedAdifFile = file;
        const display = $('adifFileNameDisplay');
        if (display) display.textContent = `已選擇：${file.name}`;
    } else {
        selectedAdifFile = null;
        const display = $('adifFileNameDisplay');
        if (display) display.textContent = '';
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
        const parsed = parseADIF(e.target.result);
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
            renderAdminTable();
            showToast(`✅ 成功匯入 ${newRecords.length} 筆紀錄${errorCount > 0 ? `，${errorCount} 筆已跳過` : ''}`);
        } else {
            showToast('⚠️ 未找到有效資料');
        }
        $('adifFile').value = '';
        $('adifFileNameDisplay').textContent = '';
        selectedAdifFile = null;
    };
    reader.readAsText(selectedAdifFile);
}

// ============================================================
// 首頁初始化事件綁定 (僅在 index.html 執行)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // 如果找不到首頁的專屬元素 (例如 qsoTableBody)，代表目前在別頁，直接返回
    if (!document.getElementById('qsoTableBody')) return;

    // 分頁切換標籤
    document.querySelectorAll('.nav-tab').forEach(a => {
        if (a.dataset.tab) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(a.dataset.tab);
            });
        }
    });

    // 管理員登入相關
    const btnLogin = $('btnLogin');
    if (btnLogin) btnLogin.addEventListener('click', loginAdmin);
    const pwd = $('adminPassword');
    if (pwd) pwd.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginAdmin();
    });
    const btnLogout = $('btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', logoutAdmin);

    // ADIF 與手動新增
    const adif = $('adifFile');
    if (adif) adif.addEventListener('change', handleAdifSelect);
    const btnAdif = $('btnUploadADIF');
    if (btnAdif) btnAdif.addEventListener('click', uploadADIF);

    const btnAdd = $('btnAddManual');
    if (btnAdd) btnAdd.addEventListener('click', addManualRecord);

    // 清除與重置
    const btnClear = $('btnClearAll');
    if (btnClear) btnClear.addEventListener('click', clearAllRecords);
    const btnReset = $('btnResetDemo');
    if (btnReset) btnReset.addEventListener('click', resetToDemo);

    // 燈箱點擊關閉
    const lb = $('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    const lbClose = $('lightboxClose');
    if (lbClose) lbClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
    });

    // 初始渲染首頁表格
    renderMainTable();
});