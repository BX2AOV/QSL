/* ============================================================
   manage.js - 管理員後台完整邏輯 (包含圖片刪除與版本檢測)
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
let selectedAdifFile = null;

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
// 網頁版本檢測 (CF 更新檢查)
// ============================================================
async function checkUpdate() {
    const statusEl = document.getElementById('updateStatus');
    const btn = document.getElementById('btnCheckUpdate');
    
    statusEl.innerHTML = '⏳ 正在向 Cloudflare 檢查檔案更新...';
    btn.disabled = true;

    try {
        const filesToCheck = ['manage.js', 'manage.html', 'style.css'];
        let totalServerBytes = 0;

        for (const file of filesToCheck) {
            const response = await fetch(`${file}?t=${new Date().getTime()}`, { cache: 'no-store' });
            const text = await response.text();
            totalServerBytes += text.length;
        }

        const lastKnownBytes = sessionStorage.getItem('lastServerBytes');

        if (!lastKnownBytes) {
            sessionStorage.setItem('lastServerBytes', totalServerBytes);
            statusEl.innerHTML = `📌 <b>已建立基準點</b><br>目前檔案總大小：${(totalServerBytes / 1024).toFixed(1)} KB`;
            statusEl.style.color = '#5a6e85';
        } else {
            const diff = Math.abs(totalServerBytes - parseInt(lastKnownBytes, 10));
            
            if (diff > 10) {
                statusEl.innerHTML = `✅ <b>發現新版本！</b><br>伺服器上的檔案大小已改變。<br>請重新整理載入最新畫面。`;
                statusEl.style.color = '#0e6b3e';
                sessionStorage.setItem('lastServerBytes', totalServerBytes);
            } else {
                statusEl.innerHTML = `☕ <b>目前是最新版本</b><br>核心檔案大小未改變。`;
                statusEl.style.color = '#5a6e85';
            }
        }
    } catch (error) {
        statusEl.innerHTML = '❌ 檢查失敗，請確認網路連線。';
        statusEl.style.color = '#b03030';
    }
    btn.disabled = false;
}

// ============================================================
// 雲端空間監測 (由資料庫計算)
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
    manageTableBody.innerHTML = '<tr><td colspan="6"><div class="empty-state">⏳ 資料載入中...</div></td></tr>';

    const { data, error } = await _supabase.from('qsl_records').select('*').order('id', { ascending: true });

    if (error) { manageTableBody.innerHTML = '<tr><td colspan="6"><div class="empty-state">資料載入失敗</div></td></tr>'; return; }
    if (data.length === 0) { manageTableBody.innerHTML = '<tr><td colspan="6"><div class="empty-state">目前沒有通聯紀錄</div></td></tr>'; return; }

    manageTableBody.innerHTML = data.map(r => {
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

        // 收到圖片區塊
        const recvHtml = `
            <div class="upload-btns" style="margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <label for="recv-${r.id}">📥 收到</label>
                <input type="file" id="recv-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'received', event)">
                ${r.receivedImg ? `<img src="${r.receivedImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.receivedImg}')">` : ''}
                ${r.receivedImg ? `<button onclick="deleteQslImage(${r.id}, 'received')" style="background:#fde8e8; color:#b03030; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.75rem;">刪除</button>` : ''}
            </div>`;

        // 發出圖片區塊
        const sentHtml = `
            <div class="upload-btns" style="display:flex; align-items:center; gap:6px;">
                <label for="sent-${r.id}">📤 發出</label>
                <input type="file" id="sent-${r.id}" accept="image/*" onchange="handleQslImageUpload(${r.id}, 'sent', event)">
                ${r.sentImg ? `<img src="${r.sentImg}" class="qsl-thumb" style="width:40px;height:28px;" onclick="openLightbox('${r.sentImg}')">` : ''}
                ${r.sentImg ? `<button onclick="deleteQslImage(${r.id}, 'sent')" style="background:#fde8e8; color:#b03030; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.75rem;">刪除</button>` : ''}
            </div>`;

        return `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td>${escapeHtml(r.band)}</td>
            <td>${escapeHtml(r.mode)}</td>
            <td>${reqHtml}</td>
            <td>${recvHtml}${sentHtml}</td>
        </tr>`;
    }).join('');
}

// ---------- 刪除單筆圖片 (從 Storage 與資料庫移除) ----------
async function deleteQslImage(recordId, type) {
    if (!confirm(`確定要刪除這張「${type === 'received' ? '收到' : '發出'}」的 QSL 圖片嗎？`)) return;

    // 1. 從資料庫取得該圖片的網址
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('receivedImg, sentImg').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到紀錄'); return; }

    const imgUrl = type === 'received' ? record.receivedImg : record.sentImg;
    if (!imgUrl) return;

    // 2. 解析檔名，準備從 Storage 刪除實體檔案
    try {
        // 網址格式通常長這樣：https://.../storage/v1/object/public/qsl-images/12345.jpg
        // 我們把最後面的檔名切出來
        const fileName = imgUrl.split('/').pop();
        
        // 執行 Storage 刪除
        if (fileName) {
            await _supabase.storage.from('qsl-images').remove([fileName]);
        }
    } catch (e) {
        console.error('Storage 實體檔案刪除失敗:', e);
    }

    // 3. 清空資料庫欄位
    const updateData = {};
    updateData[type === 'received' ? 'receivedImg' : 'sentImg'] = null;

    const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);

    if (dbError) {
        showToast('❌ 刪除失敗');
        console.error(dbError);
    } else {
        showToast('🗑️ 圖片已刪除');
        renderAdminTable();
        calculateStorageUsage(); // 重新計算空間
    }
}

// ---------- 處理使用者的申請 ----------
async function deleteRequest(recordId, reqIndex) {
    if (!confirm('確定要刪除這筆使用者的換卡申請嗎？')) return;
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到該筆資料'); return; }
    let requests = record.requests || [];
    requests.splice(reqIndex, 1);
    const { error: updateError } = await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    if (updateError) { showToast('❌ 刪除失敗'); } else { showToast('🗑️ 已刪除該筆申請'); renderAdminTable(); calculateStorageUsage(); }
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
// 圖片上傳到 Supabase Storage
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
    if (uploadError) { 
        console.error("Storage上傳失敗:", uploadError);
        showToast('❌ 圖片上傳失敗: ' + uploadError.message); 
        event.target.value=''; 
        return; 
    }

    const { data: { publicUrl } } = _supabase.storage.from('qsl-images').getPublicUrl(fileName);
    const updateData = {};
    updateData[type === 'received' ? 'receivedImg' : 'sentImg'] = publicUrl;

    const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
    
    if (dbError) { 
        console.error("資料庫更新失敗詳情:", dbError);
        showToast('❌ 資料庫更新失敗: ' + dbError.message); 
    } 
    else { 
        showToast('✅ 圖片上傳成功'); 
        renderAdminTable(); 
        calculateStorageUsage(); 
    }
    event.target.value = '';
}

// ============================================================
// ADIF 上傳與手動新增
// ============================================================
function handleAdifSelect(event) {
    const file = event.target.files[0];
    if (file) { selectedAdifFile = file; document.getElementById('adifFileNameDisplay').textContent = `已選擇：${file.name}`; }
    else { selectedAdifFile = null; document.getElementById('adifFileNameDisplay').textContent = ''; }
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
        if (fieldName === 'EOR') { if (Object.keys(current).length > 0) { records.push({ ...current }); current = {}; } } 
        else if (fieldName === 'QSO_DATE') { let d = value; if (d.length === 8) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; current.date = d; } 
        else if (fieldName === 'CALL') { current.call = value.toUpperCase(); } 
        else if (fieldName === 'BAND') { current.band = value; } 
        else if (fieldName === 'MODE') { current.mode = value.toUpperCase(); } 
        else if (fieldName === 'COMMENT' || fieldName === 'NOTES') { current.note = (current.note || '') + value; }
    }
    if (Object.keys(current).length > 0) records.push({ ...current });
    return records;
}

async function uploadADIF() {
    if (!selectedAdifFile) { showToast('請先選擇 ADIF 檔案'); return; }
    const btnUploadADIF = document.getElementById('btnUploadADIF');
    const reader = new FileReader();
    reader.onload = async function(e) {
        const parsed = parseADIF(e.target.result);
        let newRecords = []; 
        for (const p of parsed) {
            if (!p.call) continue;
            newRecords.push({ date: p.date || '—', call: p.call, band: p.band || '—', mode: p.mode || '—', note: p.note || '', requests: [] });
        }
        if (newRecords.length > 0) {
            btnUploadADIF.disabled = true; btnUploadADIF.textContent = `⏳ 匯入中...`;
            const { error } = await _supabase.from('qsl_records').insert(newRecords);
            btnUploadADIF.disabled = false; btnUploadADIF.textContent = '上傳並匯入';
            showToast(error ? '❌ 匯入失敗' : `✅ 成功匯入 ${newRecords.length} 筆紀錄`);
            if(!error) { renderAdminTable(); calculateStorageUsage(); }
        } else { showToast('⚠️ 無有效資料'); }
        document.getElementById('adifFile').value = ''; document.getElementById('adifFileNameDisplay').textContent = ''; selectedAdifFile = null;
    };
    reader.readAsText(selectedAdifFile);
}

async function addManualRecord() {
    const btnAddManual = document.getElementById('btnAddManual');
    const date = document.getElementById('manualDate').value;
    const call = document.getElementById('manualCall').value.trim().toUpperCase();
    const band = document.getElementById('manualBand').value.trim();
    const mode = document.getElementById('manualMode').value.trim().toUpperCase();
    const note = document.getElementById('manualNote').value.trim();
    if (!date || !call || !band || !mode) { showToast('請填寫完整欄位'); return; }

    btnAddManual.disabled = true; btnAddManual.textContent = '新增中...';
    const { error } = await _supabase.from('qsl_records').insert([{ date, call, band, mode, note, requests: [] }]);
    btnAddManual.disabled = false; btnAddManual.textContent = '新增紀錄';
    
    if (error) { showToast('❌ 新增失敗'); } 
    else {
        showToast(`✅ 已新增 ${call}`);
        document.getElementById('manualDate').value = ''; document.getElementById('manualCall').value = '';
        document.getElementById('manualBand').value = ''; document.getElementById('manualMode').value = ''; document.getElementById('manualNote').value = '';
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
    document.getElementById('btnAddManual')?.addEventListener('click', addManualRecord);
    document.getElementById('btnCheckUpdate')?.addEventListener('click', checkUpdate);

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
});