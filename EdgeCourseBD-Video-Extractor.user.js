// ==UserScript==
// @name         EdgeCourseBD Video Extractor & Manager (Categorized + Search + Sort)
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Extracts Vimeo / Tenbyte-Vidinfra (tb-player) links, auto-categorizes nested Course Content > Academic Class > Subject (all parents, Academic Classes - stripped) - full hierarchy fix.
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

    /* --- NETWORK HOOKS --- */
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
    // Bulk capture from course API (new site loads lessons via JSON) - now handles nested hierarchy
    const apiLessonCache = new Map(); // lessonTitle -> {title, category, link}
    function handleCourseApiResponse(url, json) {
        try {
            let count = 0;
            function walk(node, curPath) {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) { node.forEach(n=>walk(n,curPath)); return; }
                const title = node.title || node.name || node.lesson_title || node.lessonName || node.videoTitle || node.label;
                const link = node.videoUrl || node.video_url || node.playerUrl || node.player_url || node.src || node.url || node.link || node.iframe || node.mediaUrl || node.video_url_hls;
                // Detect category container and build hierarchical path
                let newPath = curPath ? [...curPath] : [];
                const rawCat = node.categoryName || node.chapterTitle || node.sectionTitle || node.groupName;
                if (rawCat) {
                    const norm = String(rawCat).replace(/^\s*Academic Classes\s*-\s*/i,'').trim();
                    if (norm && !newPath.includes(norm)) newPath.push(norm);
                } else if (title && (node.lessons || node.videos || node.items || node.children || node.modules || node.chapters)) {
                    const norm = String(title).replace(/^\s*Academic Classes\s*-\s*/i,'').trim();
                    if (norm && !newPath.includes(norm)) newPath.push(norm);
                }
                if (title && link && typeof link === 'string' && /vidinfra|tenbyte|vimeo|player|m3u8|mpd/i.test(link)) {
                    // This is a lesson leaf - use hierarchical path as category
                    const cat = newPath.length ? newPath.join(' > ') : (curPath ? curPath.join(' > ') : 'Uncategorized');
                    const key = String(title).trim();
                    const normCat = cat.split(' > ').map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean).join(' > ');
                    if (!apiLessonCache.has(key)) {
                        apiLessonCache.set(key, {title: key, category: normCat, link});
                        count++;
                    }
                }
                for (const v of Object.values(node)) if (typeof v==='object') walk(v, newPath);
            }
            walk(json, []);
            if (count) console.log(`[VidDB][API] Parsed ${count} lessons from ${url.slice(0,80)}`);
        } catch(e) { console.warn('[VidDB] api walk err', e); }
    }
    function installNetworkHooks() {
        try {
            const origFetch = window.fetch;
            if (origFetch) {
                window.fetch = async function(...args) {
                    try {
                        const first = args[0];
                        const url = (first instanceof Request) ? first.url : first;
                        if (typeof url === 'string') pushStreamUrl(url);
                    } catch {}
                    const resp = await origFetch.apply(this, args);
                    // Try to sniff course/lesson APIs
                    try {
                        const url = args[0] instanceof Request ? args[0].url : args[0];
                        if (typeof url === 'string' && /mycourses|lesson|course|api\/v\d|vidinfra|tenbyte/i.test(url)) {
                            const clone = resp.clone();
                            const ct = clone.headers.get('content-type')||'';
                            if (ct.includes('json') || url.includes('/api/') || url.includes('lesson')) {
                                clone.text().then(t=>{
                                    try {
                                        const j = JSON.parse(t);
                                        handleCourseApiResponse(url, j);
                                    } catch {}
                                    if (isStreamUrl(t)) pushStreamUrl(t);
                                }).catch(()=>{});
                            }
                        }
                    } catch {}
                    return resp;
                };
            }
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            let xhrUrlMap = new WeakMap();
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                try { if (typeof url === 'string') { pushStreamUrl(url); xhrUrlMap.set(this, url); } } catch {}
                return origOpen.call(this, method, url, ...rest);
            };
            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', function() {
                    try {
                        const url = xhrUrlMap.get(this) || this.responseURL || '';
                        if (/mycourses|lesson|course|api\/v\d/i.test(url) && this.responseText) {
                            try { const j = JSON.parse(this.responseText); handleCourseApiResponse(url, j); } catch {}
                        }
                    } catch {}
                });
                return origSend.apply(this, args);
            };
            try {
                const mediaProto = HTMLMediaElement.prototype;
                const srcDesc = Object.getOwnPropertyDescriptor(mediaProto, 'src');
                if (srcDesc && srcDesc.set) {
                    const origSet = srcDesc.set;
                    Object.defineProperty(mediaProto, 'src', {
                        get: srcDesc.get,
                        set: function(v) {
                            try { if (typeof v === 'string') pushStreamUrl(v); } catch {}
                            return origSet.call(this, v);
                        },
                        configurable: true
                    });
                }
            } catch {}
        } catch(e) {
            console.warn('[VidDB] Network hook install failed', e);
        }
    }
    function scanPerformanceForStream() {
        try {
            if (performance && performance.getEntriesByType) {
                const resources = performance.getEntriesByType('resource');
                for (const r of resources) if (r.name && isStreamUrl(r.name)) pushStreamUrl(r.name);
            }
        } catch {}
        try {
            document.querySelectorAll('source[src], video[src]').forEach(el => {
                const u = el.src || el.getAttribute('src');
                if (u) pushStreamUrl(u);
            });
        } catch {}
    }
    function findBestStreamForMedia(mediaId) {
        if (capturedStreamUrls.length === 0) return null;
        if (mediaId) for (let i=capturedStreamUrls.length-1;i>=0;i--) if (capturedStreamUrls[i].includes(mediaId)) return capturedStreamUrls[i];
        return capturedStreamUrls[capturedStreamUrls.length-1];
    }
    installNetworkHooks();

    /* --- STORAGE --- */
    function safeGetDB() {
        try {
            let v = GM_getValue(DB_KEY, {});
            if (typeof v === 'string') try { v = JSON.parse(v); } catch { return {}; }
            if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
            return v;
        } catch(e) { console.warn('[VidDB] safeGetDB failed', e); return {}; }
    }
    function safeSetDB(db) {
        try {
            for (const k of Object.keys(db)) {
                if (!k || !k.trim()) { delete db[k]; continue; }
                const e = db[k];
                if (!e || typeof e !== 'object') { delete db[k]; continue; }
                if (!e.savedAt) e.savedAt = Date.now();
                if (!e.category) e.category = 'Uncategorized';
                // Normalize hierarchical category (strip prefix)
                if (e.category) {
                    e.category = String(e.category).split(' > ').map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean).join(' > ') || 'Uncategorized';
                }
                if (e.link && e.link.startsWith('blob:')) {
                    const better = e.streamUrl || e.poster || (e.mediaId ? `tenbyte://${e.mediaId}` : null);
                    if (better) e.link = better; else delete db[k];
                }
            }
            let serialized = JSON.stringify(db);
            if (serialized.length > 1800000) {
                const entries = Object.entries(db).sort((a,b)=>(a[1].savedAt||0)-(b[1].savedAt||0));
                const toRemove = Math.ceil(entries.length * 0.25);
                for (let i=0;i<toRemove;i++) delete db[entries[i][0]];
                console.warn(`[VidDB] Quota guard pruned ${toRemove} oldest`);
                serialized = JSON.stringify(db);
            }
            GM_setValue(DB_KEY, db);
            return true;
        } catch(e) { console.error('[VidDB] safeSetDB failed', e); try{GM_setValue(DB_KEY, {});}catch{} return false; }
    }
    function migrateDB() {
        const db = safeGetDB();
        let changed=false; const newDB={};
        for (const [rawKey,val] of Object.entries(db)) {
            if (!rawKey || !rawKey.trim()) {changed=true; continue;}
            if (!val || typeof val!=='object') {changed=true; continue;}
            if (!val.title) val.title=rawKey;
            val.title=String(val.title).trim();
            val.category=(val.category||'Uncategorized').trim()||'Uncategorized';
            if (val.category==='Uncategorized / Extra') val.category='Uncategorized';
            // Strip Academic Classes - prefix and normalize hierarchical separator
            val.category = val.category.split(' > ').map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean).join(' > ');
            if (!val.category) val.category='Uncategorized';
            if (val.link && val.link.startsWith('blob:')) {
                const better=val.streamUrl||val.poster||(val.mediaId?`tenbyte://${val.mediaId}`:null);
                if (better){val.link=better;changed=true;} else continue;
            }
            if (!val.link) { if (val.poster) val.link=val.poster; else if (val.mediaId) val.link=`tenbyte://${val.mediaId}`; else continue; }
            if (!val.savedAt){val.savedAt=Date.now();changed=true;}
            if (!val.page) val.page=location.href;
            let newKey=rawKey;
            const existing=newDB[newKey];
            if (existing && (existing.category!==val.category || existing.mediaId!==val.mediaId)) {
                newKey=`${val.category}::${val.title}`;
                if (newDB[newKey] && val.mediaId) newKey=`${val.category}::${val.title}::${val.mediaId.slice(0,8)}`;
                changed=true;
            }
            let dupByMedia=null;
            if (val.mediaId) for (const [k,v] of Object.entries(newDB)) if (v.mediaId && v.mediaId===val.mediaId){dupByMedia=k;break;}
            if (dupByMedia) {
                const keep=(newDB[dupByMedia].savedAt||0)>(val.savedAt||0)?newDB[dupByMedia]:val;
                newDB[dupByMedia]=keep; changed=true;
            } else { newDB[newKey]=val; if (newKey!==rawKey) changed=true; }
        }
        if (changed){ console.log('[VidDB] Migration',Object.keys(db).length,'->',Object.keys(newDB).length); safeSetDB(newDB); }
        return newDB;
    }

    /* --- CSS --- */
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
        .vid-input { background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; padding: 7px 8px; border-radius: 6px; font-family: monospace; outline: none; }
        .vid-input:focus { border-color: #89b4fa; }
        #vid-search { flex-grow: 1; min-width: 0; }
        #vid-sort { cursor: pointer; width: 190px; flex-shrink: 0; }
        .vid-controls { margin-bottom: 8px; display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
        .vid-btn { background: #313244; color: #cdd6f4; border: 1px solid #45475a; padding: 6px 10px; cursor: pointer; border-radius: 6px; font-family: monospace; font-size: 12px; }
        .vid-btn:hover { background: #45475a; }
        .vid-btn.copy-btn { border-color: #a6e3a1; color: #a6e3a1; }
        .vid-btn.copy-btn:hover { background: #a6e3a1; color: #181825; }
        .vid-btn.danger-btn { border-color: #f38ba8; color: #f38ba8; }
        #vid-list-container { flex-grow: 1; overflow-y: auto; padding-right: 4px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; contain: content; }
        .vid-category-group { margin-bottom: 8px; border: 1px solid #313244; border-radius: 6px; overflow: hidden; contain: layout paint; content-visibility: auto; contain-intrinsic-size: 0 60px; }
        .vid-category-header { background: #1e1e2e; padding: 8px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; border-bottom: 1px solid transparent; user-select: none; }
        .vid-category-header:hover { background: #313244; }
        .vid-cat-toggle { font-size: 11px; color: #89b4fa; width: 14px; text-align: center; flex-shrink: 0; }
        .vid-cat-title { font-weight: 700; color: #f9e2af; font-size: 13px; white-space: normal; word-break: break-word; line-height: 1.3; }
        .vid-cat-title .vid-breadcrumb { font-weight: 400; color: #6c7086; font-size: 11px; }
        .vid-cat-title .vid-leaf { color: #f9e2af; }
        .vid-subgroup { margin: 6px 8px 6px 12px; border-left: 2px solid #313244; padding-left: 6px; }
        .vid-subgroup .vid-category-group { margin-bottom: 6px; border-color: #3a3a4a; }
        .vid-subgroup .vid-category-header { background: #252537; padding: 6px 8px; }
        .vid-subgroup .vid-category-header:hover { background: #2e2e44; }
        .vid-subgroup .vid-subgroup .vid-category-header { background: #1e1e2e; font-size: 12px; }
        .vid-category-content { display: none; background: #181825; padding: 0; }
        .vid-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
        .vid-table td { border-bottom: 1px solid #262637; padding: 6px 8px; word-break: break-word; }
        .vid-table tr:last-child td { border-bottom: none; }
        .vid-table tr:hover { background: #1e1e2e; }
        .vid-checkbox { cursor: pointer; width: 14px; height: 14px; flex-shrink: 0; }
        .vid-close { position: absolute; top: 10px; right: 14px; cursor: pointer; font-size: 18px; color: #f38ba8; line-height: 1; }
        #vid-toast { display: none; position: fixed; top: 16px; left: 50%; transform: translateX(-50%) translateZ(0); background: #a6e3a1; color: #181825; padding: 8px 14px; border-radius: 6px; z-index: 1000001; font-weight: 700; font-family: monospace; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        #vid-list-container::-webkit-scrollbar { width: 6px; }
        #vid-list-container::-webkit-scrollbar-track { background: #181825; }
        #vid-list-container::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
    `);

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

    let toastTimer=null;
    function showToast(msg){
        if (!toast) return;
        toast.textContent=msg; toast.style.display='block';
        clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.style.display='none',2200);
    }
    function updateBtnCounter(){
        if (!btn) return;
        const db=safeGetDB(); const c=Object.keys(db).length;
        btn.textContent=`📼 Vids [${c}]`;
        const s=document.getElementById('vid-stats'); if(s) s.textContent=`${c} total`;
    }

    function renderCategories(){
        const db=safeGetDB();
        const container=document.getElementById('vid-list-container');
        const sortEl=document.getElementById('vid-sort');
        const sortMethod=sortEl?sortEl.value:'date-asc';
        if (!container) return;

        // Build hierarchical tree from "A > B > C" categories
        const root = { name: null, children: {}, videos: [], fullPath: '' };
        let totalVideos = 0;
        for (const [key,data] of Object.entries(db)){
            const title=(data.title||key||'').trim(); if(!title) continue;
            const catRaw=(data.category||'Uncategorized').trim()||'Uncategorized';
            const parts = catRaw.split(' > ').map(s=>s.trim()).filter(Boolean);
            let node = root;
            let curPath = '';
            for (const part of parts) {
                curPath = curPath ? curPath + ' > ' + part : part;
                if (!node.children[part]) node.children[part] = { name: part, children: {}, videos: [], fullPath: curPath };
                node = node.children[part];
            }
            node.videos.push([key,data]);
            totalVideos++;
        }

        // Helper to count total videos in subtree
        function countSubtree(node){
            let c = node.videos.length;
            for (const child of Object.values(node.children)) c += countSubtree(child);
            return c;
        }
        // Sort helper
        function sortVideos(vids){
            vids.sort((a,b)=>{
                const da=a[1], db2=b[1];
                const ta=(da.title||a[0]), tb=(db2.title||b[0]);
                if (sortMethod==='name-asc') return ta.localeCompare(tb);
                if (sortMethod==='date-desc') return (db2.savedAt||0)-(da.savedAt||0);
                return (da.savedAt||0)-(db2.savedAt||0);
            });
        }

        const frag=document.createDocumentFragment();

        function renderNode(node, depth){
            const isRoot = !node.name;
            const fragLocal = document.createDocumentFragment();
            // Render children first (subcategories)
            const childNames = Object.keys(node.children).sort((a,b)=>a.localeCompare(b));
            for (const childName of childNames){
                const child = node.children[childName];
                const totalInChild = countSubtree(child);
                const groupDiv=document.createElement('div');
                groupDiv.className='vid-category-group';
                const fullCat = child.fullPath;
                groupDiv.dataset.catName=fullCat.toLowerCase();
                groupDiv.dataset.catRaw=fullCat;
                // Also store leaf name for search
                groupDiv.dataset.leafName = child.name.toLowerCase();

                const header=document.createElement('div');
                header.className='vid-category-header';
                // Depth-based left border color
                if (depth === 0) header.style.borderLeft = '3px solid #89b4fa';
                else if (depth === 1) header.style.borderLeft = '3px solid #a6e3a1';
                else header.style.borderLeft = '3px solid #f9e2af';

                const toggle=document.createElement('span');
                toggle.className='vid-cat-toggle'; toggle.textContent='▶';
                const cb=document.createElement('input');
                cb.type='checkbox'; cb.className='vid-checkbox cat-checkbox'; cb.dataset.category=fullCat;
                const titleEl=document.createElement('span');
                titleEl.className='vid-cat-title';
                // Show breadcrumb for leaf, but for intermediate show just name
                // For depth 0, show full top name; for nested, show leaf name with breadcrumb tooltip
                const isLeafCategory = Object.keys(child.children).length === 0;
                if (depth === 0 && isLeafCategory) {
                    titleEl.textContent=`${fullCat} (${totalInChild})`;
                } else {
                    // Show leaf name + count, tooltip shows full path
                    titleEl.innerHTML = `<span class="vid-leaf">${child.name}</span> <span style="color:#6c7086; font-weight:400;">(${totalInChild})</span>`;
                    if (fullCat !== child.name) {
                        const bc = document.createElement('span');
                        bc.className='vid-breadcrumb';
                        bc.textContent = ' — ' + fullCat;
                        bc.style.fontSize='10px';
                        titleEl.appendChild(bc);
                    }
                }
                titleEl.title=fullCat;

                header.append(toggle,cb,titleEl);
                const content=document.createElement('div');
                content.className='vid-category-content';

                // Render child subgroups recursively inside a wrapper
                if (Object.keys(child.children).length > 0) {
                    const subWrapper = document.createElement('div');
                    subWrapper.className='vid-subgroup';
                    const childFrag = renderNode(child, depth+1);
                    subWrapper.appendChild(childFrag);
                    content.appendChild(subWrapper);
                }
                // Render videos directly in this category (leaf videos)
                if (child.videos.length > 0) {
                    sortVideos(child.videos);
                    const table=document.createElement('table'); table.className='vid-table';
                    const tbody=document.createElement('tbody'); tbody.className='vid-tbody';
                    for (const [key,data] of child.videos){
                        const title=data.title||key;
                        const tr=document.createElement('tr');
                        tr.dataset.vidName=title.toLowerCase(); tr.dataset.key=key;
                        tr.dataset.catPath = fullCat.toLowerCase();
                        const tdCb=document.createElement('td'); tdCb.style.cssText='width:28px; text-align:center;';
                        const rowCb=document.createElement('input'); rowCb.type='checkbox'; rowCb.className='vid-checkbox row-checkbox'; rowCb.dataset.key=key; rowCb.dataset.name=title; rowCb.dataset.category=fullCat;
                        tdCb.appendChild(rowCb);
                        const tdTitle=document.createElement('td'); tdTitle.textContent=title; tdTitle.title=title;
                        const tdLink=document.createElement('td');
                        const displayLink=data.link||data.streamUrl||data.poster||'';
                        const a=document.createElement('a'); a.href=displayLink; a.target='_blank'; a.rel='noopener'; a.style.color='#89b4fa';
                        a.textContent=displayLink?displayLink.split('?')[0].slice(0,40)+(displayLink.length>40?'…':''):'no-link';
                        a.title=[displayLink, data.mediaId?`id:${data.mediaId}`:'', data.poster?`poster:${data.poster}`:''].filter(Boolean).join('\n');
                        tdLink.appendChild(a);
                        if (data.mediaId){ const badge=document.createElement('span'); badge.textContent=`[${data.mediaId.slice(0,8)}]`; badge.style.cssText='color:#6c7086; font-size:10px; margin-left:6px;'; tdLink.appendChild(badge); }
                        tr.append(tdCb,tdTitle,tdLink); tbody.appendChild(tr);
                    }
                    table.appendChild(tbody);
                    content.appendChild(table);
                }

                groupDiv.append(header,content);
                fragLocal.appendChild(groupDiv);
            }
            // If root has direct videos (should not happen with hierarchical, but handle)
            if (isRoot && node.videos.length > 0) {
                sortVideos(node.videos);
                const groupDiv=document.createElement('div');
                groupDiv.className='vid-category-group';
                groupDiv.dataset.catName='uncategorized';
                groupDiv.dataset.catRaw='Uncategorized';
                const header=document.createElement('div');
                header.className='vid-category-header';
                const toggle=document.createElement('span'); toggle.className='vid-cat-toggle'; toggle.textContent='▶';
                const cb=document.createElement('input'); cb.type='checkbox'; cb.className='vid-checkbox cat-checkbox'; cb.dataset.category='Uncategorized';
                const titleEl=document.createElement('span'); titleEl.className='vid-cat-title'; titleEl.textContent=`Uncategorized (${node.videos.length})`;
                header.append(toggle,cb,titleEl);
                const content=document.createElement('div'); content.className='vid-category-content';
                const table=document.createElement('table'); table.className='vid-table';
                const tbody=document.createElement('tbody');
                for (const [key,data] of node.videos){
                    const title=data.title||key;
                    const tr=document.createElement('tr'); tr.dataset.vidName=title.toLowerCase(); tr.dataset.key=key;
                    const tdCb=document.createElement('td'); tdCb.style.cssText='width:28px; text-align:center;';
                    const rowCb=document.createElement('input'); rowCb.type='checkbox'; rowCb.className='vid-checkbox row-checkbox'; rowCb.dataset.key=key; rowCb.dataset.name=title; rowCb.dataset.category='Uncategorized';
                    tdCb.appendChild(rowCb);
                    const tdTitle=document.createElement('td'); tdTitle.textContent=title; tdTitle.title=title;
                    const tdLink=document.createElement('td');
                    const displayLink=data.link||data.streamUrl||data.poster||'';
                    const a=document.createElement('a'); a.href=displayLink; a.target='_blank'; a.rel='noopener'; a.style.color='#89b4fa';
                    a.textContent=displayLink?displayLink.split('?')[0].slice(0,40)+(displayLink.length>40?'…':''):'no-link';
                    tdLink.appendChild(a);
                    tr.append(tdCb,tdTitle,tdLink); tbody.appendChild(tr);
                }
                table.appendChild(tbody); content.appendChild(table);
                groupDiv.append(header,content); fragLocal.appendChild(groupDiv);
            }
            return fragLocal;
        }

        frag.appendChild(renderNode(root, 0));
        container.replaceChildren(frag);
        // Update stats
        const stats = document.getElementById('vid-stats');
        if (stats) {
            const catCount = Object.keys(safeGetDB()).length ? Object.keys(root.children).length : 0;
            // Count total nested categories
            let totalCats = 0;
            function countCats(n){ for(const c of Object.values(n.children)){ totalCats++; countCats(c); } }
            countCats(root);
            stats.textContent = `${totalVideos} videos • ${totalCats} categories`;
        }
        triggerSearch();
    }

    function triggerSearch(){
        const termEl=document.getElementById('vid-search'); if(!termEl) return;
        const term=termEl.value.trim().toLowerCase();
        if (!term) {
            // Reset: collapse all, show all groups/rows
            document.querySelectorAll('.vid-category-group').forEach(g=>{
                g.style.display='';
                const c=g.querySelector(':scope > .vid-category-content');
                if(c){ c.style.display='none'; const t=g.querySelector(':scope > .vid-category-header .vid-cat-toggle'); if(t) t.textContent='▶'; }
                g.querySelectorAll('tbody tr').forEach(r=>r.style.display='');
            });
            return;
        }
        // For nested, process leaves first then bubble up
        const allGroups = Array.from(document.querySelectorAll('.vid-category-group')).reverse();
        const visibleGroups = new Set();
        for (const group of allGroups){
            const catName=group.dataset.catName||'';
            const leafName=group.dataset.leafName||'';
            // Check if group itself matches
            const catMatch = catName.includes(term) || leafName.includes(term);
            // Check rows directly in this group (not in nested subgroups)
            const directRows = group.querySelectorAll(':scope > .vid-category-content > table > tbody > tr');
            let visibleRows = 0;
            directRows.forEach(row=>{
                const name=row.dataset.vidName||'';
                const show = catMatch || name.includes(term);
                row.style.display=show?'':'none'; if(show) visibleRows++;
            });
            // Check if any child subgroup is visible
            const childGroups = group.querySelectorAll(':scope > .vid-category-content > .vid-subgroup > .vid-category-group');
            let childVisible = false;
            for (const ch of childGroups) if (ch.style.display !== 'none') childVisible = true;
            // Also check any descendant row visible (for parents whose rows are in nested)
            const anyDescendantVisible = group.querySelector('tbody tr:not([style*="display: none"])') !== null;

            const hasVisible = catMatch || visibleRows>0 || childVisible || anyDescendantVisible;
            if (hasVisible) visibleGroups.add(group);

            // Show/hide group
            group.style.display = hasVisible ? '' : 'none';
            if (hasVisible){
                const content=group.querySelector(':scope > .vid-category-content');
                const toggle=group.querySelector(':scope > .vid-category-header .vid-cat-toggle');
                if (content) content.style.display='block';
                if (toggle) toggle.textContent='▼';
                // Ensure parents will be considered visible in next iteration (since we reverse, parents come after children)
            } else {
                const content=group.querySelector(':scope > .vid-category-content');
                const toggle=group.querySelector(':scope > .vid-category-header .vid-cat-toggle');
                if (content) content.style.display='none';
                if (toggle) toggle.textContent='▶';
            }
        }
        // Ensure all ancestors of visible groups are also visible (in case directRows check missed)
        for (const g of visibleGroups){
            let p = g.parentElement?.closest('.vid-category-group');
            while(p){
                p.style.display='';
                const c=p.querySelector(':scope > .vid-category-content');
                const t=p.querySelector(':scope > .vid-category-header .vid-cat-toggle');
                if(c) c.style.display='block';
                if(t) t.textContent='▼';
                p = p.parentElement?.closest('.vid-category-group');
            }
        }
    }

    // --- NEW SITE TITLE/CATEGORY EXTRACTION (nested: Course Content > Academic Class(Basic to Indetails) > Subject > Class) ---
    function stripAcademicPrefix(s) {
        if (!s) return s;
        return s.replace(/^\s*Academic Classes\s*-\s*/i, '').replace(/^\s*Academic Class\s*\(Basic to Indetails\)\s*[-–]?\s*/i, 'Academic Class (Basic to Indetails) ').trim().replace(/\s+/g,' ').trim();
    }
    function normalizeCategorySegment(seg) {
        if (!seg) return null;
        let t = seg.replace(/\s+/g,' ').trim();
        if (!t || t.length < 2 || t.length > 80) return null;
        // Strip prefix
        t = t.replace(/^\s*Academic Classes\s*-\s*/i, '').trim();
        // Ignore generic toggle counts like "12" alone
        if (/^\d+$/.test(t)) return null;
        // Ignore icon-only or empty
        if (t.length < 2) return null;
        return t;
    }
    function getHeadingForRegion(region) {
        if (!region) return null;
        try {
            // Heading is previousElementSibling (h3) which contains button > p
            let headingBtn = region.previousElementSibling;
            if (headingBtn) {
                // Try multiple selectors for heading text
                const p = headingBtn.querySelector('p.line-clamp-2') || headingBtn.querySelector('p.font-semibold') || headingBtn.querySelector('p');
                if (p && p.textContent.trim()) return p.textContent.trim();
                // Fallback: button text without count badge - clone and remove count span
                try {
                    const clone = headingBtn.cloneNode(true);
                    const countBadge = clone.querySelector('span.ml-auto');
                    if (countBadge) countBadge.remove();
                    // Remove svg
                    const svg = clone.querySelector('svg');
                    if (svg) svg.remove();
                    const txt = clone.textContent.trim().split('\n')[0].trim();
                    if (txt && txt.length > 2 && txt.length < 80) return txt;
                } catch {}
                const txt2 = headingBtn.textContent.trim().split('\n')[0].trim();
                if (txt2 && txt2.length > 2 && txt2.length < 80) return txt2;
            }
            // Alternative: region is inside a vertical, the vertical's h3 is heading
            const v = region.closest('div[data-orientation="vertical"]');
            if (v) {
                let b = null;
                try { b = v.querySelector('h3 button p.line-clamp-2'); } catch {}
                if (!b) try { b = v.querySelector('h3 button p'); } catch {}
                if (!b) try { b = v.querySelector('h3 p'); } catch {}
                if (b && b.textContent.trim()) return b.textContent.trim();
            }
        } catch {}
        return null;
    }
    function collectCategoryPath(activeEl) {
        if (!activeEl) return [];
        // Collect ALL ancestor regions of activeEl, deepest first
        const regions = [];
        let r = activeEl.closest('div[role="region"]');
        // If activeEl itself is a region (when called with openRegion), include it
        if (!r && activeEl.getAttribute && activeEl.getAttribute('role')==='region') r = activeEl;
        while (r) {
            regions.unshift(r); // unshift to have outermost first later
            const parent = r.parentElement;
            if (!parent) break;
            r = parent.closest('div[role="region"]');
        }
        const path = [];
        const seen = new Set();
        for (const region of regions) {
            const raw = getHeadingForRegion(region);
            const norm = normalizeCategorySegment(raw);
            if (norm && !seen.has(norm)) { path.push(norm); seen.add(norm); }
        }
        // Prepend section h2 (Course Content) if not already in path
        // Find outermost region's section
        const outermost = regions[0];
        const sec = outermost ? outermost.closest('section') : activeEl.closest('section');
        if (sec) {
            const h2 = sec.querySelector('h2');
            if (h2) {
                const secTxt = h2.textContent.trim();
                const n2 = normalizeCategorySegment(secTxt);
                if (n2 && !seen.has(n2)) { path.unshift(n2); seen.add(n2); }
            }
        }
        return path;
    }
    function getDeepestOpenRegion() {
        const open = Array.from(document.querySelectorAll('div[role="region"]:not([hidden])'));
        if (!open.length) return null;
        // Depth = number of ancestor regions + total descendants
        let best = null, bestDepth = -1;
        for (const el of open) {
            let depth = 0, cur = el;
            while (cur) { const p = cur.parentElement?.closest('div[role="region"]'); if (p) { depth++; cur = p; } else break; }
            // Prefer deeper (more nested) and more content
            const score = depth * 10 + (el.querySelectorAll('a, button').length > 0 ? 1 : 0);
            if (score > bestDepth) { bestDepth = score; best = el; }
        }
        return best;
    }
    function findActiveLessonEl() {
        // First try to find lesson by header title (most reliable for current video)
        try {
            const hp = document.querySelector('div.flex.items-center.gap-3.border-b.bg-brand-0 p') || document.querySelector('p.min-w-0.text-sm.font-semibold');
            if (hp && hp.textContent.trim()) {
                const ht = hp.textContent.trim();
                const cands = Array.from(document.querySelectorAll('div[role="region"] a, div[role="region"] button'));
                for (const c of cands) {
                    if (c.closest('h3')) continue;
                    const txt = c.textContent.trim();
                    if (txt === ht || txt.includes(ht) || ht.includes(txt)) return c;
                }
            }
        } catch {}
        const lessonId = new URLSearchParams(location.search).get('lesson');
        if (lessonId) {
            const byHref = document.querySelector(`a[href*="lesson=${lessonId}"]`);
            if (byHref) return byHref;
            const byData = document.querySelector(`[data-lesson="${lessonId}"]`);
            if (byData) return byData;
            // Sometimes lesson link is button with onclick containing lesson id
            const all = Array.from(document.querySelectorAll('a, button'));
            for (const el of all) {
                if (el.closest('h3')) continue;
                const outer = el.outerHTML || '';
                if (outer.includes(lessonId) && el.textContent.trim().length < 120 && el.textContent.trim().length > 3) {
                    if (el.closest('div[role="region"], section')) return el;
                }
            }
        }
        // Active lesson has distinct active styling: bg-brand-500 text-white or ring or aria-current
        let el = document.querySelector('[aria-current="true"]');
        if (el) return el;
        // Look inside open regions for an element with active background - search deepest first
        const openRegions = Array.from(document.querySelectorAll('div[role="region"]:not([hidden])')).reverse();
        for (const r of openRegions) {
            // Common active pattern: bg-brand-500 or bg-brand-0 with text-brand, or ring-brand, or data-state active
            const cand = r.querySelector('[class*="bg-brand-500"], [class*="bg-brand-0"][class*="text-brand"], [class*="ring-brand"], [data-state="on"], [class*="bg-white"][class*="shadow"]');
            if (cand && cand.textContent.trim().length < 120 && !cand.closest('h3')) return cand;
            // Fallback: any button that is not a category heading but a lesson row - look for rows with lesson-like text
            const rows = r.querySelectorAll('a, button');
            for (const row of rows) {
                if (row.closest('h3')) continue; // skip category heading
                const txt = row.textContent.trim();
                if (txt.length > 0 && txt.length < 100) {
                    // Heuristic: lesson row often has play icon or small text
                    if (row.querySelector('svg') || /অধ্যায়|Class|Lecture|Chapter|Part\s*–|Part\s*-/.test(txt)) {
                        // Ensure row is leaf (not containing another region heading)
                        if (!row.querySelector('p.line-clamp-2')) return row;
                    }
                }
            }
        }
        // Fallback: deepest open region's first leaf row
        const deepest = getDeepestOpenRegion();
        if (deepest) {
            const leaf = deepest.querySelector('a, button');
            if (leaf && !leaf.closest('h3') && leaf.textContent.trim().length < 120) return leaf;
        }
        return null;
    }
    function getNewSiteTitleAndCategory() {
        try {
        let title = null;
        let categoryPath = [];

        // Title: robust multi-selector - header below player is most reliable
        let headerP = null;
        const titleSelectors = [
            'div.flex.items-center.gap-3.border-b.bg-brand-0 p',
            'div.border-b.bg-brand-0 p',
            'p.min-w-0.text-sm.font-semibold',
            'div.overflow-hidden.rounded-xl p.font-semibold',
            'div.overflow-hidden p.text-sm',
            'h1 + div p',
        ];
        for (const sel of titleSelectors) {
            try { headerP = document.querySelector(sel); if (headerP && headerP.textContent.trim().length > 3) break; } catch {}
            headerP = null;
        }
        if (headerP && headerP.textContent.trim()) {
            const t = headerP.textContent.trim();
            if (t.length > 3 && t.length < 200 && !/Course Progress|Course Outline|Course Content/i.test(t)) title = t;
        }
        if (!title) {
            const cands = Array.from(document.querySelectorAll('p, h1, h2, h3'));
            for (const p of cands) {
                const txt = p.textContent.trim();
                if (!txt || txt.length < 5 || txt.length > 150) continue;
                if (/অধ্যায়|Part\s*–|Part\s*-|Lecture\s*\d|Chapter\s*\d/i.test(txt)) {
                    if (p.offsetParent !== null) {
                        if (p.closest('div.overflow-hidden.rounded-xl') || /অধ্যায়/.test(txt)) { title = txt; break; }
                    }
                }
            }
            if (!title) {
                for (const p of cands) {
                    const txt = p.textContent.trim();
                    if (/অধ্যায়|Part\s*–|Lecture/i.test(txt) && txt.length < 120 && p.offsetParent !== null) { title = txt; break; }
                }
            }
        }
        if (!title) {
            const h1 = document.querySelector('h1');
            if (h1 && h1.textContent.trim()) {
                const h1txt = h1.textContent.trim();
                const lessonId = new URLSearchParams(location.search).get('lesson');
                if (!/EdgeCourse BD/i.test(h1txt) && h1txt.length < 80) {
                    title = h1txt;
                    if (lessonId) {
                        // Try to find more specific lesson title near video before using h1
                        const more = Array.from(document.querySelectorAll('p, h2, h3')).find(p=>{
                            const txt=p.textContent.trim();
                            return /অধ্যায়|Part/.test(txt) && txt.length<120 && p.offsetParent!==null;
                        });
                        if (more) title = more.textContent.trim();
                    }
                }
            }
        }
        if (!title) {
            const iframe = document.querySelector('iframe[src*="vidinfra"], iframe[src*="player"]');
            if (iframe) {
                const it = iframe.getAttribute('title');
                if (it && it.trim() && !it.includes('http') && it.trim().length < 100) title = it.trim();
            }
        }
        // If title from header, try to find corresponding lesson element in list to get full category path
        let headerTitleForSearch = title;
        // Category path via active lesson hierarchy - captures ALL ancestors (Course Content > Academic Class > Subject)
        const activeEl = findActiveLessonEl();
        if (activeEl) {
            categoryPath = collectCategoryPath(activeEl);
            const lessonTxt = activeEl.textContent.trim().split('\n')[0].trim();
            if (lessonTxt && lessonTxt.length < 150 && lessonTxt.length > 3 && lessonTxt !== categoryPath[categoryPath.length-1]) {
                if (!title || lessonTxt.length < title.length + 20) title = lessonTxt;
            }
            // If path is too short (only top level), try to augment via header title match
            if (categoryPath.length <= 1 && title) {
                try {
                    const cands = Array.from(document.querySelectorAll('div[role="region"] a, div[role="region"] button'));
                    for (const cand of cands) {
                        const txt = cand.textContent.trim();
                        if (txt === title || txt.includes(title) || title.includes(txt)) {
                            const candPath = collectCategoryPath(cand);
                            if (candPath.length > categoryPath.length) { categoryPath = candPath; console.log('[VidDB] activeEl path augmented via header title', title, '->', candPath); break; }
                        }
                    }
                } catch {}
            }
        }
        // If no active lesson, try deepest open region's path (captures nested Academic Class > Subject)
        if (!categoryPath.length) {
            const deepest = getDeepestOpenRegion();
            if (deepest) categoryPath = collectCategoryPath(deepest);
            else {
                const openRegion = document.querySelector('div[role="region"]:not([hidden])');
                if (openRegion) categoryPath = collectCategoryPath(openRegion);
                else {
                    const openHeadings = Array.from(document.querySelectorAll('button[data-state="open"] p.line-clamp-2'))
                        .map(p => normalizeCategorySegment(p.textContent.trim())).filter(Boolean);
                    if (openHeadings.length) categoryPath = openHeadings;
                }
            }
        }
        // If still short, try header title match as fallback (critical for physics case)
        if ((!categoryPath.length || categoryPath.length === 1) && title) {
            try {
                const cands = Array.from(document.querySelectorAll('div[role="region"] a, div[role="region"] button, div[role="region"] [class*="flex"]'));
                for (const cand of cands) {
                    const txt = cand.textContent.trim();
                    if (!txt || txt.length < 3 || txt.length > 150) continue;
                    // Match header title to lesson row
                    if (txt === title || (title.includes(txt) && txt.length > 5) || (txt.includes(title) && title.length > 5)) {
                        if (cand.closest('h3')) continue; // skip headings
                        const candPath = collectCategoryPath(cand);
                        if (candPath.length > categoryPath.length) {
                            categoryPath = candPath;
                            console.log('[VidDB] headerTitle fallback path', title, '->', candPath);
                            break;
                        }
                    }
                }
            } catch {}
        }
        // Fallback: try to find lesson element matching header title to get full path (header title is often the leaf class name) - always try to get longest path
        if (title) {
            const headerTitleForSearch = title;
            try {
                const allLessonCandidates = Array.from(document.querySelectorAll('div[role="region"] a, div[role="region"] button, div[role="region"] [role="button"]'));
                for (const cand of allLessonCandidates) {
                    if (cand.closest('h3')) continue; // skip category headings
                    const txt = cand.textContent.trim();
                    if (!txt || txt.length < 3 || txt.length > 150) continue;
                    if (txt === headerTitleForSearch || txt.includes(headerTitleForSearch) || headerTitleForSearch.includes(txt)) {
                        const candPath = collectCategoryPath(cand);
                        if (candPath.length > categoryPath.length) { categoryPath = candPath; console.log('[VidDB] header title match fallback', headerTitleForSearch, '->', candPath); break; }
                    }
                }
                // Also try any visible element with same text
                if (categoryPath.length < 2) {
                    const allP = Array.from(document.querySelectorAll('button, a'));
                    for (const p of allP) {
                        if (p.closest('h3')) continue;
                        const txt = p.textContent.trim();
                        if (txt === headerTitleForSearch && p.closest('div[role="region"]')) {
                            const candPath = collectCategoryPath(p);
                            if (candPath.length > categoryPath.length) { categoryPath = candPath; console.log('[VidDB] header title p match', headerTitleForSearch, '->', candPath); break; }
                        }
                    }
                }
            } catch {}
        }
        // Fallback: collect ALL currently open headings as path (ensures parent categories not missed)
        if (!categoryPath.length || categoryPath.length === 1) {
            // If we only got one segment (e.g., just Course Content), try to augment with all open headings
            let allOpenHeadings = [];
            try {
                allOpenHeadings = Array.from(document.querySelectorAll('button[data-state="open"] p.line-clamp-2, button[data-state="open"] p.font-semibold, button[data-state="open"] p, div[role="region"]:not([hidden]) + h3 p'))
                    .map(p => normalizeCategorySegment(p.textContent.trim())).filter(Boolean);
            } catch {}
            // Also include h2 of Course Content section
            let secH2 = null;
            try { secH2 = document.querySelector('section[id="section_course content"] h2'); } catch {}
            if (!secH2) try { secH2 = document.querySelector('section[id*="section_course"] h2'); } catch {}
            if (!secH2) {
                // Fallback: any section h2 that looks like Course Content
                const allH2 = Array.from(document.querySelectorAll('section h2'));
                for (const h of allH2) if (/Course Content|Course Outline/i.test(h.textContent)) { secH2 = h; break; }
            }
            if (!secH2) secH2 = document.querySelector('section h2');
            if (secH2) {
                const n = normalizeCategorySegment(secH2.textContent.trim());
                if (n && !allOpenHeadings.includes(n)) allOpenHeadings.unshift(n);
            }
            // If still empty, try any visible p.line-clamp-2 that is a heading (not lesson)
            if (!allOpenHeadings.length) {
                try {
                    const allPs = Array.from(document.querySelectorAll('p.line-clamp-2, p.font-semibold'));
                    for (const p of allPs) {
                        const txt = p.textContent.trim();
                        if (/Academic Class|Course Content|Course Outline|Demo/i.test(txt)) {
                            const n = normalizeCategorySegment(txt);
                            if (n && !allOpenHeadings.includes(n)) allOpenHeadings.push(n);
                        }
                    }
                } catch {}
            }
            if (allOpenHeadings.length > categoryPath.length) {
                // Prefer the more complete path
                // Deduplicate and keep order: Course Content first, then Academic Class, then Subject
                const merged = [];
                for (const seg of [...allOpenHeadings, ...categoryPath]) if (!merged.includes(seg)) merged.push(seg);
                // Also include any path segments from activeEl's ancestors that might be missing
                if (merged.length > 1) categoryPath = merged;
            }
            // Debug log for uncategorized
            if (!categoryPath.length) {
                console.warn('[VidDB] still uncategorized, openHeadings:', allOpenHeadings, 'secH2:', secH2?.textContent?.trim());
            }
        }
        // Fallback to section h2 - prefer Course Content
        if (!categoryPath.length) {
            let sec = null;
            // Try to find Course Content section specifically
            const allSecs = Array.from(document.querySelectorAll('section'));
            for (const s of allSecs) {
                const h2 = s.querySelector('h2');
                if (h2 && /Course Content/i.test(h2.textContent)) { sec = s; break; }
            }
            if (!sec) try { sec = document.querySelector('section[id*="section_course"]'); } catch {}
            if (!sec) sec = document.querySelector('section');
            if (sec) {
                const h2 = sec.querySelector('h2');
                if (h2) {
                    const n = normalizeCategorySegment(h2.textContent.trim());
                    if (n) categoryPath = [n];
                }
            }
            // Debug
            if (!categoryPath.length) {
                console.warn('[VidDB] fallback sec not found, all h2:', Array.from(document.querySelectorAll('section h2')).map(h=>h.textContent.trim().slice(0,30)));
            }
        }
        // Build category string: Course Content > Academic Class(Basic to Indetails) > Subject
        let category = 'Uncategorized';
        if (categoryPath.length) {
            // Normalize each segment (strip prefix) and dedupe consecutive duplicates
            const normed = categoryPath.map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean);
            // Unique consecutive
            const uniq = [];
            for (const s of normed) if (uniq[uniq.length-1]!==s) uniq.push(s);
            category = uniq.join(' > ');
        } else {
            // Final fallbacks - try h1, then api cache, then document.title
            let h1Cat = null;
            try {
                const h1 = document.querySelector('h1');
                if (h1 && h1.textContent.trim()) {
                    h1Cat = h1.textContent.trim().replace(/\s+/g,' ').slice(0,60);
                    const n = normalizeCategorySegment(h1Cat);
                    if (n) category = n;
                    else if (h1Cat.length > 2) category = h1Cat;
                }
            } catch {}
            if (category === 'Uncategorized') {
                // Try apiLessonCache for current lessonId
                try {
                    const lessonId = new URLSearchParams(location.search).get('lesson');
                    if (lessonId) {
                        for (const v of apiLessonCache.values()) {
                            // api cache may have lessonId in link or key
                            if (v.link && v.link.includes(lessonId)) { category = v.category; break; }
                        }
                    }
                } catch {}
            }
            if (category === 'Uncategorized') {
                // Last resort: use document.title first part or Course Content
                const dt = document.title ? document.title.split('|')[0].trim() : '';
                if (dt && dt.length > 3 && dt.length < 80) category = dt;
                else category = 'Course Content';
            }
        }
        if (title) title = title.replace(/\s+/g,' ').trim();
        if (category) category = category.replace(/\s+/g,' ').trim();
        if (category.length > 120) category = category.slice(0,120);
        // Debug log when still uncategorized or title is generic
        if (category === 'Uncategorized' || !title || /EdgeCourse BD/i.test(title)) {
            console.warn('[VidDB] getNewSite fallback triggered', {title, category, categoryPath, headerP: headerP?.textContent?.trim()?.slice(0,60), h1: document.querySelector('h1')?.textContent?.trim()?.slice(0,60), lessonId: new URLSearchParams(location.search).get('lesson'), openRegions: document.querySelectorAll('div[role="region"]:not([hidden])').length, iframe: document.querySelector('iframe')?.src?.slice(0,80)});
        }
        return {title, category, activeLessonEl};
        } catch(e) {
            console.warn('[VidDB] getNewSite failed', e);
            return {title: null, category: 'Uncategorized', activeLessonEl: null};
        }
    }

    function getSelectedCourseInfoLegacy() {
        let selectedContainer = document.querySelector('div.bg-brand-100');
        if (!selectedContainer) selectedContainer = document.querySelector('[class*="bg-brand-"][class*="100"]');
        if (!selectedContainer) {
            const candidates = Array.from(document.querySelectorAll('[aria-current="true"], [class*="active"], [class*="selected"]'));
            for (const c of candidates) if (c.querySelector('span.course_tab_text') || c.querySelector('.course_tab_text')) { selectedContainer=c; break; }
        }
        let title=null, category='Uncategorized';
        if (selectedContainer) {
            const titleEl = selectedContainer.querySelector('span.course_tab_text') || selectedContainer.querySelector('.course_tab_text') || selectedContainer;
            if (titleEl) {
                const t = titleEl.textContent ? titleEl.textContent.trim() : '';
                if (t) title=t; else if (selectedContainer.textContent) title=selectedContainer.textContent.trim().split('\n')[0].trim();
            }
            const regionDiv = selectedContainer.closest('div[role="region"]');
            if (regionDiv && regionDiv.parentElement) {
                const catTitleEl = regionDiv.parentElement.querySelector('h3 .course_tab_text') || regionDiv.parentElement.querySelector('h3');
                if (catTitleEl) {
                    const cat=catTitleEl.textContent.trim();
                    if (cat) category=cat;
                }
            }
            if (category==='Uncategorized') {
                let p=selectedContainer.parentElement;
                for(let i=0;i<4&&p;i++,p=p.parentElement){
                    const h3=p.querySelector('h3 .course_tab_text');
                    if (h3 && h3.textContent.trim()){category=h3.textContent.trim();break;}
                    const h3b=p.querySelector('h3');
                    if (h3b && h3b.textContent.trim().length<80){category=h3b.textContent.trim();break;}
                }
            }
        }
        if (!title) {
            const v=document.querySelector('video[data-media-title]');
            if (v){ const mt=v.getAttribute('data-media-title'); if(mt&&mt.trim()) title=mt.trim(); }
        }
        return {title, category, selectedContainer};
    }

    function getSelectedCourseInfo() {
        // Try new site first, then legacy
        const newer = getNewSiteTitleAndCategory();
        if (newer.title && newer.title.length > 4) return {title: newer.title, category: newer.category, selectedContainer: newer.activeLessonEl};
        const legacy = getSelectedCourseInfoLegacy();
        if (legacy.title) return legacy;
        // Ultimate fallback
        return newer.title ? {title: newer.title, category: newer.category} : legacy;
    }

    function getMediaIdFromPoster(poster) {
        if (!poster) return null;
        const m = poster.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i);
        return m ? m[1] : null;
    }

    let lastSavedSig = '';
    let scanThrottle = null;
    let tickCounter = 0;
    function scheduleScan(){ if(scanThrottle) return; scanThrottle=setTimeout(()=>{scanThrottle=null; scanForVideo();}, 450); }

    function scanForVideo() {
        if (document.hidden) return;
        let selTitle = null, selCategory = 'Uncategorized';
        try {
            const info = getSelectedCourseInfo();
            selTitle = info.title; selCategory = info.category || 'Uncategorized';
        } catch(e) {
            console.warn('[VidDB] getSelectedCourseInfo failed', e);
            // Fallback to headerP directly so capture never stops
            try {
                const hp = document.querySelector('div.flex.items-center.gap-3.border-b.bg-brand-0 p');
                if (hp && hp.textContent.trim()) selTitle = hp.textContent.trim();
            } catch {}
            if (!selTitle) {
                const h1 = document.querySelector('h1');
                if (h1) selTitle = h1.textContent.trim();
            }
        }
        const db = safeGetDB();
        let dirty = false;

        tickCounter++;
        if (tickCounter % 12 === 1) {
            try {
                const vid = document.querySelector('video.tb-player__video, video[data-media-id], .tb-player__video-container video');
                const iframes = Array.from(document.querySelectorAll('iframe')).map(f=>(f.src||f.getAttribute('src')||'').slice(0,85));
                const headerP = document.querySelector('div.flex.items-center.gap-3.border-b.bg-brand-0 p');
                console.log(`[VidDB] tick #${tickCounter} selTitle=${selTitle||'-'} cat=${selCategory} headerP=${headerP?.textContent?.trim().slice(0,40)||'-'} video=${!!vid} ifr=${iframes.length}`, iframes);
            } catch {}
        }

        function saveEntry(title, link, category, extra){
            if (!title || !title.trim() || !link || link.startsWith('blob:')) return false;
            title = title.trim(); category=(category||'Uncategorized').trim()||'Uncategorized';
            if (category==='Uncategorized / Extra') category='Uncategorized';
            // Normalize hierarchical: split, strip Academic Classes - prefix, rejoin
            category = category.split(' > ').map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean).join(' > ') || 'Uncategorized';
            let key=title;
            const mediaId=extra.mediaId||null;
            if (mediaId){
                let found=null; for(const [k,v] of Object.entries(db)) if(v.mediaId===mediaId){found=k;break;}
                if(found) key=found;
                else if(db[title] && db[title].mediaId && db[title].mediaId!==mediaId){ key=`${category}::${title}`; if(db[key] && db[key].mediaId!==mediaId) key=`${category}::${title}::${mediaId.slice(0,8)}`; }
            } else if(db[title] && db[title].category!==category){ key=`${category}::${title}`; }
            const cur=db[key];
            const sig=`${link}|${category}|${mediaId||''}|${extra.poster||''}|${extra.streamUrl||''}`;
            if (!cur || cur.link!==link || cur.category!==category || cur.mediaId!==mediaId || cur.poster!==extra.poster || cur.streamUrl!==extra.streamUrl){
                if (sig!==lastSavedSig){
                    db[key]={title, link, category, page: location.href, savedAt: cur?.savedAt||Date.now(), mediaId: mediaId||cur?.mediaId, poster: extra.poster||cur?.poster, streamUrl: extra.streamUrl||undefined, rawSrc: extra.rawSrc||undefined};
                    lastSavedSig=sig; dirty=true;
                    console.log(`[VidDB][${extra.via||'save'}] [${category}] ${title} id=${mediaId||'-'} link=${link.slice(0,70)}`);
                    return true;
                }
            }
            return false;
        }

        // 1) IFRAME players (PRIMARY) - vidinfra / vimeo
        try {
            const allIframes = Array.from(document.querySelectorAll('iframe'));
            const candidates = allIframes.filter(f=>{
                const s=(f.src||f.getAttribute('src')||'').toLowerCase();
                if(!s || s.startsWith('blob:')) return false;
                return /player\.vimeo\.com|vidinfra|tenbyte|tenbytecdn|player\./i.test(s) || s.includes('player');
            });
            const iframePool = candidates.length ? candidates : (allIframes.length===1 ? allIframes : []);
            for (const iframe of iframePool){
                const link=iframe.src||iframe.getAttribute('src')||'';
                if(!link || link.startsWith('blob:')) continue;
                let title = selTitle && selTitle.trim() && !/EdgeCourse BD/i.test(selTitle) ? selTitle.trim() : null;
                // Robust title fallback chain - never use generic site title if better exists
                if (!title || /EdgeCourse BD/i.test(title)) {
                    // Try header below player - multiple selectors
                    const titleSels = ['div.flex.items-center.gap-3.border-b.bg-brand-0 p','div.border-b.bg-brand-0 p','p.min-w-0.text-sm.font-semibold','div.overflow-hidden.rounded-xl p.font-semibold','div.overflow-hidden p.text-sm'];
                    for (const sel of titleSels) {
                        try {
                            const hp = document.querySelector(sel);
                            if (hp && hp.textContent.trim() && hp.textContent.trim().length > 3 && !/Course Progress|Course Outline|Course Content/i.test(hp.textContent)) { title = hp.textContent.trim(); break; }
                        } catch {}
                    }
                    // Exhaustive Bengali search
                    if (!title || /EdgeCourse BD/i.test(title)) {
                        const allP = Array.from(document.querySelectorAll('p, h1, h2'));
                        for (const p of allP) {
                            const txt = p.textContent.trim();
                            if (txt.length > 5 && txt.length < 150 && /অধ্যায়|Part\s*–|Lecture/i.test(txt) && p.offsetParent !== null) { title = txt; break; }
                        }
                    }
                }
                if (!title || /EdgeCourse BD/i.test(title)) {
                    const h1 = document.querySelector('h1');
                    const lessonId = new URLSearchParams(location.search).get('lesson');
                    if (h1 && h1.textContent.trim() && !/EdgeCourse BD/i.test(h1.textContent)) {
                        title = h1.textContent.trim();
                        if (lessonId) {
                            // Try to find more specific lesson title near video
                            const cands = Array.from(document.querySelectorAll('p, h2, h3'));
                            for (const p of cands) {
                                const txt = p.textContent.trim();
                                if (/অধ্যায়|Part\s*–|Lecture/i.test(txt) && txt.length < 120 && p.offsetParent !== null) { title = txt; break; }
                            }
                        }
                    }
                }
                if (!title) title=(iframe.getAttribute('title')||iframe.getAttribute('data-media-title')||'').trim()||null;
                if (!title){
                    try{
                        const idoc=iframe.contentDocument;
                        if(idoc){
                            const v=idoc.querySelector('video[data-media-title], video.tb-player__video');
                            const mt=v && (v.getAttribute('data-media-title')||v.dataset.mediaTitle);
                            if(mt&&mt.trim()) title=mt.trim();
                            if(!title){ const poster=v && (v.getAttribute('poster')||v.poster); const mid=poster && getMediaIdFromPoster(poster); if(mid) title=`Tenbyte-${mid}`; }
                        }
                    }catch{}
                }
                // Final fallback - avoid generic site title, use lessonId
                if (!title || /EdgeCourse BD/i.test(title)) {
                    const lessonId = new URLSearchParams(location.search).get('lesson');
                    const h1b = document.querySelector('h1');
                    if (h1b && lessonId) title = `${h1b.textContent.trim()} - Lesson ${lessonId}`;
                    else if (h1b) title = h1b.textContent.trim();
                    else title = document.title ? document.title.split('|')[0].trim().slice(0,80) : `Lesson ${lessonId || Date.now()}`;
                }
                if (!title) continue;
                let mediaId=getMediaIdFromPoster(link) || (link.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1]||null);
                let poster=null, extraMediaTitle=null;
                try{
                    const idoc=iframe.contentDocument;
                    if(idoc){
                        const v=idoc.querySelector('video.tb-player__video, video[data-media-id], video[poster]');
                        if(v){
                            poster=v.getAttribute('poster')||v.poster||null;
                            const mid2=v.getAttribute('data-media-id')||v.dataset.mediaId;
                            if(mid2) mediaId=mid2; else if(poster && !mediaId) mediaId=getMediaIdFromPoster(poster);
                            const mt2=v.getAttribute('data-media-title')||v.dataset.mediaTitle;
                            if(mt2&&mt2.trim()){extraMediaTitle=mt2.trim(); title=mt2.trim();}
                        }
                    }
                }catch{}
                if (!mediaId && !poster){
                    const outerVideo=document.querySelector('video.tb-player__video[poster], video[data-media-id]');
                    if(outerVideo){
                        poster=outerVideo.getAttribute('poster')||outerVideo.poster||null;
                        mediaId=outerVideo.getAttribute('data-media-id')||outerVideo.dataset.mediaId||getMediaIdFromPoster(poster);
                        const mt3=outerVideo.getAttribute('data-media-title')||outerVideo.dataset.mediaTitle;
                        if(mt3&&mt3.trim()) title=mt3.trim();
                    }
                }
                if(extraMediaTitle) title=extraMediaTitle;
                scanPerformanceForStream();
                const streamUrl=findBestStreamForMedia(mediaId);
                const finalLink=streamUrl||link;
                let category = selCategory && selCategory !== 'Uncategorized' ? selCategory : null;
                if (!category || category === 'Uncategorized') {
                    // Try to recompute category more aggressively - selCategory may be stale Uncategorized
                    try {
                        const deepest = getDeepestOpenRegion();
                        if (deepest) {
                            const path = collectCategoryPath(deepest);
                            if (path.length) category = path.map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean).join(' > ');
                        }
                    } catch {}
                    if (!category || category === 'Uncategorized') {
                        try {
                            const openHeadings = Array.from(document.querySelectorAll('button[data-state="open"] p.line-clamp-2, button[data-state="open"] p'))
                                .map(p => p.textContent.trim()).map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).filter(Boolean);
                            if (openHeadings.length) {
                                // Deduplicate and join
                                const uniq = [];
                                for (const h of openHeadings) if (!uniq.includes(h) && h.length > 2 && h.length < 80) uniq.push(h);
                                if (uniq.length) category = uniq.join(' > ');
                            }
                        } catch {}
                    }
                    if (!category || category === 'Uncategorized') {
                        const h1b = document.querySelector('h1');
                        if (h1b && h1b.textContent.trim() && !/EdgeCourse BD/i.test(h1b.textContent)) category = h1b.textContent.trim().slice(0,60);
                        else {
                            const h2b = document.querySelector('section h2');
                            if (h2b && h2b.textContent.trim()) category = h2b.textContent.trim().slice(0,60);
                        }
                    }
                    if (!category) category = 'Course Content';
                }
                saveEntry(title, finalLink, category, {mediaId, poster, streamUrl, rawSrc: link, via: streamUrl?'iframe+stream':'iframe'});
            }
        } catch(e){ console.warn('[VidDB] iframe err',e); }

        // 2) Direct video element (same-origin fallback)
        try{
            scanPerformanceForStream();
            const video=document.querySelector('video.tb-player__video, video[data-media-id], .tb-player__video-container video, video[data-media-title], video[poster*="tenbytecdn.com"]');
            const isInsideIframeEl=video && video.closest && !!video.closest('iframe');
            if(video && !isInsideIframeEl){
                let mediaId=video.getAttribute('data-media-id')||video.dataset.mediaId||null;
                let mediaTitle=video.getAttribute('data-media-title')||video.dataset.mediaTitle||null;
                if(mediaTitle && !mediaTitle.trim()) mediaTitle=null;
                let poster=video.getAttribute('poster')||video.poster||null;
                if(!poster){ const alt=document.querySelector('.tb-player__video[poster], video[poster]'); if(alt) poster=alt.getAttribute('poster')||alt.poster; }
                if(!mediaId && poster) mediaId=getMediaIdFromPoster(poster);
                let sourceEl=video.querySelector('source');
                let rawSrc=video.currentSrc||video.src||(sourceEl && (sourceEl.src||sourceEl.getAttribute('src')))||null;
                if(rawSrc && rawSrc.startsWith('blob:')) rawSrc=null;
                if(rawSrc) pushStreamUrl(rawSrc);
                let streamUrl=findBestStreamForMedia(mediaId);
                if(!streamUrl && rawSrc && isStreamUrl(rawSrc)) streamUrl=rawSrc;
                let title=null;
                if(mediaTitle&&mediaTitle.trim() && !/EdgeCourse BD/i.test(mediaTitle)) title=mediaTitle.trim();
                else if(selTitle&&selTitle.trim() && !/EdgeCourse BD/i.test(selTitle)) title=selTitle.trim();
                else {
                    // Try header below player before falling back to poster
                    try {
                        const hp = document.querySelector('div.flex.items-center.gap-3.border-b.bg-brand-0 p') || document.querySelector('p.min-w-0.text-sm.font-semibold');
                        if (hp && hp.textContent.trim() && !/Course Progress/i.test(hp.textContent)) title = hp.textContent.trim();
                    } catch {}
                    if (!title && poster) title=`Tenbyte-${mediaId||'video'}`;
                    if (!title) {
                        const h1b = document.querySelector('h1');
                        if (h1b && h1b.textContent.trim() && !/EdgeCourse BD/i.test(h1b.textContent)) title = h1b.textContent.trim();
                    }
                }
                if(title){
                    title=title.trim();
                    if (/EdgeCourse BD/i.test(title)) {
                        const h1c = document.querySelector('h1');
                        if (h1c && !/EdgeCourse BD/i.test(h1c.textContent)) title = h1c.textContent.trim();
                    }
                    let link=streamUrl||rawSrc||poster||(mediaId?`tenbyte://${mediaId}`:null);
                    if(link && !link.startsWith('blob:')){
                        let category = selCategory && selCategory !== 'Uncategorized' ? selCategory : null;
                        if (!category) {
                            try {
                                const deepest = getDeepestOpenRegion();
                                if (deepest) {
                                    const path = collectCategoryPath(deepest);
                                    if (path.length) category = path.map(s=> s.replace(/^\s*Academic Classes\s*-\s*/i,'').trim()).join(' > ');
                                }
                            } catch {}
                            if (!category) {
                                const h1d = document.querySelector('h1');
                                if (h1d) category = h1d.textContent.trim().slice(0,60);
                            }
                            if (!category) category = 'Course Content';
                        }
                        saveEntry(title, link, category, {mediaId, poster, streamUrl, rawSrc, via: streamUrl?'video+stream':'video'});
                    }
                }
            }
        } catch(e){ console.warn('[VidDB] tb err',e); }

        // 3) Bulk from API cache (if user never visited each lesson, API may have provided all lessons)
        // We don't auto-save all to avoid flooding, but if DB is empty, we can seed from cache
        try {
            if (apiLessonCache.size && Object.keys(db).length < 3) {
                for (const [k,v] of apiLessonCache.entries()){
                    if (!db[k] && !Object.values(db).some(e=>e.title===v.title)){
                        // Only seed if we have a real link
                        if (v.link) saveEntry(v.title, v.link, v.category||'Uncategorized', {via: 'api-seed'});
                    }
                }
            }
        } catch {}

        if (dirty){ safeSetDB(db); updateBtnCounter(); }
    }

    function attachUIListeners(){
        btn.addEventListener('click', ()=>{ renderCategories(); modal.style.display='flex'; });
        document.getElementById('vid-close-btn').addEventListener('click', ()=>{ modal.style.display='none'; });
        document.getElementById('vid-search').addEventListener('input', triggerSearch, {passive:true});
        document.getElementById('vid-sort').addEventListener('change', renderCategories);
        document.getElementById('vid-master-checkbox').addEventListener('change', (e)=>{
            const isChecked=e.target.checked;
            document.querySelectorAll('.vid-category-group:not([style*="display: none"]) .row-checkbox').forEach(cb=>{
                const tr=cb.closest('tr'); if(!tr||tr.style.display==='none') return; cb.checked=isChecked;
            });
            document.querySelectorAll('.cat-checkbox').forEach(cb=>{
                const grp=cb.closest('.vid-category-group'); if(!grp||grp.style.display==='none') return; cb.checked=isChecked;
            });
        });
        document.getElementById('vid-select-all').addEventListener('click', ()=>{
            document.querySelectorAll('.vid-category-group:not([style*="display: none"]) .row-checkbox, .cat-checkbox').forEach(cb=>{
                const grp=cb.closest('.vid-category-group'); const tr=cb.closest('tr');
                if(grp&&grp.style.display==='none') return; if(tr&&tr.style.display==='none') return; cb.checked=true;
            });
            const m=document.getElementById('vid-master-checkbox'); if(m) m.checked=true;
        });
        const list=document.getElementById('vid-list-container');
        list.addEventListener('click', (e)=>{
            const header=e.target.closest('.vid-category-header'); if(!header) return;
            if(e.target.classList.contains('cat-checkbox')) return;
            const group=header.closest('.vid-category-group');
            const content=group.querySelector('.vid-category-content');
            const toggle=header.querySelector('.vid-cat-toggle');
            const isOpen=content.style.display==='block';
            content.style.display=isOpen?'none':'block'; if(toggle) toggle.textContent=isOpen?'▶':'▼';
        });
        list.addEventListener('change', (e)=>{
            if(!e.target.classList.contains('cat-checkbox')) return;
            const isChecked=e.target.checked;
            const group=e.target.closest('.vid-category-group');
            // Check all descendant row-checkboxes and child category checkboxes
            group.querySelectorAll('.row-checkbox, .cat-checkbox').forEach(cb=>{
                if (cb === e.target) return;
                const tr=cb.closest('tr');
                const grp=cb.closest('.vid-category-group');
                if (tr && tr.style.display==='none') return;
                if (grp && grp.style.display==='none') return;
                // Only check visible
                const isRowHidden = cb.closest('tr')?.style.display === 'none';
                const isGroupHidden = cb.closest('.vid-category-group')?.style.display === 'none';
                if (isRowHidden || isGroupHidden) return;
                cb.checked=isChecked;
            });
        });
        function cleanName(name){ return name.replace(/[,;|]/g,'_').replace(/_+/g,'_').trim(); }
        document.getElementById('vid-copy-names').addEventListener('click', ()=>{
            const sel=Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb=> cleanName(cb.dataset.name||cb.dataset.key||''));
            if(!sel.length) return showToast('⚠️ Nothing selected!');
            GM_setClipboard(sel.join(' | ')); showToast(`✅ Copied ${sel.length} names!`);
        });
        document.getElementById('vid-copy-links').addEventListener('click', ()=>{
            const db=safeGetDB();
            const keys=Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb=> cb.dataset.key||cb.dataset.name);
            if(!keys.length) return showToast('⚠️ Nothing selected!');
            const links=keys.map(k=> db[k]?.link||db[k]?.streamUrl||db[k]?.poster||'').filter(Boolean);
            if(!links.length) return showToast('⚠️ No links found');
            GM_setClipboard(links.join(' | ')); showToast(`✅ Copied ${links.length} links!`);
        });
        document.getElementById('vid-clear-all').addEventListener('click', ()=>{
            if(!confirm('⚠️ Delete ALL saved videos?')) return;
            safeSetDB({}); lastSavedSig=''; renderCategories(); updateBtnCounter();
            const s=document.getElementById('vid-search'); if(s) s.value='';
            const m=document.getElementById('vid-master-checkbox'); if(m) m.checked=false;
            showToast('🗑️ Database Cleared!');
        });
        modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.style.display='none'; });
        document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && modal.style.display!=='none') modal.style.display='none'; });
    }

    function init(){
        migrateDB();
        createUI();
        let iv=setInterval(()=>{ if(!document.hidden) scanForVideo(); }, 2600);
        document.addEventListener('visibilitychange', ()=>{
            if(document.hidden){ clearInterval(iv); iv=null; }
            else if(!iv){ scanForVideo(); iv=setInterval(()=>{ if(!document.hidden) scanForVideo(); }, 2600); }
        });
        setTimeout(scanForVideo, 900);
        setTimeout(scanForVideo, 2200);
        setTimeout(scanForVideo, 4200);
        console.log('[VidDB] v4.0 init (new site layout). If Uncategorized, check headerP selector: document.querySelector(\"div.flex.items-center.gap-3.border-b.bg-brand-0 p\")');
        try{
            const target=document.querySelector('.tb-player__video-container') || document.querySelector('div.video-container') || document.body;
            const obs=new MutationObserver(()=> scheduleScan());
            obs.observe(target, {childList:true, subtree:true, attributes:true, attributeFilter:['src','poster','data-media-id','data-media-title','title']});
            const iframeObs=new MutationObserver(()=> scheduleScan());
            iframeObs.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
            const origPush=history.pushState;
            history.pushState=function(...a){ const r=origPush.apply(this,a); scheduleScan(); setTimeout(scanForVideo,700); return r; };
            window.addEventListener('popstate', ()=>{ scheduleScan(); setTimeout(scanForVideo,700); });
            // Also watch URL param change (lesson navigation is pushState)
            let lastHref=location.href;
            setInterval(()=>{ if(location.href!==lastHref){ lastHref=location.href; scheduleScan(); setTimeout(scanForVideo,800); } }, 1000);
        }catch(e){}
    }
    if(document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
