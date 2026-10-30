/* ============================================================
   manage.js - 管理員後台完整邏輯 (安全性強化版)
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
const paginationContainer = document.getElementById('paginationContainer');

let selectedFilesArray = [];
let allRecords = []; 
let filteredRecords = []; 

let currentPage = 1;
const itemsPerPage = 20;

// ============================================================
// 共用工具與轉義
// ============================================================
function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(!t) return; 
    t.textContent = msg; t.classList.add('show'); 
    clearTimeout(window.tt); 
    window.tt = setTimeout(() => t.classList.remove('show'), 4000); 
}

// 文字上下文轉義
function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

// 屬性上下文轉義 (C-2 修復核心)
function escAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function getDaysSince(dateString) {
    if (!dateString) return null;
    const sentDate = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - sentDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// ============================================================
// 登入與登出 (H-2 修復：改用 getSession)
// ============================================================
async function login() {
    const email = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    if (!email || !password) { showToast('請輸入 Email 與密碼'); return; }

    btnLogin.disabled = true; 
    btnLogin.textContent = '登入中...';
    
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });
    
    btnLogin.disabled = false; 
    btnLogin.textContent = '登入';

    if (error) { 
        showToast('❌ 帳號或密碼錯誤'); 
        console.error("登入錯誤:", error.message);
        return; 
    }

    showToast('✅ 管理員登入成功');
    checkUser();
}

async function logout() { 
    await _supabase.auth.signOut();
    showToast('👋 已登出'); 
    checkUser(); 
}

// ============================================================
// 背景清理（原公開首頁的 clever-responder 呼叫）
// ============================================================
async function runCleanupOnce() {
    // 每次瀏覽器 session 只跑一次，避免管理員一直重新整理造成重複觸發
    if (sessionStorage.getItem('qslCleanupDone') === '1') return;
    sessionStorage.setItem('qslCleanupDone', '1');
    try {
        const { data } = await _supabase.functions.invoke('clever-responder');
        if (data && data.success && data.message !== '已清理 0 筆過期紀錄的圖片。') {
            console.log('🧹 背景清理通知：', data.message);
        }
    } catch (e) {
        console.warn('背景清理失敗（不影響後台操作）', e);
    }
}

async function checkUser() {
    // 向 Supabase 確認是否有真實的有效 Session
    const { data: { session }, error } = await _supabase.auth.getSession();
    
    if (session && !error) {
        // 真實登入狀態
        loginSection.style.display = 'none'; 
        adminPanel.style.display = 'block';
        roleBadge.textContent = '管理員'; 
        roleBadge.className = 'role-badge admin';
        renderAdminTable(); 
        calculateStorageUsage(); 

        // 資安：原本公開首頁每次載入都會觸發這支無鑑權的邊緣函式，
        // 任何人狂刷首頁就能無限觸發。改為只有管理員登入後才呼叫。
        runCleanupOnce();
    } else {
        // 未登入
        loginSection.style.display = 'block'; 
        adminPanel.style.display = 'none';
        roleBadge.textContent = '未登入'; 
        roleBadge.className = 'role-badge';
        document.getElementById('adminUser').value = ''; 
        document.getElementById('adminPassword').value = '';
        allRecords = []; // 清空記憶體中的資料
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
        const { data: records, error } = await _supabase.from('qsl_records').select('*');
        if (!error && records) {
            const jsonString = JSON.stringify(records);
            const bytes = new Blob([jsonString]).size;
            const mb = bytes / (1024 * 1024);
            const percent = Math.min((mb / 500) * 100, 100);
            dbBar.style.width = `${Math.max(percent, 0.5)}%`;
            dbText.textContent = `${mb.toFixed(2)} MB / 500 MB (約 ${percent.toFixed(2)}%)`;

            let imgCount = 0;
            records.forEach(r => {
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
// 渲染管理表格與操作 (C-2 修復：移除內聯 onclick)
// ============================================================
async function renderAdminTable() {
    if (!manageTableBody) return;
    
    if (allRecords.length === 0) {
        manageTableBody.innerHTML = '<tr><td colspan="9"><div class="empty-state">⏳ 資料載入中...</div></td></tr>';
        const { data, error } = await _supabase.from('qsl_records').select('*').order('date', { ascending: false }).order('time', { ascending: false });
        
        if (error) { 
            manageTableBody.innerHTML = '<tr><td colspan="9"><div class="empty-state">資料載入失敗</div></td></tr>'; 
            return; 
        }
        
        allRecords = data.map(r => { if (!r.requests) r.requests = []; return r; });
    }

    const searchInput = document.getElementById('adminSearchInput');
    const keyword = searchInput ? searchInput.value.trim().toUpperCase() : '';
    const filterStatus = document.getElementById('filterStatus')?.value || 'all';
    const filterMode = document.getElementById('filterMode')?.value || 'all';

    filteredRecords = allRecords.filter(r => {
        // L-2 修復：防止 null 呼叫 includes 報錯
        const matchKeyword = !keyword || (r.call || '').includes(keyword) || (r.date || '').includes(keyword) || (r.band || '').toUpperCase().includes(keyword);
        const matchStatus = (filterStatus === 'all') || (r.status === filterStatus || (!r.status && filterStatus === 'none'));
        const displayInfo = getDisplayInfo(r);
        const matchMode = (filterMode === 'all') || (displayInfo.mode === filterMode);
        return matchKeyword && matchStatus && matchMode;
    });

    if (filteredRecords.length === 0) {
        manageTableBody.innerHTML = '<tr><td colspan="9"><div class="empty-state">🔍 找不到符合條件的紀錄</div></td></tr>';
        if(paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    manageTableBody.innerHTML = paginatedRecords.map(r => {
        const display = getDisplayInfo(r); 

        let reqHtml = '<div class="req-empty">尚無申請</div>';
        if (r.requests && r.requests.length > 0) {
            reqHtml = r.requests.map((req, idx) => {
                let statusHtml = '';
                if (req.status === 'pending') statusHtml = '<span class="badge-pending" style="margin-left:4px;">待處理</span>';
                else if (req.status === 'approved') statusHtml = '<span class="badge-approved" style="margin-left:4px;">已核准</span>';
                else if (req.status === 'rejected') statusHtml = '<span class="badge-rejected" style="margin-left:4px;">已拒絕</span>';

                return `
                <div class="req-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                        <div><strong class="req-call">👤 ${escapeHtml(req.userCall)}</strong>${statusHtml}</div>
                        <button class="btn-delete-req" data-id="${escAttr(r.id)}" data-idx="${escAttr(idx)}">刪除申請</button>
                    </div>
                    <div class="req-detail">
                        <strong>收件人：</strong>${escapeHtml(req.shipName)}<br>
                        <strong>手機：</strong>${escapeHtml(req.shipPhone)}<br>
                        <strong>地址：</strong>${escapeHtml(req.shipZip)} ${escapeHtml(req.shipAddress)}
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-approve-req" data-id="${escAttr(r.id)}" data-idx="${escAttr(idx)}">核准申請</button>
                        <button class="btn-reject-req" data-id="${escAttr(r.id)}" data-idx="${escAttr(idx)}">拒絕申請</button>
                    </div>
                </div>`;
            }).join('');
        }

        // 有圖片就只顯示圖片 + 刪除；沒有圖片才顯示上傳按鈕
        const recvHtml = r.receivedImg
            ? `<div class="upload-btns" style="margin-bottom:4px;">
                    <img src="${escAttr(r.receivedImg)}" data-src="${escAttr(r.receivedImg)}" class="qsl-thumb" alt="收到的 QSL 卡" loading="lazy">
                    <button class="btn-del-img" data-id="${escAttr(r.id)}" data-type="received">刪除</button>
               </div>`
            : `<div class="upload-btns" style="margin-bottom:4px;">
                    <label for="recv-${escAttr(r.id)}">📥 收到</label>
                    <input type="file" id="recv-${escAttr(r.id)}" class="file-upload-input" data-id="${escAttr(r.id)}" data-type="received" accept="image/*">
               </div>`;
        
        let sentReminderHtml = '';
        if (r.sentImg && r.sentDate) {
            const days = getDaysSince(r.sentDate);
            if (days >= 30) {
                sentReminderHtml = `<div class="reminder-chip warn-chip">⏰ 已寄出 ${days} 天</div>`;
            }
        }
        if (r.status === 'completed' && r.completedDate) {
            const daysSinceComplete = getDaysSince(r.completedDate);
            const daysLeft = 30 - daysSinceComplete;
            if (daysLeft > 0) {
                sentReminderHtml += `<div class="reminder-chip ok-chip">✅ ${daysLeft} 天後清理</div>`;
            }
        }

        const sentHtml = r.sentImg
            ? `<div class="upload-btns">
                    <img src="${escAttr(r.sentImg)}" data-src="${escAttr(r.sentImg)}" class="qsl-thumb" alt="發出的 QSL 卡" loading="lazy">
                    <button class="btn-del-img" data-id="${escAttr(r.id)}" data-type="sent">刪除</button>
               </div>
               ${sentReminderHtml}`
            : `<div class="upload-btns">
                    <label for="sent-${escAttr(r.id)}">📤 發出</label>
                    <input type="file" id="sent-${escAttr(r.id)}" class="file-upload-input" data-id="${escAttr(r.id)}" data-type="sent" accept="image/*">
               </div>`;

        const currentStatus = r.status || 'none';
        
        // 移除 onchange，改用 data 屬性
        const statusSelect = `
            <select class="status-select-change" data-id="${escAttr(r.id)}" aria-label="QSL 狀態">
                <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>未申請</option>
                <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>待處理</option>
                <option value="received_paper" ${currentStatus === 'received_paper' ? 'selected' : ''}>已收到紙卡</option>
                <option value="received_eqsl" ${currentStatus === 'received_eqsl' ? 'selected' : ''}>已收到電子卡</option>
                <option value="sent" ${currentStatus === 'sent' ? 'selected' : ''}>已發出紙卡</option>
                <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>✅ 已交換完成</option>
                <option value="not_needed" ${currentStatus === 'not_needed' ? 'selected' : ''}>無需換卡</option>
            </select>
        `;

        return `<tr>
            <td style="white-space:nowrap;">${escapeHtml(r.date)}</td>
            <td style="white-space:nowrap;"><strong>${escapeHtml(r.time || '—')}</strong></td>
            <td><strong>${escapeHtml(r.call)}</strong></td>
            <td><strong style="color:#0066cc;">${escapeHtml(display.band)}</strong></td>
            <td><span style="font-weight:bold; color:#7b3fa0;">${escapeHtml(display.mode)}</span></td>
            <td>${reqHtml}</td>
            <td>${recvHtml}${sentHtml}</td>
            <td>${statusSelect}</td>
            <td>
                <button class="btn-delete-record" data-id="${escAttr(r.id)}" aria-label="刪除這筆紀錄">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    renderPagination(totalPages);
}

// ============================================================
// 分頁按鈕渲染
// ============================================================
function renderPagination(totalPages) {
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    const btnStyle = 'padding: 8px 16px; border-radius: 40px; border: 1px solid #cbdae8; background: #fff; color: #1f3a5f; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: 0.2s;';
    const disabledStyle = 'opacity: 0.5; cursor: not-allowed;';

    paginationContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px;';
    paginationContainer.innerHTML = `
        <button id="btnAdminPrev" style="${btnStyle} ${currentPage === 1 ? disabledStyle : ''}" ${currentPage === 1 ? 'disabled' : ''}>上一頁</button>
        <span style="font-size: 0.9rem; color: #5a6e85; font-weight: bold;">第 ${currentPage} / ${totalPages} 頁</span>
        <button id="btnAdminNext" style="${btnStyle} ${currentPage === totalPages ? disabledStyle : ''}" ${currentPage === totalPages ? 'disabled' : ''}>下一頁</button>
    `;

    document.getElementById('btnAdminPrev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderAdminTable();
            document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    document.getElementById('btnAdminNext').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderAdminTable();
            document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

// ============================================================
// 其他操作 (狀態修改、刪除、上傳圖片)
// ============================================================
async function changeStatus(recordId, newStatus) {
    showToast('⏳ 更新狀態中...');
    const updateData = { status: newStatus };
    
    if (newStatus === 'completed') {
        updateData.completedDate = new Date().toISOString();
    } else {
        updateData.completedDate = null;
    }

    const { error } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
    if (error) { showToast('❌ 更新失敗'); } 
    else { 
        showToast('✅ 狀態已更新'); 
        allRecords = []; 
        renderAdminTable();
    }
}

async function deleteRecord(recordId) {
    if (!confirm('⚠️ 警告：您確定要刪除這筆通聯紀錄嗎？\n這將會連同該筆的所有申請資料一起刪除！')) return;
    showToast('⏳ 正在刪除...');
    const { error } = await _supabase.from('qsl_records').delete().eq('id', recordId);
    if (error) { showToast('❌ 刪除失敗：' + error.message); } 
    else { showToast('🗑️ 已成功刪除該筆通聯紀錄'); allRecords = []; renderAdminTable(); calculateStorageUsage(); }
}

async function deleteQslImage(recordId, type) {
    if (!confirm(`確定要刪除這張「${type === 'received' ? '收到' : '發出'}」的 QSL 圖片嗎？`)) return;
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('receivedImg, sentImg').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到紀錄'); return; }
    const imgUrl = type === 'received' ? record.receivedImg : record.sentImg;
    if (!imgUrl) return;
    try {
        const fileName = imgUrl.split('/').pop();
        if (fileName) {
            // 連同列表用的縮圖一起刪（縮圖不存在時忽略錯誤）
            await _supabase.storage.from('qsl-images').remove([fileName]);
            const thumbName = fileName.replace(/\.(jpe?g|png)$/i, '_thumb.jpg');
            if (thumbName !== fileName) {
                await _supabase.storage.from('qsl-images').remove([thumbName]);
            }
        }
    } catch (e) { console.error('Storage 刪除失敗:', e); }
    
    const updateData = {};
    updateData[type === 'received' ? 'receivedImg' : 'sentImg'] = null;
    if (type === 'sent') updateData.sentDate = null;
    
    const currentRecord = allRecords.find(r => r.id === recordId);
    if (currentRecord) {
        if (type === 'received' && currentRecord.status === 'completed') {
            updateData.status = currentRecord.sentImg ? 'sent' : 'pending';
            updateData.completedDate = null;
        } else if (type === 'sent' && currentRecord.status === 'completed') {
            updateData.status = currentRecord.receivedImg ? 'received_paper' : 'pending';
            updateData.completedDate = null;
        }
    }

    const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
    if (dbError) { showToast('❌ 刪除失敗'); } 
    else { showToast('🗑️ 圖片已刪除'); allRecords = []; renderAdminTable(); calculateStorageUsage(); }
}

async function deleteRequest(recordId, reqIndex) {
    if (!confirm('確定要刪除這筆使用者的換卡申請嗎？')) return;
    const { data: record, error: fetchError } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (fetchError || !record) { showToast('❌ 找不到該筆資料'); return; }
    let requests = record.requests || [];
    requests.splice(reqIndex, 1);
    const { error: updateError } = await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    if (updateError) { showToast('❌ 刪除失敗'); } 
    else { showToast('🗑️ 已刪除該筆申請'); allRecords = []; renderAdminTable(); }
}

async function approveRequest(recordId, reqIndex) {
    const { data: record } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (!record) return;
    let requests = record.requests;
    requests[reqIndex].status = 'approved';
    await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    showToast('✅ 已核准申請'); allRecords = []; renderAdminTable();
}

async function rejectRequest(recordId, reqIndex) {
    const { data: record } = await _supabase.from('qsl_records').select('requests').eq('id', recordId).single();
    if (!record) return;
    let requests = record.requests;
    requests[reqIndex].status = 'rejected';
    await _supabase.from('qsl_records').update({ requests: requests }).eq('id', recordId);
    showToast('已拒絕申請'); allRecords = []; renderAdminTable();
}

// ============================================================
// 圖片上傳與自動判斷完成
// ============================================================
async function handleQslImageUpload(recordId, type, event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('⚠️ 請上傳圖片'); return; }
    
    if (file.size > 10 * 1024 * 1024) { showToast('⚠️ 圖片超過 10MB，請重新選擇'); event.target.value = ''; return; }

    showToast('⏳ 圖片壓縮與上傳中...');

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const MAX_WIDTH = 1200;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 直接用 canvas.toBlob 產生檔案，不要 fetch(dataURL)
            // （CSP 的 connect-src 不含 data:，fetch 會被擋下）
            const blob = await new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
            });

            if (!blob) {
                showToast('❌ 圖片處理失敗，請換一張圖片再試');
                event.target.value = '';
                return;
            }
            
            const fileExt = 'jpg';
            const fileName = `${Date.now()}_${recordId}_${type}.${fileExt}`;

            // 先產生列表用縮圖（寬 160px），讓首頁不必下載原圖
            const thumbName = fileName.replace(/\.jpg$/, '_thumb.jpg');
            const thumbBlob = await new Promise((resolve) => {
                const tw = 160;
                const th = Math.max(1, Math.round((height * tw) / width));
                const tc = document.createElement('canvas');
                tc.width = tw;
                tc.height = th;
                tc.getContext('2d').drawImage(img, 0, 0, tw, th);
                tc.toBlob((b) => resolve(b), 'image/jpeg', 0.72);
            });

            const { error: uploadError } = await _supabase.storage.from('qsl-images').upload(fileName, blob, { contentType: 'image/jpeg' });
            
            if (uploadError) { 
                showToast('❌ 圖片上傳失敗: ' + uploadError.message); 
                event.target.value=''; 
                return; 
            }

            // 縮圖上傳失敗不影響主圖（不覆寫，避免需要 UPDATE policy）
            if (thumbBlob) {
                const { error: thumbError } = await _supabase.storage
                    .from('qsl-images')
                    .upload(thumbName, thumbBlob, { contentType: 'image/jpeg' });
                if (thumbError) console.warn('縮圖上傳失敗（不影響主圖）:', thumbError.message);
            }

            const { data: { publicUrl } } = _supabase.storage.from('qsl-images').getPublicUrl(fileName);
            const updateData = {};
            
            const currentRecord = allRecords.find(r => r.id === recordId);
            let willBeCompleted = false;

            if (type === 'received') {
                updateData.receivedImg = publicUrl;
                if (currentRecord && currentRecord.sentImg) {
                    willBeCompleted = true;
                }
            } else if (type === 'sent') {
                updateData.sentImg = publicUrl;
                updateData.sentDate = new Date().toISOString();
                if (currentRecord && currentRecord.receivedImg) {
                    willBeCompleted = true;
                }
            }

            if (willBeCompleted) {
                updateData.status = 'completed';
                updateData.completedDate = new Date().toISOString();
            } else {
                if (type === 'sent') {
                    updateData.status = 'sent';
                } else if (type === 'received') {
                    if (currentRecord && (currentRecord.status === 'none' || currentRecord.status === 'pending' || !currentRecord.status)) {
                        updateData.status = 'received_paper';
                    }
                }
            }

            const { error: dbError } = await _supabase.from('qsl_records').update(updateData).eq('id', recordId);
            if (dbError) { showToast('❌ 資料庫更新失敗: ' + dbError.message); } 
            else { 
                if (willBeCompleted) {
                    showToast('🎉 雙方圖片已齊全，狀態已改為「已交換完成」！');
                } else {
                    showToast(type === 'sent' ? '✅ 圖片已上傳，狀態已改為「已發出」' : '✅ 圖片上傳成功'); 
                }
                allRecords = []; 
                renderAdminTable(); 
                calculateStorageUsage(); 
            }
            event.target.value = '';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ============================================================
// 一次性補產生縮圖（給先前已上傳、沒有 _thumb 檔的舊圖片）
// ============================================================
async function buildMissingThumbs() {
    const btn = document.getElementById('btnBuildThumbs');
    const info = document.getElementById('thumbProgress');
    if (!btn || btn.disabled) return;

    const targets = [];
    (allRecords || []).forEach(r => {
        ['receivedImg', 'sentImg'].forEach(k => {
            const url = r[k];
            if (url) targets.push({ id: r.id, key: k, url });
        });
    });

    if (targets.length === 0) {
        if (info) info.textContent = '沒有找到任何 QSL 圖片。';
        return;
    }

    btn.disabled = true;
    let done = 0, created = 0, skipped = 0, failed = 0;

    for (const t of targets) {
        done++;
        if (info) info.textContent = `處理中 ${done}/${targets.length}…（新增 ${created}，略過 ${skipped}，失敗 ${failed}）`;

        const fileName = t.url.split('/').pop();
        if (!fileName || !/\.(jpe?g|png)$/i.test(fileName)) { skipped++; continue; }
        const thumbName = fileName.replace(/\.(jpe?g|png)$/i, '_thumb.jpg');

        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((ok, no) => {
                img.onload = ok;
                img.onerror = () => no(new Error('load failed'));
                img.src = t.url;
            });

            const tw = 160;
            const th = Math.max(1, Math.round((img.height * tw) / img.width));
            const tc = document.createElement('canvas');
            tc.width = tw;
            tc.height = th;
            tc.getContext('2d').drawImage(img, 0, 0, tw, th);
            const blob = await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.72));
            if (!blob) { failed++; continue; }

            const { error } = await _supabase.storage
                .from('qsl-images')
                .upload(thumbName, blob, { contentType: 'image/jpeg' });

            if (error) {
                const msg = (error.message || '').toLowerCase();
                if (msg.includes('duplicate') || msg.includes('already exists') || error.statusCode === 409) {
                    skipped++;
                } else {
                    failed++;
                    console.warn('縮圖失敗:', fileName, error.message);
                }
            } else {
                created++;
            }
        } catch (e) {
            failed++;
            console.warn('縮圖失敗:', fileName, e);
        }
    }

    btn.disabled = false;
    if (info) info.textContent = `✅ 完成：新增 ${created} 張縮圖，略過 ${skipped} 張（已存在或格式不符），失敗 ${failed} 張。`;
    showToast(`✅ 縮圖處理完成：新增 ${created} 張`);
}

// ============================================================
// ADIF 上傳與手動新增
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
        else if (fieldName === 'FREQ') { current.freq = parseFloat(value); } 
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

    const { data: existingRecords, error: fetchError } = await _supabase.from('qsl_records').select('date, time, call, band, mode, note');
    if (fetchError) { showToast('❌ 無法讀取資料庫進行比對'); btnUploadADIF.disabled = false; btnUploadADIF.textContent = '全部上傳並匯入'; return; }

    let allNewRecords = [];
    let processed = 0;
    let duplicateCount = 0;

    const readPromises = selectedFilesArray.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const parsed = parseADIF(e.target.result);
                for (const p of parsed) {
                    if (!p.call) continue;
                    
                    const isDuplicate = existingRecords.some(ex => {
                        if (ex.call !== p.call || ex.mode !== p.mode || ex.date !== p.date) return false;

                        if (p.freq && ex.note) {
                            const match = ex.note.match(/FREQ:([\d.]+)/);
                            if (match) {
                                const exFreq = parseFloat(match[1]);
                                if (Math.abs(exFreq - p.freq) > 0.005) return false;
                            }
                        } else if (ex.band !== p.band) {
                            return false;
                        }

                        const exTime = timeToMinutes(ex.time);
                        const newTime = timeToMinutes(p.time);
                        return Math.abs(exTime - newTime) <= 3;
                    });

                    if (isDuplicate) { duplicateCount++; continue; }

                    let noteStr = p.note || '';
                    if (p.satName) noteStr = `[${p.satName}] 衛星通聯 ${noteStr}`.trim();
                    if (p.freq) noteStr = `FREQ:${p.freq} ${noteStr}`.trim();

                    let finalBand = p.band || '—';
                    if (p.freq) {
                        finalBand = p.freq.toString();
                    }

                    allNewRecords.push({ 
                        date: p.date || '—', 
                        time: p.time || '—',
                        call: p.call, 
                        band: finalBand, 
                        mode: p.mode || '—', 
                        note: noteStr, 
                        requests: [] 
                    });
                }
                processed++;
                btnUploadADIF.textContent = `⏳ 比對中 (${processed}/${selectedFilesArray.length})...`;
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
            let msg = `✅ 新增 ${allNewRecords.length} 筆`;
            if (duplicateCount > 0) msg += `，跳過 ${duplicateCount} 筆重複`;
            showToast(msg);
            allRecords = []; 
            renderAdminTable(); calculateStorageUsage();
        }
    } else { 
        showToast(`⚠️ 無有效資料 (跳過 ${duplicateCount} 筆重複)`); 
    }

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
        allRecords = []; 
        renderAdminTable(); calculateStorageUsage();
    }
}

// ============================================================
// 初始化與事件委託綁定
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    btnLogin?.addEventListener('click', login);
    btnLogout?.addEventListener('click', logout);
    document.getElementById('btnPrint')?.addEventListener('click', function () { window.print(); });
    document.getElementById('adminPassword')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
    
    document.getElementById('adifFile')?.addEventListener('change', handleAdifSelect);
    document.getElementById('btnUploadADIF')?.addEventListener('click', uploadADIF);
    document.getElementById('btnClearFiles')?.addEventListener('click', clearSelectedFiles);
    
    document.getElementById('btnAddManual')?.addEventListener('click', addManualRecord);
    document.getElementById('btnBuildThumbs')?.addEventListener('click', buildMissingThumbs);
    document.getElementById('adminSearchInput')?.addEventListener('input', function() { currentPage = 1; renderAdminTable(); });
    document.getElementById('filterStatus')?.addEventListener('change', function() { currentPage = 1; renderAdminTable(); });
    document.getElementById('filterMode')?.addEventListener('change', function() { currentPage = 1; renderAdminTable(); });

    document.getElementById('btnSyncLoTW')?.addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        btn.textContent = '⏳ 正在從 LoTW 抓取資料...';

        const { data, error } = await _supabase.functions.invoke('swift-task');

        btn.disabled = false;
        btn.textContent = '🔄 從 LoTW 自動同步已確認卡片';

        if (error) {
            showToast('❌ 同步失敗: ' + error.message);
            console.error(error);
        } else if (data && data.error) {
            showToast('❌ 錯誤: ' + data.error);
        } else {
            showToast('✅ ' + (data.message || '同步成功！'));
            allRecords = []; 
            renderAdminTable(); 
        }
    });

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    // ============================================================
    // C-2 事件委託：處理表格內所有按鈕與圖片、下拉選單
    // ============================================================
    manageTableBody?.addEventListener('click', (e) => {
        // 1. 圖片燈箱
        const img = e.target.closest('.qsl-thumb');
        if (img) {
            const src = img.dataset.src || img.getAttribute('src');
            if (src) openLightbox(src);
            return;
        }

        // 2. 刪除申請
        const btnDelReq = e.target.closest('.btn-delete-req');
        if (btnDelReq) {
            deleteRequest(Number(btnDelReq.dataset.id), Number(btnDelReq.dataset.idx));
            return;
        }

        // 3. 核准申請
        const btnApprove = e.target.closest('.btn-approve-req');
        if (btnApprove) {
            approveRequest(Number(btnApprove.dataset.id), Number(btnApprove.dataset.idx));
            return;
        }

        // 4. 拒絕申請
        const btnReject = e.target.closest('.btn-reject-req');
        if (btnReject) {
            rejectRequest(Number(btnReject.dataset.id), Number(btnReject.dataset.idx));
            return;
        }

        // 5. 刪除圖片
        const btnDelImg = e.target.closest('.btn-del-img');
        if (btnDelImg) {
            deleteQslImage(Number(btnDelImg.dataset.id), btnDelImg.dataset.type);
            return;
        }

        // 6. 刪除整筆紀錄
        const btnDelRecord = e.target.closest('.btn-delete-record');
        if (btnDelRecord) {
            deleteRecord(Number(btnDelRecord.dataset.id));
            return;
        }
    });

    // 處理下拉選單改變
    manageTableBody?.addEventListener('change', (e) => {
        const select = e.target.closest('.status-select-change');
        if (select) {
            changeStatus(Number(select.dataset.id), select.value);
            return;
        }

        // 處理圖片上傳
        const fileInput = e.target.closest('.file-upload-input');
        if (fileInput && fileInput.files.length > 0) {
            handleQslImageUpload(Number(fileInput.dataset.id), fileInput.dataset.type, e);
        }
    });
});
