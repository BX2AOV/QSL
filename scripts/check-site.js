#!/usr/bin/env node
/* ============================================================
   check-site.js — 靜態網站的基本健檢（無外部依賴）
   檢查項目：
     1. HTML 內引用的本地檔案是否存在
     2. 主要容器標籤是否配對（div / section / main / table / tbody / thead / tr）
     3. 每個頁面是否有 title、main#main；公開頁是否有 description
     4. 靜態資源的 ?v= 版本號是否一致（不一致只警告）
   用法：node scripts/check-site.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'apply.html', 'manage.html', '404.html'];
const needDescription = ['index.html', 'apply.html'];

let errors = 0;
let warnings = 0;

const fail = (msg) => { console.error('  ERROR  ' + msg); errors++; };
const warn = (msg) => { console.warn('  WARN   ' + msg); warnings++; };

const pairs = ['div', 'section', 'main', 'table', 'thead', 'tbody', 'tr', 'header', 'nav'];

function countTag(html, tag) {
    const open = (html.match(new RegExp('<' + tag + '\\b', 'gi')) || []).length;
    const close = (html.match(new RegExp('</' + tag + '\\s*>', 'gi')) || []).length;
    return { open, close };
}

function stripComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '');
}

function localTarget(ref) {
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/i.test(ref)) return null;
    let clean = ref.split('?')[0].split('#')[0];
    if (clean.startsWith('/')) clean = clean.slice(1);
    if (!clean) return null;
    return path.join(root, clean);
}

const versions = new Map();

for (const page of pages) {
    const file = path.join(root, page);
    if (!fs.existsSync(file)) {
        fail(`${page} 不存在`);
        continue;
    }

    const raw = fs.readFileSync(file, 'utf8');
    const html = stripComments(raw);

    // 1. 引用的本地檔案
    const refs = [...raw.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
        const target = localTarget(ref);
        if (!target) continue;
        // Cloudflare Pages 的 clean URL：/apply 實際上是 apply.html
        const exists = fs.existsSync(target)
            || fs.existsSync(target + '.html')
            || fs.existsSync(path.join(target, 'index.html'));
        if (!exists) fail(`${page}: 引用了不存在的檔案 ${ref}`);
        const v = (ref.match(/\?v=([\w.-]+)/) || [])[1];
        if (v) {
            if (!versions.has(v)) versions.set(v, []);
            versions.get(v).push(`${page}:${ref.split('?')[0]}`);
        }
    }

    // 2. 標籤配對
    for (const tag of pairs) {
        const { open, close } = countTag(html, tag);
        if (open !== close) fail(`${page}: <${tag}> 開 ${open} 個、關 ${close} 個，沒有配對`);
    }

    // 3. 必要元素
    if (!/<title>[^<]+<\/title>/i.test(html)) fail(`${page}: 缺少 <title>`);
    if (!/<main[^>]*id="main"/i.test(html)) fail(`${page}: 缺少 <main id="main">（skip link 的目標）`);
    if (needDescription.includes(page) && !/<meta\s+name="description"/i.test(html)) {
        fail(`${page}: 缺少 meta description`);
    }
    if (/<img\b(?![^>]*\balt=)/i.test(html)) warn(`${page}: 有 <img> 沒有 alt`);
}

// 4. 版本號一致
if (versions.size > 1) {
    warn('靜態資源的 ?v= 版本號不一致：');
    for (const [v, list] of versions) console.warn(`         ${v} → ${list.join(', ')}`);
}

console.log(`\n結果：${errors} 個錯誤、${warnings} 個警告`);
process.exit(errors > 0 ? 1 : 0);
