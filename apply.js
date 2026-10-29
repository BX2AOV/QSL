/* ============================================================
   apply.html 專用邏輯（完全獨立，不依賴 script.js）
   ============================================================ */

// ---------- 模擬資料庫 ----------
var qslRecords = [
    { id: 1, date: '2025-01-10', call: 'BM2ABC', band: '20m', mode: 'SSB', note: '等待回卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 2, date: '2025-01-12', call: 'JP1XYZ', band: '15m', mode: 'FT8', note: '已收到紙卡', receivedImg: null, sentImg: null, requests: [] },
    { id: 3, date: '2025-01-15', call: 'BM2ABC', band: '40m', mode: 'CW', note: '已寄出', receivedImg: null, sentImg: null, requests: [] },
    { id: 4, date: '2025-01-18', call: 'W6GHI', band: '10m', mode: 'SSB', note: '透過 Bureau', receivedImg: null, sentImg: null, requests: [] },
    { id: 5, date: '2025-01-20', call: 'JP1XYZ', band: '2m', mode: 'FM', note: '本地交換', receivedImg: null, sentImg: null, requests: [] }
];

// ---------- 工具函式 ----------
function showToast(msg) {
    var toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(function() {
        toastEl.classList.remove('show');
    }, 2500);
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function computeQslStatus(r) {
    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: '雙向完成' };
    if (r.receivedImg) return { cls: 'badge-received', text: '已收到' };
    if (r.sentImg) return { cls: 'badge-sent', text: '已發出' };
    return { cls: 'badge-pending', text: '待處理' };
}

// ---------- 主邏輯 ----------
(function() {
    function init() {
        var btnQuery = document.getElementById('btnQuery');
        if (!btnQuery) return; // 確保在 apply.html 才執行

        var queryCallsign = '';
        var matchedRecords = [];
        var selectedRecordIds = new Set();

        var queryInput = document.getElementById('queryCallsignInput');
        var queryHint = document.getElementById('queryResultHint');
        var queryResultCard = document.getElementById('queryResultCard');
        var queryResultBody = document.getElementById('queryResultBody');
        var shipInfoCard = document.getElementById('shipInfoCard');
        var selectAllCheckbox = document.getElementById('selectAll');
        var selectedCountHint = document.getElementById('selectedCountHint');
        var btnSubmit = document.getElementById('btnSubmitApplication');

        // ---------- 查詢 ----------
        function doQuery() {
            var call = queryInput.value.trim().toUpperCase();
            if (!call) {
                showToast('請輸入呼號');
                return;
            }
            queryCallsign = call;
            matchedRecords = qslRecords.filter(function(r) { return r.call === call; });

            if (matchedRecords.length === 0) {
                queryResultCard.style.display = 'none';
                shipInfoCard.style.display = 'none';
                queryHint.innerHTML = '<span style="color:#b03030;">❌ 找不到此呼號的通聯記錄，無法申請換卡</span>';
                showToast('找不到此呼號的通聯記錄，無法換卡');
                return;
            }

            queryHint.innerHTML = '<span style="color:#0e6b3e;">✅ 找到 ' + matchedRecords.length + ' 筆通聯紀錄</span>';
            selectedRecordIds.clear();
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            renderQueryResult();
            queryResultCard.style.display = 'block';
            shipInfoCard.style.display = 'none';
            queryResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function renderQueryResult() {
            if (matchedRecords.length === 0) {
                queryResultBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">無紀錄</div></td></tr>';
                return;
            }
            queryResultBody.innerHTML = matchedRecords.map(function(r) {
                var st = computeQslStatus(r);
                var already = (r.requests || []).some(function(req) { return req.userCall === queryCallsign; });
                var checked = selectedRecordIds.has(r.id) ? 'checked' : '';
                var disabled = already ? 'disabled' : '';
                var alreadyTag = already ? ' <span class="badge-requested">已申請</span>' : '';
                return '<tr>' +
                    '<td><input type="checkbox" class="record-checkbox" data-id="' + r.id + '" ' + checked + ' ' + disabled + '></td>' +
                    '<td>' + escapeHtml(r.date) + '</td>' +
                    '<td><strong>' + escapeHtml(r.call) + '</strong></td>' +
                    '<td>' + escapeHtml(r.band) + '</td>' +
                    '<td>' + escapeHtml(r.mode) + '</td>' +
                    '<td><span class="' + st.cls + '">' + st.text + '</span>' + alreadyTag + '</td>' +
                    '<td>' + escapeHtml(r.note || '—') + '</td>' +
                    '</tr>';
            }).join('');

            document.querySelectorAll('.record-checkbox').forEach(function(cb) {
                cb.addEventListener('change', function() {
                    var id = Number(this.dataset.id);
                    if (this.checked) selectedRecordIds.add(id);
                    else selectedRecordIds.delete(id);
                    updateSelectedCount();
                });
            });
            updateSelectedCount();
        }

        function updateSelectedCount() {
            var n = selectedRecordIds.size;
            selectedCountHint.textContent = n > 0 ? '已選擇 ' + n + ' 筆通聯' : '請勾選要申請的通聯';
            shipInfoCard.style.display = n > 0 ? 'block' : 'none';
        }

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                var boxes = document.querySelectorAll('.record-checkbox:not(:disabled)');
                var self = this;
                boxes.forEach(function(cb) {
                    cb.checked = self.checked;
                    var id = Number(cb.dataset.id);
                    if (self.checked) selectedRecordIds.add(id);
                    else selectedRecordIds.delete(id);
                });
                updateSelectedCount();
            });
        }

        // ---------- 送出申請 ----------
        if (btnSubmit) {
            btnSubmit.addEventListener('click', function() {
                if (!queryCallsign) { showToast('請先查詢呼號'); return; }
                if (selectedRecordIds.size === 0) { showToast('請至少勾選一筆通聯'); return; }

                var name = document.getElementById('shipName').value.trim();
                var phone = document.getElementById('shipPhone').value.trim();
                var zip = document.getElementById('shipZip').value.trim();
                var address = document.getElementById('shipAddress').value.trim();
                var note = document.getElementById('shipNote').value.trim();

                if (!name) { showToast('請填寫收件人'); return; }
                if (!phone) { showToast('請填寫手機號碼'); return; }
                if (!/^09\d{8}$/.test(phone)) { showToast('手機格式錯誤（需為 09 開頭 10 碼）'); return; }
                if (!zip) { showToast('請填寫郵遞區號'); return; }
                if (!/^\d{3,6}$/.test(zip)) { showToast('郵遞區號格式錯誤（3-6 位數字）'); return; }
                if (!address) { showToast('請填寫地址'); return; }

                var count = 0;
                selectedRecordIds.forEach(function(id) {
                    var record = qslRecords.find(function(r) { return r.id === id; });
                    if (!record) return;
                    if ((record.requests || []).some(function(req) { return req.userCall === queryCallsign; })) return;
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

                showToast('✅ 已送出 ' + count + ' 筆 QSL 換卡申請');
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
        }

        // ---------- 我的申請紀錄 ----------
        function renderMyRequests() {
            var tbody = document.getElementById('myRequestsBody');
            if (!tbody) return;

            if (!queryCallsign) {
                tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">請先查詢您的呼號</div></td></tr>';
                return;
            }

            var list = [];
            qslRecords.forEach(function(r) {
                (r.requests || []).forEach(function(req) {
                    if (req.userCall === queryCallsign) list.push(Object.assign({}, req, { record: r }));
                });
            });

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">尚無申請紀錄</div></td></tr>';
                return;
            }

            tbody.innerHTML = list.map(function(req) {
                var cls = 'badge-pending', txt = '待處理';
                if (req.status === 'approved') { cls = 'badge-approved'; txt = '已核准'; }
                else if (req.status === 'rejected') { cls = 'badge-rejected'; txt = '已拒絕'; }
                var shipInfo = req.shipName ? escapeHtml(req.shipName) + ' / ' + escapeHtml(req.shipPhone || '—') : '—';
                var addr = req.shipZip ? escapeHtml(req.shipZip) + ' ' + escapeHtml(req.shipAddress) : '—';
                return '<tr>' +
                    '<td>' + escapeHtml(req.requestDate) + '</td>' +
                    '<td><strong>' + escapeHtml(req.record.call) + '</strong></td>' +
                    '<td>' + escapeHtml(req.record.date) + '</td>' +
                    '<td>' + escapeHtml(req.record.band) + ' / ' + escapeHtml(req.record.mode) + '</td>' +
                    '<td>' + shipInfo + '</td>' +
                    '<td>' + escapeHtml(req.shipPhone || '—') + '</td>' +
                    '<td>' + addr + '</td>' +
                    '<td><span class="' + cls + '">' + txt + '</span></td>' +
                    '</tr>';
            }).join('');
        }

        // ---------- 綁定事件 ----------
        btnQuery.addEventListener('click', doQuery);
        queryInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doQuery();
            }
        });

        // 燈箱
        var lb = document.getElementById('lightbox');
        if (lb) lb.addEventListener('click', function() {
            lb.classList.remove('show');
            document.getElementById('lightboxImg').src = '';
        });
        var lbClose = document.getElementById('lightboxClose');
        if (lbClose) lbClose.addEventListener('click', function(e) {
            e.stopPropagation();
            lb.classList.remove('show');
            document.getElementById('lightboxImg').src = '';
        });

        // 初始渲染
        renderMyRequests();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();