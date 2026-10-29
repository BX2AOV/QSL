/* ============================================================
   apply.js - 申請頁面專用邏輯 (最終獨立解鎖版)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentLang = localStorage.getItem('site_lang') || 'zh';
// 儲存已經解鎖的紀錄 ID 與真實地址資訊
let unlockedRecords = {}; 

window.changeLang = function(lang) {
    currentLang = lang;
    localStorage.setItem('site_lang', currentLang);
    applyLanguage();
};

function applyLanguage() {
    document.querySelectorAll('[data-zh]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}`)) {
            el.textContent = el.getAttribute(`data-${currentLang}`);
        }
    });
    document.querySelectorAll('[data-zh-placeholder]').forEach(el => {
        if (el.hasAttribute(`data-${currentLang}-placeholder`)) {
            el.placeholder = el.getAttribute(`data-${currentLang}-placeholder`);
        }
    });
    const btnNoPhone = document.getElementById('btnNoPhone');
    if (btnNoPhone) {
        const isCancelled = btnNoPhone.getAttribute('data-active') === 'true';
        const noPhoneText = { zh: isCancelled ? '已取消提供' : '無需提供', cn: isCancelled ? '已取消提供' : '无需提供', en: isCancelled ? 'Cancelled' : 'No Phone', ja: isCancelled ? 'キャンセル済' : '電話不要' };
        btnNoPhone.textContent = noPhoneText[currentLang];
    }
    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.setAttribute('data-active', currentLang);
    const langMap = { zh: 'zh-Hant', cn: 'zh-Hans', en: 'en', ja: 'ja' };
    document.documentElement.lang = langMap[currentLang] || 'zh-Hant';

    if (typeof renderMyRequests === 'function' && typeof queryCallsign !== 'undefined' && queryCallsign) {
        renderMyRequests();
    }
}

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

function escAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function computeQslStatus(r) {
    const t = {
        zh: { none: '未申請', pending: '待處理', paper: '已收到紙卡', eqsl: '已收到電子卡', sent: '已發出紙卡', completed: '已交換完成', not_needed: '無需換卡', both: '雙向完成', rcvd: '已收到', snt: '已發出' },
        cn: { none: '未申请', pending: '待处理', paper: '已收到纸卡', eqsl: '已收到电子卡', sent: '已发出纸卡', completed: '已交换完成', not_needed: '无需换卡', both: '双向完成', rcvd: '已收到', snt: '已发出' },
        en: { none: 'Not Requested', pending: 'Pending', paper: 'Paper QSL Rcvd', eqsl: 'eQSL Rcvd', sent: 'Paper QSL Sent', completed: 'Completed', not_needed: 'No QSL Needed', both: 'Both Completed', rcvd: 'Received', snt: 'Sent' },
        ja: { none: '未申請', pending: '処理待ち', paper: '紙QSL受取済', eqsl: 'eQSL受取済', sent: '紙QSL発送済', completed: '交換完了', not_needed: 'QSL不要', both: '双方完了', rcvd: '受取済', snt: '発送済' }
    };
    const lang = currentLang;

    if (r.status === 'completed') return { cls: 'badge-completed-dark', text: t[lang].completed };
    if (r.status === 'received_eqsl') return { cls: 'badge-received', text: t[lang].eqsl };
    if (r.status === 'not_needed') return { cls: 'badge-not-needed', text: t[lang].not_needed }; 
    if (r.status === 'received_paper') return { cls: 'badge-received', text: t[lang].paper };
    if (r.status === 'sent') return { cls: 'badge-sent', text: t[lang].sent };
    if (r.status === 'pending') return { cls: 'badge-pending', text: t[lang].pending };

    if (r.receivedImg && r.sentImg) return { cls: 'badge-completed', text: t[lang].both };
    if (r.receivedImg) return { cls: 'badge-received', text: t[lang].rcvd };
    if (r.sentImg) return { cls: 'badge-sent', text: t[lang].snt };
    
    if (r.has_requests) return { cls: 'badge-pending', text: t[lang].pending };
    return { cls: 'badge-none', text: t[lang].none };
}

let currentCountryCode = '+886';
window.selectCountry = function(code) {
    currentCountryCode = code;
    document.getElementById('selectedCountryCode').textContent = code;
    document.getElementById('countryCodeWrapper').classList.remove('open');
};

document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('countryCodeWrapper');
    if (wrapper && !wrapper.contains(e.target)) wrapper.classList.remove('open');
});

document.addEventListener('DOMContentLoaded', function() {
    const btnQuery = document.getElementById('btnQuery');
    if (!btnQuery) return;

    let queryCallsign = '';
    let matchedRecords = [];
    let myRequests = [];
    let selectedRecordIds = new Set();
    let isPhoneDisabled = false;

    const queryInput = document.getElementById('queryCallsignInput');
    const queryHint = document.getElementById('queryResultHint');
    const queryResultCard = document.getElementById('queryResultCard');
    const queryResultBody = document.getElementById('queryResultBody');
    const shipInfoCard = document.getElementById('shipInfoCard');
    const selectAllCheckbox = document.getElementById('selectAll');
    const selectedCountHint = document.getElementById('selectedCountHint');
    const btnSubmit = document.getElementById('btnSubmitApplication');
    const shipPhone = document.getElementById('shipPhone');
    const btnNoPhone = document.getElementById('btnNoPhone');
    const countryCodeWrapper = document.getElementById('countryCodeWrapper');
    const countryCodeTrigger = document.getElementById('countryCodeTrigger');

    applyLanguage();

    document.getElementById('langToggle')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.lang-option');
        if (opt) changeLang(opt.dataset.lang);
    });

    if (countryCodeTrigger) {
        countryCodeTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            countryCodeWrapper.classList.toggle('open');
        });
    }

    if (btnNoPhone) {
        btnNoPhone.addEventListener('click', function() {
            isPhoneDisabled = !isPhoneDisabled;
            if (isPhoneDisabled) {
                shipPhone.style.display = 'none';
                document.getElementById('countryCodeWrapper').style.display = 'none';
                btnNoPhone.style.background = '#0b2a4a';
                btnNoPhone.style.color = '#fff';
                btnNoPhone.setAttribute('data-active', 'true');
            } else {
                shipPhone.style.display = 'block';
                document.getElementById('countryCodeWrapper').style.display = 'block';
                btnNoPhone.style.background = '';
                btnNoPhone.style.color = '';
                btnNoPhone.removeAttribute('data-active');
            }
            applyLanguage();
        });
    }

    const savedCall = localStorage.getItem('user_callsign');
    if (savedCall) {
        queryInput.value = savedCall;
        setTimeout(() => doQuery(), 100);
    }

    async function doQuery() {
        const call = queryInput.value.trim().toUpperCase();
        if (!call) { showToast('請輸入呼號'); return; }
        queryCallsign = call;
        localStorage.setItem('user_callsign', queryCallsign);
        queryHint.innerHTML = '<span style="color:#5a6e85;">⏳...</span>';

        const { data, error } = await _supabase.from('qsl_public').select('*').eq('call', call);
        if (error) { queryHint.innerHTML = `<span style="color:#b03030;">❌ 系統錯誤</span>`; return; }

        matchedRecords = data || [];
        if (matchedRecords.length === 0) {
            queryResultCard.style.display = 'none';
            shipInfoCard.style.display = 'none';
            queryHint.innerHTML = `<span style="color:#b03030;">❌ 找不到此呼號的通聯記錄</span>`;
            return;
        }

        queryHint.innerHTML = `<span style="color:#0e6b3e;">✅ 找到 ${matchedRecords.length} 筆通聯紀錄</span>`;
        selectedRecordIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        // 查詢時，一律先拉取「未解鎖」的資料（因為我們傳入空密碼，資料庫會回傳上鎖狀態）
        await loadMyRequests();
        renderQueryResult();
        queryResultCard.style.display = 'block';
        shipInfoCard.style.display = 'none';
    }

    async function loadMyRequests() {
        if (!queryCallsign) { myRequests = []; return; }
        
        // 這裡傳入空密碼，讓資料庫強制回傳「上鎖」狀態。真實解鎖由點擊按鈕時呼叫 RPC 處理。
        const { data, error } = await _supabase.rpc('my_qsl_requests', { 
            p_user_call: queryCallsign,
            p_password: '' 
        });
        
        if (error) {
            console.error("載入失敗:", error);
            myRequests = [];
        } else {
            myRequests = data || [];
        }
    }

    function isAlreadyRequested(recordId) {
        return myRequests.some(req => Number(req.record_id) === Number(recordId));
    }

    function renderQueryResult() {
        queryResultBody.innerHTML = matchedRecords.map(r => {
            const st = computeQslStatus(r);
            const already = isAlreadyRequested(r.id);
            
            let actionHtml = already 
                ? `<span style="color:#7b3fa0; font-weight:bold; font-size:0.85rem; background:#f3e5ff; padding:4px 10px; border-radius:20px;">已申請</span>` 
                : `<input type="checkbox" class="record-checkbox" data-id="${escAttr(r.id)}" ${selectedRecordIds.has(r.id) ? 'checked' : ''}>`;
            
            let displayBand = r.band;
            let displayNote = r.note || '—';

            if (r.note) {
                const satMatch = r.note.match(/^\[(.*?)\]/);
                if (satMatch && satMatch[1] && !satMatch[1].includes(':')) displayBand = satMatch[1]; 
                else { const freqMatch = r.note.match(/FREQ:([\d.]+)/); if (freqMatch && freqMatch[1]) displayBand = freqMatch[1]; }
                const satText = { zh: '衛星通聯', cn: '卫星通联', en: 'SAT QSO', ja: '衛星通信' };
                displayNote = displayNote.replace('衛星通聯', satText[currentLang]).trim();
                displayNote = displayNote.replace(/FREQ:[\d.]+\s*/, ''); 
            }

            return `<tr>
                <td style="text-align:center;">${actionHtml}</td>
                <td>${escapeHtml(r.date)}</td>
                <td><strong>${escapeHtml(r.call)}</strong></td>
                <td>${escapeHtml(displayBand)}</td> 
                <td>${escapeHtml(r.mode)}</td>
                <td><span class="${st.cls}">${st.text}</span></td>
                <td>${escapeHtml(displayNote)}</td>
            </tr>`;
        }).join('');

        applyLanguage();
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
        selectedCountHint.textContent = n > 0 ? `已選擇 ${n} 筆通聯` : '請勾選要申請的通聯';
        shipInfoCard.style.display = n > 0 ? 'block' : 'none';
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            document.querySelectorAll('.record-checkbox').forEach(cb => {
                cb.checked = this.checked;
                const id = Number(cb.dataset.id);
                if (this.checked) selectedRecordIds.add(id); else selectedRecordIds.delete(id);
            });
            updateSelectedCount();
        });
    }

    if (btnSubmit) {
        btnSubmit.addEventListener('click', async function() {
            if (selectedRecordIds.size === 0) return;
            
            const name = document.getElementById('shipName').value.trim();
            const rawPhone = shipPhone.value.trim();
            const zip = document.getElementById('shipZip').value.trim();
            const address = document.getElementById('shipAddress').value.trim();
            const note = document.getElementById('shipNote').value.trim();
            const password = document.getElementById('shipPassword').value.trim(); 

            if (!name || !zip || !address) { showToast('請填寫完整收件資訊'); return; }
            if (!isPhoneDisabled && !rawPhone) { showToast('請填寫手機或點擊無需提供'); return; }
            if (!password || password.length < 4) { showToast('請設定至少 4 位數的查詢密碼'); return; } 

            let finalPhone = isPhoneDisabled ? '未提供' : `${currentCountryCode} ${rawPhone}`;

            btnSubmit.disabled = true; 
            btnSubmit.textContent = '處理中...';
            let count = 0, hasError = false;

            for (const id of selectedRecordIds) {
                const { error } = await _supabase.rpc('submit_qsl_request', {
                    p_record_id: Number(id),
                    p_user_call: queryCallsign,
                    p_ship_name: name,
                    p_ship_phone: finalPhone,
                    p_ship_zip: zip,
                    p_ship_addr: address,
                    p_ship_note: note,
                    p_password: password 
                });

                if (error) { hasError = true; console.error(error); } 
                else { 
                    count++; 
                }
            }

            btnSubmit.disabled = false; 
            btnSubmit.textContent = '送出 QSL 換卡申請';
            applyLanguage();
            
            if (count === 0) showToast('❌ 全部失敗');
            else showToast(`✅ 已送出 ${count} 筆申請`);

            selectedRecordIds.clear();
            if (selectAllCheckbox) selectAllCheckbox.checked = false;

            await loadMyRequests();
            renderQueryResult();
            renderMyRequests();
            
            document.getElementById('shipName').value = ''; shipPhone.value = ''; document.getElementById('shipZip').value = ''; document.getElementById('shipAddress').value = ''; document.getElementById('shipNote').value = ''; document.getElementById('shipPassword').value = '';
            shipInfoCard.style.display = 'none';
        });
    }

    function renderMyRequests() {
        const tbody = document.getElementById('myRequestsBody');
        if (!tbody) return;

        if (!queryCallsign) { 
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">請先查詢您的呼號</div></td></tr>`; 
            return; 
        }
        if (myRequests.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">尚無申請紀錄</div></td></tr>`; 
            return; 
        }

        const recordMap = new Map(matchedRecords.map(r => [Number(r.id), r]));

        tbody.innerHTML = myRequests.map(req => {
            let cls = 'badge-pending', txt = '待處理';
            if (req.status === 'approved') { cls = 'badge-approved'; txt = '已核准'; }
            else if (req.status === 'rejected') { cls = 'badge-rejected'; txt = '已拒絕'; }

            const rec = recordMap.get(Number(req.record_id)) || {};
            const shipInfo = req.ship_name ? `${escapeHtml(req.ship_name)}` : '—';
            
            // 🌟 判斷這筆紀錄是否已經在前端被解鎖過
            const isUnlocked = unlockedRecords[req.record_id];

            let statusHtml = '';
            
            if (isUnlocked) {
                // 已解鎖，顯示真實資料
                const data = unlockedRecords[req.record_id];
                statusHtml = `
                    <div style="margin-bottom:5px;"><span class="${cls}">${txt}</span></div>
                    <div style="font-size:0.8rem; color:#333;">
                        <strong>地址：</strong>${escapeHtml(data.ship_zip)} ${escapeHtml(data.ship_addr)}<br>
                        <strong>手機：</strong>${escapeHtml(data.ship_phone || '未提供')}
                    </div>
                `;
            } else {
                // 未解鎖
                statusHtml = `
                    <div style="margin-bottom:5px;"><span class="${cls}">${txt}</span> <span style="color:#b03030; font-size:0.8rem;">🔒 已上鎖</span></div>
                    <button class="btn-unlock" data-id="${escAttr(req.record_id)}" style="background:#0b2a4a; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem;">🔓 解鎖詳情</button>
                `;
            }

            return `<tr>
                <td>${escapeHtml(req.request_date || '—')}</td>
                <td><strong>${escapeHtml(rec.call || '—')}</strong></td>
                <td>${escapeHtml(rec.date || '—')}</td>
                <td>${escapeHtml(rec.band || '—')} / ${escapeHtml(rec.mode || '—')}</td>
                <td>${shipInfo}</td>
                <td>${statusHtml}</td>
            </tr>`;
        }).join('');

        // 綁定解鎖按鈕事件 (使用剛剛新建的單筆驗證 RPC)
        document.querySelectorAll('.btn-unlock').forEach(btn => {
            btn.addEventListener('click', async function() {
                const id = this.dataset.id;
                const pwd = prompt('請輸入您當初設定的查詢密碼：');
                if (!pwd) return;
                
                // 呼叫單筆驗證 RPC
                const { data, error } = await _supabase.rpc('verify_qsl_password', { 
                    p_record_id: Number(id),
                    p_user_call: queryCallsign,
                    p_password: pwd
                });

                if (error) {
                    showToast('❌ 驗證失敗，請稍後再試');
                    console.error(error);
                } else if (data && data.success) {
                    showToast('✅ 解鎖成功');
                    // 把真實資料存進 unlockedRecords 中
                    unlockedRecords[id] = {
                        ship_addr: data.ship_addr,
                        ship_zip: data.ship_zip,
                        ship_phone: data.ship_phone
                    };
                    renderMyRequests(); // 重新渲染畫面
                } else {
                    showToast('❌ 密碼錯誤');
                }
            });
        });
    }

    btnQuery.addEventListener('click', doQuery);
    queryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); doQuery(); } });
});
