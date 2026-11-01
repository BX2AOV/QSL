/* ============================================================
   select.js — 自訂下拉選單
   原生 <select> 的彈出清單由作業系統繪製，無法套用圓角/陰影，
   所以這裡用按鈕＋清單取代外觀，原生 select 只留著存值與觸發 change。
   ============================================================ */
(function () {
    'use strict';

    var openInstance = null;

    function closeOpen() {
        if (openInstance) {
            openInstance.close();
            openInstance = null;
        }
    }

    function enhance(sel) {
        if (!sel || sel.dataset.csEnhanced === '1') return;
        if (sel.multiple || sel.size > 1) return;
        if (sel.closest('.cs-wrap')) return;

        sel.dataset.csEnhanced = '1';

        var wrap = document.createElement('span');
        wrap.className = 'cs-wrap';
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        sel.classList.add('cs-native');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cs-trigger';
        if (sel.classList.contains('status-select-change')) {
            btn.classList.add('cs-status');
        } else if (sel.id === 'countryCode') {
            btn.classList.add('cs-country');
        } else {
            btn.classList.add('cs-pill');
        }

        var label = document.createElement('span');
        label.className = 'cs-label';
        var arrow = document.createElement('span');
        arrow.className = 'cs-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        btn.appendChild(label);
        btn.appendChild(arrow);
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        if (sel.getAttribute('aria-label')) {
            btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
        }
        wrap.appendChild(btn);

        var menuEl = null;
        var activeIndex = -1;

        function syncLabel() {
            var opt = sel.options[sel.selectedIndex];
            label.textContent = opt ? opt.textContent : '';
            btn.disabled = sel.disabled;
        }

        function ensureVisible(i) {
            if (!menuEl) return;
            var el = menuEl.children[i];
            if (!el) return;
            var top = el.offsetTop;
            var bottom = top + el.offsetHeight;
            if (top < menuEl.scrollTop) {
                menuEl.scrollTop = top - 6;
            } else if (bottom > menuEl.scrollTop + menuEl.clientHeight) {
                menuEl.scrollTop = bottom - menuEl.clientHeight + 6;
            }
        }

        function setActive(i) {
            if (!menuEl) return;
            var items = menuEl.children;
            if (i < 0) i = 0;
            if (i >= items.length) i = items.length - 1;
            for (var k = 0; k < items.length; k++) {
                items[k].classList.toggle('is-active', k === i);
            }
            activeIndex = i;
            var el = items[i];
            if (el) {
                btn.setAttribute('aria-activedescendant', el.id);
                ensureVisible(i);
            }
        }

        function moveActive(delta) {
            if (!menuEl) return;
            var n = menuEl.children.length;
            var i = activeIndex;
            for (var step = 0; step < n; step++) {
                i = (i + delta + n) % n;
                if (!menuEl.children[i].classList.contains('is-disabled')) break;
            }
            setActive(i);
        }

        function choose(i) {
            var opt = sel.options[i];
            if (!opt || opt.disabled) return;
            sel.selectedIndex = i;
            syncLabel();
            close();
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function buildMenu() {
            var menu = document.createElement('div');
            menu.className = 'cs-menu';
            menu.setAttribute('role', 'listbox');
            for (var i = 0; i < sel.options.length; i++) {
                (function (idx) {
                    var opt = sel.options[idx];
                    var item = document.createElement('div');
                    item.className = 'cs-option';
                    item.id = 'cs-opt-' + (sel.id || 'sel') + '-' + idx;
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', idx === sel.selectedIndex ? 'true' : 'false');
                    item.textContent = opt.textContent;
                    if (opt.disabled) item.classList.add('is-disabled');
                    item.addEventListener('click', function () { choose(idx); });
                    item.addEventListener('mouseenter', function () { setActive(idx); });
                    menu.appendChild(item);
                })(i);
            }
            return menu;
        }

        function position() {
            if (!menuEl) return;
            var r = btn.getBoundingClientRect();
            var minW = Math.max(r.width, 160);
            menuEl.style.minWidth = minW + 'px';
            var left = Math.min(r.left, window.innerWidth - minW - 8);
            menuEl.style.left = Math.max(8, left) + 'px';
            var mh = menuEl.offsetHeight;
            var below = window.innerHeight - r.bottom - 8;
            var top = (mh > below && r.top > mh + 8) ? (r.top - mh - 6) : (r.bottom + 6);
            menuEl.style.top = Math.max(8, top) + 'px';
        }

        function onKey(e) {
            if (!menuEl) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
            else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
            else if (e.key === 'End') { e.preventDefault(); setActive(menuEl.children.length - 1); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(activeIndex); }
            else if (e.key === 'Escape' || e.key === 'Tab') { close(); }
        }

        function onDocDown(e) {
            if (menuEl && !wrap.contains(e.target) && !menuEl.contains(e.target)) close();
        }

        function open() {
            if (btn.disabled || menuEl) return;
            closeOpen();
            menuEl = buildMenu();
            menuEl.style.visibility = 'hidden';
            document.body.appendChild(menuEl);
            position();
            menuEl.style.visibility = '';
            btn.setAttribute('aria-expanded', 'true');
            activeIndex = sel.selectedIndex;
            setActive(activeIndex);
            openInstance = { close: close };
            document.addEventListener('keydown', onKey, true);
            window.addEventListener('resize', close, true);
            window.addEventListener('scroll', close);
            setTimeout(function () {
                document.addEventListener('pointerdown', onDocDown, true);
            }, 0);
        }

        function close() {
            if (!menuEl) return;
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('pointerdown', onDocDown, true);
            window.removeEventListener('resize', close, true);
            window.removeEventListener('scroll', close);
            if (menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
            menuEl = null;
            btn.setAttribute('aria-expanded', 'false');
            btn.removeAttribute('aria-activedescendant');
            if (openInstance && openInstance.close === close) openInstance = null;
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            if (menuEl) close(); else open();
        });

        btn.addEventListener('keydown', function (e) {
            if (!menuEl && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                open();
            }
        });

        // 外部程式改 sel.style.display（例如申請頁隱藏國碼）時，連動隱藏
        var mo = new MutationObserver(function () {
            wrap.style.display = sel.style.display === 'none' ? 'none' : '';
        });
        mo.observe(sel, { attributes: true, attributeFilter: ['style'] });

        sel.addEventListener('change', syncLabel);
        syncLabel();
    }

    function enhanceAll(root) {
        var list = (root || document).querySelectorAll('select');
        for (var i = 0; i < list.length; i++) enhance(list[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { enhanceAll(document); });
    } else {
        enhanceAll(document);
    }

    // 後台表格每次重繪都會產生新的 select，這裡自動接手
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'SELECT') enhance(node);
                else if (node.querySelectorAll) enhanceAll(node);
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
})();
