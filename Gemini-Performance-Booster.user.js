// ==UserScript==
// @name         Gemini Performance Booster (Animation Killer)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Blocks all animations, gradients, and shimmer effects on Gemini for low-end hardware. DOM cleaner saves RAM by removing old messages. Keeps fonts and functionality intact.
// @author       ShoyebOP
// @match        https://gemini.google.com/*
// @match        https://business.gemini.google.com/*
// @downloadURL  https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/Gemini-Performance-Booster.user.js
// @updateURL    https://github.com/ShoyebOP/My-Userscripts/raw/refs/heads/main/Gemini-Performance-Booster.user.js
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  const KEEP_VISIBLE_COUNT = 4; // Keep last 10 conversation-containers (5 exchanges)

  // State
  let isCleanupEnabled = true;

  // ============================================================================
  // SECTION 1: Broad CSS Animation Blockers (ALWAYS ON)
  // ============================================================================

  const broadBlock = `
        *, *::before, *::after {
            animation: none !important;
        }
        html, body {
            scroll-behavior: auto !important;
        }
    `;

  // ============================================================================
  // SECTION 2: Gemini-Specific Selectors
  // ============================================================================

  const geminiSpecific = `
        /* Circular Progress / Spinners */
        .javascriptMaterialdesignGm3WizCircularProgressCircularProgressIndeterminate,
        .javascriptMaterialdesignGm3WizCircularProgressCircularProgressContainer,
        .javascriptMaterialdesignGm3WizCircularProgressCircularProgressActiveIndicator,
        .javascriptMaterialdesignGm3WizCircularProgressCircularProgressTrack,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__indeterminate-container,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__spinner-layer,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__color-1,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__color-2,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__color-3,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__color-4,
        .mdc-circular-progress--indeterminate .mdc-circular-progress__indeterminate-circle-graphic,
        .mat-mdc-progress-spinner,
        .mat-progress-spinner-reduced-motion,
        .emoji-keyboard__loading-message__icon {
            animation: none !important;
        }

        /* LM Loading / Neural Expressive Animation */
        body.enable-lm-loading-animation,
        .show-lm-background::before,
        body.enable-lm-loading-animation .chat-container {
            animation: none !important;
        }

        /* Thought Streaming Animations */
        .enable-thoughts-streaming,
        .enable-thoughts-streaming .container-leave-animation,
        .enable-thoughts-streaming .request-enter-animation,
        .enable-lm-loading-animation .request-enter-animation {
            animation: none !important;
        }

        /* Gradient Blobs & Strips */
        .gradient-strip,
        .dark-theme .gradient-strip,
        .nl-bg-blob,
        .nl-fg-blob,
        .input-gradient,
        .input-gradient::before,
        .input-gradient::after,
        .bottom-gradient-container,
        .top-gradient-container,
        .bottom-gradient,
        .top-gradient {
            animation: none !important;
            background-image: none !important;
            background: transparent !important;
        }

        /* Shimmer Effect */
        .gem-shimmer-active,
        .gem-shimmer-active::before {
            animation: none !important;
            background-image: none !important;
        }

        /* Image Generation Loaders */
        .generated-image .placeholder.loading,
        .generated-video .placeholder.loading,
        .generated-image .loader.animate::before,
        .generated-video .loader.animate::before,
        .generated-image .loader.animate.done-generating::before,
        .generated-video .loader.animate.done-generating::before,
        .generated-images-container.loader-grid.animate::before,
        .image-gallery.loader-grid.animate::before {
            animation: none !important;
        }

        /* Mic Button Pulse */
        .gem-mic-button-wrapper .pulse,
        .speech_dictation_mic_button .pulse {
            animation: none !important;
        }

        /* Menu Panel */
        .mat-mdc-menu-panel,
        .mat-mdc-menu-panel.mat-menu-panel-exit-animation {
            animation: none !important;
        }

        /* Angular Animation Triggers */
        [ng-trigger],
        [ng-trigger] * {
            animation: none !important;
        }
    `;

  // ============================================================================
  // SECTION 3: Gradient Background Kill
  // ============================================================================

  const gradientKill = `
        .gradient-strip { background: transparent !important; background-image: none !important; }
        .nl-bg-blob, .nl-fg-blob { background: transparent !important; background-image: none !important; opacity: 0 !important; }
        .input-gradient { background: transparent !important; background-image: none !important; }
        .input-gradient::before, .input-gradient::after { background-image: none !important; background: transparent !important; }
        .bottom-gradient, .top-gradient { background: transparent !important; background-image: none !important; }
        body.enable-lm-loading-animation .show-lm-background::before { background: transparent !important; background-image: none !important; }
    `;

  // ============================================================================
  // SECTION 4: Sidebar Button Fix (restore visibility killed by animation:none)
  // ============================================================================

  const sidebarFix = `
        .close-sidenav-button-desktop,
        .close-sidenav-button-mobile {
            opacity: 1 !important;
            visibility: visible !important;
        }
    `;

  // ============================================================================
  // SECTION 5: DOM Cleaner UI Styles
  // ============================================================================

  const uiStyles = `
        .gp-toggle-btn {
            position: fixed;
            bottom: 20px;
            right: 80px;
            z-index: 2147483647;
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
            transition: transform 0.2s ease;
        }
        .gp-toggle-btn:hover {
            transform: scale(1.1);
        }
        .gp-toggle-btn.active {
            background-color: #188038;
        }
        .gp-toggle-btn.inactive {
            background-color: #d93025;
        }
        .gp-placeholder {
            padding: 10px;
            margin: 5px 0;
            border: 1px dashed #555;
            border-radius: 8px;
            color: #888;
            font-size: 12px;
            text-align: center;
            background-color: #1e1e1e;
            cursor: default;
        }
    `;

  // ============================================================================
  // SECTION 6: Inject CSS
  // ============================================================================

  const fullCss = [
    broadBlock,
    geminiSpecific,
    gradientKill,
    sidebarFix,
    uiStyles,
  ].join("\n");

  function injectCSS() {
    const style = document.createElement("style");
    style.textContent = fullCss;
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }
    if (typeof GM_addStyle === "function") {
      GM_addStyle(fullCss);
    }
  }

  injectCSS();

  // ============================================================================
  // SECTION 7: DOM Cleaner Logic
  // ============================================================================

  function getConversationContainers() {
    const scroller = document.querySelector("infinite-scroller.chat-history");
    if (!scroller) return [];
    return Array.from(
      scroller.querySelectorAll(":scope > .conversation-container"),
    );
  }

  function detachContent(container, index) {
    if (container._gpDetached) return;
    container._gpSavedNodes = Array.from(container.childNodes);
    const placeholder = document.createElement("div");
    placeholder.className = "gp-placeholder";
    placeholder.textContent = `Message #${index + 1} hidden (removed from DOM to save RAM)`;
    container.replaceChildren(placeholder);
    container._gpDetached = true;
  }

  function restoreContent(container) {
    if (!container._gpDetached) return;
    if (container._gpSavedNodes && container._gpSavedNodes.length > 0) {
      container.replaceChildren(...container._gpSavedNodes);
    }
    container._gpDetached = false;
  }

  function runCleanup() {
    const containers = getConversationContainers();
    if (containers.length === 0) return;

    if (!isCleanupEnabled) {
      containers.forEach(restoreContent);
      return;
    }

    const cutoff = containers.length - KEEP_VISIBLE_COUNT;
    containers.forEach((container, index) => {
      if (index < cutoff) {
        detachContent(container, index);
      } else {
        restoreContent(container);
      }
    });
  }

  // ============================================================================
  // SECTION 8: Toggle Button
  // ============================================================================

  function createButton() {
    if (document.getElementById("gp-toggle-btn")) return;

    const btn = document.createElement("button");
    btn.id = "gp-toggle-btn";
    btn.className = "gp-toggle-btn active";
    btn.textContent = "\u{1F680}";
    btn.title = "Toggle DOM Cleanup (keeps last 10 messages)";

    btn.onclick = () => {
      isCleanupEnabled = !isCleanupEnabled;
      if (isCleanupEnabled) {
        btn.textContent = "\u{1F680}";
        btn.className = "gp-toggle-btn active";
      } else {
        btn.textContent = "\u{1F40D}";
        btn.className = "gp-toggle-btn inactive";
      }
      runCleanup();
    };

    document.body.appendChild(btn);
  }

  // ============================================================================
  // SECTION 9: Main Loop
  // ============================================================================

  setInterval(() => {
    try {
      createButton();
      runCleanup();
    } catch (e) {
      console.error("[Gemini Perf Booster] Error:", e);
    }
  }, 1000);
})();
