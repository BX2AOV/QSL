const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function showToast(msg) { const t = document.getElementById('toast'); if(!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(window.tt); window.tt = setTimeout(() => t.classList.remove('show'), 2500); }
function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function computeQslStatus(r) { if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: '雙向完成' }; if (r.receivedImg) return { cls: 'badge-received', text: '已收到' }; if (r.sentImg) return { cls: 'badge-sent', text: '已發出' }; return { cls: 'badge-pending', text: '待處理' }; }

document.addEventListener('DOMContentLoaded', function() {
    const btnQuery = document.getElementById('btnQuery');
    if (!btnQuery) return;

    let queryCallsign = '';
    let matchedRecords = [];
    let selectedRecordIds = new Set();

    const queryInput = document.getElementById('queryCallsignInput');
    const queryHint = document.getElementById('queryResultHint');
    const queryResultCard = document.getElementById('queryResultCard');
    const queryResultBody = document.getElementById('queryResultBody');
    const shipInfoCard = document.getElementById('shipInfoCard');
    const selectAllCheckbox = document.getElementById('selectAll');
    const selectedCountHint = document.getElementById('selectedCountHint');
    const btnSubmit = document.getElementById('btnSubmitApplication');

    async function doQuery() {
        const call = queryInput.value.trim().toUpperCase();
        if (!call) { showToast('請輸入呼號'); return; }
        queryCallsign = call;
        queryHint.innerHTML = '<span style="color:#5a6e85;">⏳ 查詢中...</span>';

        const { data, error } = await _supabase.from('qsl_records').select('*').eq('call', call);

        if (error) { queryHint.innerHTML = '<span style="color:#b03030;">❌ 系統錯誤</span>'; return; }

        matchedRecords = data || [];
        if (matchedRecords.length === 0) {
            queryResultCard.style.display = 'none';
            shipInfoCard.style.display = 'none';
            queryHint.innerHTML = '<span style="color:#b03030;">❌ 找不到此呼號的通聯記錄，無法申請換卡</span>';
            showToast('找不到記錄'); return;
        }

        queryHint.innerHTML = '<span style="color:#0e6b3e;">✅ 找到 ' + matchedRecords.length + ' 筆通聯紀錄</span>';
        selectedRecordIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        matchedRecords.forEach(r => { if (!r.requests) r.requests = []; });
        
        renderQueryResult();
        queryResultCard.style.display = 'block';
        shipInfoCard.style.display = 'none';
        queryResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderQueryResult() {
        queryResultBody.innerHTML = matchedRecords.map(r => {
            const st = computeQslStatus(r);
            const already = (r.requests || []).some(req => req.userCall === queryCallsign);
            const checked = selectedRecordIds.has(r.id) ? 'checked' : '';
            const disabled = already ? 'disabled' : '';
            const alreadyTag = already ? ' <span class="badge-requested">已申請</span>' : '';
            
            return `<tr>
                <td><input type="checkbox" class="record-checkbox" data-id="${r.id}" ${checked} ${disabled}></td>
                <td>${escapeHtml(r.date)}</td>
                <td><strong>${escapeHtml(r.call)}</strong></td>
                <td>${escapeHtml(r.band)}</td>
                <td>${escapeHtml(r.mode)}</td>
                <td><span class="${st.cls}">${st.text}</span>${alreadyTag}</td>
                <td>${escapeHtml(r.note || '—')}</td>
            </tr>`;
        }).join('');

        document.querySelectorAll('.record-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
                const id = Number(this.dataset.id);
                if (this.checked) selectedRecordIds.add(id); else selectedRecordIds.delete(id);
                updateSelectedCount();
            });
        });
        updateSelectedCount();
    }

    function updateSelectedCount() {
        const n = selectedRecordIds.size;
        selectedCountHint.textContent = n > 0 ? '已選擇 ' + n + ' 筆通聯' : '請勾選要申請的通聯';
        shipInfoCard.style.display = n > 0 ? 'block' : 'none';
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const boxes = document.querySelectorAll('.record-checkbox:not(:disabled)');
            boxes.forEach(cb => {
                cb.checked = this.checked;
                const id = Number(cb.dataset.id);
                if (this.checked) selectedRecordIds.add(id); else selectedRecordIds.delete(id);
            });
            updateSelectedCount();
        });
    }

    if (btnSubmit) {
        btnSubmit.addEventListener('click', async function() {
            if (selectedRecordIds.size === 0) { showToast('請至少勾選一筆'); return; }
            const name = document.getElementById('shipName').value.trim();
            const phone = document.getElementById('shipPhone').value.trim();
            const zip = document.getElementById('shipZip').value.trim();
            const address = document.getElementById('shipAddress').value.trim();
            const note = document.getElementById('shipNote').value.trim();

            if (!name || !phone || !zip || !address) { showToast('請填寫完整收件資訊'); return; }
            if (!/^09\d{8}$/.test(phone)) { showToast('手機格式錯誤'); return; }

            btnSubmit.disabled = true; btnSubmit.textContent = '處理中...';
            let count = 0, hasError = false;

            for (const id of selectedRecordIds) {
                const record = matchedRecords.find(r => r.id === id);
                if (!record || record.requests.some(req => req.userCall === queryCallsign)) continue;

                const newReq = { userCall: queryCallsign, requestDate: new Date().toISOString().slice(0, 10), status: 'pending', shipName: name, shipPhone: phone, shipZip: zip, shipAddress: address, shipNote: note };
                const updatedRequests = [...record.requests, newReq];

                const { error } = await _supabase.from('qsl_records').update({ requests: updatedRequests }).eq('id', id);
                if (error) { hasError = true; } else { record.requests = updatedRequests; count++; }
            }

            btnSubmit.disabled = false; btnSubmit.textContent = '送出 QSL 換卡申請';
            showToast(hasError ? '⚠️ 部分失敗' : `✅ 已送出 ${count} 筆申請`);

            selectedRecordIds.clear();
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            renderQueryResult();
            renderMyRequests();
            
            document.getElementById('shipName').value = ''; document.getElementById('shipPhone').value = '';
            document.getElementById('shipZip').value = ''; document.getElementById('shipAddress').value = ''; document.getElementById('shipNote').value = '';
            shipInfoCard.style.display = 'none';
        });
    }

    function renderMyRequests() {
        const tbody = document.getElementById('myRequestsBody');
        if (!queryCallsign) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">請先查詢您的呼號</div></td></tr>'; return; }
        
        let list = [];
        matchedRecords.forEach(r => (r.requests || []).forEach(req => { if (req.userCall === queryCallsign) list.push({ ...req, record: r }); }));

        if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">尚無申請紀錄</div></td></tr>'; return; }

        tbody.innerHTML = list.map(req => {
            let cls = 'badge-pending', txt = '待處理';
            if (req.status === 'approved') { cls = 'badge-approved'; txt = '已核准'; }
            else if (req.status === 'rejected') { cls = 'badge-rejected'; txt = '已拒絕'; }
            return `<tr>
                <td>${escapeHtml(req.requestDate)}</td>
                <td><strong>${escapeHtml(req.record.call)}</strong></td>
                <td>${escapeHtml(req.record.date)}</td>
                <td>${escapeHtml(req.record.band)} / ${escapeHtml(req.record.mode)}</td>
                <td>${escapeHtml(req.shipName)} / ${escapeHtml(req.shipPhone)}</td>
                <td>${escapeHtml(req.shipPhone)}</td>
                <td>${escapeHtml(req.shipZip)} ${escapeHtml(req.shipAddress)}</td>
                <td><span class="${cls}">${txt}</span></td>
            </tr>`;
        }).join('');
    }

    btnQuery.addEventListener('click', doQuery);
    queryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); doQuery(); } });
    renderMyRequests();
});