// ==UserScript==
// @name         AI Studio Performance Booster V4.1 (URL Fix)
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Physically removes old chat content to save RAM.
// @author       ShoyebOP
// @match        https://aistudio.google.com/*
// @match        https://www.aistudio.google.com/*
// @include      https://aistudio.google.com/*
// @downloadURL  https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/AI-Studio-Performance-Booster.user.js
// @updateURL    https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/AI-Studio-Performance-Booster.user.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const KEEP_VISIBLE_COUNT = 9; // Only keep the last 9 chats real

    // State
    let isHidingEnabled = true;

    // --- LOGGING ---
    function log(msg) {
        // console.log(`[AI Booster] ${msg}`); // Uncomment for debugging
    }

    // --- CSS ---
    // Style for the "placeholder" that replaces the heavy chat
    const css = `
        .shoyeb-placeholder {
            padding: 10px;
            margin: 5px 0;
            border: 1px dashed #ccc;
            border-radius: 8px;
            color: #888;
            font-size: 12px;
            text-align: center;
            background-color: #f9f9f9;
            cursor: pointer;
        }
        .shoyeb-placeholder:hover {
            background-color: #e0e0e0;
            color: #333;
        }
        #shoyeb-toggle-btn {
            position: fixed;
            bottom: 20px;
            right: 80px;
            z-index: 2147483647;
            background-color: #d93025; /* Red initially to show it's powerful */
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: sans-serif;
            user-select: none;
            transition: all 0.3s ease;
        }
        #shoyeb-toggle-btn:hover {
            transform: scale(1.1);
        }
        #shoyeb-toggle-btn.active-mode {
            background-color: #188038; /* Green when saving RAM */
        }
    `;

    const style = document.createElement('style');
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    // --- MAIN LOGIC ---

    function runCleanup() {
        const turns = document.querySelectorAll('ms-chat-turn');

        if (turns.length === 0) return;

        // If Hiding is DISABLED (Show All Mode)
        // We must restore everything that was detached
        if (!isHidingEnabled) {
            turns.forEach(restoreContent);
            return;
        }

        // Calculate cutoff
        const cutoff = turns.length - KEEP_VISIBLE_COUNT;

        turns.forEach((turn, index) => {
            if (index < cutoff) {
                // This is an old message -> DETACH CONTENT
                detachContent(turn, index);
            } else {
                // This is a new message -> ENSURE IT IS VISIBLE
                restoreContent(turn);
            }
        });
    }

    // --- DETACHMENT LOGIC (The Magic) ---

    function detachContent(turn, index) {
        // If already detached, do nothing
        if (turn._isDetached) return;

        // 1. Save all child nodes (text, code blocks, buttons) into a JS array
        //    This removes them from the DOM tree but keeps them in memory.
        turn._savedNodes = Array.from(turn.childNodes);

        // 2. Estimate height to prevent massive scroll jumping (optional, simplified here)
        // const oldHeight = turn.offsetHeight;

        // 3. Create a lightweight placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'shoyeb-placeholder';
        placeholder.textContent = `Chat #${index + 1} Hidden (Content Removed from DOM)`;

        // 4. Swap! (Security Safe: replaceChildren doesn't use innerHTML)
        turn.replaceChildren(placeholder);

        // 5. Mark as detached
        turn._isDetached = true;
    }

    function restoreContent(turn) {
        // If not detached, do nothing
        if (!turn._isDetached) return;

        // 1. Get the saved nodes
        if (turn._savedNodes && turn._savedNodes.length > 0) {
            // 2. Put them back
            turn.replaceChildren(...turn._savedNodes);
        } else {
            // Fallback if something went wrong (shouldn't happen)
            turn.textContent = "Error restoring content.";
        }

        // 3. Mark as active
        turn._isDetached = false;
    }

    // --- UI CREATION ---

    function createButton() {
        if (document.getElementById('shoyeb-toggle-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'shoyeb-toggle-btn';
        btn.textContent = '🚀';
        btn.title = 'Toggle High Performance Mode';
        btn.className = 'active-mode'; // Start green

        btn.onclick = () => {
            isHidingEnabled = !isHidingEnabled;

            if (isHidingEnabled) {
                btn.textContent = '🚀'; // Rocket = Fast
                btn.className = 'active-mode';
            } else {
                btn.textContent = '🐢'; // Turtle = Slow (Show All)
                btn.className = '';
            }

            runCleanup();
        };

        document.body.appendChild(btn);
    }

    // --- LOOP ---
    // Check frequently to keep the DOM light as new messages come in
    setInterval(() => {
        try {
            createButton();
            runCleanup();
        } catch (e) {
            console.error('[AI Booster] Error:', e);
        }
    }, 1000);

})();
