const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const roleBadge = document.getElementById('roleBadge');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
let selectedAdifFile = null;

function showToast(msg) { const t = document.getElementById('toast'); if(!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(window.tt); window.tt = setTimeout(() => t.classList.remove('show'), 2500); }

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

function logout() { sessionStorage.removeItem('isAdmin'); showToast('👋 已登出'); checkUser(); }

function checkUser() {
    const isLoggedIn = sessionStorage.getItem('isAdmin') === 'true';
    if (isLoggedIn) {
        loginSection.style.display = 'none'; adminPanel.style.display = 'block';
        roleBadge.textContent = '管理員'; roleBadge.className = 'role-badge admin';
    } else {
        loginSection.style.display = 'block'; adminPanel.style.display = 'none';
        roleBadge.textContent = '未登入'; roleBadge.className = 'role-badge';
        document.getElementById('adminUser').value = ''; document.getElementById('adminPassword').value = '';
    }
}

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
    const btnUploadADIF = document.getElementById('btnUploadADIF');
    if (!selectedAdifFile) { showToast('請先選擇 ADIF 檔案'); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const parsed = parseADIF(e.target.result);
        let newRecords = []; let errorCount = 0;
        for (const p of parsed) {
            if (!p.call) { errorCount++; continue; }
            newRecords.push({ date: p.date || '—', call: p.call, band: p.band || '—', mode: p.mode || '—', note: p.note || '', requests: [] });
        }
        if (newRecords.length > 0) {
            btnUploadADIF.disabled = true; btnUploadADIF.textContent = `⏳ 匯入 ${newRecords.length} 筆中...`;
            const { error } = await _supabase.from('qsl_records').insert(newRecords);
            btnUploadADIF.disabled = false; btnUploadADIF.textContent = '上傳並匯入';
            showToast(error ? '❌ 匯入失敗' : `✅ 成功匯入 ${newRecords.length} 筆紀錄`);
            if (error) console.error(error);
        } else { showToast('⚠️ 未找到有效資料'); }
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
    
    if (error) { showToast('❌ 新增失敗'); console.error(error); } 
    else {
        showToast(`✅ 已新增 ${call}`);
        document.getElementById('manualDate').value = ''; document.getElementById('manualCall').value = '';
        document.getElementById('manualBand').value = ''; document.getElementById('manualMode').value = ''; document.getElementById('manualNote').value = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    btnLogin?.addEventListener('click', login);
    btnLogout?.addEventListener('click', logout);
    document.getElementById('adminPassword')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
    document.getElementById('adifFile')?.addEventListener('change', handleAdifSelect);
    document.getElementById('btnUploadADIF')?.addEventListener('click', uploadADIF);
    document.getElementById('btnAddManual')?.addEventListener('click', addManualRecord);
});1