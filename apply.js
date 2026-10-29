/* ============================================================
   apply.js - 申請頁面專用邏輯 (包含四國語言與自訂國碼)
   ============================================================ */

const SUPABASE_URL = 'https://btcsstbtbnejuyexwbpn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3NzdGJ0Ym5lanV5ZXh3YnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzAzNDQsImV4cCI6MjEwODgwNjM0NH0.fDV1XxtEbCiTBn1Q8tAx_ljqsBGA_O-kc8SZ6flea44';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentLang = localStorage.getItem('site_lang') || 'zh';

// ============================================================
// 核心：精準點擊哪個語言就切換
// ============================================================
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
        const noPhoneText = { 
            zh: isCancelled ? '已取消提供' : '無需提供', 
            cn: isCancelled ? '已取消提供' : '无需提供', 
            en: isCancelled ? 'Cancelled' : 'No Phone', 
            ja: isCancelled ? 'キャンセル済' : '電話不要' 
        };
        btnNoPhone.textContent = noPhoneText[currentLang];
    }

    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.setAttribute('data-active', currentLang);

    const langMap = { zh: 'zh-Hant', cn: 'zh-Hans', en: 'en', ja: 'ja' };
    document.documentElement.lang = langMap[currentLang] || 'zh-Hant';

    // 防呆：只有當 renderMyRequests 存在，且已經有查詢過呼號時，才重新渲染
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

// 文字上下文轉義
function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

// 屬性上下文轉義 (C-2)
function escAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

// 🌟 國碼自訂選單邏輯
let currentCountryCode = '+886';

window.selectCountry = function(code) {
    currentCountryCode = code;
    document.getElementById('selectedCountryCode').textContent = code;
    document.getElementById('countryCodeWrapper').classList.remove('open');
};

document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('countryCodeWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        wrapper.classList.remove('open');
    }
});

