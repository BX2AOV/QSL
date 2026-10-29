/* ============================================================
   manage.js - 管理員後台完整邏輯 (支援狀態編輯與多次選取)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const roleBadge = document.getElementById('roleBadge');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const manageTableBody = document.getElementById('manageTableBody');

let selectedFilesArray = [];

// 共用工具
function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(!t) return; 
    t.textContent = msg; t.classList.add('show'); 
    clearTimeout(window.tt); 
    window.tt = setTimeout(() => t.classList.remove('show'), 3500); 
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

// 衛星與顯示判斷
function getDisplayInfo(r) {
    let displayBand = r.band;
    let displayMode = r.mode;
    if (r.note) {
        const satMatch = r.note.match(/^\[(.*?)\]/);
        if (satMatch && satMatch[1]) {
            displayBand = satMatch[1]; 
            displayMode = 'SAT';       
        }
    }
    return { band: displayBand, mode: displayMode };
}

// ============================================================
// 登入與登出
// ============================================================
async function login() {
    const user = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    if (!user || !password) { showToast('請輸入帳號與密碼'); return; }

    btnLogin.disabled = true; btnLogin.textContent = '登入中...';
    const { data, error } = await _supabase.from('admins').select('*').eq('username', user).eq('password', password).single();
    btnLogin.disabled = false; btnLogin.textContent = '登入';

    if (error || !data) { showToast('❌ 帳號或密碼錯誤'); return; }

    sessionStorage.setItem('isAdmin', 'true');
    showToast('✅ 登入成功');
    checkUser();
}

function logout() { 
    sessionStorage.removeItem('isAdmin'); 
    showToast('👋 已登出'); 
    checkUser(); 
}

function checkUser() {
    const isLoggedIn = sessionStorage.getItem('isAdmin') === 'true';
    if (isLoggedIn) {
        loginSection.style.display = 'none'; 
        adminPanel.style.display = 'block';
        roleBadge.textContent = '管理員'; 
        roleBadge.className = 'role-badge admin';
        renderAdminTable(); 
        calculateStorageUsage(); 
    } else {
        loginSection.style.display = 'block'; 
        adminPanel.style.display = 'none';
        roleBadge.textContent = '未登入'; 
        roleBadge.className = 'role-badge';
        document.getElementById('adminUser').value = ''; 
        document.getElementById('adminPassword').value = '';
    }
}

// ============================================================
// 雲端空間監測
// ============================================================
async function calculateStorageUsage() {
    const dbBar = document.getElementById('dbUsageBar');
    const dbText = document.getElementById('dbUsageText');
    const stBar = document.getElementById('storageUsageBar');
    const stText = document.getElementById('storageUsageText');
    if (!dbBar || !stBar) return;

    try {
        const { data: allRecords, error } = await _supabase.from('qsl_records').select('*');
        if (!error && allRecords) {
            const jsonString = JSON.stringify(allRecords);
            const bytes = new Blob([jsonString]).size;
            const mb = bytes / (1024 * 1024);
            const percent = Math.min((mb / 500) * 100, 100);
            dbBar.style.width = `${Math.max(percent, 0.5)}%`;
            dbText.textContent = `${mb.toFixed(2)} MB / 500 MB (約 ${percent.toFixed(2)}%)`;

            let imgCount = 0;
            allRecords.forEach(r => {
                if (r.receivedImg && r.receivedImg.trim() !== '') imgCount++;
                if (r.sentImg && r.sentImg.trim() !== '') imgCount++;
            });

            const estimatedBytes = imgCount * 150 * 1024;
            const estMb = estimatedBytes / (1024 * 1024);
            const estPercent = Math.min((estMb / 1000) * 100, 100);
            
            stBar.style.width = `${Math.max(estPercent, 0.5)}%`;
            stText.textContent = imgCount === 0 ? `0.00 MB / 1000 MB` : `已連結 ${imgCount} 張圖片 (估算約 ${estMb.toFixed(2)} MB)`;
        }
    } catch (e) { 
        dbText.textContent = '無法估算'; 
        stText.textContent = '無法估算';
    }
}

// ============================================================
// 渲染管理表格與操作
// ============================================================
async function renderAdminTable() {
    if (!manageTableBody) return;
    manageTableBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">⏳ 資料載入中...</div></td></tr>';

    const { data, error } = await _supabase.from('qsl_records').select('*').order('id', { ascending: true });

    if (error) { manageTableBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">資料載入失敗</div></td></tr>'; return; }
    if (data.length === 0) { manageTableBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">目前沒有通聯紀錄</div></td></tr>'; return; }

    manageTableBody.innerHTML = data.map(r => {
        const display = getDisplayInfo(r); 

        let reqHtml = '<div style="color:#a0b2c6; font-size:0.85rem;">尚無申請</div>';
        if (r.requests && r.requests.length > 0) {
            reqHtml = r.requests.map((req, idx) => {
                let statusHtml = '';
                if (req.status === 'pending') statusHtml = '<span class="badge-pending" style="margin-left:4px;">待處理</span>';
                else if (req.status === 'approved') statusHtml = '<span class="badge-approved" style="margin-left:4px;">已核准</span>';
                else if (req.status === 'rejected') statusHtml = '<span class="badge-rejected" style="margin-left:4px;">已拒絕</span>';

                return `
                <div style="margin-bottom: 10px; padding: 10px; background: #f8fbfe; border-radius: 8px; border: 1px solid #e0e9f2; position: relative;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                        <div><strong style="color:#7b3fa0; font-size:0.95rem;">👤 ${escapeHtml(req.userCall)}</strong>${statusHtml}</div>
                        <button onclick="deleteRequest(${r.id}, ${idx})" style="background:#fde8e8; color:#b03030; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.75rem;">刪除申請</button>
                    </div>
                    <div style="font-size:0.85rem; color:#333; margin-bottom:8px; line-height:1.4;">
                        <strong>收件人：</strong>${escapeHtml(req.shipName)}<br>
                        <strong>手機：</strong>${escapeHtml(req.shipPhone)}<br>
                        <strong>地址：</strong>${escapeHtml(req.shipZip)} ${escapeHtml(req.shipAddress)}
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button onclick="approveRequest(${r.id}, ${idx})" style="background:#d9f0e0; color:#0e6b3e; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">核准申請</button>
                        <button onclick="rejectRequest(${r.id}, ${idx})" style="background:#fff0d9; color:#b45f06; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">拒絕申請</button>
                    </div>
                </div>`;
            }).join('');
        }

        const recvImgHtml = r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" style="width:40px;height:28px; object-fit:cover; border-radius:4px;" onclick="openLightbox('${r.receivedImg}')">` : '';
        const recvBtnHtml = r.receivedImg ? `<button onclick="deleteQslImage(${r.id}, 'received')" style="background:#fde8e8; color:#b03030; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-left:4px;">刪除</button>` : '';

        const sentImgHtml = r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" style="width:40px;height:28px; object-fit:cover; border-radius:4px;" onclick="openLightbox('${r.sentImg}')">` : '';
        const sentBtnHtml = r.sentImg ? `<button onclick="deleteQslImage(${r.id}, 'sent')" style="background:#fde8e8; color:#b03030; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.75rem; margin-left:4px;">刪除</button>` : '';

        const recvHtml = `
            <div class="upload-btns" style="margin-bottom:8px; display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                <label for="recv-${r.id}">📥 收到</label>
                <input type="file" id="recv-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'received', event)">
                ${recvImgHtml}
                ${recvBtnHtml}
            </div>`;

        const sentHtml = `
            <div class="upload-btns" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                <label for="sent-${r.id}">📤 發出</label>
                <input type="file" id="sent-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'sent', event)">
                ${sentImgHtml}
                ${sentBtnHtml}
            </div>`;

        // 👇 這裡是狀態下拉選單 👇
        const currentStatus = r.status || 'none';
        const statusSelect = `
            <select onchange="changeStatus(${r.id}, this.value)" style="padding:6px 10px; border-radius:6px; border:1px solid #cbdae8; font-size:0.85rem; background:#fff; cursor:pointer; outline:none;">
                <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>未申請</option>
                <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>待處理</option>
                <option value="received_paper" ${currentStatus === 'received_paper' ? 'selected' : ''}>已收到紙卡</option>
                <option value="received_eqsl" ${currentStatus === 'received_eqsl' ? 'selected' : ''}>已收到電子卡</option>
                <option value="sent" ${currentStatus === 'sent' ? 'selected' : ''}>已發出紙卡</option>
                <option value="not_needed" ${currentStatus === 'not_needed' ? 'selected' : ''}>無需換卡</option>
            </select>
        `;

        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(r.time || '—')}</strong></td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td><strong style="color:#0066cc;">${escapeHtml(display.band)}</strong></td>
            <td><span style="font-weight:bold; color:#7b3fa0;">${escapeHtml(display.mode)}</span></td>
            <td>${reqHtml}</td>
            <td>${recvHtml}${sentHtml}</td>
            <td>${statusSelect}</td>
            <td>
                <button onclick="deleteRecord(${r.id})" style="background:#0b2a4a; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:0.8rem; white-space:nowrap;">🗑️ 刪除</button>
            </td>
        </tr>`;
    }).join('');
}

// 修改狀態的函式
async function changeStatus(recordId, newStatus) {
    showToast('⏳ 更新狀態中...');
    const { error } = await _supabase.from('qsl_records').update({ status: newStatus }).eq('id', recordId);
    
    if (error) { 
        showToast('❌ 更新失敗'); 
        console.error(error);
    } else { 
        showToast('✅ 狀態已更新'); 
    }
}

// ---------- 刪除整筆 ----------
async function deleteRecord(recordId) {
    if (!confirm('⚠️ 警告：您確定要刪除這筆通聯紀錄嗎？\n這將會連同該筆的所有申請資料一起刪除！')) return;
    showToast('⏳ 正在刪除...');
    const { error } = await _supabase.from('qsl_records').delete().eq('id', recordId);
    if (error) { showToast('❌ 刪除失敗：' + error.message); } 
    else { showToast('🗑️ 已成功刪除該筆通聯紀錄'); renderAdminTable(); calculateStorageUsage(); }
}

// ---------- 刪除單筆圖片 ----------
async function deleteQslImage(recordId, type) {
    if (!confirm(`確定要刪除這張「${type === 'received' ? '收到' : '發出'}」的 QSL 圖片嗎？`)) return;
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('receivedImg, sentImg').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到紀錄'); return; }
    const imgUrl = type === 'received' ? record.receivedImg : record.sentImg;
    if (!imgUrl) return;
    try {
        const fileName = imgUrl.split('/').pop();
        if (fileName) await _supabase.storage.from('qsl-images').remove([fileName]);
    } catch (e) { console.error('Storage 刪除失敗:', e); }
    const updateData = {};
    updateData[type === 'received' ? 'receivedImg' : 'sentImg'] = null;
    const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
    if (dbError) { showToast('❌ 刪除失敗'); } 
    else { showToast('🗑️ 圖片已刪除'); renderAdminTable(); calculateStorageUsage(); }
}

// ---------- 處理使用者的申請 ----------
async function deleteRequest(recordId, reqIndex) {
    if (!confirm('確定要刪除這筆使用者的換卡申請嗎？')) return;
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到該筆資料'); return; }
    let requests = record.requests || [];
    requests.splice(reqIndex, 1);
    const { error: updateError } = await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    if (updateError) { showToast('❌ 刪除失敗'); } else { showToast('🗑️ 已刪除該筆申請'); renderAdminTable(); }
}

async function approveRequest(recordId, reqIndex) {
    const { data: record } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (!record) return;
    let requests = record.requests;
    requests[reqIndex].status = 'approved';
    await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    showToast('✅ 已核准申請'); renderAdminTable();
}

async function rejectRequest(recordId, reqIndex) {
    const { data: record } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (!record) return;
    let requests = record.requests;
    requests[reqIndex].status = 'rejected';
    await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    showToast('已拒絕申請'); renderAdminTable();
}

// ============================================================
// 圖片上傳
// ============================================================
async function handleQslImageUpload(recordId, type, event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('⚠️ 請上傳圖片'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('⚠️ 圖片超過 2MB'); event.target.value = ''; return; }

    showToast('⏳ 圖片上傳中...');
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${recordId}_${type}.${fileExt}`;

    const { error: uploadError } = await _supabase.storage.from('qsl-images').upload(fileName, file);
    if (uploadError) { showToast('❌ 圖片上傳失敗: ' + uploadError.message); event.target.value=''; return; }

    const { data: { publicUrl } } = _supabase.storage.from('qsl-images').getPublicUrl(fileName);
    const updateData = {};
    updateData[type === 'received' ? 'receivedImg' : 'sentImg'] = publicUrl;

    const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
    if (dbError) { showToast('❌ 資料庫更新失敗: ' + dbError.message); } 
    else { showToast('✅ 圖片上傳成功'); renderAdminTable(); calculateStorageUsage(); }
    event.target.value = '';
}

// ============================================================
// ADIF 上傳
// ============================================================
function handleAdifSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            const isDuplicate = selectedFilesArray.some(f => f.name === files[i].name && f.size === files[i].size);
            if (!isDuplicate) selectedFilesArray.push(files[i]);
        }
        document.getElementById('adifFileNameDisplay').textContent = `已選擇 ${selectedFilesArray.length} 個檔案，可繼續點擊選取。`;
        document.getElementById('btnClearFiles').style.display = 'block';
    }
    event.target.value = '';
}

function clearSelectedFiles() {
    selectedFilesArray = [];
    document.getElementById('adifFileNameDisplay').textContent = '';
    document.getElementById('btnClearFiles').style.display = 'none';
}

function parseADIF(content) {
    const records = []; let current = {}; let pos = 0; const len = content.length;
    const headerEnd = content.toUpperCase().indexOf('<EOH>'); if (headerEnd !== -1) pos = headerEnd + 5;
    while (pos < len) {
        const tagStart = content.indexOf('<', pos); if (tagStart === -1) break;
        const tagEnd = content.indexOf('>', tagStart); if (tagEnd === -1) break;
        const tagFull = content.substring(tagStart + 1, tagEnd).trim();
        const parts = tagFull.split(':'); const fieldName = parts[0].trim().toUpperCase();
        let fieldLen = parts.length > 1 ? parseInt(parts[1].trim(), 10) : null; pos = tagEnd + 1;
        let value = '';
        if (fieldLen !== null && !isNaN(fieldLen)) { value = content.substring(pos, pos + fieldLen).trim(); pos += fieldLen; } 
        else { if (fieldName === 'EOR') { if (Object.keys(current).length > 0) { records.push({ ...current }); current = {}; } } continue; }
        
        if (fieldName === 'EOR') { 
            if (Object.keys(current).length > 0) { records.push({ ...current }); current = {}; } 
        } 
        else if (fieldName === 'QSO_DATE') { let d = value; if (d.length === 8) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; current.date = d; } 
        else if (fieldName === 'TIME_ON') { let t = value; if (t.length >= 4) t = `${t.slice(0,2)}:${t.slice(2,4)}`; current.time = t; }
        else if (fieldName === 'CALL') { current.call = value.toUpperCase(); } 
        else if (fieldName === 'BAND') { current.band = value; } 
        else if (fieldName === 'MODE') { current.mode = value.toUpperCase(); } 
        else if (fieldName === 'SAT_NAME') { current.satName = value.toUpperCase(); }
        else if (fieldName === 'COMMENT' || fieldName === 'NOTES') { current.note = (current.note || '') + value; }
    }
    if (Object.keys(current).length > 0) records.push({ ...current });
    return records;
}

async function uploadADIF() {
    if (selectedFilesArray.length === 0) { showToast('請先選擇 ADIF 檔案'); return; }
    const btnUploadADIF = document.getElementById('btnUploadADIF');
    
    btnUploadADIF.disabled = true; 
    btnUploadADIF.textContent = `⏳ 讀取中...`;

    let allNewRecords = [];
    let processed = 0;

    const readPromises = selectedFilesArray.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const parsed = parseADIF(e.target.result);
                for (const p of parsed) {
                    if (!p.call) continue;
                    let noteStr = p.note || '';
                    if (p.satName) noteStr = `[${p.satName}] 衛星通聯 ${noteStr}`.trim();

                    allNewRecords.push({ 
                        date: p.date || '—', 
                        time: p.time || '—',
                        call: p.call, 
                        band: p.band || '—', 
                        mode: p.mode || '—', 
                        note: noteStr, 
                        requests: [] 
                    });
                }
                processed++;
                btnUploadADIF.textContent = `⏳ 讀取中 (${processed}/${selectedFilesArray.length})...`;
                resolve();
            };
            reader.readAsText(file);
        });
    });

    await Promise.all(readPromises);

    if (allNewRecords.length > 0) {
        btnUploadADIF.textContent = `⏳ 寫入資料庫中...`;
        const { error } = await _supabase.from('qsl_records').insert(allNewRecords);
        
        if (error) { showToast('❌ 匯入失敗'); } 
        else { 
            showToast(`✅ 成功從 ${selectedFilesArray.length} 個檔案匯入 ${allNewRecords.length} 筆紀錄`);
            renderAdminTable(); calculateStorageUsage();
        }
    } else { showToast('⚠️ 無有效資料'); }

    btnUploadADIF.disabled = false; 
    btnUploadADIF.textContent = '全部上傳並匯入';
    clearSelectedFiles();
}

async function addManualRecord() {
    const btnAddManual = document.getElementById('btnAddManual');
    const date = document.getElementById('manualDate').value;
    const time = document.getElementById('manualTime').value;
    const call = document.getElementById('manualCall').value.trim().toUpperCase();
    const band = document.getElementById('manualBand').value.trim();
    const mode = document.getElementById('manualMode').value.trim().toUpperCase();
    const note = document.getElementById('manualNote').value.trim();
    
    if (!date || !call || !band || !mode) { showToast('請填寫完整欄位'); return; }

    btnAddManual.disabled = true; btnAddManual.textContent = '新增中...';
    const { error } = await _supabase.from('qsl_records').insert([{ 
        date, time, call, band, mode, note, requests: [] 
    }]);
    btnAddManual.disabled = false; btnAddManual.textContent = '新增紀錄';
    
    if (error) { showToast('❌ 新增失敗'); } 
    else {
        showToast(`✅ 已新增 ${call}`);
        document.getElementById('manualDate').value = ''; 
        document.getElementById('manualTime').value = '';
        document.getElementById('manualCall').value = '';
        document.getElementById('manualBand').value = ''; 
        document.getElementById('manualMode').value = ''; 
        document.getElementById('manualNote').value = '';
        renderAdminTable(); calculateStorageUsage();
    }
}

// ============================================================
// 初始化事件綁定
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    btnLogin?.addEventListener('click', login);
    btnLogout?.addEventListener('click', logout);
    document.getElementById('adminPassword')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
    
    document.getElementById('adifFile')?.addEventListener('change', handleAdifSelect);
    document.getElementById('btnUploadADIF')?.addEventListener('click', uploadADIF);
    document.getElementById('btnClearFiles')?.addEventListener('click', clearSelectedFiles);
    
    document.getElementById('btnAddManual')?.addEventListener('click', addManualRecord);

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
});