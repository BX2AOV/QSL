/* ============================================================
   apply.html 專用邏輯：查詢通聯 → 填收件資訊 → 送出申請
   依賴 script.js 提供的全域變數與函式：
   - qslRecords（陣列）
   - showToast(msg)
   - escapeHtml(text)
   - computeQslStatus(record)
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    let queryCallsign = '';
    let matchedRecords = [];
    let selectedRecordIds = new Set();

    const queryInput = document.getElementById('queryCallsignInput');
    const btnQuery = document.getElementById('btnQuery');
    const queryHint = document.getElementById('queryResultHint');
    const queryResultCard = document.getElementById('queryResultCard');
    const queryResultBody = document.getElementById('queryResultBody');
    const shipInfoCard = document.getElementById('shipInfoCard');
    const selectAllCheckbox = document.getElementById('selectAll');
    const selectedCountHint = document.getElementById('selectedCountHint');

    // ---------- 查詢通聯紀錄 ----------
    function doQuery() {
        const call = queryInput.value.trim().toUpperCase();
        if (!call) {
            showToast('請輸入呼號');
            return;
        }
        queryCallsign = call;
        matchedRecords = qslRecords.filter(r => r.call === call);

        // 查無此呼號 → 明確提示無法換卡
        if (matchedRecords.length === 0) {
            queryResultCard.style.display = 'none';
            shipInfoCard.style.display = 'none';
            queryHint.innerHTML = `<span style="color:#b03030;">❌ 找不到此呼號的通聯記錄，無法申請換卡</span>`;
            showToast('找不到此呼號的通聯記錄，無法換卡');
            return;
        }

        queryHint.innerHTML = `<span style="color:#0e6b3e;">✅ 找到 ${matchedRecords.length} 筆通聯紀錄</span>`;
        selectedRecordIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        renderQueryResult();
        queryResultCard.style.display = 'block';
        shipInfoCard.style.display = 'none';
        queryResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderQueryResult() {
        if (matchedRecords.length === 0) {
            queryResultBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">無紀錄</div></td></tr>`;
            return;
        }
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
                if (this.checked) selectedRecordIds.add(id);
                else selectedRecordIds.delete(id);
                updateSelectedCount();
            });
        });
        updateSelectedCount();
    }

    function updateSelectedCount() {
        const n = selectedRecordIds.size;
        selectedCountHint.textContent = n > 0 ? `已選擇 ${n} 筆通聯` : '請勾選要申請的通聯';
        if (n > 0) {
            shipInfoCard.style.display = 'block';
        } else {
            shipInfoCard.style.display = 'none';
        }
    }

    // 全選
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const boxes = document.querySelectorAll('.record-checkbox:not(:disabled)');
            boxes.forEach(cb => {
                cb.checked = this.checked;
                const id = Number(cb.dataset.id);
                if (this.checked) selectedRecordIds.add(id);
                else selectedRecordIds.delete(id);
            });
            updateSelectedCount();
        });
    }

    // ---------- 送出申請 ----------
    document.getElementById('btnSubmitApplication').addEventListener('click', function() {
        if (!queryCallsign) { showToast('請先查詢呼號'); return; }
        if (selectedRecordIds.size === 0) { showToast('請至少勾選一筆通聯'); return; }

        const name = document.getElementById('shipName').value.trim();
        const phone = document.getElementById('shipPhone').value.trim();
        const zip = document.getElementById('shipZip').value.trim();
        const address = document.getElementById('shipAddress').value.trim();
        const note = document.getElementById('shipNote').value.trim();

        if (!name) { showToast('請填寫收件人'); return; }
        if (!phone) { showToast('請填寫手機號碼'); return; }
        if (!/^09\d{8}$/.test(phone)) { showToast('手機格式錯誤（需為 09 開頭 10 碼）'); return; }
        if (!zip) { showToast('請填寫郵遞區號'); return; }
        if (!/^\d{3,6}$/.test(zip)) { showToast('郵遞區號格式錯誤（3-6 位數字）'); return; }
        if (!address) { showToast('請填寫地址'); return; }

        let count = 0;
        selectedRecordIds.forEach(id => {
            const record = qslRecords.find(r => r.id === id);
            if (!record) return;
            if ((record.requests || []).some(req => req.userCall === queryCallsign)) return;
            if (!record.requests) record.requests = [];
            record.requests.push({
                userCall: queryCallsign,
                requestDate: new Date().toISOString().slice(0, 10),
                status: 'pending',
                shipName: name,
                shipPhone: phone,
                shipZip: zip,
                shipAddress: address,
                shipNote: note
            });
            count++;
        });

        showToast(`✅ 已送出 ${count} 筆 QSL 換卡申請`);
        selectedRecordIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        renderQueryResult();
        renderMyRequests();
        document.getElementById('shipName').value = '';
        document.getElementById('shipPhone').value = '';
        document.getElementById('shipZip').value = '';
        document.getElementById('shipAddress').value = '';
        document.getElementById('shipNote').value = '';
        shipInfoCard.style.display = 'none';
    });

    // ---------- 我的申請紀錄 ----------
    function renderMyRequests() {
        const tbody = document.getElementById('myRequestsBody');
        if (!tbody) return;

        if (!queryCallsign) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">請先查詢您的呼號</div></td></tr>`;
            return;
        }

        const list = [];
        qslRecords.forEach(r => {
            (r.requests || []).forEach(req => {
                if (req.userCall === queryCallsign) list.push({ ...req, record: r });
            });
        });

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">尚無申請紀錄</div></td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(req => {
            let cls = 'badge-pending', txt = '待處理';
            if (req.status === 'approved') { cls = 'badge-approved'; txt = '已核准'; }
            else if (req.status === 'rejected') { cls = 'badge-rejected'; txt = '已拒絕'; }
            const shipInfo = req.shipName ? `${escapeHtml(req.shipName)} / ${escapeHtml(req.shipPhone || '—')}` : '—';
            const addr = req.shipZip ? `${escapeHtml(req.shipZip)} ${escapeHtml(req.shipAddress)}` : '—';
            return `<tr>
                <td>${escapeHtml(req.requestDate)}</td>
                <td><strong>${escapeHtml(req.record.call)}</strong></td>
                <td>${escapeHtml(req.record.date)}</td>
                <td>${escapeHtml(req.record.band)} / ${escapeHtml(req.record.mode)}</td>
                <td>${shipInfo}</td>
                <td>${escapeHtml(req.shipPhone || '—')}</td>
                <td>${addr}</td>
                <td><span class="${cls}">${txt}</span></td>
            </tr>`;
        }).join('');
    }

    // ---------- 事件綁定 ----------
    if (btnQuery) btnQuery.addEventListener('click', doQuery);
    if (queryInput) {
        queryInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') doQuery();
        });
    }

    // 初始渲染
    renderMyRequests();
});1