// ============================================================
// 主邏輯 (查詢與送出)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    const btnQuery = document.getElementById('btnQuery');
    if (!btnQuery) {
        console.error("找不到 btnQuery 按鈕，請確認 apply.html 的 ID 是否正確。");
        return;
    }

    // 將變數宣告在 DOMContentLoaded 外層，避免作用域問題
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
    const phoneReq = document.getElementById('phoneReq');
    const countryCodeWrapper = document.getElementById('countryCodeWrapper');
    const countryCodeTrigger = document.getElementById('countryCodeTrigger');

    applyLanguage();

    // C-2 配套：語言切換改事件委託
    document.getElementById('langToggle')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.lang-option');
        if (!opt) return;
        const lang = opt.dataset.lang;
        if (lang && typeof changeLang === 'function') changeLang(lang);
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
                countryCodeWrapper.style.display = 'none';
                phoneReq.style.display = 'none';
                
                btnNoPhone.style.background = '#0b2a4a';
                btnNoPhone.style.color = '#fff';
                btnNoPhone.style.borderColor = '#0b2a4a';
                btnNoPhone.setAttribute('data-active', 'true');
            } else {
                shipPhone.style.display = 'block';
                countryCodeWrapper.style.display = 'block';
                phoneReq.style.display = 'inline';
                
                btnNoPhone.style.background = '';
                btnNoPhone.style.color = '';
                btnNoPhone.style.borderColor = '#cbdae8';
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
        if (!call) { 
            const hint = { zh: '請輸入呼號', cn: '请输入呼号', en: 'Please enter callsign', ja: 'コールサインを入力してください' };
            showToast(hint[currentLang]); 
            return; 
        }
        
        queryCallsign = call;
        localStorage.setItem('user_callsign', queryCallsign);
        
        queryHint.innerHTML = '<span style="color:#5a6e85;">⏳...</span>';

        const { data, error } = await _supabase
            .from('qsl_public')
            .select('id, date, time, call, band, mode, note, receivedImg, sentImg, status, has_requests')
            .eq('call', call);

        if (error) { 
            const errText = { zh: '❌ 系統錯誤', cn: '❌ 系统错误', en: '❌ System Error', ja: '❌ システムエラー' };
            queryHint.innerHTML = `<span style="color:#b03030;">${errText[currentLang]}</span>`; 
            return; 
        }

        matchedRecords = data || [];
        if (matchedRecords.length === 0) {
            queryResultCard.style.display = 'none';
            shipInfoCard.style.display = 'none';
            const notFound = { zh: '❌ 找不到此呼號的通聯記錄，無法申請換卡', cn: '❌ 找不到此呼号的通联记录，无法申请换卡', en: '❌ No QSO records found for this callsign.', ja: '❌ このコールサインの記録が見つかりません。' };
            queryHint.innerHTML = `<span style="color:#b03030;">${notFound[currentLang]}</span>`;
            showToast(notFound[currentLang]); return;
        }

        const foundText = { zh: '✅ 找到 ', cn: '✅ 找到 ', en: '✅ Found ', ja: '✅ ' };
        const unitText = { zh: ' 筆通聯紀錄', cn: ' 条通联记录', en: ' QSO records', ja: '件の交信記録' };
        queryHint.innerHTML = `<span style="color:#0e6b3e;">${foundText[currentLang]}${matchedRecords.length}${unitText[currentLang]}</span>`;
        
        selectedRecordIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        await loadMyRequests();

        renderQueryResult();
        queryResultCard.style.display = 'block';
        shipInfoCard.style.display = 'none';
        
        if (document.activeElement === btnQuery) {
            queryResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        renderMyRequests();
    }

    async function loadMyRequests() {
        if (!queryCallsign) { myRequests = []; return; }
        const { data, error } = await _supabase.rpc('my_qsl_requests', { p_user_call: queryCallsign });
        if (error) {
            console.warn('my_qsl_requests failed:', error.message);
            myRequests = [];
            return;
        }
        myRequests = data || [];
    }

    function isAlreadyRequested(recordId) {
        return myRequests.some(req => Number(req.record_id) === Number(recordId));
    }

    function renderQueryResult() {
        queryResultBody.innerHTML = matchedRecords.map(r => {
            const st = computeQslStatus(r);
            const already = isAlreadyRequested(r.id);
            
            let actionHtml = already 
                ? `<span style="color:#7b3fa0; font-weight:bold; font-size:0.85rem; background:#f3e5ff; padding:4px 10px; border-radius:20px;" data-zh="已申請" data-cn="已申请" data-en="Requested" data-ja="申請済">已申請</span>` 
                : `<input type="checkbox" class="record-checkbox" data-id="${escAttr(r.id)}" ${selectedRecordIds.has(r.id) ? 'checked' : ''}>`;
            
            let displayBand = r.band;
            let displayNote = r.note || '—';

            if (r.note) {
                const satMatch = r.note.match(/^\[(.*?)\]/);
                if (satMatch && satMatch[1] && !satMatch[1].includes(':')) {
                    displayBand = satMatch[1]; 
                } else {
                    const freqMatch = r.note.match(/FREQ:([\d.]+)/);
                    if (freqMatch && freqMatch[1]) {
                        displayBand = freqMatch[1]; 
                    }
                }
                
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
        const countText = { zh: '已選擇 ', cn: '已选择 ', en: 'Selected ', ja: '選択済み: ' };
        const unitText = { zh: ' 筆通聯', cn: ' 条通联', en: ' QSOs', ja: '件' };
        const hintText = { zh: '請勾選要申請的通聯', cn: '请勾选要申请的通联', en: 'Please select QSOs', ja: '交信を選択してください' };

        selectedCountHint.textContent = n > 0 ? `${countText[currentLang]}${n}${unitText[currentLang]}` : hintText[currentLang];
        shipInfoCard.style.display = n > 0 ? 'block' : 'none';
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const boxes = document.querySelectorAll('.record-checkbox');
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
            if (selectedRecordIds.size === 0) { 
                const hint = { zh: '請至少勾選一筆', cn: '请至少勾选一条', en: 'Please select at least one', ja: '少なくとも1件選択してください' };
                showToast(hint[currentLang]); 
                return; 
            }
            const name = document.getElementById('shipName').value.trim();
            const rawPhone = shipPhone.value.trim();
            const zip = document.getElementById('shipZip').value.trim();
            const address = document.getElementById('shipAddress').value.trim();
            const note = document.getElementById('shipNote').value.trim();

            let finalPhone = isPhoneDisabled ? '未提供' : `${currentCountryCode} ${rawPhone}`;

            const errorMsg = { zh: '請填寫完整收件資訊', cn: '请填写完整收件信息', en: 'Please fill in all required fields.', ja: '必須項目を入力してください。' };
            if (!name || !zip || !address) { showToast(errorMsg[currentLang]); return; }
            
            if (!isPhoneDisabled && !rawPhone) {
                const phoneErr = { zh: '請填寫手機或點擊無需提供', cn: '请填写手机或点击无需提供', en: 'Please enter phone or click No Phone.', ja: '電話番号を入力するか、「電話不要」をクリックしてください。' };
                showToast(phoneErr[currentLang]); return; 
            }

            btnSubmit.disabled = true; 
            const processingText = { zh: '處理中...', cn: '处理中...', en: 'Processing...', ja: '処理中...' };
            btnSubmit.textContent = processingText[currentLang];
            let count = 0, hasError = false;

            for (const id of selectedRecordIds) {
                const { data, error } = await _supabase.rpc('submit_qsl_request', {
                    p_record_id: Number(id),
                    p_user_call: queryCallsign,
                    p_ship_name: name,
                    p_ship_phone: finalPhone,
                    p_ship_zip: zip,
                    p_ship_addr: address,
                    p_ship_note: note
                });

                if (error) {
                    hasError = true;
                    console.error('submit_qsl_request failed:', error.message);
                } else {
                    count++;
                }
            }

            btnSubmit.disabled = false; 
            btnSubmit.textContent = '送出 QSL 換卡申請';
            applyLanguage();
            
            const successText = { zh: `✅ 已送出 ${count} 筆申請`, cn: `✅ 已提交 ${count} 条申请`, en: `✅ Submitted ${count} request(s)`, ja: `✅ ${count}件の申請を送信しました` };
            const failText = { zh: '⚠️ 部分失敗', cn: '⚠️ 部分失败', en: '⚠️ Partial failure', ja: '⚠️ 一部失敗しました' };
            const totalFailText = { zh: '❌ 全部失敗，請稍後再試', cn: '❌ 全部失败，请稍后再试', en: '❌ All requests failed', ja: '❌ すべて失敗しました' };
            
            if (count === 0) {
                showToast(totalFailText[currentLang]);
            } else {
                showToast(hasError ? failText[currentLang] : successText[currentLang]);
            }

            selectedRecordIds.clear();
            if (selectAllCheckbox) selectAllCheckbox.checked = false;

            await loadMyRequests();
            renderQueryResult();
            renderMyRequests();
            
            document.getElementById('shipName').value = ''; 
            shipPhone.value = '';
            document.getElementById('shipZip').value = ''; document.getElementById('shipAddress').value = ''; document.getElementById('shipNote').value = '';
            shipInfoCard.style.display = 'none';
        });
    }

    function renderMyRequests() {
        const tbody = document.getElementById('myRequestsBody');
        if (!tbody) return;

        if (!queryCallsign) { 
            const empty = { zh: '請先查詢您的呼號', cn: '请先查询您的呼号', en: 'Please search a callsign first', ja: '先にコールサインを検索してください' };
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">${empty[currentLang]}</div></td></tr>`; 
            return; 
        }
        
        if (myRequests.length === 0) { 
            const empty = { zh: '尚無申請紀錄', cn: '尚无申请记录', en: 'No records found', ja: '履歴がありません' };
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">${empty[currentLang]}</div></td></tr>`; 
            return; 
        }

        const recordMap = new Map(matchedRecords.map(r => [Number(r.id), r]));

        tbody.innerHTML = myRequests.map(req => {
            let cls = 'badge-pending', txt = '待處理';
            if (currentLang === 'zh') { txt = req.status === 'approved' ? '已核准' : (req.status === 'rejected' ? '已拒絕' : '待處理'); }
            if (currentLang === 'cn') { txt = req.status === 'approved' ? '已核准' : (req.status === 'rejected' ? '已拒绝' : '待处理'); }
            if (currentLang === 'en') { txt = req.status === 'approved' ? 'Approved' : (req.status === 'rejected' ? 'Rejected' : 'Pending'); }
            if (currentLang === 'ja') { txt = req.status === 'approved' ? '承認済み' : (req.status === 'rejected' ? '拒否' : '処理待ち'); }
            
            if (req.status === 'approved') cls = 'badge-approved';
            else if (req.status === 'rejected') cls = 'badge-rejected';

            const rec = recordMap.get(Number(req.record_id)) || {};
            const shipInfo = req.ship_name ? `${escapeHtml(req.ship_name)} / ${escapeHtml(req.ship_phone || '—')}` : '—';
            const addr = req.ship_zip ? `${escapeHtml(req.ship_zip)} ${escapeHtml(req.ship_addr)}` : '—';
            const displayDate = req.request_date || '—';

            return `<tr>
                <td>${escapeHtml(displayDate)}</td>
                <td><strong>${escapeHtml(rec.call || '—')}</strong></td>
                <td>${escapeHtml(rec.date || '—')}</td>
                <td>${escapeHtml(rec.band || '—')} / ${escapeHtml(rec.mode || '—')}</td>
                <td>${shipInfo}</td>
                <td>${escapeHtml(req.ship_phone || '—')}</td>
                <td>${addr}</td>
                <td><span class="${cls}">${txt}</span></td>
            </tr>`;
        }).join('');
    }

    btnQuery.addEventListener('click', doQuery);
    queryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); doQuery(); } });
});
