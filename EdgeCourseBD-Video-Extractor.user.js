// ==UserScript==
// @name         EdgeCourseBD Video Extractor & Manager (Categorized + Search + Sort)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Extracts Vimeo / Tenbyte-Vidinfra (tb-player) links, categorizes them, with ultra-fast search and sorting. Dual player support + low-end optimized.
// @author       ShoyebOP
// @downloadURL  https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/EdgeCourseBD-Video-Extractor.user.js
// @updateURL    https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/EdgeCourseBD-Video-Extractor.user.js
// @match        *://*.edgecoursebd.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const DB_KEY = 'edgeVids';

    /* --- NETWORK HOOKS FOR NEW TB-PLAYER (Tenbyte / Vidinfra) --- */
    const capturedStreamUrls = [];
    function isStreamUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return /\.m3u8|\.mpd|tenbytecdn|vidinfra/i.test(url);
    }
    function pushStreamUrl(url) {
        if (!isStreamUrl(url)) return;
        if (!capturedStreamUrls.includes(url)) {
            capturedStreamUrls.push(url);
            if (capturedStreamUrls.length > 50) capturedStreamUrls.shift();
            console.log('[VidDB][StreamHook] Captured:', url);
        }
    }
    function installNetworkHooks() {
        try {
            const origFetch = window.fetch;
            if (origFetch) {
                window.fetch = function(...args) {
                    try {
                        const first = args[0];
                        const url = (first instanceof Request) ? first.url : first;
                        if (typeof url === 'string') pushStreamUrl(url);
                    } catch(e) {}
                    return origFetch.apply(this, args);
                };
            }
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                try { if (typeof url === 'string') pushStreamUrl(url); } catch(e) {}
                return origOpen.call(this, method, url, ...rest);
            };
            try {
                const mediaProto = HTMLMediaElement.prototype;
                const srcDesc = Object.getOwnPropertyDescriptor(mediaProto, 'src');
                if (srcDesc && srcDesc.set) {
                    const origSet = srcDesc.set;
                    Object.defineProperty(mediaProto, 'src', {
                        get: srcDesc.get,
                        set: function(v) {
                            try { if (typeof v === 'string') pushStreamUrl(v); } catch(e) {}
                            return origSet.call(this, v);
                        },
                        configurable: true
                    });
                }
            } catch(e) {}
        } catch(e) {
            console.warn('[VidDB] Network hook install failed', e);
        }
    }
    function scanPerformanceForStream() {
        try {
            if (performance && performance.getEntriesByType) {
                const resources = performance.getEntriesByType('resource');
                for (const r of resources) {
                    if (r.name && isStreamUrl(r.name)) pushStreamUrl(r.name);
                }
            }
        } catch(e) {}
        try {
            document.querySelectorAll('source[src], video[src]').forEach(el => {
                const u = el.src || el.getAttribute('src');
                if (u) pushStreamUrl(u);
            });
        } catch(e) {}
    }
    function findBestStreamForMedia(mediaId) {
        if (capturedStreamUrls.length === 0) return null;
        if (mediaId) {
            for (let i = capturedStreamUrls.length - 1; i >= 0; i--) {
                if (capturedStreamUrls[i].includes(mediaId)) return capturedStreamUrls[i];
            }
        }
        return capturedStreamUrls[capturedStreamUrls.length - 1];
    }
    installNetworkHooks();

    /* --- STORAGE HELPERS (fixes corruption, bloat, race) --- */
    function safeGetDB() {
        try {
            let v = GM_getValue(DB_KEY, {});
            // Tampermonkey may return string if previously stored as JSON
            if (typeof v === 'string') {
                try { v = JSON.parse(v); } catch { return {}; }
            }
            if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
            return v;
        } catch (e) {
            console.warn('[VidDB] safeGetDB failed', e);
            return {};
        }
    }
    function safeSetDB(db) {
        try {
            // Quick sanity: drop empty keys, fix missing savedAt
            for (const k of Object.keys(db)) {
                if (!k || !k.trim()) { delete db[k]; continue; }
                const e = db[k];
                if (!e || typeof e !== 'object') { delete db[k]; continue; }
                if (!e.savedAt) e.savedAt = Date.now();
                if (!e.category) e.category = 'Uncategorized';
                // purge stale blob links if we have better fallback
                if (e.link && e.link.startsWith('blob:')) {
                    const better = e.streamUrl || e.poster || (e.mediaId ? `tenbyte://${e.mediaId}` : null);
                    if (better) e.link = better; else delete db[k];
                }
            }
            // Quota guard: GM storage ~2-10MB. Trim oldest 20% if >1.8MB serialized
            let serialized = JSON.stringify(db);
            if (serialized.length > 1800000) {
                const entries = Object.entries(db).sort((a,b)=>(a[1].savedAt||0)-(b[1].savedAt||0));
                const toRemove = Math.ceil(entries.length * 0.25);
                for (let i=0;i<toRemove;i++) delete db[entries[i][0]];
                console.warn(`[VidDB] Quota guard pruned ${toRemove} oldest entries`);
                serialized = JSON.stringify(db);
            }
            GM_setValue(DB_KEY, db);
            return true;
        } catch (e) {
            console.error('[VidDB] safeSetDB failed', e);
            try { GM_setValue(DB_KEY, {}); } catch {}
            return false;
        }
    }
    // One-time migration: normalize old blob entries, ensure title field, handle duplicate titles across categories
    function migrateDB() {
        const db = safeGetDB();
        let changed = false;
        const newDB = {};
        for (const [rawKey, val] of Object.entries(db)) {
            if (!rawKey || !rawKey.trim()) { changed = true; continue; }
            if (!val || typeof val !== 'object') { changed = true; continue; }
            // Ensure title field (old DB used key as title)
            if (!val.title) val.title = rawKey;
            // Trim
            val.title = String(val.title).trim();
            val.category = (val.category || 'Uncategorized').trim() || 'Uncategorized';
            // Normalize category alias
            if (val.category === 'Uncategorized / Extra') val.category = 'Uncategorized';
            // Fix blob
            if (val.link && val.link.startsWith('blob:')) {
                const better = val.streamUrl || val.poster || (val.mediaId ? `tenbyte://${val.mediaId}` : null);
                if (better) { val.link = better; changed = true; } else continue;
            }
            if (!val.link) { // incomplete entry
                if (val.poster) val.link = val.poster;
                else if (val.mediaId) val.link = `tenbyte://${val.mediaId}`;
                else continue;
            }
            if (!val.savedAt) { val.savedAt = Date.now(); changed = true; }
            if (!val.page) val.page = location.href;
            // Use stable key: prefer mediaId unique, else category::title to avoid collisions (same lecture name in two categories)
            // Keep backward compat: if key already equals title and mediaId absent, keep as is if no collision yet
            let newKey = rawKey;
            if (val.mediaId) {
                // If multiple entries share same mediaId, last wins - dedupe by mediaId is desired
                // Keep title-based key for UI search but ensure mediaId unique: use mediaId as canonical if poster present
                // To avoid breaking existing copy-by-name logic, keep title key but store mediaId for dedupe check below
                // We'll detect duplicate titles with different categories and namespace them
            }
            // Detect collision: same title already in newDB but different category/mediaId
            const existing = newDB[newKey];
            if (existing && (existing.category !== val.category || existing.mediaId !== val.mediaId)) {
                // Namespace with category to avoid overwrite
                newKey = `${val.category}::${val.title}`;
                // If still collides (duplicate within same category), append mediaId prefix
                if (newDB[newKey] && val.mediaId) newKey = `${val.category}::${val.title}::${val.mediaId.slice(0,8)}`;
                changed = true;
            }
            // Also dedupe by mediaId: if another entry already has same mediaId, keep newest savedAt
            let dupByMedia = null;
            if (val.mediaId) {
                for (const [k,v] of Object.entries(newDB)) {
                    if (v.mediaId && v.mediaId === val.mediaId) { dupByMedia = k; break; }
                }
            }
            if (dupByMedia) {
                const keep = (newDB[dupByMedia].savedAt || 0) > (val.savedAt || 0) ? newDB[dupByMedia] : val;
                newDB[dupByMedia] = keep;
                changed = true;
            } else {
                newDB[newKey] = val;
                if (newKey !== rawKey) changed = true;
            }
        }
        if (changed) {
            console.log('[VidDB] Migration applied, before:', Object.keys(db).length, 'after:', Object.keys(newDB).length);
            safeSetDB(newDB);
        }
        return newDB;
    }

    /* --- CSS FOR THE UI (low-end optimized) --- */
    GM_addStyle(`
        #vid-collector-btn {
            position: fixed; bottom: 16px; left: 16px; z-index: 999999;
            background: #1e1e2e; color: #a6e3a1; border: 1px solid #a6e3a1;
            padding: 9px 12px; border-radius: 8px; cursor: pointer;
            font-family: monospace; font-size: 13px; will-change: transform;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            transition: background-color 0.15s, color 0.15s;
            transform: translateZ(0);
        }
        #vid-collector-btn:hover { background: #a6e3a1; color: #1e1e2e; }
        
        #vid-collector-modal {
            display: none; position: fixed; inset: 8% auto auto 50%; transform: translateX(-50%) translateZ(0);
            width: min(880px, 90vw); max-height: 84vh;
            background: #181825; border: 1px solid #89b4fa; border-radius: 10px;
            z-index: 1000000; padding: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.45);
            font-family: monospace; color: #cdd6f4; overflow: hidden;
            flex-direction: column; contain: layout paint style;
        }
        @media (max-width: 640px) {
            #vid-collector-modal { inset: 4% auto auto 50%; width: 96vw; max-height: 92vh; padding: 12px; }
            #vid-collector-btn { bottom: 12px; left: 12px; font-size: 12px; padding: 8px 10px; }
        }
        #vid-collector-modal h2 { margin: 0 0 10px 0; color: #89b4fa; border-bottom: 1px solid #313244; padding-bottom: 8px; flex-shrink: 0; font-size: 16px; }
        
        .vid-top-bar { display: flex; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
        .vid-input {
            background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
            padding: 7px 8px; border-radius: 6px; font-family: monospace; outline: none;
        }
        .vid-input:focus { border-color: #89b4fa; }
        #vid-search { flex-grow: 1; min-width: 0; }
        #vid-sort { cursor: pointer; width: 190px; flex-shrink: 0; }
        
        .vid-controls { margin-bottom: 8px; display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
        .vid-btn { 
            background: #313244; color: #cdd6f4; border: 1px solid #45475a; 
            padding: 6px 10px; cursor: pointer; border-radius: 6px; font-family: monospace; font-size: 12px;
        }
        .vid-btn:hover { background: #45475a; }
        .vid-btn.copy-btn { border-color: #a6e3a1; color: #a6e3a1; }
        .vid-btn.copy-btn:hover { background: #a6e3a1; color: #181825; }
        .vid-btn.danger-btn { border-color: #f38ba8; color: #f38ba8; }
        
        #vid-list-container { flex-grow: 1; overflow-y: auto; padding-right: 4px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; contain: content; }
        
        .vid-category-group { margin-bottom: 8px; border: 1px solid #313244; border-radius: 6px; overflow: hidden; contain: layout paint; content-visibility: auto; contain-intrinsic-size: 0 60px; }
        .vid-category-header { 
            background: #1e1e2e; padding: 8px 10px; display: flex; align-items: center; gap: 8px; 
            cursor: pointer; border-bottom: 1px solid transparent; user-select: none;
        }
        .vid-category-header:hover { background: #313244; }
        .vid-cat-toggle { font-size: 11px; color: #89b4fa; width: 14px; text-align: center; flex-shrink: 0; }
        .vid-cat-title { font-weight: 700; color: #f9e2af; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vid-category-content { display: none; background: #181825; padding: 0; }
        
        .vid-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
        .vid-table td { border-bottom: 1px solid #262637; padding: 6px 8px; word-break: break-word; }
        .vid-table tr:last-child td { border-bottom: none; }
        .vid-table tr:hover { background: #1e1e2e; }
        
        .vid-checkbox { cursor: pointer; width: 14px; height: 14px; flex-shrink: 0; }
        .vid-close { position: absolute; top: 10px; right: 14px; cursor: pointer; font-size: 18px; color: #f38ba8; line-height: 1; }
        
        #vid-toast {
            display: none; position: fixed; top: 16px; left: 50%; transform: translateX(-50%) translateZ(0);
            background: #a6e3a1; color: #181825; padding: 8px 14px; border-radius: 6px;
            z-index: 1000001; font-weight: 700; font-family: monospace; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        
        #vid-list-container::-webkit-scrollbar { width: 6px; }
        #vid-list-container::-webkit-scrollbar-track { background: #181825; }
        #vid-list-container::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { transition: none !important; animation: none !important; }
        }
    `);

    /* --- DOM ELEMENTS --- */
    let btn, modal, toast;
    function createUI() {
        btn = document.createElement('button');
        btn.id = 'vid-collector-btn';
        document.body.appendChild(btn);

        modal = document.createElement('div');
        modal.id = 'vid-collector-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <span class="vid-close" id="vid-close-btn">✖</span>
            <h2>📼 Captured Videos</h2>
            <div class="vid-top-bar">
                <input type="text" id="vid-search" class="vid-input" placeholder="🔍 Search titles or categories...">
                <select id="vid-sort" class="vid-input">
                    <option value="date-asc">Sort: Oldest First</option>
                    <option value="date-desc">Sort: Newest First</option>
                    <option value="name-asc">Sort: Name (A-Z)</option>
                </select>
            </div>
            <div class="vid-controls">
                <button class="vid-btn" id="vid-select-all">Select All</button>
                <button class="vid-btn copy-btn" id="vid-copy-names">Copy Names</button>
                <button class="vid-btn copy-btn" id="vid-copy-links">Copy Links</button>
                <button class="vid-btn danger-btn" id="vid-clear-all" style="margin-left:auto;">Clear DB</button>
            </div>
            <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <input type="checkbox" id="vid-master-checkbox" class="vid-checkbox"> 
                <span style="color:#a6adc8; font-size: 12px;">Toggle visible</span>
                <span id="vid-stats" style="margin-left:auto; color:#6c7086; font-size:11px;"></span>
            </div>
            <div id="vid-list-container"></div>
        `;
        document.body.appendChild(modal);
        toast = document.createElement('div');
        toast.id = 'vid-toast';
        document.body.appendChild(toast);
        attachUIListeners();
        updateBtnCounter();
    }

    /* --- LOGIC --- */
    let toastTimer = null;
    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }
    function updateBtnCounter() {
        if (!btn) return;
        const db = safeGetDB();
        const c = Object.keys(db).length;
        btn.textContent = `📼 Vids [${c}]`;
        const stats = document.getElementById('vid-stats');
        if (stats) stats.textContent = `${c} total`;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }
    function renderCategories() {
        const db = safeGetDB();
        const container = document.getElementById('vid-list-container');
        const sortEl = document.getElementById('vid-sort');
        const sortMethod = sortEl ? sortEl.value : 'date-asc';
        if (!container) return;
        // Group
        const grouped = {};
        for (const [key, data] of Object.entries(db)) {
            const title = (data.title || key || '').trim();
            if (!title) continue;
            const cat = (data.category || 'Uncategorized').trim() || 'Uncategorized';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push([key, data]);
        }
        // Sort categories alphabetically for stability
        const cats = Object.keys(grouped).sort((a,b)=>a.localeCompare(b));
        const frag = document.createDocumentFragment();
        for (const catName of cats) {
            const vids = grouped[catName];
            vids.sort((a,b)=>{
                const da = a[1], db2 = b[1];
                const ta = (da.title || a[0]), tb = (db2.title || b[0]);
                if (sortMethod === 'name-asc') return ta.localeCompare(tb);
                if (sortMethod === 'date-desc') return (db2.savedAt||0)-(da.savedAt||0);
                return (da.savedAt||0)-(db2.savedAt||0);
            });
            const groupDiv = document.createElement('div');
            groupDiv.className = 'vid-category-group';
            groupDiv.dataset.catName = catName.toLowerCase();
            groupDiv.dataset.catRaw = catName;

            const header = document.createElement('div');
            header.className = 'vid-category-header';
            // Use textContent for title to avoid HTML injection cost
            const toggle = document.createElement('span');
            toggle.className = 'vid-cat-toggle';
            toggle.textContent = '▶';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'vid-checkbox cat-checkbox';
            cb.dataset.category = catName;
            const titleEl = document.createElement('span');
            titleEl.className = 'vid-cat-title';
            titleEl.textContent = `${catName} (${vids.length})`;
            titleEl.title = catName;
            header.append(toggle, cb, titleEl);

            const content = document.createElement('div');
            content.className = 'vid-category-content';
            const table = document.createElement('table');
            table.className = 'vid-table';
            const tbody = document.createElement('tbody');
            tbody.className = 'vid-tbody';
            for (const [key, data] of vids) {
                const title = data.title || key;
                const tr = document.createElement('tr');
                tr.dataset.vidName = title.toLowerCase();
                tr.dataset.key = key;
                const tdCb = document.createElement('td');
                tdCb.style.cssText = 'width:28px; text-align:center;';
                const rowCb = document.createElement('input');
                rowCb.type = 'checkbox';
                rowCb.className = 'vid-checkbox row-checkbox';
                rowCb.dataset.key = key;
                rowCb.dataset.name = title;
                rowCb.dataset.category = catName;
                tdCb.appendChild(rowCb);
                const tdTitle = document.createElement('td');
                tdTitle.textContent = title;
                tdTitle.title = title;
                const tdLink = document.createElement('td');
                const displayLink = data.link || data.streamUrl || data.poster || '';
                const a = document.createElement('a');
                a.href = displayLink;
                a.target = '_blank';
                a.rel = 'noopener';
                a.style.color = '#89b4fa';
                a.textContent = displayLink ? displayLink.split('?')[0].slice(0,40) + (displayLink.length>40?'…':'') : 'no-link';
                a.title = [displayLink, data.mediaId?`id:${data.mediaId}`:'', data.poster?`poster:${data.poster}`:''].filter(Boolean).join('\n');
                tdLink.appendChild(a);
                if (data.mediaId) {
                    const badge = document.createElement('span');
                    badge.textContent = `[${data.mediaId.slice(0,8)}]`;
                    badge.style.cssText = 'color:#6c7086; font-size:10px; margin-left:6px;';
                    tdLink.appendChild(badge);
                }
                tr.append(tdCb, tdTitle, tdLink);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            content.appendChild(table);
            groupDiv.append(header, content);
            frag.appendChild(groupDiv);
        }
        container.replaceChildren(frag);
        triggerSearch();
    }

    function triggerSearch() {
        const termEl = document.getElementById('vid-search');
        if (!termEl) return;
        const term = termEl.value.trim().toLowerCase();
        const groups = document.querySelectorAll('.vid-category-group');
        groups.forEach(group => {
            const catName = group.dataset.catName || '';
            const catRaw = group.dataset.catRaw || catName;
            const rows = group.querySelectorAll('tbody tr');
            let visible = 0;
            const catMatch = term && catName.includes(term);
            rows.forEach(row => {
                const name = row.dataset.vidName || '';
                const show = !term || catMatch || name.includes(term);
                row.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            const hasVisible = visible > 0;
            group.style.display = !term || hasVisible ? '' : 'none';
            if (hasVisible) {
                const content = group.querySelector('.vid-category-content');
                const toggle = group.querySelector('.vid-cat-toggle');
                if (!content || !toggle) return;
                const shouldOpen = term !== '' && visible>0;
                // keep user toggled state if no search term
                if (term !== '') {
                    content.style.display = shouldOpen ? 'block' : 'none';
                    toggle.textContent = shouldOpen ? '▼' : '▶';
                }
            }
        });
    }

    function getSelectedCourseInfo() {
        const selectedContainer = document.querySelector('div.bg-brand-100');
        let title = null;
        let category = 'Uncategorized';
        if (selectedContainer) {
            const titleEl = selectedContainer.querySelector('span.course_tab_text');
            if (titleEl) title = titleEl.textContent.trim();
            const regionDiv = selectedContainer.closest('div[role="region"]');
            if (regionDiv && regionDiv.parentElement) {
                const catTitleEl = regionDiv.parentElement.querySelector('h3 .course_tab_text');
                if (catTitleEl) {
                    const cat = catTitleEl.textContent.trim();
                    if (cat) category = cat;
                }
            }
        }
        return { title, category, selectedContainer };
    }
    function getMediaIdFromPoster(poster) {
        if (!poster) return null;
        const m = poster.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i);
        return m ? m[1] : null;
    }

    let lastSavedSig = '';
    let scanThrottle = null;
    function scheduleScan() {
        if (scanThrottle) return;
        scanThrottle = setTimeout(()=>{ scanThrottle=null; scanForVideo(); }, 500);
    }
    function scanForVideo() {
        if (document.hidden) return; // offload when tab hidden
        const { title: selTitle, category: selCategory } = getSelectedCourseInfo();
        const db = safeGetDB();
        let dirty = false;

        // 1) OLD Vimeo
        try {
            const iframe = document.querySelector('iframe[src*="player.vimeo.com"]');
            if (iframe && selTitle && selTitle.trim()) {
                const title = selTitle.trim();
                const link = iframe.src;
                if (link && !link.startsWith('blob:')) {
                    const key = title; // keep legacy key for vimeo-only titles
                    const cur = db[key];
                    if (!cur || cur.link !== link || cur.category !== selCategory) {
                        db[key] = { title, link, category: selCategory, page: location.href, savedAt: cur?.savedAt || Date.now() };
                        dirty = true;
                        console.log(`[VidDB][Vimeo] ${selCategory} -> ${title}`);
                    }
                }
            }
        } catch(e) { console.warn('[VidDB] vimeo err', e); }

        // 2) NEW tb-player
        try {
            scanPerformanceForStream();
            const video = document.querySelector('video.tb-player__video, video[data-media-id], .tb-player__video-container video, video[data-media-title], video[poster*="tenbytecdn.com"]');
            if (video) {
                let mediaId = video.getAttribute('data-media-id') || video.dataset.mediaId || null;
                let mediaTitle = video.getAttribute('data-media-title') || video.dataset.mediaTitle || null;
                if (mediaTitle && !mediaTitle.trim()) mediaTitle = null;
                let poster = video.getAttribute('poster') || video.poster || null;
                if (!poster) {
                    const alt = document.querySelector('.tb-player__video[poster], video[poster]');
                    if (alt) poster = alt.getAttribute('poster') || alt.poster;
                }
                if (!mediaId && poster) mediaId = getMediaIdFromPoster(poster);
                let sourceEl = video.querySelector('source');
                let rawSrc = video.currentSrc || video.src || (sourceEl && (sourceEl.src || sourceEl.getAttribute('src'))) || null;
                if (rawSrc && rawSrc.startsWith('blob:')) rawSrc = null;
                if (rawSrc) pushStreamUrl(rawSrc);
                let streamUrl = findBestStreamForMedia(mediaId);
                if (!streamUrl && rawSrc && isStreamUrl(rawSrc)) streamUrl = rawSrc;
                let title = null;
                if (mediaTitle && mediaTitle.trim()) title = mediaTitle.trim();
                else if (selTitle && selTitle.trim()) title = selTitle.trim();
                else if (poster) title = `Tenbyte-${mediaId || 'video'}`;
                if (title) {
                    title = title.trim();
                    let link = streamUrl || rawSrc || poster || (mediaId ? `tenbyte://${mediaId}` : null);
                    if (link && !link.startsWith('blob:')) {
                        let category = selCategory || 'Uncategorized';
                        if (category === 'Uncategorized' && !document.querySelector('div.bg-brand-100')) {
                            const catEl = document.querySelector('h3 .course_tab_text');
                            if (catEl && catEl.textContent.trim()) category = catEl.textContent.trim();
                        }
                        // Stable key: prefer mediaId unique, else namespaced title
                        let key = title;
                        if (mediaId) {
                            // check if any existing entry already has this mediaId (dedupe)
                            let foundKey = null;
                            for (const [k,v] of Object.entries(db)) if (v.mediaId===mediaId) { foundKey=k; break; }
                            if (foundKey) key = foundKey;
                            else if (db[title] && db[title].mediaId && db[title].mediaId !== mediaId) {
                                // collision on title with different mediaId -> namespace
                                key = `${category}::${title}`;
                                if (db[key] && db[key].mediaId !== mediaId) key = `${category}::${title}::${mediaId.slice(0,8)}`;
                            }
                        } else if (db[title] && db[title].category !== category) {
                            key = `${category}::${title}`;
                        }
                        const cur = db[key];
                        const sig = `${link}|${category}|${mediaId||''}|${poster||''}|${streamUrl||''}`;
                        if (!cur || cur.link !== link || cur.category !== category || cur.mediaId !== mediaId || cur.poster !== poster || cur.streamUrl !== streamUrl) {
                            // also avoid churn: if sig same as last save, skip
                            if (sig !== lastSavedSig) {
                                db[key] = { title, link, category, page: location.href, savedAt: cur?.savedAt || Date.now(), mediaId: mediaId||cur?.mediaId, poster: poster||cur?.poster, streamUrl: streamUrl||undefined, rawSrc: rawSrc||undefined };
                                lastSavedSig = sig;
                                dirty = true;
                                console.log(`[VidDB][TB] [${category}] ${title} id=${mediaId} ${streamUrl?'stream':'poster'}`);
                            }
                        }
                    }
                }
            }
        } catch(e) { console.warn('[VidDB] tb err', e); }

        if (dirty) {
            safeSetDB(db);
            updateBtnCounter();
        }
    }

    function attachUIListeners() {
        btn.addEventListener('click', () => {
            renderCategories();
            modal.style.display = 'flex';
        });
        document.getElementById('vid-close-btn').addEventListener('click', () => { modal.style.display = 'none'; });
        document.getElementById('vid-search').addEventListener('input', triggerSearch, {passive:true});
        document.getElementById('vid-sort').addEventListener('change', renderCategories);
        document.getElementById('vid-master-checkbox').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.vid-category-group:not([style*="display: none"]) .row-checkbox').forEach(cb=>{
                const tr = cb.closest('tr');
                if (!tr || tr.style.display==='none') return;
                cb.checked = isChecked;
            });
            // sync category checkboxes
            document.querySelectorAll('.cat-checkbox').forEach(cb=>{
                const grp = cb.closest('.vid-category-group');
                if (!grp || grp.style.display==='none') return;
                cb.checked = isChecked;
            });
        });
        document.getElementById('vid-select-all').addEventListener('click', () => {
            document.querySelectorAll('.vid-category-group:not([style*="display: none"]) .row-checkbox, .cat-checkbox').forEach(cb=>{
                const grp = cb.closest('.vid-category-group');
                const tr = cb.closest('tr');
                if (grp && grp.style.display==='none') return;
                if (tr && tr.style.display==='none') return;
                cb.checked = true;
            });
            const m = document.getElementById('vid-master-checkbox');
            if (m) m.checked = true;
        });
        // Event delegation for category toggles / per-category checkbox
        const list = document.getElementById('vid-list-container');
        list.addEventListener('click', (e)=>{
            const header = e.target.closest('.vid-category-header');
            if (!header) return;
            if (e.target.classList.contains('cat-checkbox')) return;
            const group = header.closest('.vid-category-group');
            const content = group.querySelector('.vid-category-content');
            const toggle = header.querySelector('.vid-cat-toggle');
            const isOpen = content.style.display === 'block';
            content.style.display = isOpen ? 'none' : 'block';
            if (toggle) toggle.textContent = isOpen ? '▶' : '▼';
        });
        list.addEventListener('change', (e)=>{
            if (!e.target.classList.contains('cat-checkbox')) return;
            const isChecked = e.target.checked;
            const group = e.target.closest('.vid-category-group');
            group.querySelectorAll('.row-checkbox').forEach(cb=>{
                const tr = cb.closest('tr');
                if (tr && tr.style.display==='none') return;
                cb.checked = isChecked;
            });
        });
        function cleanName(name) { return name.replace(/[,;|]/g,'_').replace(/_+/g,'_').trim(); }
        document.getElementById('vid-copy-names').addEventListener('click', () => {
            const sel = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb=> cleanName(cb.dataset.name || cb.dataset.key || ''));
            if (!sel.length) return showToast('⚠️ Nothing selected!');
            GM_setClipboard(sel.join(' | '));
            showToast(`✅ Copied ${sel.length} names!`);
        });
        document.getElementById('vid-copy-links').addEventListener('click', () => {
            const db = safeGetDB();
            const keys = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb=> cb.dataset.key || cb.dataset.name);
            if (!keys.length) return showToast('⚠️ Nothing selected!');
            const links = keys.map(k=> db[k]?.link || db[k]?.streamUrl || db[k]?.poster || '').filter(Boolean);
            if (!links.length) return showToast('⚠️ No links found (migrated?)');
            GM_setClipboard(links.join(' | '));
            showToast(`✅ Copied ${links.length} links!`);
        });
        document.getElementById('vid-clear-all').addEventListener('click', () => {
            if (!confirm('⚠️ Delete ALL saved videos? This cannot be undone.')) return;
            safeSetDB({});
            lastSavedSig = '';
            renderCategories();
            updateBtnCounter();
            const s = document.getElementById('vid-search');
            if (s) s.value = '';
            const m = document.getElementById('vid-master-checkbox');
            if (m) m.checked = false;
            showToast('🗑️ Database Cleared!');
        });
        // Close on outside click / Esc
        modal.addEventListener('click', (e)=>{ if (e.target===modal) modal.style.display='none'; });
        document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && modal.style.display!=='none') modal.style.display='none'; });
    }

    function init() {
        migrateDB();
        createUI();
        // Throttled polling + visibility-aware
        let iv = setInterval(()=>{ if (!document.hidden) scanForVideo(); }, 3000);
        document.addEventListener('visibilitychange', ()=>{
            if (document.hidden) { clearInterval(iv); iv=null; }
            else if (!iv) { scanForVideo(); iv=setInterval(()=>{ if (!document.hidden) scanForVideo(); }, 3000); }
        });
        setTimeout(scanForVideo, 900);
        setTimeout(scanForVideo, 3200);
        // Throttled observer: only watch relevant subtree, debounced
        try {
            const target = document.querySelector('.tb-player__video-container') || document.body;
            const obs = new MutationObserver(()=> scheduleScan());
            obs.observe(target, { childList:true, subtree:true, attributes:true, attributeFilter:['src','poster','data-media-id','data-media-title'] });
            // Fallback: if container not yet present, observe body but throttled
            if (target !== document.body) {
                const bodyObs = new MutationObserver(()=>{
                    if (!document.querySelector('.tb-player__video-container')) return;
                    scheduleScan();
                });
                bodyObs.observe(document.body, { childList:true, subtree:true });
                setTimeout(()=> bodyObs.disconnect(), 30000); // stop after 30s to save CPU
            }
        } catch(e) {}
    }
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
