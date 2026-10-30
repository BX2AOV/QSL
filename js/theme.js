/* ============================================================
   theme.js — 佈景主題（自動 / 淺色 / 深色）
   必須「同步」載入於 <head>（不能 defer），否則深色模式會先閃一下白畫面。
   狀態存在 localStorage.site_theme，值為 auto / light / dark。
   ============================================================ */
(function () {
    var KEY = 'site_theme';
    var pref = 'auto';
    try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* 無痕模式 */ }

    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function resolve() {
        if (pref === 'dark') return 'dark';
        if (pref === 'light') return 'light';
        return (mq && mq.matches) ? 'dark' : 'light';
    }

    function apply() {
        document.documentElement.setAttribute('data-theme', resolve());
    }

    apply();

    // 系統切換時，只有在「自動」模式才跟著變
    if (mq && mq.addEventListener) {
        mq.addEventListener('change', function () {
            if (pref === 'auto') apply();
        });
    }

    var ICONS = { auto: '🌗', light: '☀️', dark: '🌙' };
    var LABELS = { auto: '主題：跟隨系統', light: '主題：淺色', dark: '主題：深色' };
    var ORDER = ['auto', 'light', 'dark'];

    function renderButton(btn) {
        btn.textContent = ICONS[pref] || ICONS.auto;
        btn.setAttribute('aria-label', LABELS[pref] || LABELS.auto);
        btn.title = LABELS[pref] || LABELS.auto;
    }

    window.theme = {
        get: function () { return pref; },
        set: function (value) {
            pref = (ORDER.indexOf(value) >= 0) ? value : 'auto';
            try { localStorage.setItem(KEY, pref); } catch (e) { /* ignore */ }
            apply();
            var btn = document.getElementById('themeToggle');
            if (btn) renderButton(btn);
        },
        cycle: function () {
            this.set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        renderButton(btn);
        btn.addEventListener('click', function () { window.theme.cycle(); });
    });
})();
