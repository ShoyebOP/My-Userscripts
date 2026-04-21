// ==UserScript==
// @name         EdgeCourseBD Video Extractor & Manager (Categorized + Search + Sort)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Extracts Vimeo links, categorizes them, with ultra-fast search and sorting.
// @author       ShoyebOP
// @downloadURL  https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/EdgeCourseBD-Video-Extractor.user.js
// @updateURL    https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/EdgeCourseBD-Video-Extractor.user.js
// @match        *://*.edgecoursebd.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    /* --- CSS FOR THE UI --- */
    GM_addStyle(`
        #vid-collector-btn {
            position: fixed; bottom: 20px; left: 20px; z-index: 999999;
            background: #1e1e2e; color: #a6e3a1; border: 1px solid #a6e3a1;
            padding: 10px 15px; border-radius: 8px; cursor: pointer;
            font-family: monospace; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.5);
            transition: all 0.2s;
        }
        #vid-collector-btn:hover { background: #a6e3a1; color: #1e1e2e; }
        
        #vid-collector-modal {
            display: none; position: fixed; top: 10%; left: 10%; width: 80%; max-height: 80%;
            background: #181825; border: 2px solid #89b4fa; border-radius: 10px;
            z-index: 1000000; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            font-family: monospace; color: #cdd6f4; overflow-y: hidden;
            display: flex; flex-direction: column;
        }
        
        #vid-collector-modal h2 { margin-top: 0; color: #89b4fa; border-bottom: 1px solid #45475a; padding-bottom: 10px; flex-shrink: 0;}
        
        .vid-top-bar { display: flex; gap: 10px; margin-bottom: 15px; flex-shrink: 0; }
        .vid-input {
            background: #1e1e2e; color: #cdd6f4; border: 1px solid #585b70;
            padding: 8px; border-radius: 4px; font-family: monospace; outline: none;
        }
        .vid-input:focus { border-color: #89b4fa; }
        #vid-search { flex-grow: 1; }
        #vid-sort { cursor: pointer; width: 200px;}
        
        .vid-controls { margin-bottom: 10px; display: flex; gap: 10px; flex-shrink: 0; }
        .vid-btn { 
            background: #313244; color: #cdd6f4; border: 1px solid #585b70; 
            padding: 8px 12px; cursor: pointer; border-radius: 4px; font-family: monospace;
        }
        .vid-btn:hover { background: #45475a; }
        .vid-btn.copy-btn { border-color: #a6e3a1; color: #a6e3a1; }
        .vid-btn.copy-btn:hover { background: #a6e3a1; color: #181825; }
        .vid-btn.danger-btn { border-color: #f38ba8; color: #f38ba8; }
        
        #vid-list-container { flex-grow: 1; overflow-y: auto; padding-right: 5px; }
        
        /* Category Accordion Styles */
        .vid-category-group { margin-bottom: 10px; border: 1px solid #313244; border-radius: 6px; overflow: hidden; }
        .vid-category-header { 
            background: #1e1e2e; padding: 10px; display: flex; align-items: center; gap: 10px; 
            cursor: pointer; border-bottom: 1px solid transparent; user-select: none;
        }
        .vid-category-header:hover { background: #313244; }
        .vid-cat-toggle { font-size: 12px; color: #89b4fa; width: 15px; text-align: center; }
        .vid-cat-title { font-weight: bold; color: #f9e2af; }
        .vid-category-content { display: none; background: #181825; padding: 0; }
        
        .vid-table { width: 100%; border-collapse: collapse; text-align: left; }
        .vid-table td { border-bottom: 1px solid #313244; padding: 8px; }
        .vid-table tr:last-child td { border-bottom: none; }
        .vid-table tr:hover { background: #1e1e2e; }
        
        .vid-checkbox { cursor: pointer; transform: scale(1.2); }
        .vid-close { position: absolute; top: 15px; right: 20px; cursor: pointer; font-size: 20px; color: #f38ba8; z-index: 2; }
        
        #vid-toast {
            display: none; position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #a6e3a1; color: #181825; padding: 10px 20px; border-radius: 5px;
            z-index: 1000001; font-weight: bold; font-family: monospace;
        }
        
        /* Scrollbar styling for XFCE look */
        #vid-list-container::-webkit-scrollbar { width: 8px; }
        #vid-list-container::-webkit-scrollbar-track { background: #181825; }
        #vid-list-container::-webkit-scrollbar-thumb { background: #45475a; border-radius: 4px; }
        #vid-list-container::-webkit-scrollbar-thumb:hover { background: #585b70; }
    `);

    /* --- DOM ELEMENTS --- */
    const btn = document.createElement('button');
    btn.id = 'vid-collector-btn';
    document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'vid-collector-modal';
    // Modal is initially fully hidden via style inline below, but block locally in html
    modal.style.display = 'none';
    modal.innerHTML = `
        <span class="vid-close" id="vid-close-btn">✖</span>
        <h2>📼 Captured Videos</h2>
        
        <div class="vid-top-bar">
            <input type="text" id="vid-search" class="vid-input" placeholder="🔍 Search video names or categories...">
            <select id="vid-sort" class="vid-input">
                <option value="date-asc">Sort: Oldest First (Default)</option>
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

        <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
            <input type="checkbox" id="vid-master-checkbox" class="vid-checkbox"> 
            <span style="color:#cdd6f4; font-size: 14px;">Toggle Selection</span>
        </div>

        <div id="vid-list-container"></div>
    `;
    document.body.appendChild(modal);

    const toast = document.createElement('div');
    toast.id = 'vid-toast';
    document.body.appendChild(toast);

    /* --- LOGIC --- */
    
    function showToast(msg) {
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }

    function updateBtnCounter() {
        const db = GM_getValue('edgeVids', {});
        const validKeys = Object.keys(db).filter(k => k.trim() !== "");
        btn.textContent = `📼 Vids DB [${validKeys.length}]`;
    }

    function renderCategories() {
        const db = GM_getValue('edgeVids', {});
        const container = document.getElementById('vid-list-container');
        const sortMethod = document.getElementById('vid-sort').value;
        
        container.innerHTML = ''; // Clear current view

        // 1. Group data into categories
        const grouped = {};
        for (const[name, data] of Object.entries(db)) {
            if (name.trim() === "") continue;
            const cat = data.category || "Uncategorized / Extra"; 
            if (!grouped[cat]) grouped[cat] = {};
            grouped[cat][name] = data;
        }

        // 2. Build DOM for each category
        for (const[catName, vids] of Object.entries(grouped)) {
            const vidCount = Object.keys(vids).length;
            const safeCatName = catName.replace(/"/g, '&quot;');
            
            // Array-ify and sort items INSIDE the category
            let vidArray = Object.entries(vids);
            if (sortMethod === 'name-asc') {
                vidArray.sort((a, b) => a[0].localeCompare(b[0]));
            } else if (sortMethod === 'date-desc') {
                vidArray.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
            } else { // date-asc
                vidArray.sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
            }
            
            const groupDiv = document.createElement('div');
            groupDiv.className = 'vid-category-group';
            // Store raw text for fast search
            groupDiv.dataset.catName = catName.toLowerCase();
            
            const header = document.createElement('div');
            header.className = 'vid-category-header';
            header.innerHTML = `
                <span class="vid-cat-toggle">▶</span>
                <input type="checkbox" class="vid-checkbox cat-checkbox" data-category="${safeCatName}">
                <span class="vid-cat-title">${safeCatName} (${vidCount})</span>
            `;

            const content = document.createElement('div');
            content.className = 'vid-category-content';
            
            let tableHTML = `<table class="vid-table"><tbody class="vid-tbody">`;
            for (const [name, data] of vidArray) {
                tableHTML += `
                    <tr data-vid-name="${name.replace(/"/g, '&quot;').toLowerCase()}">
                        <td style="width: 30px; text-align: center;">
                            <input type="checkbox" class="vid-checkbox row-checkbox" data-category="${safeCatName}" data-name="${name.replace(/"/g, '&quot;')}">
                        </td>
                        <td>${name}</td>
                        <td><a href="${data.link}" target="_blank" style="color:#89b4fa;">${data.link.split('?')[0].substring(0,35)}...</a></td>
                    </tr>
                `;
            }
            tableHTML += `</tbody></table>`;
            content.innerHTML = tableHTML;

            header.addEventListener('click', (e) => {
                if (e.target.classList.contains('cat-checkbox')) return; 
                
                const isOpen = content.style.display === 'block';
                content.style.display = isOpen ? 'none' : 'block';
                header.querySelector('.vid-cat-toggle').textContent = isOpen ? '▶' : '▼';
                header.style.borderBottomColor = isOpen ? 'transparent' : '#313244';
            });

            const catCheckbox = header.querySelector('.cat-checkbox');
            catCheckbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                // Only toggle checkboxes that are currently visible (important if search is active)
                content.querySelectorAll('.row-checkbox').forEach(cb => {
                    if (cb.closest('tr').style.display !== 'none') {
                        cb.checked = isChecked;
                    }
                });
            });

            groupDiv.appendChild(header);
            groupDiv.appendChild(content);
            container.appendChild(groupDiv);
        }
        
        // Re-apply search filter if the user sorted while a search query was typed
        triggerSearch();
    }

    // Ultra-fast in-memory DOM search
    function triggerSearch() {
        const term = document.getElementById('vid-search').value.toLowerCase();
        const groups = document.querySelectorAll('.vid-category-group');

        groups.forEach(group => {
            const catName = group.dataset.catName;
            const rows = group.querySelectorAll('tbody tr');
            let hasVisibleRow = false;

            // If the category name itself matches the search, show all rows inside it
            const categoryMatches = catName.includes(term);

            rows.forEach(row => {
                const vidName = row.dataset.vidName;
                if (categoryMatches || vidName.includes(term)) {
                    row.style.display = '';
                    hasVisibleRow = true;
                } else {
                    row.style.display = 'none';
                }
            });

            // Hide the entire category if no rows match
            if (!hasVisibleRow) {
                group.style.display = 'none';
            } else {
                group.style.display = '';
                // Auto-expand if the user typed something
                const content = group.querySelector('.vid-category-content');
                const toggle = group.querySelector('.vid-cat-toggle');
                const header = group.querySelector('.vid-category-header');
                
                if (term !== '') {
                    content.style.display = 'block';
                    toggle.textContent = '▼';
                    header.style.borderBottomColor = 'transparent';
                } else {
                    // Collapse back if search is empty
                    content.style.display = 'none';
                    toggle.textContent = '▶';
                    header.style.borderBottomColor = '#313244';
                }
            }
        });
    }

    // Extraction Logic (Silent background polling)
    function scanForVideo() {
        const iframe = document.querySelector('iframe[src*="player.vimeo.com"]');
        const selectedContainer = document.querySelector('div.bg-brand-100');
        
        if (iframe && selectedContainer) {
            const titleEl = selectedContainer.querySelector('span.course_tab_text');
            if (titleEl) {
                const title = titleEl.textContent.trim();
                const link = iframe.src;

                if (title !== "") {
                    let categoryName = "Uncategorized";
                    const regionDiv = selectedContainer.closest('div[role="region"]');
                    if (regionDiv && regionDiv.parentElement) {
                        const catTitleEl = regionDiv.parentElement.querySelector('h3 .course_tab_text');
                        if (catTitleEl) {
                            categoryName = catTitleEl.textContent.trim();
                        }
                    }

                    const db = GM_getValue('edgeVids', {});
                    
                    if (!db[title] || db[title].link !== link || db[title].category !== categoryName) {
                        db[title] = {
                            link: link,
                            category: categoryName,
                            page: window.location.href,
                            savedAt: Date.now() // Timestamps used for sorting!
                        };
                        GM_setValue('edgeVids', db);
                        updateBtnCounter();
                        console.log(`[VidDB] Updated: [${categoryName}] -> ${title}`); 
                    }
                }
            }
        }
    }

    /* --- UI EVENT LISTENERS --- */

    btn.addEventListener('click', () => {
        renderCategories();
        modal.style.display = 'flex'; // Changed to flex for proper layout handling
    });
    
    document.getElementById('vid-close-btn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Search Box Listener
    document.getElementById('vid-search').addEventListener('input', triggerSearch);
    
    // Dropdown Sort Listener
    document.getElementById('vid-sort').addEventListener('change', renderCategories);

    document.getElementById('vid-master-checkbox').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        // Only select items that aren't hidden by the search
        document.querySelectorAll('.cat-checkbox, .row-checkbox').forEach(cb => {
            const tr = cb.closest('tr');
            if (!tr || tr.style.display !== 'none') {
                cb.checked = isChecked;
            }
        });
    });

    document.getElementById('vid-select-all').addEventListener('click', () => {
        document.querySelectorAll('.cat-checkbox, .row-checkbox').forEach(cb => {
            const tr = cb.closest('tr');
            if (!tr || tr.style.display !== 'none') {
                 cb.checked = true;
            }
        });
        document.getElementById('vid-master-checkbox').checked = true;
    });

    function cleanName(name) {
        return name.replace(/[,;|]/g, '_').replace(/_+/g, '_').trim();
    }

    document.getElementById('vid-copy-names').addEventListener('click', () => {
        const selected = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cleanName(cb.dataset.name));
        if (selected.length === 0) return showToast("⚠️ Nothing selected!");
        GM_setClipboard(selected.join(' | '));
        showToast(`✅ Copied ${selected.length} names!`);
    });

    document.getElementById('vid-copy-links').addEventListener('click', () => {
        const db = GM_getValue('edgeVids', {});
        const selectedNames = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.dataset.name);
        if (selectedNames.length === 0) return showToast("⚠️ Nothing selected!");
        
        const links = selectedNames.map(name => db[name].link);
        GM_setClipboard(links.join(' | '));
        showToast(`✅ Copied ${links.length} links!`);
    });

    document.getElementById('vid-clear-all').addEventListener('click', () => {
        if (confirm("⚠️ Delete ALL saved videos? This cannot be undone.")) {
            GM_setValue('edgeVids', {});
            renderCategories();
            updateBtnCounter();
            document.getElementById('vid-search').value = '';
            showToast("🗑️ Database Cleared!");
        }
    });

    /* --- INIT --- */
    updateBtnCounter();
    setInterval(scanForVideo, 2500);

})();
