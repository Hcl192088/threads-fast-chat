// ==UserScript==
// @name         threads-fast-chat
// @namespace    https://local.threads-fast-chat/
// @version      0.5.26
// @description  Threads 網頁版聊天室加速（支援電腦與 iPhone Safari）：常駐一鍵表情列、🃏 Anki 字卡刷貼文模式（快捷鍵 1~6 選表情 + R 打字回覆 + 0ms 瞬切背景送出）、滑鼠懸停預覽、自動背景預載 0 閃動。
// @author       Local
// @match        https://www.threads.com/*
// @match        https://threads.com/*
// @match        https://*.threads.com/*
// @match        https://www.threads.net/*
// @match        https://threads.net/*
// @match        https://*.threads.net/*
// @updateURL    https://raw.githubusercontent.com/Hcl192088/threads-fast-chat/main/threads-fast-chat.meta.js
// @downloadURL  https://raw.githubusercontent.com/Hcl192088/threads-fast-chat/main/threads-fast-chat.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 設定區 ====================
  const SCRIPT_VERSION = '0.5.26';
  const DEFAULT_EMOJIS = ['❤️', '🤣', '🔥', '👀', '🫠', '👍'];
  const STORAGE_KEYS = {
    fastMode: 'tcf_fast_mode',
    showEmojiBar: 'tcf_show_emoji_bar',
    autoPreload: 'tcf_auto_preload',
    stayInPlace: 'tcf_stay_in_place',
    hoverPreviewMs: 'tcf_hover_preview_ms',
  };

  const HOVER_DELAY_PRESETS = [400, 800, 1200, 0]; // 0 = 關閉
  const savedHoverMs = Number(localStorage.getItem(STORAGE_KEYS.hoverPreviewMs));

  const state = {
    fastMode: localStorage.getItem(STORAGE_KEYS.fastMode) !== 'false',
    showEmojiBar: localStorage.getItem(STORAGE_KEYS.showEmojiBar) !== 'false',
    autoPreload: localStorage.getItem(STORAGE_KEYS.autoPreload) !== 'false',
    stayInPlace: localStorage.getItem(STORAGE_KEYS.stayInPlace) !== 'false',
    hoverPreviewMs: Number.isFinite(savedHoverMs) && localStorage.getItem(STORAGE_KEYS.hoverPreviewMs) !== null ? savedHoverMs : 500,
    isPreloading: false,
    stopPreloadRequested: false,
    drawerOpen: false,
    onlyPostsFilter: true,
    searchQuery: '',
    currentThreadId: null,
    gridObserver: null,
    cachedCount: 0,
    isClickingReaction: false,
  };

  const autoPreloadedThreads = new Set();

  // ==================== 樣式注入 ====================
  const STYLES = `
    /* 隱藏點擊快速表情時閃現的原生彈窗；Anki 模式下阻斷原生彈窗吃掉下一張卡的點擊 */
    html.tcf-hide-native-menu div[role="menu"],
    html.tcf-hide-native-menu div[role="dialog"]:not(#tcf-anki-modal) {
      opacity: 0 !important;
      transition: none !important;
    }
    html.tcf-anki-open.tcf-hide-native-menu div[role="menu"],
    html.tcf-anki-open.tcf-hide-native-menu div[role="dialog"]:not(#tcf-anki-modal) {
      pointer-events: none !important;
    }

    /* 極速減重模式：關閉過場動畫、模糊特效與昂貴陰影 */
    html.tcf-fast-mode div[role="grid"] *,
    html.tcf-fast-mode div[role="grid"] *::before,
    html.tcf-fast-mode div[role="grid"] *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    html.tcf-fast-mode div[role="grid"] img {
      image-rendering: auto;
    }

    /* 常駐一鍵表情列 */
    .tcf-emoji-bar {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(128, 128, 128, 0.12);
      border: 1px solid rgba(128, 128, 128, 0.18);
      width: fit-content;
      max-width: 100%;
      user-select: none;
      opacity: 0.78;
      transition: opacity 0.12s ease, background 0.12s ease !important;
      z-index: 2;
    }
    .tcf-emoji-bar:hover {
      opacity: 1;
      background: rgba(128, 128, 128, 0.2);
    }
    html.tcf-hide-emoji-bars .tcf-emoji-bar {
      display: none !important;
    }
    .tcf-emoji-btn {
      appearance: none;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 3px 4px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.1s ease, background 0.1s ease !important;
    }
    .tcf-emoji-btn:hover {
      transform: scale(1.25);
      background: rgba(128, 128, 128, 0.22);
    }
    .tcf-emoji-btn:active,
    .tcf-emoji-btn.tcf-pop {
      transform: scale(0.9);
      background: rgba(0, 149, 246, 0.25);
    }
    .tcf-emoji-btn.tcf-more {
      font-size: 12px;
      font-weight: 700;
      color: inherit;
      opacity: 0.7;
      padding: 3px 5px;
    }

    /* 浮動控制列 */
    #tcf-toolbar {
      position: fixed;
      top: 12px;
      right: 16px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(20, 20, 22, 0.88);
      color: #f5f5f7;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1;
    }
    #tcf-toolbar button {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.08);
      color: #f5f5f7;
      padding: 5px 9px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    #tcf-toolbar button:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    #tcf-toolbar button.tcf-active {
      background: #0095f6;
      border-color: #0095f6;
      color: #fff;
    }
    #tcf-toolbar button.tcf-danger {
      background: #e11d48;
      border-color: #e11d48;
      color: #fff;
    }
    #tcf-status {
      font-size: 11px;
      color: #a1a1aa;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #tcf-btn-collapse {
      display: none;
    }

    /* 手機版 / iPhone Safari RWD 適配 */
    @media (max-width: 768px) {
      #tcf-toolbar {
        top: calc(8px + env(safe-area-inset-top, 0px));
        right: 8px;
        max-width: calc(100vw - 16px);
        flex-wrap: wrap;
        border-radius: 16px;
        padding: 6px 8px;
        gap: 5px;
      }
      #tcf-toolbar.tcf-collapsed {
        padding: 4px;
        border-radius: 999px;
      }
      #tcf-toolbar.tcf-collapsed > :not(#tcf-btn-collapse) {
        display: none !important;
      }
      #tcf-btn-collapse {
        display: inline-flex;
        font-weight: 700;
        padding: 6px 10px !important;
      }
      #tcf-status {
        max-width: 100%;
        flex-basis: 100%;
        padding-left: 4px;
      }
      #tcf-drawer {
        top: calc(56px + env(safe-area-inset-top, 0px));
        left: 8px;
        right: 8px;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        width: auto;
        max-width: none;
      }
      .tcf-drawer-list {
        -webkit-overflow-scrolling: touch;
      }
      .tcf-drawer-controls input[type="search"] {
        font-size: 16px;
      }
    }

    /* 觸控螢幕（iPhone / iPad）加大表情按鈕熱區 */
    @media (pointer: coarse) {
      .tcf-emoji-bar {
        gap: 4px;
        padding: 3px 8px;
        opacity: 0.92;
      }
      .tcf-emoji-btn {
        font-size: 17px;
        padding: 5px 6px;
        min-width: 30px;
        min-height: 30px;
      }
      .tcf-emoji-btn.tcf-more {
        font-size: 14px;
      }
      #tcf-toolbar button {
        padding: 7px 10px;
        font-size: 13px;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
    }

    /* 本地快取貼文抽屜 */
    #tcf-drawer {
      position: fixed;
      top: 56px;
      right: 16px;
      bottom: 16px;
      width: 390px;
      max-width: calc(100vw - 32px);
      z-index: 99998;
      background: #141416;
      color: #f5f5f7;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #tcf-drawer.tcf-open {
      display: flex;
    }
    .tcf-drawer-header {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #1a1a1e;
    }
    .tcf-drawer-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 14px;
    }
    .tcf-drawer-controls {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .tcf-drawer-controls input[type="search"] {
      flex: 1;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #0d0d0f;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .tcf-drawer-controls label {
      font-size: 12px;
      color: #d4d4d8;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      white-space: nowrap;
    }
    .tcf-drawer-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tcf-card {
      background: #1e1e23;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12.5px;
    }
    .tcf-card-meta {
      display: flex;
      justify-content: space-between;
      color: #a1a1aa;
      font-size: 11px;
    }
    .tcf-card-text {
      color: #f4f4f5;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      max-height: 90px;
      overflow: hidden;
    }
    .tcf-post-link {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      text-decoration: none;
      color: #e4e4e7;
    }
    .tcf-post-link:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .tcf-post-thumb {
      width: 52px;
      height: 52px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
      background: #27272a;
    }
    .tcf-post-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .tcf-post-author {
      font-weight: 600;
      color: #60a5fa;
      font-size: 11.5px;
    }
    .tcf-post-excerpt {
      font-size: 12px;
      color: #d4d4d8;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tcf-empty {
      text-align: center;
      color: #71717a;
      padding: 36px 16px;
      font-size: 13px;
      line-height: 1.6;
    }
    .tcf-drawer-footer {
      padding: 8px 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #a1a1aa;
      background: #1a1a1e;
    }
    .tcf-small-btn {
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: transparent;
      color: #e4e4e7;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
    }
    .tcf-small-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    /* 滑鼠懸停 N 秒極速貼文預覽窗 */
    #tcf-hover-preview {
      position: fixed;
      z-index: 100000;
      width: 440px;
      max-width: calc(100vw - 24px);
      max-height: min(76vh, 640px);
      background: #16161a;
      color: #f4f4f5;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 16px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.65);
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #tcf-hover-preview.tcf-visible {
      display: flex;
    }
    .tcf-pv-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 14px;
      background: #1d1d22;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .tcf-pv-author-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .tcf-pv-avatar {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      object-fit: cover;
      background: #27272a;
      flex-shrink: 0;
    }
    .tcf-pv-author {
      font-weight: 700;
      font-size: 13px;
      color: #fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tcf-pv-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .tcf-pv-actions a {
      color: #60a5fa;
      text-decoration: none;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid rgba(96, 165, 250, 0.35);
    }
    .tcf-pv-actions a:hover {
      background: rgba(96, 165, 250, 0.15);
    }
    .tcf-pv-body {
      padding: 12px 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 14px;
      line-height: 1.55;
    }
    .tcf-pv-text {
      white-space: pre-wrap;
      word-break: break-word;
      color: #f4f4f5;
    }
    .tcf-pv-media {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tcf-pv-media img,
    .tcf-pv-media video {
      max-height: 320px;
      max-width: 100%;
      border-radius: 10px;
      object-fit: contain;
      background: #0b0b0d;
      flex-shrink: 0;
    }
    .tcf-pv-quote {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 12.5px;
      color: #d4d4d8;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tcf-pv-quote-author {
      font-weight: 600;
      color: #93c5fd;
    }
    .tcf-pv-parent {
      border-left: 3px solid #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      border-radius: 0 10px 10px 0;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: #e4e4e7;
    }
    .tcf-pv-parent-label {
      font-size: 11px;
      font-weight: 700;
      color: #7dd3fc;
      letter-spacing: 0.3px;
    }
    .tcf-anki-done-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
      font-weight: 600;
      font-size: 11.5px;
    }
    .tcf-pv-replies {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tcf-pv-reply {
      font-size: 12.5px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 6px 8px;
      color: #e4e4e7;
    }
    .tcf-pv-stats {
      font-size: 12px;
      color: #a1a1aa;
      display: flex;
      gap: 12px;
      padding-top: 2px;
    }
    .tcf-pv-loading {
      font-size: 12px;
      color: #93c5fd;
    }

    /* 🃏 Anki 字卡刷貼文模式 */
    #tcf-anki-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483640;
      background: rgba(9, 9, 12, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f4f4f5;
    }
    #tcf-anki-modal.tcf-open {
      display: flex;
    }
    .tcf-anki-shell {
      width: min(680px, 100%);
      max-height: min(90vh, 820px);
      background: #16161b;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 20px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .tcf-anki-top {
      padding: 12px 16px;
      background: #1d1d24;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tcf-anki-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 14px;
    }
    .tcf-anki-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(0, 149, 246, 0.22);
      color: #7dd3fc;
    }
    .tcf-anki-top-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tcf-anki-btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.07);
      color: #f4f4f5;
      padding: 5px 10px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tcf-anki-btn:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .tcf-anki-btn.tcf-active {
      background: #0095f6;
      border-color: #0095f6;
      color: #fff;
    }
    .tcf-anki-progress-bar {
      height: 3px;
      background: rgba(255, 255, 255, 0.08);
      width: 100%;
    }
    .tcf-anki-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0095f6, #38bdf8);
      width: 0%;
      transition: width 0.2s ease !important;
    }
    .tcf-anki-card {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 260px;
    }
    .tcf-anki-chat-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px 10px;
      font-size: 12px;
      color: #a1a1aa;
      background: rgba(255, 255, 255, 0.04);
      padding: 6px 10px;
      border-radius: 10px;
    }
    .tcf-anki-post-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
    }
    .tcf-anki-post-section h3 {
      margin: 0;
      color: #d4d4d8;
      font-size: 13px;
    }
    .tcf-anki-post-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .tcf-anki-author {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      color: #fff;
    }
    .tcf-anki-text {
      font-size: 15.5px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      color: #f4f4f5;
    }
    .tcf-anki-media {
      display: flex;
      flex-shrink: 0;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 6px;
      scroll-snap-type: x mandatory;
    }
    .tcf-anki-media img,
    .tcf-anki-media video {
      max-height: 360px;
      max-width: 100%;
      border-radius: 12px;
      object-fit: contain;
      background: #0b0b0e;
      flex-shrink: 0;
      scroll-snap-align: start;
    }
    .tcf-anki-media.tcf-multi img,
    .tcf-anki-media.tcf-multi video,
    .tcf-pv-media.tcf-multi img,
    .tcf-pv-media.tcf-multi video {
      max-width: 82%;
    }
    .tcf-media-count {
      font-size: 11.5px;
      color: #93c5fd;
      font-weight: 600;
      margin-bottom: -4px;
    }
    .tcf-anki-footer {
      padding: 12px 16px 14px;
      background: #1d1d24;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .tcf-anki-emoji-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tcf-anki-emoji-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tcf-anki-key-btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #27272f;
      color: #fff;
      padding: 7px 11px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 16px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: transform 0.1s ease, background 0.1s ease !important;
    }
    .tcf-anki-key-btn:hover {
      background: #353542;
      transform: translateY(-1px);
    }
    .tcf-anki-key-btn:active {
      transform: scale(0.95);
      background: #0095f6;
    }
    .tcf-anki-kbd {
      font-size: 11px;
      font-weight: 700;
      color: #a1a1aa;
      background: rgba(0, 0, 0, 0.35);
      padding: 1px 5px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .tcf-anki-reply-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #tcf-anki-modal.tcf-anki-finished #tcf-anki-emoji-group,
    #tcf-anki-modal.tcf-anki-finished #tcf-anki-skip,
    #tcf-anki-modal.tcf-anki-finished .tcf-anki-reply-row,
    #tcf-anki-modal.tcf-anki-finished .tcf-anki-hint > span:first-child {
      display: none;
    }
    .tcf-anki-reply-input {
      flex: 1;
      padding: 9px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: #101014;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .tcf-anki-reply-input:focus {
      border-color: #0095f6;
      box-shadow: 0 0 0 2px rgba(0, 149, 246, 0.25);
    }
    .tcf-anki-send-btn {
      appearance: none;
      border: none;
      background: #0095f6;
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      padding: 9px 14px;
      border-radius: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .tcf-anki-send-btn:hover {
      background: #1aa3ff;
    }
    .tcf-anki-hint {
      font-size: 11.5px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* iPhone / 手機版 Anki 滿版與觸控適配 */
    @media (max-width: 768px) {
      #tcf-anki-modal {
        padding: calc(6px + env(safe-area-inset-top, 0px)) 6px calc(6px + env(safe-area-inset-bottom, 0px));
      }
      .tcf-anki-shell {
        width: 100%;
        max-height: calc(100dvh - 12px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
        border-radius: 16px;
      }
      .tcf-anki-card {
        padding: 14px;
        -webkit-overflow-scrolling: touch;
      }
      .tcf-anki-footer {
        padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
        gap: 8px;
      }
      .tcf-anki-emoji-group#tcf-anki-emoji-group {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 6px;
      }
      .tcf-anki-key-btn {
        justify-content: center;
        padding: 10px 0;
        font-size: 20px;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      .tcf-anki-kbd,
      .tcf-anki-hint > span:first-child {
        display: none;
      }
      .tcf-anki-reply-input {
        font-size: 16px;
      }
    }
  `;

  if (typeof GM_addStyle === 'function') {
    GM_addStyle(STYLES);
  } else {
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // ==================== IndexedDB 本地快取層 ====================
  const DB_NAME = 'ThreadsFastChatDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'messages';
  const DAY_MS = 86_400_000;
  const ANKI_CARD_LIMIT = 500;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('threadId', 'threadId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function saveMessagesBatch(records) {
    if (!records.length) return;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const rec of new Map(records.map((row) => [row.key, row])).values()) {
          const request = store.get(rec.key);
          request.onsuccess = () => {
            const previous = request.result;
            const updated = { ...previous, ...rec };
            if (updated.ownReaction || updated.repliedByMe) {
              updated.processedAt = previous?.processedAt || rec.processedAt || Date.now();
            } else {
              delete updated.processedAt;
            }
            if (updated.processedAt && Date.now() - updated.processedAt >= 7 * DAY_MS) {
              store.put(compactProcessedCard(updated));
            } else {
              store.put(updated);
            }
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[ThreadsFastChat] IndexedDB write failed:', err);
    }
  }

  function compactProcessedCard(row) {
    const { key, threadId, messageId, sentAt, capturedAt, ownReaction, repliedByMe, processedAt } = row;
    return { key, threadId, messageId, sentAt, capturedAt, ownReaction, repliedByMe, processedAt };
  }

  function messageTime(row) {
    return row.sentAt || Date.parse(row.timestamp) || row.capturedAt || 0;
  }

  function isAnkiSourceCard(row) {
    return row.sentByViewer === false && row.hasPost && row.posts?.length && !row.isReplyMessage;
  }

  async function pruneAnkiCache(rows, expireByAge) {
    const now = Date.now();
    const writes = [];
    const deletes = new Set();
    const fullCards = [];
    for (const row of rows) {
      if (expireByAge && now - (row.processedAt || messageTime(row)) >= 30 * DAY_MS) {
        deletes.add(row.key);
      } else if (row.posts?.length) {
        if (row.processedAt && now - row.processedAt >= 7 * DAY_MS) {
          writes.push(compactProcessedCard(row));
        } else {
          fullCards.push(row);
        }
      }
    }
    fullCards.sort((a, b) => Number(Boolean(!b.processedAt && isAnkiSourceCard(b))) -
      Number(Boolean(!a.processedAt && isAnkiSourceCard(a))) ||
      Number(Boolean(a.processedAt)) - Number(Boolean(b.processedAt)) ||
      messageTime(b) - messageTime(a));
    for (const row of fullCards.slice(ANKI_CARD_LIMIT)) {
      if (row.processedAt) writes.push(compactProcessedCard(row));
      else deletes.add(row.key);
    }
    if (!deletes.size && !writes.length) return rows;

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const key of deletes) store.delete(key);
      for (const row of writes) store.put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    const compacted = new Map(writes.map((row) => [row.key, row]));
    return rows.filter((row) => !deletes.has(row.key)).map((row) => compacted.get(row.key) || row);
  }

  async function getThreadMessages(threadId) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.objectStore(STORE_NAME).index('threadId');
        const req = index.getAll(threadId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[ThreadsFastChat] IndexedDB read failed:', err);
      return [];
    }
  }

  async function clearThreadCache(threadId) {
    try {
      const db = await openDB();
      const rows = await getThreadMessages(threadId);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const r of rows) store.delete(r.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[ThreadsFastChat] IndexedDB clear failed:', err);
    }
  }

  // ==================== 工具函式 ====================
  function getThreadIdFromUrl() {
    const m = location.pathname.match(/\/messages\/t\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizeEmoji(str) {
    return (str || '').replace(/\uFE0F/g, '').trim();
  }

  function getMessageGrid() {
    const grids = Array.from(document.querySelectorAll('div[role="grid"]'));
    return (
      grids.find((g) => g.querySelector('div[data-message-id]')) ||
      grids.find((g) => g.scrollHeight > g.clientHeight) ||
      grids[0] ||
      null
    );
  }

  function setStatus(text) {
    const el = document.getElementById('tcf-status');
    if (el) el.textContent = text || '';
  }

  function applyGlobalFlags() {
    document.documentElement.classList.toggle('tcf-fast-mode', state.fastMode);
    document.documentElement.classList.toggle('tcf-hide-emoji-bars', !state.showEmojiBar);
  }

  // ==================== 一鍵表情符號觸發邏輯 ====================
  function invokeReactHoverProps(el) {
    if (!el) return;
    try {
      const propKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (!propKey) return;
      const props = el[propKey];
      if (!props) return;
      const fakeEvt = {
        target: el,
        currentTarget: el,
        relatedTarget: document.body,
        bubbles: true,
        preventDefault() {},
        stopPropagation() {},
        persist() {},
      };
      if (typeof props.onPointerEnter === 'function') props.onPointerEnter({ ...fakeEvt, type: 'pointerenter', pointerType: 'mouse' });
      if (typeof props.onMouseEnter === 'function') props.onMouseEnter({ ...fakeEvt, type: 'mouseenter' });
      if (typeof props.onMouseOver === 'function') props.onMouseOver({ ...fakeEvt, type: 'mouseover' });
    } catch {}
  }

  function hoverMessageRow(msgEl) {
    // 實測 Threads 的 hover 監聽掛在 d2 (div[data-message-id] > div > div)
    // 1. 直接呼叫 React __reactProps$ 的 onMouseEnter/onPointerEnter（在 iPhone Safari 無滑鼠環境下也能 1ms 同步喚醒 gridcell！）
    const d1 = msgEl?.firstElementChild;
    const d2 = d1?.firstElementChild;
    const d3 = d2?.firstElementChild;
    invokeReactHoverProps(d2);
    invokeReactHoverProps(d3);

    // 2. 同時派發標準冒泡 mouseover/pointerover 雙重保險
    const target = d3 || d2;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const cx = rect.left + Math.min(rect.width / 2, 40);
    const cy = rect.top + Math.min(rect.height / 2, 20);
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: cx,
      clientY: cy,
      relatedTarget: document.body,
      pointerType: 'mouse',
      isPrimary: true,
    };
    target.dispatchEvent(new PointerEvent('pointerover', opts));
    target.dispatchEvent(new MouseEvent('mouseover', opts));
    target.dispatchEvent(new MouseEvent('mousemove', opts));
  }

  function simulateRealClick(el, shouldFocus = true) {
    if (!el) return;
    if (shouldFocus) {
      try {
        el.focus({ preventScroll: true });
      } catch {}
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      button: 0,
      buttons: 1,
      detail: 1,
    };
    const ptrCommon = {
      ...common,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', ptrCommon));
    el.dispatchEvent(new MouseEvent('mousedown', common));
    el.dispatchEvent(new PointerEvent('pointerup', { ...ptrCommon, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...common, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...common, buttons: 0 }));
  }

  async function waitForElement(finder, timeoutMs = 500, intervalMs = 20) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = finder();
      if (found) return found;
      await sleep(intervalMs);
    }
    return null;
  }

  let deviceNeedsLongPress = false;

  function findNewReactionMenu(existingMenus) {
    const candidates = Array.from(document.querySelectorAll('div[role="menu"], div[role="dialog"]'));
    for (const el of candidates) {
      if (existingMenus.has(el)) continue;
      if (el.closest('#tcf-anki-modal, #tcf-drawer, #tcf-hover-preview')) continue;
      if (el.getAttribute('role') === 'menu') return el;
      // 若 iOS 行動版用 role="dialog" 當表情選單，確認內含 emoji button 才匹配
      const hasEmojiBtn = Array.from(el.querySelectorAll('div[role="button"]')).some((b) =>
        /\p{Extended_Pictographic}/u.test((b.textContent || '').trim())
      );
      if (hasEmojiBtn) return el;
    }
    return null;
  }

  async function triggerLongPressFallback(msgEl, existingMenus) {
    // 行動版 iOS Safari 備援：派發真正的 TouchEvent + PointerEvent 長按，於選單一出現就立刻結束等待
    const target =
      msgEl?.querySelector('a[href*="/post/"]') ||
      msgEl?.firstElementChild?.firstElementChild?.firstElementChild ||
      msgEl;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const cx = rect.left + Math.min(rect.width / 2, 60);
    const cy = rect.top + Math.min(rect.height / 2, 30);
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    };

    let touchObj = null;
    try {
      if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
        touchObj = new Touch({
          identifier: Date.now() % 100000,
          target,
          clientX: cx,
          clientY: cy,
          pageX: cx + window.scrollX,
          pageY: cy + window.scrollY,
          radiusX: 10,
          radiusY: 10,
          force: 1,
        });
        target.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touchObj],
            targetTouches: [touchObj],
            changedTouches: [touchObj],
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      }
    } catch {}

    target.dispatchEvent(new PointerEvent('pointerdown', common));
    target.dispatchEvent(new MouseEvent('mousedown', common));

    const start = Date.now();
    while (Date.now() - start < 550) {
      if (findNewReactionMenu(existingMenus)) break;
      await sleep(25);
    }

    target.dispatchEvent(new MouseEvent('contextmenu', common));
    if (touchObj) {
      try {
        target.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [touchObj],
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      } catch {}
    }
    target.dispatchEvent(new PointerEvent('pointerup', common));
    target.dispatchEvent(new MouseEvent('mouseup', common));
  }

  async function triggerQuickReaction(msgEl, emoji, openFullPicker = false) {
    if (state.isClickingReaction) return { ok: false, reason: '忙線中' };
    state.isClickingReaction = true;
    setStatus(openFullPicker ? '開啟表情選單...' : `送出 ${emoji} 中...`);

    try {
      // 實測對方與自己訊息的 gridcell 按鈕順序相反，但「更多 (...)」的 svg 帶有 title 屬性，「傳達心情」沒有 title！
      const findReactBtn = () => {
        const gc = msgEl.querySelector('div[role="gridcell"]');
        if (!gc) return null;
        const dialogBtns = Array.from(gc.querySelectorAll('div[role="button"][aria-haspopup="dialog"]'));
        return dialogBtns.find((b) => !b.querySelector('svg[title]')) || dialogBtns[0] || null;
      };

      // 1. 嘗試喚醒 gridcell；若在無滑鼠且讀不到 React props 的手機環境，縮短等待快速進入長按備援
      const d2 = msgEl?.firstElementChild?.firstElementChild;
      const hasReactProps = Boolean(d2 && Object.keys(d2).some((k) => k.startsWith('__reactProps$')));
      const hoverWaitMs = !hasReactProps && 'ontouchstart' in window ? 60 : 400;
      let reactBtn = findReactBtn();
      if (!reactBtn) {
        hoverMessageRow(msgEl);
        reactBtn = await waitForElement(findReactBtn, hoverWaitMs, 10);
      }

      // 2. 暫時隱藏原生彈窗避免閃爍（若是開啟完整選單則不隱藏）
      if (!openFullPicker) {
        document.documentElement.classList.add('tcf-hide-native-menu');
      }

      const existingMenus = new Set(document.querySelectorAll('div[role="menu"], div[role="dialog"]'));
      const allowFocus = !ankiState.open;

      if (reactBtn) {
        simulateRealClick(reactBtn, allowFocus);
      } else {
        await triggerLongPressFallback(msgEl, existingMenus);
      }

      const menu = await waitForElement(() => findNewReactionMenu(existingMenus), 500, 10);

      if (!menu) {
        document.documentElement.classList.remove('tcf-hide-native-menu');
        const reason = reactBtn ? '原生表情選單未出現' : '未喚出表情選單';
        setStatus(reason);
        return { ok: false, reason };
      }

      const buttons = Array.from(menu.querySelectorAll('div[role="button"]'));

      if (openFullPicker) {
        const plusBtn = buttons.find((b) => !b.textContent.trim() && b.querySelector('svg')) || buttons[buttons.length - 1];
        if (plusBtn) simulateRealClick(plusBtn, allowFocus);
        setStatus('已開啟更多表情');
        return { ok: true };
      }

      const targetNorm = normalizeEmoji(emoji);
      const emojiBtn = buttons.find((b) => normalizeEmoji(b.textContent) === targetNorm);

      if (emojiBtn) {
        simulateRealClick(emojiBtn, allowFocus);
        setStatus(`已送出 ${emoji}`);
      } else {
        document.documentElement.classList.remove('tcf-hide-native-menu');
        const reason = `選單內無 ${emoji}`;
        setStatus(`${reason}，請直接點選`);
        return { ok: false, reason };
      }

      await sleep(20);
      return { ok: true };
    } catch (err) {
      console.error('[ThreadsFastChat] reaction error:', err);
      const reason = err?.message || String(err);
      setStatus(`表情失敗: ${reason}`);
      return { ok: false, reason };
    } finally {
      document.documentElement.classList.remove('tcf-hide-native-menu');
      state.isClickingReaction = false;
    }
  }

  function injectEmojiBar(msgEl) {
    if (!msgEl || msgEl.dataset.tcfEnhanced === '1') return;
    msgEl.dataset.tcfEnhanced = '1';

    // 最佳化此訊息內的圖片與影片
    optimizeMediaInMessage(msgEl);

    const bar = document.createElement('div');
    bar.className = 'tcf-emoji-bar';
    bar.setAttribute('data-tcf-bar', '1');

    // 滑鼠一移到表情列就預熱 hover，讓原生 gridcell 提前掛載
    bar.addEventListener('pointerenter', () => hoverMessageRow(msgEl));
    // 攔截 pointerdown/mousedown 冒泡，避免 Meta 全域 outside-click handler 關閉彈窗
    const stopDown = (e) => e.stopPropagation();
    bar.addEventListener('pointerdown', stopDown);
    bar.addEventListener('mousedown', stopDown);

    for (const emoji of DEFAULT_EMOJIS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tcf-emoji-btn';
      btn.textContent = emoji;
      btn.title = `一鍵送出 ${emoji}`;
      btn.addEventListener('pointerdown', stopDown);
      btn.addEventListener('mousedown', stopDown);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('tcf-pop');
        setTimeout(() => btn.classList.remove('tcf-pop'), 150);
        triggerQuickReaction(msgEl, emoji, false);
      });
      bar.appendChild(btn);
    }

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'tcf-emoji-btn tcf-more';
    moreBtn.textContent = '＋';
    moreBtn.title = '開啟更多表情符號';
    moreBtn.addEventListener('pointerdown', stopDown);
    moreBtn.addEventListener('mousedown', stopDown);
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerQuickReaction(msgEl, null, true);
    });
    bar.appendChild(moreBtn);

    // 判斷訊息是靠左還是靠右，並優先掛進 d3（d2 原生 hover 區內的直向 flex 容器）
    // 這樣滑鼠移到表情列時就 100% 處於原生 hover 區，Threads 會自動掛載 gridcell！
    const d1 = msgEl.firstElementChild;
    const d2 = d1?.firstElementChild;
    const d3 = d2?.firstElementChild;
    const justifyEl = d2 || msgEl.querySelector('[style*="--x-justifyContent"]');
    const isRight = justifyEl && justifyEl.getAttribute('style')?.includes('end');

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = isRight ? 'flex-end' : 'flex-start';
    wrapper.style.padding = d3
      ? (isRight ? '2px 0 4px 0' : '2px 0 4px 40px')
      : (isRight ? '0 12px 4px 0' : '0 0 4px 44px');
    wrapper.appendChild(bar);

    if (d3) {
      d3.appendChild(wrapper);
    } else {
      msgEl.appendChild(wrapper);
    }
  }

  function optimizeMediaInMessage(msgEl) {
    if (!state.fastMode) return;
    // 圖片非同步解碼，減少主執行緒卡頓
    msgEl.querySelectorAll('img').forEach((img) => {
      if (!img.decoding) img.decoding = 'async';
    });
    // 影片取消自動播放與預載
    msgEl.querySelectorAll('video').forEach((v) => {
      v.autoplay = false;
      v.preload = 'none';
      if (!v.paused) {
        try {
          v.pause();
        } catch {}
      }
    });
  }

  // ==================== 訊息擷取與本地快取 ====================
  const seenInSession = new Set();
  let pendingRecords = [];
  let flushTimer = null;

  function detectNativeReactions(msgEl) {
    // 偵測原生表情徽章（排除我們注入的 [data-tcf-bar="1"] 與貼文連結與 hover gridcell）
    const reactions = [];
    const btns = msgEl.querySelectorAll('[role="button"], button');
    for (const b of btns) {
      if (b.closest('[data-tcf-bar="1"]')) continue;
      if (b.closest('div[role="gridcell"]')) continue;
      if (b.closest('a[href*="/post/"]')) continue;
      const txt = (b.textContent || '').trim();
      if (!txt || txt.length > 16) continue;
      if (/\p{Extended_Pictographic}/u.test(txt)) {
        reactions.push(txt);
      }
    }
    return reactions;
  }

  function getReactFiber(element) {
    const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    return element[key];
  }

  function getNativeMessageData(msgEl, messageId) {
    // Threads 的訊息資料用 Relay 連到實際發送者，頭像與版面位置會隨虛擬化和介面變化。
    let item;
    let nextItem;
    let members;
    for (let fiber = getReactFiber(msgEl); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.item?.as_micg_interface?.message_id === messageId) {
        item = props.item;
        nextItem = props.nextItem;
      }
      if (props?.['slideThread$key']) members = props['slideThread$key'].members?.nodes;

      const environment = props?.value?.environment;
      if (!item || !environment?.getStore) continue;
      const source = environment.getStore().getSource();
      // xdt_text_app_viewer 是登入者，私訊列表的 userKey 是聊天對象。
      const viewerRef = source.get('client:root')?.xdt_text_app_viewer?.__ref;
      const viewerUserRef = source.get(viewerRef)?.user?.__ref;
      const viewerIgId = source.get(viewerUserRef)?.pk;
      const messageRef = source.get(item.__id)?.as_micg_interface?.__ref;
      const message = source.get(messageRef);
      if (viewerIgId && message) return { source, viewerIgId, message, members, item, nextItem };
    }
  }

  function getNativeMessageSender(data) {
    if (!data) return {};
    const { source, viewerIgId, message } = data;
    const user = source.get(message.sender?.__ref);
    const senderId = message.sender_fbid;
    if (senderId && user?.id === senderId && user.igid) {
      const sentByViewer = String(user.igid) === String(viewerIgId);
      const sender = sentByViewer ? '你自己' : (user.username ? `@${user.username}` : getChatPartnerName());
      return { senderId, sentByViewer, sender, senderSource: 'native' };
    }
    return {};
  }

  function extractUsernameFromHref(href) {
    if (!href || href.includes('/post/')) return '';
    const match = href.match(/(?:^|\/\/[^/]+)\/@([^/?#]+)\/?$/);
    return match ? `@${match[1]}` : '';
  }

  function extractNameFromAvatarAlt(alt) {
    const raw = (alt || '').trim();
    if (!raw) return '';
    const zh = raw.match(/^(.+?)的大頭貼照$/);
    if (zh?.[1]) return zh[1].trim();
    const en = raw.match(/^(.+?)'s profile picture$/i);
    if (en?.[1]) return en[1].trim();
    return '';
  }

  function getChatPartnerName() {
    const ignored = '#tcf-anki-modal, #tcf-drawer, #tcf-toolbar, div[role="grid"], nav';
    const links = document.querySelectorAll('header a[href*="/@"], main a[href*="/@"]');
    for (const a of links) {
      if (a.closest(ignored)) continue;
      const username = extractUsernameFromHref(a.getAttribute('href') || '');
      if (username) return username;
    }
    const headings = document.querySelectorAll('header h1, header h2, header [role="heading"], main h1, main h2');
    for (const h of headings) {
      if (h.closest(ignored)) continue;
      const text = (h.textContent || '').trim();
      if (text && text.length <= 40 && !/^(訊息|私訊|Messages|Chats)$/i.test(text)) {
        return text;
      }
    }
    return '對方';
  }

  function detectMessageHorizontalAlign(msgEl) {
    const d1 = msgEl.firstElementChild;
    const d2 = d1?.firstElementChild;
    const d3 = d2?.firstElementChild;
    for (const el of [d2, d3, d1, msgEl.querySelector('[style*="--x-justifyContent"]')]) {
      const style = el?.getAttribute?.('style') || '';
      if (!style.includes('--x-justifyContent')) continue;
      const match = style.match(/--x-justifyContent\s*:\s*([^;]+)/i);
      const val = (match?.[1] || '').trim().toLowerCase();
      if (val.includes('end') || val === 'right') return 'right';
      if (val.includes('start') || val === 'left') return 'left';
    }

    const anchor =
      msgEl.querySelector('a[href*="/post/"]') ||
      Array.from(msgEl.querySelectorAll('span[dir="auto"]')).find(
        (s) => !s.closest('[data-tcf-bar="1"], div[role="gridcell"]')
      );
    if (!anchor) return '';

    const msgRect = msgEl.getBoundingClientRect();
    let bubble = anchor;
    for (let child = anchor, parent = anchor.parentElement; parent && child !== msgEl; child = parent, parent = parent.parentElement) {
      const parentRect = parent.getBoundingClientRect();
      const childRect = child.getBoundingClientRect();
      const narrower = parentRect.width > 0 && childRect.width > 0 && parentRect.width - childRect.width >= 12;
      if (narrower) {
        bubble = child;
        const cs = getComputedStyle(parent);
        if (cs.display.includes('flex')) {
          const dir = cs.flexDirection;
          if (dir === 'row' || dir === 'row-reverse') {
            const jc = cs.justifyContent;
            const isEnd = jc === 'flex-end' || jc === 'end' || jc === 'right';
            const isStart = jc === 'flex-start' || jc === 'start' || jc === 'left';
            if (isEnd) return dir === 'row-reverse' ? 'left' : 'right';
            if (isStart) return dir === 'row-reverse' ? 'right' : 'left';
          } else if (dir === 'column' || dir === 'column-reverse') {
            const self = getComputedStyle(child).alignSelf;
            const ai = self && self !== 'auto' ? self : cs.alignItems;
            if (ai === 'flex-end' || ai === 'end' || ai === 'right') return 'right';
            if (ai === 'flex-start' || ai === 'start' || ai === 'left') return 'left';
          }
        }
      }
      if (parent === msgEl) break;
    }

    if (msgRect.width > 0) {
      const bubbleRect = bubble.getBoundingClientRect();
      if (bubbleRect.width > 0 && msgRect.width - bubbleRect.width >= 20) {
        const leftGap = bubbleRect.left - msgRect.left;
        const rightGap = msgRect.right - bubbleRect.right;
        if (leftGap > 48 && rightGap <= 28 && leftGap - rightGap >= 20) return 'right';
        if (rightGap > 48 && leftGap <= 56 && rightGap - leftGap >= 16) return 'left';
      }
    }
    return '';
  }

  function getDomMessageSender(msgEl) {
    if (!msgEl) return {};
    const exclude = 'a[href*="/post/"], [data-tcf-bar="1"], div[role="gridcell"]';

    // 1. 對方頭像連結（自己傳的訊息不會顯示自己的頭像連結）
    for (const a of msgEl.querySelectorAll('a[href*="/@"]')) {
      if (a.closest(exclude)) continue;
      const username = extractUsernameFromHref(a.getAttribute('href') || '');
      if (username) {
        return { sentByViewer: false, sender: username, senderSource: 'dom' };
      }
    }

    // 2. 左側對方頭像圖片（排除貼文卡片與表情列）
    const msgRect = msgEl.getBoundingClientRect();
    for (const img of msgEl.querySelectorAll('img')) {
      if (img.closest(exclude)) continue;
      const alt = img.getAttribute('alt') || '';
      const looksLikeAvatar =
        isAvatarUrl(img.currentSrc || img.src) || /大頭貼照|profile picture|avatar/i.test(alt);
      if (!looksLikeAvatar) continue;
      const rect = img.getBoundingClientRect();
      const smallAvatar = rect.width > 0 && rect.width <= 56 && rect.height <= 56;
      const onLeftSide = msgRect.width === 0 || rect.left - msgRect.left < msgRect.width * 0.35;
      if (smallAvatar && onLeftSide) {
        const sender = extractNameFromAvatarAlt(alt) || getChatPartnerName();
        return { sentByViewer: false, sender, senderSource: 'dom' };
      }
    }

    // 3. 依訊息氣泡左右對齊判定（右 = 自己、左 = 對方）
    const align = detectMessageHorizontalAlign(msgEl);
    if (align === 'right') {
      return { sentByViewer: true, sender: '你自己', senderSource: 'dom' };
    }
    if (align === 'left') {
      return { sentByViewer: false, sender: getChatPartnerName(), senderSource: 'dom' };
    }
    return {};
  }

  function hasDomReaction(msgEl, emoji) {
    const target = normalizeEmoji(emoji);
    if (!target || !msgEl) return false;
    return detectNativeReactions(msgEl).some((reaction) => normalizeEmoji(reaction) === target);
  }

  function getFollowingMessageText(data) {
    if (!data?.nextItem) return '';
    const { source, message, item, nextItem } = data;
    const next = nextItem.as_micg_interface;
    const elapsed = Number(next?.timestamp_ms) - Number(item.as_micg_interface.timestamp_ms);
    if (!(elapsed >= 0 && elapsed <= 60_000) || next.sender_fbid !== message.sender_fbid) return '';

    const nextRef = source.get(nextItem.__id)?.as_micg_interface?.__ref;
    const content = source.get(source.get(nextRef)?.content?.__ref);
    return content?.__typename === 'THMessageTextContent' ? content.text_body?.trim().slice(0, 500) || '' : '';
  }

  function getOwnNativeReaction(data) {
    if (!data) return;
    const { source, viewerIgId, message, members } = data;
    const viewer = members?.map((member) => source.get(source.get(member?.__id)?.as_micg_interface?.__ref))
      .find((user) => user?.igid === viewerIgId);
    const refs = message.msg_reactions?.__refs;
    if (!viewer?.id || !Array.isArray(refs)) return;
    const reactions = refs.map((ref) => source.get(ref));
    if (reactions.some((reaction) => !reaction?.sender_fbid || !reaction.reaction)) return;
    return reactions.find((reaction) => reaction.sender_fbid === viewer.id) || null;
  }

  function hasOwnNativeReaction(msgEl, messageId, emoji) {
    const reaction = getOwnNativeReaction(getNativeMessageData(msgEl, messageId));
    return reaction === undefined ? undefined : normalizeEmoji(reaction?.reaction) === normalizeEmoji(emoji);
  }

  function prioritizeSharedReply(posts, data) {
    if (posts.length < 2) return;
    if (data) {
      const content = data.source.get(data.message.content?.__ref);
      const parent = data.source.get(content?.parent_post?.__ref);
      if (!parent?.threads_post_json || !content.threads_post_json) return;
      // Threads 先放原貼文的連結，但 threads_post_json 指向實際分享的留言。
      try {
        const replyCode = JSON.parse(content.threads_post_json).code;
        if (!replyCode) return;
        const replyIndex = posts.findIndex((post) => extractPostCode(post.url) === replyCode);
        if (replyIndex > 0) posts.unshift(posts.splice(replyIndex, 1)[0]);
        if (replyIndex >= 0) posts[0].sharedParent = summarizePostObj(JSON.parse(parent.threads_post_json));
      } catch (error) {
        console.warn('[ThreadsFastChat] shared reply JSON invalid:', error);
      }
      return;
    }
    // DOM 備援（iPhone 隔離環境讀不到 nativeData）：
    // Threads 分享留言時，DOM 依序先放原貼文連結 (posts[0])，再放實際分享的留言連結 (posts[1])。
    const parentPost = posts[0];
    const replyPost = posts[1];
    const parentCode = extractPostCode(parentPost.url);
    const replyCode = extractPostCode(replyPost.url);
    if (!parentCode || !replyCode || parentCode === replyCode) return;
    posts.unshift(posts.splice(1, 1)[0]);
    posts[0].sharedParent = {
      code: parentCode,
      author: parentPost.author || 'Threads 貼文',
      avatar: '',
      text: parentPost.excerpt || '',
      media: parentPost.imgUrl ? [{ type: 'image', url: parentPost.imgUrl }] : [],
    };
  }

  function getDomFollowingMessageText(msgEl, senderInfo, grid) {
    if (!msgEl || !grid || typeof senderInfo?.sentByViewer !== 'boolean') return '';
    const msgs = Array.from(grid.querySelectorAll('div[data-message-id^="mid."]'));
    const idx = msgs.indexOf(msgEl);
    if (idx < 0 || idx + 1 >= msgs.length) return '';
    const nextEl = msgs[idx + 1];
    if (!nextEl || nextEl.querySelector('a[href*="/post/"]')) return '';
    const rawNext = (nextEl.textContent || '').trim();
    if (/已回覆|回覆了|replied/i.test(rawNext)) return '';
    const nextSender = getDomMessageSender(nextEl);
    if (nextSender.sentByViewer !== senderInfo.sentByViewer) return '';
    const parts = [];
    nextEl.querySelectorAll('span[dir="auto"]').forEach((span) => {
      if (span.closest('[data-tcf-bar="1"], div[role="gridcell"]')) return;
      const t = span.textContent.trim();
      if (t) parts.push(t);
    });
    return parts.join('\n').trim().slice(0, 500);
  }

  function parseThreadTimeLabel(raw, now = new Date()) {
    const s = (raw || '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 42) return NaN;

    const parseClock = (str) => {
      const m = str.match(/(上午|下午|凌晨|中午|晚上|早上)?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (!m) return null;
      let h = Number(m[2]);
      const min = Number(m[3]);
      if (h > 23 || min > 59) return null;
      const zhP = m[1] || '';
      const enP = (m[4] || '').toUpperCase();
      if ((zhP === '下午' || zhP === '晚上' || enP === 'PM') && h < 12) h += 12;
      if ((zhP === '凌晨' || zhP === '上午' || enP === 'AM') && h === 12) h = 0;
      return [h, min];
    };

    const clock = parseClock(s);
    const makeDate = (y, m, d, c = clock) => new Date(y, m, d, c ? c[0] : 12, c ? c[1] : 0, 0, 0).getTime();

    // 2026年11月25日 / 2026/11/25 / 2026-11-25
    const ymd = s.match(/(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/);
    if (ymd) return makeDate(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

    // 11月25日
    const md = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (md) {
      let ts = makeDate(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
      if (ts > now.getTime() + DAY_MS) ts = makeDate(now.getFullYear() - 1, Number(md[1]) - 1, Number(md[2]));
      return ts;
    }

    // 今天 / 昨天 / 前天 / Today / Yesterday
    if (/今天|Today/i.test(s)) return makeDate(now.getFullYear(), now.getMonth(), now.getDate());
    if (/昨天|Yesterday/i.test(s)) return makeDate(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (/前天/.test(s)) return makeDate(now.getFullYear(), now.getMonth(), now.getDate() - 2);

    // 星期X / 週X / Mon..Sun
    const zhDay = s.match(/(?:星期|週|周)([日天一二三四五六])/);
    const enDay = s.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\b/i);
    if (zhDay || enDay) {
      const targetDow = zhDay
        ? { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[zhDay[1]]
        : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(enDay[1].toLowerCase().slice(0, 3));
      if (targetDow >= 0) {
        let diff = (now.getDay() - targetDow + 7) % 7;
        if (diff === 0) diff = 7;
        return makeDate(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      }
    }

    // 純時間（例如 20:15 / 下午 8:15）視為今天
    if (clock && s.length <= 16) {
      return makeDate(now.getFullYear(), now.getMonth(), now.getDate());
    }
    return NaN;
  }

  function getDomMessageTimestamp(msgEl, grid) {
    if (!msgEl || !grid) return undefined;
    // 從 msgEl 所屬的虛擬列往上/往前找最近一個不含 data-message-id 的時間分隔列
    let row = msgEl;
    while (row.parentElement && row.parentElement !== grid && !row.hasAttribute('data-virtualized')) {
      row = row.parentElement;
    }
    for (let prev = row.previousElementSibling, hops = 0; prev && hops < 25; prev = prev.previousElementSibling, hops++) {
      if (prev.querySelector('div[data-message-id^="mid."]')) continue;
      const t = prev.querySelector('time');
      if (t) {
        const parsed = Date.parse(t.getAttribute('datetime') || '') || parseThreadTimeLabel(t.textContent);
        if (Number.isFinite(parsed)) return parsed;
      }
      const text = (prev.textContent || '').trim();
      if (text && text.length <= 42) {
        const parsed = parseThreadTimeLabel(text);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  function extractMessageRecord(msgEl, threadId) {
    const messageId = msgEl.getAttribute('data-message-id');
    if (!messageId) return null;

    // 找轉發貼文卡片 a[href*="/post/"]
    const postLinks = Array.from(msgEl.querySelectorAll('a[href*="/post/"]'));
    const posts = [];
    const seenUrls = new Set();

    for (const a of postLinks) {
      const href = a.href;
      if (!href || seenUrls.has(href)) continue;
      seenUrls.add(href);

      const authorMatch = a.getAttribute('href')?.match(/\/@([^/]+)\/post\//);
      const author = authorMatch ? '@' + authorMatch[1] : '';
      const spans = Array.from(a.querySelectorAll('span[dir="auto"]'))
        .map((s) => s.textContent.trim())
        .filter(Boolean);
      const excerpt = spans.join(' ').slice(0, 260);
      const img = Array.from(a.querySelectorAll('img')).find(
        (el) => el.src && !isAvatarUrl(el.src) && (el.getAttribute('aria-hidden') === 'true' || el.alt === '' || el.naturalWidth > 64)
      );
      const imgUrl = img ? img.src : '';

      posts.push({ url: href, author, excerpt, imgUrl });
    }

    const nativeData = getNativeMessageData(msgEl, messageId);
    prioritizeSharedReply(posts, nativeData);
    const nativeSender = getNativeMessageSender(nativeData);
    const senderInfo = typeof nativeSender.sentByViewer === 'boolean'
      ? nativeSender
      : getDomMessageSender(msgEl);
    const repliedToMessageId = nativeData?.source.get(nativeData.message.replied_to_message?.__ref)?.message_id;
    const ownReaction = posts.length ? getOwnNativeReaction(nativeData) : undefined;
    // 一般文字（排除貼文卡片內的文字）
    const textParts = [];
    msgEl.querySelectorAll('span[dir="auto"]').forEach((span) => {
      if (span.closest('a[href*="/post/"]')) return;
      if (span.closest('[data-tcf-bar="1"]')) return;
      const t = span.textContent.trim();
      if (t) textParts.push(t);
    });
    const text = textParts.join('\n').slice(0, 500);

    // 時間
    const timeEl = msgEl.querySelector('time');
    const timestamp = timeEl?.getAttribute('datetime') || timeEl?.getAttribute('title') || '';

    // 原生表情反應狀態與距底部偏移（供 Anki 刷卡過濾與定位使用）
    const reactions = detectNativeReactions(msgEl);

    // 偵測此訊息是否為「回覆某則訊息/貼文」（Threads 繁中可能是「你已回覆」「已回覆」「回覆了」）
    const rawMsgText = (msgEl.textContent || '').trim();
    const isReplyMessage = Boolean(repliedToMessageId) || /已回覆|回覆了|replied/i.test(rawMsgText);

    const grid = getMessageGrid();
    let bottomOffset = null;
    if (grid) {
      const gridRect = grid.getBoundingClientRect();
      const msgRect = msgEl.getBoundingClientRect();
      const msgTopInScroll = grid.scrollTop + (msgRect.top - gridRect.top);
      bottomOffset = Math.max(0, Math.round(grid.scrollHeight - msgTopInScroll));
    }

    if (!text && !posts.length) return null;

    const followingText = posts.length
      ? (nativeData ? getFollowingMessageText(nativeData) : getDomFollowingMessageText(msgEl, senderInfo, grid))
      : '';
    const domSentAt = nativeData ? undefined : getDomMessageTimestamp(msgEl, grid);
    const baseSentAt = Number(nativeData?.item.as_micg_interface.timestamp_ms) || Date.parse(timestamp) || domSentAt;
    // 同時間分隔線下用 bottomOffset 微調毫秒差，確保由新到舊排序穩定
    const sentAt = Number.isFinite(baseSentAt)
      ? (domSentAt && bottomOffset != null ? Math.max(1, baseSentAt - Math.min(bottomOffset, 59_000)) : baseSentAt)
      : undefined;

    return {
      key: `${threadId}::${messageId}`,
      threadId,
      messageId,
      ...senderInfo,
      text,
      followingText,
      posts,
      hasPost: posts.length > 0,
      reactions,
      hasReaction: reactions.length > 0,
      ...(ownReaction === undefined ? {} : { ownReaction: ownReaction?.reaction || '' }),
      ...(ownReaction?.reaction_timestamp_ms ? { processedAt: Number(ownReaction.reaction_timestamp_ms) } : {}),
      repliedToMessageId,
      isReplyMessage,
      ...(isReplyMessage && senderInfo.sentByViewer && !repliedToMessageId ? { replyRawText: rawMsgText.slice(0, 300) } : {}),
      bottomOffset,
      timestamp,
      sentAt,
      capturedAt: Date.now(),
    };
  }

  async function flushPendingMessageRecords() {
    clearTimeout(flushTimer);
    flushTimer = null;
    await saveMessagesBatch(pendingRecords.splice(0, pendingRecords.length));
  }

  function scheduleFlushCache() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      await flushPendingMessageRecords();
      await refreshCacheCount();
    }, 350);
  }

  function scanVisibleMessages(seen = seenInSession, cutoff = 0, onRecord) {
    const threadId = state.currentThreadId;
    if (!threadId) return;
    const grid = getMessageGrid();
    if (!grid) return;

    const msgs = grid.querySelectorAll('div[data-message-id^="mid."]');
    msgs.forEach((msgEl) => {
      if (!state.isBulkScanning) {
        injectEmojiBar(msgEl);
      }

      const mid = msgEl.getAttribute('data-message-id');
      const cacheKey = `${threadId}::${mid}`;
      if (!seen.has(cacheKey)) {
        const rec = extractMessageRecord(msgEl, threadId);
        if (!rec) return;
        onRecord?.(rec, msgEl);
        seen.add(cacheKey);
        if (!cutoff || messageTime(rec) >= cutoff) {
          seenInSession.add(cacheKey);
          pendingRecords.push(rec);
          scheduleFlushCache();
        }
      }
    });
  }

  async function refreshCacheCount() {
    if (!state.currentThreadId) return;
    const rows = await getThreadMessages(state.currentThreadId);
    state.cachedCount = rows.length;
    const btn = document.getElementById('tcf-btn-drawer');
    if (btn) {
      const postCount = rows.filter((r) => r.hasPost).length;
      btn.textContent = `📚 快取貼文 (${postCount}/${rows.length})`;
    }
    if (state.drawerOpen) {
      renderDrawerList(rows);
    }
  }

  // ==================== 背景預載歷史訊息 (解決往上滑等載入) ====================
  async function preloadOlderMessages(pages = 5, isAuto = false) {
    if (state.isPreloading) {
      if (!isAuto) state.stopPreloadRequested = true;
      return;
    }

    const grid = getMessageGrid();
    if (!grid) {
      setStatus('找不到聊天室捲動區');
      return;
    }

    const startThreadId = state.currentThreadId;
    state.isPreloading = true;
    state.stopPreloadRequested = false;
    updatePreloadButton();

    // 記住使用者目前距離底部的偏移量，鎖定畫面或結束時回到原位
    let anchorBottomOffset = grid.scrollHeight - grid.scrollTop;
    const origScrollBehavior = grid.style.scrollBehavior;
    grid.style.scrollBehavior = 'auto';

    // 如果使用者在預載過程中自己主動滾輪/滑動，立刻更新錨點，絕不跟使用者搶捲軸
    let isInternalJump = false;
    const onUserScrollIntent = () => {
      if (isInternalJump) return;
      anchorBottomOffset = grid.scrollHeight - grid.scrollTop;
    };
    const onScrollUpdateAnchor = () => {
      if (!isInternalJump && state.stayInPlace) {
        anchorBottomOffset = grid.scrollHeight - grid.scrollTop;
      }
    };
    grid.addEventListener('wheel', onUserScrollIntent, { passive: true });
    grid.addEventListener('touchmove', onUserScrollIntent, { passive: true });
    grid.addEventListener('scroll', onScrollUpdateAnchor, { passive: true });

    const jumpTo = (top) => {
      isInternalJump = true;
      grid.scrollTop = Math.max(0, top);
      requestAnimationFrame(() => {
        isInternalJump = false;
      });
    };

    const getOpaqueBackground = (el) => {
      let cur = el;
      while (cur && cur !== document.documentElement) {
        const bg = getComputedStyle(cur).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
        cur = cur.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor || '#101010';
    };

    const getCenterVisibleMessageId = () => {
      const rect = grid.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const msgs = Array.from(grid.querySelectorAll('div[data-message-id^="mid."]'));
      let bestMid = null;
      let bestDist = Infinity;
      for (const m of msgs) {
        const r = m.getBoundingClientRect();
        if (r.bottom < rect.top || r.top > rect.bottom) continue;
        const dist = Math.abs((r.top + r.bottom) / 2 - midY);
        if (dist < bestDist) {
          bestDist = dist;
          bestMid = m.getAttribute('data-message-id');
        }
      }
      return bestMid;
    };

    const createFreezeOverlay = () => {
      const rect = grid.getBoundingClientRect();
      const savedScrollTop = grid.scrollTop;
      const cs = getComputedStyle(grid);
      const clone = grid.cloneNode(true);
      clone.removeAttribute('role');
      clone.setAttribute('data-tcf-freeze-overlay', '1');
      clone.style.position = 'fixed';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.margin = '0';
      clone.style.zIndex = '99990';
      clone.style.pointerEvents = 'none';
      clone.style.backgroundColor = getOpaqueBackground(grid);
      clone.style.overflowX = cs.overflowX;
      clone.style.overflowY = cs.overflowY;
      clone.style.scrollBehavior = 'auto';
      document.body.appendChild(clone);
      clone.scrollTop = savedScrollTop;
      return clone;
    };

    const pulseTopZeroFlicker = async (pulseMs = 55) => {
      // 真正 0 閃動：蓋上目前可視畫面的靜態 DOM 遮罩 → 底下默默跳頂觸發載入 → 跳回原位並等虛擬化重繪完畢才撤遮罩
      const anchorMid = getCenterVisibleMessageId();
      const overlay = createFreezeOverlay();

      try {
        isInternalJump = true;
        grid.scrollTop = 0;
        grid.dispatchEvent(new Event('scroll', { bubbles: true }));

        await sleep(pulseMs);

        grid.scrollTop = Math.max(0, grid.scrollHeight - anchorBottomOffset);

        // 等待底下真 grid 把原本正在看的訊息從虛擬化重繪回來，再撤遮罩
        if (anchorMid) {
          const waitStart = Date.now();
          while (Date.now() - waitStart < 280) {
            if (grid.querySelector(`div[data-message-id="${CSS.escape(anchorMid)}"]`)) {
              break;
            }
            await sleep(16);
          }
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      } finally {
        overlay.remove();
        isInternalJump = false;
      }
    };

    let loadedPages = 0;
    let stagnantRounds = 0;

    try {
      for (let i = 0; i < pages; i++) {
        if (state.stopPreloadRequested || state.currentThreadId !== startThreadId) break;

        const prevHeight = grid.scrollHeight;
        const stayMode = state.stayInPlace;
        setStatus(`${isAuto ? '自動' : ''}預載 ${i + 1}/${pages} 頁${stayMode ? '(0閃動)' : ''}...`);

        if (stayMode) {
          await pulseTopZeroFlicker(55);
        } else {
          jumpTo(0);
          grid.dispatchEvent(new Event('scroll', { bubbles: true }));
        }

        // 等待 scrollHeight 增加（最多等 3.5 秒）
        const startWait = Date.now();
        let grew = false;
        let retriedPulse = false;

        while (Date.now() - startWait < 3500) {
          if (state.stopPreloadRequested || state.currentThreadId !== startThreadId) break;

          if (!stayMode) scanVisibleMessages();

          if (grid.scrollHeight > prevHeight + 40) {
            grew = true;
            if (stayMode) {
              // 頂部塞入舊訊息後立刻補償高度差，畫面穩穩停在原本正在看的位置
              jumpTo(grid.scrollHeight - anchorBottomOffset);
            }
            break;
          }

          // 若 950ms 內還沒開始載入，補發一次稍長的 0 閃動脈衝
          if (stayMode && !retriedPulse && Date.now() - startWait > 950) {
            retriedPulse = true;
            await pulseTopZeroFlicker(95);
          }

          await sleep(90);
        }

        await sleep(180);
        scanVisibleMessages();

        if (stayMode && grew) {
          jumpTo(grid.scrollHeight - anchorBottomOffset);
        }

        if (grew) {
          loadedPages++;
          stagnantRounds = 0;
        } else {
          stagnantRounds++;
          if (stagnantRounds >= 2) {
            setStatus(`已達最頂端 (預載 ${loadedPages} 頁)`);
            break;
          }
        }
      }

      if (state.currentThreadId === startThreadId) {
        jumpTo(grid.scrollHeight - anchorBottomOffset);
        if (!stagnantRounds || stagnantRounds < 2) {
          setStatus(`完成！已預載 ${loadedPages} 頁`);
        }
      }
    } finally {
      grid.style.scrollBehavior = origScrollBehavior;
      grid.removeEventListener('wheel', onUserScrollIntent);
      grid.removeEventListener('touchmove', onUserScrollIntent);
      grid.removeEventListener('scroll', onScrollUpdateAnchor);
      state.isPreloading = false;
      state.stopPreloadRequested = false;
      updatePreloadButton();
      await refreshCacheCount();
    }
  }

  function updatePreloadButton() {
    const btn = document.getElementById('tcf-btn-preload');
    if (!btn) return;
    if (state.isPreloading) {
      btn.textContent = '⏹ 停止預載';
      btn.classList.add('tcf-danger');
    } else {
      btn.textContent = '⚡ 預載歷史 (+5頁)';
      btn.classList.remove('tcf-danger');
    }
  }

  // ==================== 本地快取抽屜 UI ====================
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderDrawerList(rows) {
    const listEl = document.getElementById('tcf-drawer-list');
    const summaryEl = document.getElementById('tcf-drawer-summary');
    if (!listEl) return;

    const q = state.searchQuery.trim().toLowerCase();
    const filtered = rows
      .filter((r) => (!state.onlyPostsFilter || r.hasPost))
      .filter((r) => {
        if (!q) return true;
        const hay = [
          r.sender,
          r.text,
          ...(r.posts || []).map((p) => `${p.author} ${p.excerpt} ${p.url}`),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));

    if (summaryEl) {
      summaryEl.textContent = `顯示 ${filtered.length} / 總快取 ${rows.length} 則`;
    }

    if (!filtered.length) {
      listEl.innerHTML = `<div class="tcf-empty">目前沒有符合的快取資料。<br>點上方「⚡ 預載歷史 (+5頁)」即可在背景把舊貼文全部收進本地秒開！</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((r) => {
        const postsHtml = (r.posts || [])
          .map(
            (p) => `
            <a class="tcf-post-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">
              ${p.imgUrl ? `<img class="tcf-post-thumb" src="${escapeHtml(p.imgUrl)}" loading="lazy" decoding="async" />` : ''}
              <div class="tcf-post-info">
                <div class="tcf-post-author">${escapeHtml(p.author || 'Threads 貼文')}</div>
                <div class="tcf-post-excerpt">${escapeHtml(p.excerpt || p.url)}</div>
              </div>
            </a>`
          )
          .join('');

        return `
          <div class="tcf-card">
            <div class="tcf-card-meta">
              <span>${escapeHtml(r.sender || '訊息')}</span>
              <span>${escapeHtml(r.timestamp ? r.timestamp.slice(0, 16).replace('T', ' ') : '')}</span>
            </div>
            ${r.text ? `<div class="tcf-card-text">${escapeHtml(r.text)}</div>` : ''}
            ${postsHtml}
          </div>`;
      })
      .join('');
  }

  function ensureUI() {
    if (!document.getElementById('tcf-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id = 'tcf-toolbar';
      // 手機螢幕預設折疊成單顆 ⚡ 小鈕，避免擋住聊天室標題列
      if (window.innerWidth <= 768) {
        toolbar.classList.add('tcf-collapsed');
      }
      toolbar.innerHTML = `
        <button id="tcf-btn-collapse" type="button" title="展開/收合工具列">⚡</button>
        <button id="tcf-btn-anki" type="button" title="🃏 Anki 字卡刷貼文模式：快捷鍵 1~6 選表情、R 打字回覆，自動只抓未處理貼文">🃏 刷卡</button>
        <button id="tcf-btn-preload" type="button" title="在背景自動往上載入 5 頁舊訊息">⚡ 預載歷史 (+5頁)</button>
        <button id="tcf-btn-auto" type="button" title="進入聊天室時自動背景預載前 5 頁歷史">🔄 自動</button>
        <button id="tcf-btn-stay" type="button" title="切換預載時畫面是否保持原地不動">🔒 不滑</button>
        <button id="tcf-btn-drawer" type="button" title="0ms 秒開已快取的聊天室貼文">📚 快取貼文 (0)</button>
        <button id="tcf-btn-preview" type="button" title="滑鼠懸停在貼文上 N 秒直接預覽全文與圖影（點擊切換秒數或關閉）">👁️ 預覽 0.5s</button>
        <button id="tcf-btn-emoji" type="button" title="切換常駐一鍵表情列">😀 表情</button>
        <button id="tcf-btn-fast" type="button" title="停用動畫與影片自動播放以加速滑動">🚀 極速</button>
        <span id="tcf-status"></span>
      `;
      document.body.appendChild(toolbar);

      const collapseBtn = document.getElementById('tcf-btn-collapse');
      collapseBtn.addEventListener('click', () => {
        const collapsed = toolbar.classList.toggle('tcf-collapsed');
        collapseBtn.textContent = collapsed ? '⚡' : '✕';
      });

      document.getElementById('tcf-btn-anki').addEventListener('click', () => openAnkiMode());
      document.getElementById('tcf-btn-preload').addEventListener('click', () => preloadOlderMessages(5, false));

      const autoToggle = document.getElementById('tcf-btn-auto');
      autoToggle.classList.toggle('tcf-active', state.autoPreload);
      autoToggle.addEventListener('click', () => {
        state.autoPreload = !state.autoPreload;
        localStorage.setItem(STORAGE_KEYS.autoPreload, String(state.autoPreload));
        autoToggle.classList.toggle('tcf-active', state.autoPreload);
        setStatus(state.autoPreload ? '進聊天室將自動預載' : '已關閉自動預載');
      });

      const stayToggle = document.getElementById('tcf-btn-stay');
      const syncStayBtn = () => {
        stayToggle.textContent = state.stayInPlace ? '🔒 不滑' : '📜 跟著滑';
        stayToggle.classList.toggle('tcf-active', state.stayInPlace);
      };
      syncStayBtn();
      stayToggle.addEventListener('click', () => {
        state.stayInPlace = !state.stayInPlace;
        localStorage.setItem(STORAGE_KEYS.stayInPlace, String(state.stayInPlace));
        syncStayBtn();
        setStatus(state.stayInPlace ? '預載時鎖定畫面不滑上去' : '預載時畫面跟著滑上去');
      });

      document.getElementById('tcf-btn-drawer').addEventListener('click', async () => {
        state.drawerOpen = !state.drawerOpen;
        const drawer = document.getElementById('tcf-drawer');
        if (drawer) drawer.classList.toggle('tcf-open', state.drawerOpen);
        document.getElementById('tcf-btn-drawer').classList.toggle('tcf-active', state.drawerOpen);
        if (state.drawerOpen && state.currentThreadId) {
          const rows = await getThreadMessages(state.currentThreadId);
          renderDrawerList(rows);
        }
      });

      const emojiToggle = document.getElementById('tcf-btn-emoji');
      emojiToggle.classList.toggle('tcf-active', state.showEmojiBar);

      const previewToggle = document.getElementById('tcf-btn-preview');
      const syncPreviewBtn = () => {
        if (state.hoverPreviewMs > 0) {
          previewToggle.textContent = `👁️ 預覽 ${(state.hoverPreviewMs / 1000).toFixed(1)}s`;
          previewToggle.classList.add('tcf-active');
        } else {
          previewToggle.textContent = '👁️ 預覽 關';
          previewToggle.classList.remove('tcf-active');
        }
      };
      syncPreviewBtn();
      previewToggle.addEventListener('click', () => {
        const idx = HOVER_DELAY_PRESETS.indexOf(state.hoverPreviewMs);
        const nextMs = HOVER_DELAY_PRESETS[(idx + 1) % HOVER_DELAY_PRESETS.length];
        state.hoverPreviewMs = nextMs;
        localStorage.setItem(STORAGE_KEYS.hoverPreviewMs, String(nextMs));
        syncPreviewBtn();
        setStatus(nextMs > 0 ? `懸停 ${(nextMs / 1000).toFixed(1)} 秒自動預覽貼文` : '已關閉懸停預覽');
        if (nextMs === 0) hideHoverPreview();
      });
      emojiToggle.addEventListener('click', () => {
        state.showEmojiBar = !state.showEmojiBar;
        localStorage.setItem(STORAGE_KEYS.showEmojiBar, String(state.showEmojiBar));
        emojiToggle.classList.toggle('tcf-active', state.showEmojiBar);
        applyGlobalFlags();
      });

      const fastToggle = document.getElementById('tcf-btn-fast');
      fastToggle.classList.toggle('tcf-active', state.fastMode);
      fastToggle.addEventListener('click', () => {
        state.fastMode = !state.fastMode;
        localStorage.setItem(STORAGE_KEYS.fastMode, String(state.fastMode));
        fastToggle.classList.toggle('tcf-active', state.fastMode);
        applyGlobalFlags();
      });
    }

    if (!document.getElementById('tcf-drawer')) {
      const drawer = document.createElement('aside');
      drawer.id = 'tcf-drawer';
      drawer.innerHTML = `
        <div class="tcf-drawer-header">
          <div class="tcf-drawer-top">
            <span>📚 本聊天室極速快取</span>
            <button id="tcf-drawer-close" class="tcf-small-btn" type="button">✕ 關閉</button>
          </div>
          <div class="tcf-drawer-controls">
            <input id="tcf-search" type="search" placeholder="搜尋作者、貼文內容、關鍵字..." />
            <label><input id="tcf-only-posts" type="checkbox" checked /> 只看貼文</label>
          </div>
        </div>
        <div id="tcf-drawer-list" class="tcf-drawer-list"></div>
        <div class="tcf-drawer-footer">
          <span id="tcf-drawer-summary">載入中...</span>
          <button id="tcf-clear-cache" class="tcf-small-btn" type="button">清空此室快取</button>
        </div>
      `;
      document.body.appendChild(drawer);

      document.getElementById('tcf-drawer-close').addEventListener('click', () => {
        state.drawerOpen = false;
        drawer.classList.remove('tcf-open');
        document.getElementById('tcf-btn-drawer')?.classList.remove('tcf-active');
      });

      document.getElementById('tcf-search').addEventListener('input', async (e) => {
        state.searchQuery = e.target.value;
        if (state.currentThreadId) {
          renderDrawerList(await getThreadMessages(state.currentThreadId));
        }
      });

      document.getElementById('tcf-only-posts').addEventListener('change', async (e) => {
        state.onlyPostsFilter = e.target.checked;
        if (state.currentThreadId) {
          renderDrawerList(await getThreadMessages(state.currentThreadId));
        }
      });

      document.getElementById('tcf-clear-cache').addEventListener('click', async () => {
        if (!state.currentThreadId) return;
        await clearThreadCache(state.currentThreadId);
        seenInSession.clear();
        await refreshCacheCount();
        setStatus('已清空本聊天室快取');
      });
    }

    ensureHoverPreviewUI();
  }

  // ==================== 滑鼠懸停 N 秒極速貼文預覽（免開分頁） ====================
  const postPreviewCache = new Map();
  const postPreviewInflight = new Map();
  let hoverShowTimer = null;
  let hoverPrefetchTimer = null;
  let hoverHideTimer = null;
  let hoverListenersBound = false;
  let activeHoverLink = null;

  function extractPostCode(url) {
    const m = (url || '').match(/\/post\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function isAvatarUrl(url) {
    if (!url) return false;
    // Instagram / Threads CDN 中 t51.2885-19 專用存放大頭貼
    return /t51\.2885-19|\/s150x150\/|\/s100x100\//i.test(url);
  }

  function pickBestImage(obj) {
    const cands = obj?.image_versions2?.candidates;
    if (!Array.isArray(cands) || !cands.length) return '';
    return cands[0]?.url || '';
  }

  function pickBestVideo(obj) {
    const vids = obj?.video_versions;
    if (!Array.isArray(vids) || !vids.length) return '';
    const mp4 = vids.find((v) => typeof v?.url === 'string' && v.url.includes('.mp4'));
    return (mp4 || vids[0])?.url || '';
  }

  function extractMediaFromPostObj(postObj, deepScan = true) {
    const media = [];
    const seen = new Set();
    const pushItem = (type, url, poster = '') => {
      if (!url || isAvatarUrl(url)) return;
      // 用路徑主體去重，避免同一張圖不同 query 參數重複出現
      const dedupeKey = `${type}::${url.split('?')[0]}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      media.push({ type, url, poster });
    };

    const collectFromNode = (item) => {
      if (!item || typeof item !== 'object') return;
      const vid = pickBestVideo(item);
      const img = pickBestImage(item);
      if (vid) {
        pushItem('video', vid, img);
      } else if (img) {
        pushItem('image', img);
      }
      if (typeof item.image_url === 'string' && item.image_url.startsWith('http')) {
        pushItem('image', item.image_url);
      }
    };

    const carousel = Array.isArray(postObj?.carousel_media) && postObj.carousel_media.length
      ? postObj.carousel_media
      : null;

    if (carousel) {
      for (const rawItem of carousel) {
        collectFromNode(rawItem?.media || rawItem);
      }
    } else {
      collectFromNode(postObj);
    }

    // 若主層沒有媒體（例如附帶 IG Reels / IG 貼文 / 連結預覽 / 轉發附件），遞迴深挖 bestPost 內所有子物件
    if (deepScan && media.length === 0 && postObj && typeof postObj === 'object') {
      const SKIP_KEYS = new Set(['user', 'quoted_post', 'reply_to_author', 'facepile_top_likers']);
      const walkMedia = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 12) return;
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) walkMedia(node[i], depth + 1);
          return;
        }
        if (Array.isArray(node.carousel_media) && node.carousel_media.length) {
          for (const rawItem of node.carousel_media) collectFromNode(rawItem?.media || rawItem);
        } else {
          collectFromNode(node);
        }
        for (const k of Object.keys(node)) {
          if (SKIP_KEYS.has(k)) continue;
          walkMedia(node[k], depth + 1);
        }
      };
      walkMedia(postObj, 0);
    }

    return media;
  }

  function mergeMatchedPosts(candidates) {
    if (!candidates.length) return null;
    // 把同一個 code 的多個殘缺/完整物件合併，保留最多圖/影片/文字/互動數的欄位
    const merged = { ...candidates[0] };
    for (const c of candidates) {
      if (Array.isArray(c.carousel_media) && c.carousel_media.length > (merged.carousel_media?.length || 0)) {
        merged.carousel_media = c.carousel_media;
      }
      if (Array.isArray(c.video_versions) && c.video_versions.length > (merged.video_versions?.length || 0)) {
        merged.video_versions = c.video_versions;
      }
      if (c.image_versions2?.candidates?.length && !merged.image_versions2?.candidates?.length) {
        merged.image_versions2 = c.image_versions2;
      }
      if ((c.caption?.text?.length || 0) > (merged.caption?.text?.length || 0)) {
        merged.caption = c.caption;
      }
      if (c.user?.profile_pic_url && !merged.user?.profile_pic_url) {
        merged.user = { ...merged.user, ...c.user };
      }
      if (typeof c.like_count === 'number' && typeof merged.like_count !== 'number') {
        merged.like_count = c.like_count;
      }
      if (c.text_post_app_info && (!merged.text_post_app_info || c.text_post_app_info.share_info?.quoted_post)) {
        merged.text_post_app_info = { ...merged.text_post_app_info, ...c.text_post_app_info };
      }
    }
    return merged;
  }

  function summarizePostObj(p) {
    if (!p) return null;
    return {
      code: p.code || '',
      author: p.user?.username ? '@' + p.user.username : '',
      avatar: p.user?.profile_pic_url || '',
      text: p.caption?.text || '',
      likeCount: typeof p.like_count === 'number' ? p.like_count : null,
      media: extractMediaFromPostObj(p, false),
    };
  }

  function findPostDataInJson(root, targetCode) {
    const matchedPosts = [];
    let parentPosts = [];
    const replyMap = new Map();

    const addReply = (rp) => {
      if (!rp?.code || rp.code === targetCode || replyMap.has(rp.code) || replyMap.size >= 18) return;
      const summary = summarizePostObj(rp);
      if (!summary || (!summary.text && !summary.media?.length)) return;
      replyMap.set(rp.code, summary);
    };

    const walk = (node, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 28) return;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }

      // 優先檢查 thread_items（完整對話串 + reply_threads 底下的所有網友留言）
      if (Array.isArray(node.thread_items) && node.thread_items.length) {
        const hitIdx = node.thread_items.findIndex((it) => it?.post?.code === targetCode);
        if (hitIdx >= 0) {
          matchedPosts.push(node.thread_items[hitIdx].post);
          if (hitIdx > parentPosts.length) {
            parentPosts = node.thread_items
              .slice(0, hitIdx)
              .map((it) => summarizePostObj(it?.post))
              .filter(Boolean);
          }
          for (let j = hitIdx + 1; j < node.thread_items.length; j++) {
            addReply(node.thread_items[j]?.post);
          }
        } else {
          // 這是其他 reply_threads 裡的網友留言串！
          for (let j = 0; j < node.thread_items.length; j++) {
            addReply(node.thread_items[j]?.post);
          }
        }
      }

      if (node.post && typeof node.post === 'object' && node.post.code) {
        const p = node.post;
        if (p.code === targetCode) {
          matchedPosts.push(p);
        } else {
          addReply(p);
        }
      } else if (
        node.code === targetCode &&
        (node.caption || node.user || node.image_versions2 || node.video_versions || node.carousel_media)
      ) {
        matchedPosts.push(node);
      }

      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        walk(node[keys[i]], depth + 1);
      }
    };

    walk(root, 0);

    // 移除已被歸類為原貼文 (parentPosts) 的項目，避免重複
    const parentCodes = new Set(parentPosts.map((pp) => pp.code));
    const replies = Array.from(replyMap.values()).filter((r) => !parentCodes.has(r.code));
    return { matchedPosts, parentPosts, replies };
  }

  function parseThreadsPostHtml(html, postUrl) {
    const code = extractPostCode(postUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const allMatchedPosts = [];
    let foundParents = [];
    const allRepliesMap = new Map();

    if (code) {
      const scripts = doc.querySelectorAll('script[type="application/json"]');
      for (const s of scripts) {
        const raw = s.textContent;
        if (!raw || (!raw.includes(code) && !raw.includes('reply_threads'))) continue;
        try {
          const json = JSON.parse(raw);
          const { matchedPosts, parentPosts, replies } = findPostDataInJson(json, code);
          if (matchedPosts.length) allMatchedPosts.push(...matchedPosts);
          if (parentPosts.length > foundParents.length) foundParents = parentPosts;
          for (const r of replies) {
            if (!allRepliesMap.has(r.code)) allRepliesMap.set(r.code, r);
          }
        } catch {}
      }
    }

    const parentCodeSet = new Set(foundParents.map((p) => p.code));
    const foundReplies = Array.from(allRepliesMap.values())
      .filter((r) => r.code !== code && !parentCodeSet.has(r.code))
      .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
      .slice(0, 15);

    const bestPost = mergeMatchedPosts(allMatchedPosts);

    if (bestPost) {
      const author = bestPost.user?.username ? '@' + bestPost.user.username : '';
      const avatar = bestPost.user?.profile_pic_url || '';
      const text = bestPost.caption?.text || '';
      const media = extractMediaFromPostObj(bestPost);
      const likeCount = bestPost.like_count;
      const replyCount = bestPost.text_post_app_info?.direct_reply_count;

      const quotedRaw = bestPost.text_post_app_info?.share_info?.quoted_post;
      const quoted = quotedRaw
        ? {
            author: quotedRaw.user?.username ? '@' + quotedRaw.user.username : '',
            text: quotedRaw.caption?.text || '',
            media: extractMediaFromPostObj(quotedRaw),
          }
        : null;

      return {
        url: postUrl,
        author,
        avatar,
        text,
        media,
        likeCount,
        replyCount,
        parentPosts: foundParents,
        quoted,
        replies: foundReplies,
        fullLoaded: true,
      };
    }

    // Fallback：解析 OpenGraph meta 標籤（過濾大頭貼 URL 絕不放大當貼文大圖，並支援 og:video）
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const ogVid =
      doc.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
      '';
    const authorMatch = postUrl.match(/\/@([^/]+)\/post\//);
    const ogImgIsAvatar = isAvatarUrl(ogImg);
    const fallbackMedia = [];
    if (ogVid) {
      fallbackMedia.push({ type: 'video', url: ogVid, poster: ogImgIsAvatar ? '' : ogImg });
    } else if (ogImg && !ogImgIsAvatar) {
      fallbackMedia.push({ type: 'image', url: ogImg });
    }
    return {
      url: postUrl,
      author: authorMatch ? '@' + authorMatch[1] : ogTitle,
      avatar: ogImgIsAvatar ? ogImg : '',
      text: ogDesc || ogTitle,
      media: fallbackMedia,
      likeCount: null,
      replyCount: null,
      parentPosts: [],
      quoted: null,
      replies: [],
      fullLoaded: true,
    };
  }

  async function fetchPostPreview(postUrl) {
    if (postPreviewCache.has(postUrl)) return postPreviewCache.get(postUrl);
    if (postPreviewInflight.has(postUrl)) return postPreviewInflight.get(postUrl);

    const task = (async () => {
      try {
        // 移除追蹤參數，帶上標準 HTML 導航標頭讓 Threads 回傳完整 SSR JSON（含影片、多圖與原貼文串）
        const cleanUrl = postUrl.split('?')[0];
        const res = await fetch(cleanUrl, {
          credentials: 'include',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const parsed = parseThreadsPostHtml(html, postUrl);
        postPreviewCache.set(postUrl, parsed);
        return parsed;
      } catch (err) {
        console.warn('[ThreadsFastChat] preview fetch failed:', err);
        return null;
      } finally {
        postPreviewInflight.delete(postUrl);
      }
    })();

    postPreviewInflight.set(postUrl, task);
    return task;
  }

  function extractInstantPreviewFromLink(linkEl) {
    const href = linkEl.href;
    const authorMatch = href.match(/\/@([^/]+)\/post\//);
    const author = authorMatch ? '@' + authorMatch[1] : 'Threads 貼文';
    const spans = Array.from(linkEl.querySelectorAll('span[dir="auto"]'))
      .map((s) => s.textContent.trim())
      .filter(Boolean);
    const text = spans.join('\n');
    const imgs = Array.from(linkEl.querySelectorAll('img'))
      .filter((img) => img.src && !isAvatarUrl(img.src) && (img.getAttribute('aria-hidden') === 'true' || img.width > 48))
      .map((img) => ({ type: 'image', url: img.src }));
    return {
      url: href,
      author,
      avatar: '',
      text: text || '載入貼文全文中...',
      media: imgs,
      likeCount: null,
      replyCount: null,
      parentPosts: [],
      quoted: null,
      replies: [],
      fullLoaded: false,
    };
  }

  function renderHoverPreview(data, isLoading = false) {
    const box = document.getElementById('tcf-hover-preview');
    if (!box) return;

    const renderMediaList = (list) =>
      (list || []).length
        ? `${list.length > 1 ? `<div class="tcf-media-count">🖼️ 共 ${list.length} 個媒體（可左右滑動）</div>` : ''}<div class="tcf-pv-media${list.length > 1 ? ' tcf-multi' : ''}">${list
            .map((m) =>
              m.type === 'video'
                ? `<video src="${escapeHtml(m.url)}" ${m.poster ? `poster="${escapeHtml(m.poster)}"` : ''} controls autoplay muted loop playsinline preload="metadata"></video>`
                : `<img src="${escapeHtml(m.url)}" loading="eager" decoding="async" />`
            )
            .join('')}</div>`
        : '';

    const parentsHtml = (data.parentPosts || []).length
      ? data.parentPosts
          .map(
            (pp, pIdx) => `
            <div class="tcf-pv-parent">
              <div class="tcf-pv-parent-label">🧵 ${pIdx === 0 ? '原貼文' : '上層留言'} · ${escapeHtml(pp.author || '')}</div>
              ${pp.text ? `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(pp.text)}</div>` : ''}
              ${renderMediaList(pp.media)}
            </div>`
          )
          .join('')
      : '';

    const mediaHtml = renderMediaList(data.media);

    const quoteHtml =
      data.quoted && (data.quoted.author || data.quoted.text || data.quoted.media?.length)
        ? `<div class="tcf-pv-quote">
             <div class="tcf-pv-quote-author">引用 ${escapeHtml(data.quoted.author)}</div>
             ${data.quoted.text ? `<div>${escapeHtml(data.quoted.text)}</div>` : ''}
             ${renderMediaList(data.quoted.media)}
           </div>`
        : '';

    const statsParts = [];
    if (typeof data.likeCount === 'number') statsParts.push(`❤️ ${data.likeCount.toLocaleString()}`);
    if (typeof data.replyCount === 'number') statsParts.push(`💬 ${data.replyCount.toLocaleString()}`);
    const statsHtml = statsParts.length ? `<div class="tcf-pv-stats">${statsParts.map((s) => `<span>${s}</span>`).join('')}</div>` : '';

    const repliesHtml = (data.replies || []).length
      ? `<div class="tcf-pv-replies">${data.replies
          .map(
            (r) => `<div class="tcf-pv-reply"><strong>${escapeHtml(r.author)}</strong>：${escapeHtml(r.text)}</div>`
          )
          .join('')}</div>`
      : '';

    box.innerHTML = `
      <div class="tcf-pv-head">
        <div class="tcf-pv-author-wrap">
          ${data.avatar ? `<img class="tcf-pv-avatar" src="${escapeHtml(data.avatar)}" />` : ''}
          <span class="tcf-pv-author">${(data.parentPosts || []).length ? '💬 ' : ''}${escapeHtml(data.author || 'Threads 貼文')}</span>
        </div>
        <div class="tcf-pv-actions">
          <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">↗ 原頁</a>
          <button id="tcf-pv-close" class="tcf-small-btn" type="button">✕</button>
        </div>
      </div>
      <div class="tcf-pv-body">
        ${isLoading ? '<div class="tcf-pv-loading">⚡ 正在背景載入完整全文與多圖/影片...</div>' : ''}
        ${parentsHtml}
        ${data.text ? `<div class="tcf-pv-text">${escapeHtml(data.text)}</div>` : ''}
        ${mediaHtml}
        ${quoteHtml}
        ${statsHtml}
        ${repliesHtml}
      </div>
    `;

    document.getElementById('tcf-pv-close')?.addEventListener('click', hideHoverPreview);
  }

  function positionHoverPreview(anchorRect) {
    const box = document.getElementById('tcf-hover-preview');
    if (!box) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxW = Math.min(440, vw - 24);
    const gap = 14;

    // 優先靠卡片右側展開，空間不夠就靠左側，都不夠就置中
    let left = anchorRect.right + gap;
    if (left + boxW > vw - 12) {
      left = anchorRect.left - boxW - gap;
    }
    if (left < 12) {
      left = Math.max(12, Math.min(vw - boxW - 12, anchorRect.left));
    }

    const estH = Math.min(vh * 0.72, 560);
    let top = Math.max(58, anchorRect.top - 10);
    if (top + estH > vh - 12) {
      top = Math.max(58, vh - estH - 12);
    }

    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  async function showHoverPreviewForLink(linkEl) {
    if (!linkEl || !document.contains(linkEl)) return;
    const url = linkEl.href;
    if (!url) return;

    const box = document.getElementById('tcf-hover-preview');
    if (!box) return;

    const rect = linkEl.getBoundingClientRect();
    positionHoverPreview(rect);

    const cached = postPreviewCache.get(url);
    if (cached) {
      renderHoverPreview(cached, false);
      box.classList.add('tcf-visible');
      return;
    }

    // 先 0ms 顯示現有摘要，不白屏
    renderHoverPreview(extractInstantPreviewFromLink(linkEl), true);
    box.classList.add('tcf-visible');

    const fullData = await fetchPostPreview(url);
    // 確認使用者還停在同一個連結或預覽窗上才更新
    if (fullData && box.classList.contains('tcf-visible') && activeHoverLink === linkEl) {
      renderHoverPreview(fullData, false);
    }
  }

  function hideHoverPreview() {
    clearTimeout(hoverShowTimer);
    clearTimeout(hoverPrefetchTimer);
    clearTimeout(hoverHideTimer);
    activeHoverLink = null;
    const box = document.getElementById('tcf-hover-preview');
    if (box) {
      box.classList.remove('tcf-visible');
      // 暫停預覽窗內正在播的影片避免背景出聲
      box.querySelectorAll('video').forEach((v) => {
        try {
          v.pause();
        } catch {}
      });
    }
  }

  function scheduleHideHoverPreview() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
      hideHoverPreview();
    }, 240);
  }

  function ensureHoverPreviewUI() {
    if (!document.getElementById('tcf-hover-preview')) {
      const box = document.createElement('div');
      box.id = 'tcf-hover-preview';
      box.addEventListener('mouseenter', () => {
        clearTimeout(hoverHideTimer);
      });
      box.addEventListener('mouseleave', () => {
        scheduleHideHoverPreview();
      });
      document.body.appendChild(box);
    }

    if (hoverListenersBound) return;
    hoverListenersBound = true;

    document.addEventListener('mouseover', (e) => {
      if (state.hoverPreviewMs <= 0) return;
      if (e.target.closest?.('#tcf-hover-preview')) {
        clearTimeout(hoverHideTimer);
        return;
      }
      const link = e.target.closest?.('a[href*="/post/"]');
      if (!link) return;
      // 僅針對聊天室內或快取抽屜內的貼文連結觸發
      if (!link.closest('div[data-message-id], #tcf-drawer')) return;
      if (link === activeHoverLink) {
        clearTimeout(hoverHideTimer);
        return;
      }

      clearTimeout(hoverShowTimer);
      clearTimeout(hoverPrefetchTimer);
      clearTimeout(hoverHideTimer);
      activeHoverLink = link;

      // 移進後 120ms 先偷偷在背景抓全文，滿 N 秒時就能 0ms 秒開！
      const prefetchDelay = Math.min(120, Math.max(40, state.hoverPreviewMs - 150));
      hoverPrefetchTimer = setTimeout(() => {
        if (activeHoverLink === link && !postPreviewCache.has(link.href)) {
          fetchPostPreview(link.href);
        }
      }, prefetchDelay);

      hoverShowTimer = setTimeout(() => {
        if (activeHoverLink === link) {
          showHoverPreviewForLink(link);
        }
      }, state.hoverPreviewMs);
    }, true);

    document.addEventListener('mouseout', (e) => {
      const link = e.target.closest?.('a[href*="/post/"]');
      if (!link || link !== activeHoverLink) return;
      const to = e.relatedTarget;
      if (to && (link.contains(to) || to.closest?.('#tcf-hover-preview'))) return;
      clearTimeout(hoverShowTimer);
      clearTimeout(hoverPrefetchTimer);
      scheduleHideHoverPreview();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideHoverPreview();
    });
  }

  // ==================== 🃏 Anki 字卡刷貼文模式 ====================
  const ankiState = {
    open: false,
    onlyUnhandled: true,
    deck: [],
    index: 0,
    isBusy: false,
    isScanning: false,
    handledIds: new Set(),
    keyListenerBound: false,
  };

  function ensureAnkiModalUI() {
    if (document.getElementById('tcf-anki-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'tcf-anki-modal';
    modal.innerHTML = `
      <div class="tcf-anki-shell">
        <div class="tcf-anki-top">
          <div class="tcf-anki-title">
            <span>🃏 Anki 刷貼文模式</span>
            <span id="tcf-anki-counter" class="tcf-anki-badge">0 / 0</span>
            <span class="tcf-anki-badge" style="opacity:0.7;font-weight:500;">v${SCRIPT_VERSION}</span>
          </div>
          <div class="tcf-anki-top-actions">
            <button id="tcf-anki-scan-7d" class="tcf-anki-btn" type="button" title="自動持續往前掃描直到抓滿近 7 天內所有未處理貼文（可隨時停止）">📅 撈近 7 天</button>
            <button id="tcf-anki-scan" class="tcf-anki-btn" type="button" title="在背景往前多撈 5 頁未處理貼文加入牌組">⚡ 往前撈 5 頁</button>
            <button id="tcf-anki-filter" class="tcf-anki-btn tcf-active" type="button" title="切換只看未按表情/未回覆的貼文，或顯示全部貼文">僅未處理</button>
            <button id="tcf-anki-close" class="tcf-anki-btn" type="button">✕ 關閉</button>
          </div>
        </div>
        <div class="tcf-anki-progress-bar">
          <div id="tcf-anki-progress-fill" class="tcf-anki-progress-fill"></div>
        </div>
        <div id="tcf-anki-card" class="tcf-anki-card"></div>
        <div class="tcf-anki-footer">
          <div class="tcf-anki-emoji-row">
            <div class="tcf-anki-emoji-group" id="tcf-anki-emoji-group"></div>
            <div class="tcf-anki-emoji-group">
              <button id="tcf-anki-prev" class="tcf-anki-btn" type="button">← 上一張</button>
              <button id="tcf-anki-skip" class="tcf-anki-btn" type="button">跳過 Space →</button>
            </div>
          </div>
          <div class="tcf-anki-reply-row">
            <input id="tcf-anki-reply-input" class="tcf-anki-reply-input" type="text" placeholder="按 R 快速打字回覆這則貼文，按 Enter 送出並切下一張..." />
            <button id="tcf-anki-send-reply" class="tcf-anki-send-btn" type="button">送出回覆 ↵</button>
          </div>
          <div class="tcf-anki-hint">
            <span>快捷鍵：<strong>1~6</strong> 選表情並下一張 ｜ <strong>R</strong> 打字回覆 ｜ <strong>Space / →</strong> 跳過 ｜ <strong>←</strong> 上一張 ｜ <strong>O</strong> 開原頁</span>
            <span id="tcf-anki-status"></span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 攔截事件冒泡，避免在 Anki 連刷點擊時觸發 Meta 全域 outside-click / dialog 干擾下一次點擊或關閉背景表情選單
    const stopAnkiBubble = (e) => e.stopPropagation();
    for (const evtName of ['pointerdown', 'mousedown', 'touchstart', 'touchend']) {
      modal.addEventListener(evtName, stopAnkiBubble, { passive: true });
    }

    // 點擊深色背景關閉
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === modal) closeAnkiMode();
    });

    // 手機手指左右滑動切卡（左滑跳過下一張，右滑回上一張；避開多圖橫向滑動區）
    const cardArea = document.getElementById('tcf-anki-card');
    let touchStartX = 0;
    let touchStartY = 0;
    let ignoreSwipe = false;
    cardArea.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      ignoreSwipe = !!e.target.closest?.('.tcf-anki-media');
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    cardArea.addEventListener('touchend', (e) => {
      if (ignoreSwipe || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) stepAnki(1);
        else stepAnki(-1);
      }
    }, { passive: true });

    document.getElementById('tcf-anki-close').addEventListener('click', closeAnkiMode);
    document.getElementById('tcf-anki-prev').addEventListener('click', () => stepAnki(-1));
    document.getElementById('tcf-anki-skip').addEventListener('click', () => stepAnki(1));
    document.getElementById('tcf-anki-scan-7d').addEventListener('click', () => scanRecentDaysForAnki(7));
    document.getElementById('tcf-anki-scan').addEventListener('click', () => scanOlderForAnki(5));

    const filterBtn = document.getElementById('tcf-anki-filter');
    filterBtn.addEventListener('click', async () => {
      ankiState.onlyUnhandled = !ankiState.onlyUnhandled;
      filterBtn.textContent = ankiState.onlyUnhandled ? '僅未處理' : '全部貼文';
      filterBtn.classList.toggle('tcf-active', ankiState.onlyUnhandled);
      await rebuildAnkiDeck(true);
    });

    // 建立 1~6 快捷鍵表情按鈕
    const emojiGroup = document.getElementById('tcf-anki-emoji-group');
    DEFAULT_EMOJIS.forEach((emoji, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tcf-anki-key-btn';
      btn.innerHTML = `<span class="tcf-anki-kbd">${idx + 1}</span><span>${emoji}</span>`;
      btn.title = `按鍵 ${idx + 1}：送出 ${emoji} 並跳下一張`;
      btn.addEventListener('click', () => handleAnkiEmoji(emoji));
      emojiGroup.appendChild(btn);
    });

    const replyInput = document.getElementById('tcf-anki-reply-input');
    const sendBtn = document.getElementById('tcf-anki-send-reply');
    sendBtn.addEventListener('click', () => handleAnkiReply());
    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        handleAnkiReply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        replyInput.blur();
      }
    });

    if (!ankiState.keyListenerBound) {
      ankiState.keyListenerBound = true;
      document.addEventListener('keydown', (e) => {
        if (!ankiState.open) return;
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (isTyping) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          closeAnkiMode();
          return;
        }
        if (e.key >= '1' && e.key <= String(DEFAULT_EMOJIS.length)) {
          e.preventDefault();
          const emoji = DEFAULT_EMOJIS[Number(e.key) - 1];
          if (emoji) handleAnkiEmoji(emoji);
          return;
        }
        if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          stepAnki(1);
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          stepAnki(-1);
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          document.getElementById('tcf-anki-reply-input')?.focus();
          return;
        }
        if (e.key === 'o' || e.key === 'O') {
          const card = ankiState.deck[ankiState.index];
          const url = card?.posts?.[0]?.url;
          if (url) {
            e.preventDefault();
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }
      });
    }
  }

  function setAnkiStatus(msg) {
    const el = document.getElementById('tcf-anki-status');
    if (el) el.textContent = msg || '';
  }

  async function rebuildAnkiDeck(resetIndex = false, refreshVisible = true, expireByAge = false) {
    const threadId = state.currentThreadId;
    if (!threadId) return;
    // 先把畫面上目前看得到的訊息狀態（包含最新反應徽章）刷新進 DB
    const grid = getMessageGrid();
    if (grid && refreshVisible) {
      const liveBatch = [];
      grid.querySelectorAll('div[data-message-id^="mid."]').forEach((el) => {
        const rec = extractMessageRecord(el, threadId);
        if (rec) liveBatch.push(rec);
      });
      if (liveBatch.length) await saveMessagesBatch(liveBatch);
    }

    const cachedRows = await getThreadMessages(threadId);
    const repliedIds = new Map();
    const domReplyTexts = [];
    for (const row of cachedRows) {
      if (row.sentByViewer && row.repliedToMessageId) {
        const time = messageTime(row);
        repliedIds.set(row.repliedToMessageId, Math.min(time, repliedIds.get(row.repliedToMessageId) || time));
      } else if (row.sentByViewer && row.isReplyMessage && row.replyRawText) {
        domReplyTexts.push({ raw: row.replyRawText, time: messageTime(row) });
      }
    }
    const matchDomReplyTime = (row) => {
      if (!domReplyTexts.length) return 0;
      const needles = [row.posts?.[0]?.excerpt, row.text]
        .map((s) => (s || '').trim().slice(0, 40))
        .filter((s) => s.length >= 10);
      if (!needles.length) return 0;
      for (const rep of domReplyTexts) {
        if (needles.some((needle) => rep.raw.includes(needle))) return rep.time || Date.now();
      }
      return 0;
    };
    const newlyReplied = cachedRows.filter((row) => {
      if (!row.posts?.length || row.repliedByMe) return false;
      if (repliedIds.has(row.messageId)) return true;
      const domTime = matchDomReplyTime(row);
      if (domTime) {
        repliedIds.set(row.messageId, domTime);
        return true;
      }
      return false;
    });
    for (const row of newlyReplied) {
      row.repliedByMe = true;
      row.processedAt ||= repliedIds.get(row.messageId) || Date.now();
    }
    if (newlyReplied.length) await saveMessagesBatch(newlyReplied);
    const rows = await pruneAnkiCache(cachedRows, expireByAge);
    if (state.currentThreadId !== threadId) return;
    const previousDeck = ankiState.deck;
    const previousCard = previousDeck[ankiState.index];
    const prevCardId = previousCard?.messageId;

    const sourceCards = new Map(rows.filter(isAnkiSourceCard).map((card) => [card.messageId, card]));
    const handledThisRound = new Set();
    if (!resetIndex) {
      // 這輪已處理的卡保留在導航順序裡，重新開啟或切換篩選時再重新選卡。
      for (const previous of previousDeck) {
        if (!ankiState.handledIds.has(previous.messageId)) continue;
        handledThisRound.add(previous.messageId);
        const latest = sourceCards.get(previous.messageId) || previous;
        sourceCards.set(previous.messageId, { ...latest, doneInSession: true });
      }
    }

    const filtered = Array.from(sourceCards.values())
      .filter((r) => {
        if (!ankiState.onlyUnhandled) return true;
        if (handledThisRound.has(r.messageId)) return true;
        if (ankiState.handledIds.has(r.messageId)) return false;
        const reacted = Boolean(r.ownReaction || r.hasReaction || r.reactions?.length);
        return !reacted && !r.repliedByMe;
      })
      .sort((a, b) => messageTime(b) - messageTime(a));

    if (!resetIndex && previousDeck.length && ankiState.index === previousDeck.length) {
      const previousIds = new Set(previousDeck.map((card) => card.messageId));
      const firstNewIndex = filtered.findIndex((card) => !previousIds.has(card.messageId));
      if (firstNewIndex < 0) return;
      ankiState.index = firstNewIndex;
    } else if (resetIndex) {
      ankiState.index = 0;
    } else if (prevCardId) {
      const idx = filtered.findIndex((c) => c.messageId === prevCardId);
      ankiState.index = idx >= 0 ? idx : Math.min(ankiState.index, Math.max(0, filtered.length - 1));
    } else {
      ankiState.index = Math.min(ankiState.index, Math.max(0, filtered.length - 1));
    }

    ankiState.deck = filtered;
    const current = filtered[ankiState.index];
    if (!resetIndex && current && current.messageId === prevCardId) {
      const displayed = (row) => [row.sender, row.text, row.followingText, row.posts, row.reactions, row.doneInSession];
      if (JSON.stringify(displayed(previousCard)) === JSON.stringify(displayed(current))) {
        updateAnkiProgress(ankiState.index + 1, filtered.length);
        return;
      }
    }
    renderCurrentAnkiCard(!resetIndex && Boolean(current && current.messageId === prevCardId));
  }

  function getSharedAnkiParentUrl(card) {
    const parent = card?.posts?.[0]?.sharedParent;
    return parent && card.posts.find((post) => extractPostCode(post.url) === parent.code)?.url;
  }

  function prefetchNextAnkiCards() {
    for (let offset = 0; offset <= 3; offset++) {
      const c = ankiState.deck[ankiState.index + offset];
      const url = c?.posts?.[0]?.url;
      if (url && !postPreviewCache.has(url)) {
        fetchPostPreview(url);
      }
      if (offset === 1) {
        const parentUrl = getSharedAnkiParentUrl(c);
        if (parentUrl) fetchPostPreview(parentUrl);
      }
    }
  }

  function updateAnkiProgress(position, total) {
    const counterEl = document.getElementById('tcf-anki-counter');
    const fillEl = document.getElementById('tcf-anki-progress-fill');
    if (counterEl) counterEl.textContent = `${position} / ${total}`;
    if (fillEl) fillEl.style.width = `${total ? Math.round(position / total * 100) : 100}%`;
  }

  async function renderCurrentAnkiCard(preserveScroll = false) {
    const cardEl = document.getElementById('tcf-anki-card');
    if (!cardEl) return;

    const total = ankiState.deck.length;
    const finished = total > 0 && ankiState.index === total;
    document.getElementById('tcf-anki-modal')?.classList.toggle('tcf-anki-finished', finished);
    if (finished) {
      updateAnkiProgress(total, total);
      cardEl.innerHTML = '<div class="tcf-empty">🎉 已全部刷完！</div>';
      return;
    }

    if (!total) {
      updateAnkiProgress(0, 0);
      cardEl.innerHTML = `
        <div class="tcf-empty">
          這台裝置目前還沒有待刷字卡。<br><br>
          點上方 <strong>「⚡ 往前撈 5 頁」</strong> 可以繼續往更舊的聊天紀錄裡抓出還沒按過表情的貼文，<br>
           或切換 <strong>「全部貼文」</strong> 瀏覽收到的貼文。
        </div>`;
      return;
    }

    const idx = Math.max(0, Math.min(ankiState.index, total - 1));
    ankiState.index = idx;
    const card = ankiState.deck[idx];
    const primaryPost = card.posts[0];
    const sharedParent = primaryPost.sharedParent;
    const parentUrl = getSharedAnkiParentUrl(card);
    let parentPreview = parentUrl ? postPreviewCache.get(parentUrl) : null;
    let parentLoading = Boolean(parentUrl && !parentPreview);
    let rendered = false;

    updateAnkiProgress(idx + 1, total);

    const renderBody = (postData, isLoading, changedPart) => {
      // 避免非同步回來時已經翻到別張卡
      if (ankiState.deck[ankiState.index]?.messageId !== card.messageId) return;

      const renderMediaBlock = (list, cls = 'tcf-anki-media') =>
        (list || []).length
          ? `${list.length > 1 ? `<div class="tcf-media-count">🖼️ 共 ${list.length} 個媒體（可左右滑動）</div>` : ''}<div class="${cls}${list.length > 1 ? ' tcf-multi' : ''}">${list
              .map((m) =>
                m.type === 'video'
                  ? `<video src="${escapeHtml(m.url)}" ${m.poster ? `poster="${escapeHtml(m.poster)}"` : ''} controls autoplay muted loop playsinline preload="metadata"></video>`
                  : `<img src="${escapeHtml(m.url)}" loading="eager" decoding="async" />`
              )
              .join('')}</div>`
          : '';

      const renderPostHeader = (author, avatar, url, linkLabel) => `
        <div class="tcf-anki-post-header">
          <div class="tcf-anki-author">
            ${avatar ? `<img class="tcf-pv-avatar" src="${escapeHtml(avatar)}" />` : ''}
            <span>${escapeHtml(author)}</span>
          </div>
          ${url ? `<a class="tcf-anki-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${linkLabel}</a>` : ''}
        </div>`;
      const parentAuthor = parentPreview?.author || sharedParent?.author || 'Threads 貼文';
      const parentAvatar = parentPreview?.avatar || sharedParent?.avatar || '';
      const parentText = parentPreview?.text || sharedParent?.text || '';
      const parentHtml = sharedParent ? `
        <h3>原貼文</h3>
        ${renderPostHeader(parentAuthor, parentAvatar, parentUrl, '↗ 開啟原貼文')}
        ${parentText ? `<div class="tcf-anki-text">${escapeHtml(parentText)}</div>` : ''}
        ${renderMediaBlock(parentPreview ? parentPreview.media : sharedParent.media)}
        ${parentUrl && !parentPreview && !parentLoading ? '<div class="tcf-pv-loading">未取得原貼文的完整媒體</div>' : ''}
      ` : '';
      if (changedPart === 'parent') {
        const parentSection = cardEl.querySelector('[data-anki-part="parent"]');
        if (parentSection) parentSection.innerHTML = parentHtml;
        return;
      }

      const parentPosts = sharedParent ? [] : postData.parentPosts || [];
      const parentsHtml = parentPosts.length
        ? parentPosts
            .map(
              (pp, pIdx) => `
              <div class="tcf-pv-parent">
                <div class="tcf-pv-parent-label">🧵 ${pIdx === 0 ? '原貼文' : '上層留言'} · ${escapeHtml(pp.author || '')}</div>
                ${pp.text ? `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(pp.text)}</div>` : ''}
                ${renderMediaBlock(pp.media, 'tcf-pv-media')}
              </div>`
            )
            .join('')
        : '';

      const mediaHtml = renderMediaBlock(postData.media, 'tcf-anki-media');

      const quoteHtml =
        postData.quoted && (postData.quoted.author || postData.quoted.text || postData.quoted.media?.length)
          ? `<div class="tcf-pv-quote">
               <div class="tcf-pv-quote-author">引用 ${escapeHtml(postData.quoted.author)}</div>
               ${postData.quoted.text ? `<div>${escapeHtml(postData.quoted.text)}</div>` : ''}
               ${renderMediaBlock(postData.quoted.media, 'tcf-pv-media')}
             </div>`
          : '';

      const statsParts = [];
      if (typeof postData.likeCount === 'number') statsParts.push(`❤️ ${postData.likeCount.toLocaleString()}`);
      if (typeof postData.replyCount === 'number') statsParts.push(`💬 ${postData.replyCount.toLocaleString()}`);
      const statsHtml = statsParts.length ? `<div class="tcf-pv-stats">${statsParts.map((s) => `<span>${s}</span>`).join('')}</div>` : '';

      const allReplies = postData.replies || [];
      const renderReplyItem = (r) => `
        <div class="tcf-pv-reply">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;">
            <strong style="color:#93c5fd;">${escapeHtml(r.author || '網友')}</strong>
            ${typeof r.likeCount === 'number' && r.likeCount > 0 ? `<span style="color:#a1a1aa;font-size:11px;">❤️ ${r.likeCount.toLocaleString()}</span>` : ''}
          </div>
          ${r.text ? `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(r.text)}</div>` : ''}
          ${renderMediaBlock(r.media, 'tcf-pv-media')}
        </div>`;

      const repliesHtml = allReplies.length
        ? `<div class="tcf-pv-replies">
             <div style="font-size:12px;font-weight:700;color:#d4d4d8;margin-bottom:2px;">💬 熱門留言 (${allReplies.length} 則)</div>
             ${allReplies.slice(0, 5).map(renderReplyItem).join('')}
             ${
               allReplies.length > 5
                 ? `<div id="tcf-more-replies" style="display:none;flex-direction:column;gap:6px;">${allReplies.slice(5).map(renderReplyItem).join('')}</div>
                    <button id="tcf-expand-replies" class="tcf-anki-btn" type="button" style="align-self:flex-start;margin-top:4px;">展開其餘 ${allReplies.length - 5} 則留言</button>`
                 : ''
             }
           </div>`
        : '';

      const reactionBadges = card.doneInSession
        ? `<span class="tcf-anki-done-tag">✅ 本輪已處理 ${escapeHtml((card.reactions || []).join(' '))}</span>`
        : card.reactions?.length
          ? `已有表情：${escapeHtml(card.reactions.join(' '))}`
          : '尚未按表情';

      const author = postData.author || primaryPost.author || 'Threads 貼文';
      const postHtml = `
        ${renderPostHeader(!sharedParent && parentPosts.length ? `💬 ${author}` : author, postData.avatar,
          primaryPost.url, sharedParent ? '↗ 開啟留言 (O)' : '↗ 開啟原頁 (O)')}
        ${isLoading ? '<div class="tcf-pv-loading">⚡ 正在載入完整貼文與高清圖影...</div>' : ''}
        <div class="tcf-anki-text">${escapeHtml(postData.text || primaryPost.excerpt || '(無文字內容)')}</div>
        ${mediaHtml}
        ${quoteHtml}
        ${statsHtml}
      `;
      const replyHtml = `<h3>分享的留言</h3>${postHtml}`;
      const sharedPostHtml = sharedParent ? `
        <section class="tcf-anki-post-section" data-anki-part="parent">${parentHtml}</section>
        <section class="tcf-anki-post-section" data-anki-part="reply">${replyHtml}</section>` : '';

      if (changedPart === 'reply' && sharedParent) {
        const replySection = cardEl.querySelector('[data-anki-part="reply"]');
        const repliesSection = cardEl.querySelector('[data-anki-part="replies"]');
        if (replySection) replySection.innerHTML = replyHtml;
        if (repliesSection) repliesSection.innerHTML = repliesHtml;
      } else {
        const scrollTop = preserveScroll || rendered ? cardEl.scrollTop : 0;
        cardEl.innerHTML = `
        <div class="tcf-anki-chat-meta">
          <span>轉發者：<strong>${escapeHtml(card.sender)}</strong> ${card.text ? `「${escapeHtml(card.text.slice(0, 80))}」` : ''}</span>
          <span>${reactionBadges}</span>
          <button id="tcf-anki-jump" class="tcf-anki-btn" type="button">跳到聊天室訊息</button>
        </div>
        ${card.followingText ? `
          <section class="tcf-anki-post-section">
            <h3>接續訊息</h3>
            <div class="tcf-anki-text">${escapeHtml(card.followingText)}</div>
          </section>` : ''}
        ${sharedParent ? sharedPostHtml : parentsHtml + postHtml}
        ${sharedParent ? `<div data-anki-part="replies" style="display:contents">${repliesHtml}</div>` : repliesHtml}
        `;
        cardEl.scrollTop = scrollTop;
        rendered = true;
        document.getElementById('tcf-anki-jump')?.addEventListener('click', () => jumpToAnkiMessage(card));
      }
      const expandBtn = document.getElementById('tcf-expand-replies');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          const moreEl = document.getElementById('tcf-more-replies');
          if (moreEl) moreEl.style.display = 'flex';
          expandBtn.remove();
        });
      }
    };

    const cached = postPreviewCache.get(primaryPost.url);
    let postData = cached || {
      author: primaryPost.author,
      text: primaryPost.excerpt,
      media: primaryPost.imgUrl ? [{ type: 'image', url: primaryPost.imgUrl }] : [],
    };
    let postLoading = !cached;
    renderBody(postData, postLoading);
    const tasks = [];
    if (postLoading) {
      tasks.push(fetchPostPreview(primaryPost.url).then((full) => {
        if (!full) return;
        postData = full;
        postLoading = false;
        renderBody(postData, postLoading, 'reply');
      }));
    }
    if (parentLoading) {
      tasks.push(fetchPostPreview(parentUrl).then((full) => {
        parentPreview = full;
        parentLoading = false;
        renderBody(postData, postLoading, 'parent');
      }));
    }
    prefetchNextAnkiCards();
    await Promise.all(tasks);
  }

  function stepAnki(delta) {
    if (!ankiState.deck.length) return;
    ankiState.index = Math.max(0, Math.min(ankiState.deck.length, ankiState.index + delta));
    if (!isDrainingAnkiQueue) setAnkiStatus('');
    renderCurrentAnkiCard();
  }

  function findMessageSlot(grid, messageId) {
    return Array.from(grid.querySelectorAll('[data-virtualized]')).find((element) => {
      for (let fiber = getReactFiber(element); fiber && fiber.stateNode !== grid; fiber = fiber.return) {
        if (fiber.key === messageId) return true;
      }
      return false;
    });
  }

  async function ensureMessageElementVisible(card) {
    const grid = getMessageGrid();
    if (!grid) return null;
    const selector = `div[data-message-id="${CSS.escape(card.messageId)}"]`;
    const existing = grid.querySelector(selector);
    if (existing) return existing;

    // 未掛載的訊息仍有以 messageId 為 React key 的虛擬列。
    const slot = findMessageSlot(grid, card.messageId);
    if (!slot) return null;
    grid.scrollTop += slot.getBoundingClientRect().top - grid.getBoundingClientRect().top - grid.clientHeight / 3;
    grid.dispatchEvent(new Event('scroll', { bubbles: true }));
    return waitForElement(() => grid.querySelector(selector), 500, 30);
  }

  async function findMessageElementByScroll(grid, card, active) {
    const selector = `div[data-message-id="${CSS.escape(card.messageId)}"]`;
    const existing = grid.querySelector(selector);
    if (existing) return existing;

    if (typeof card.bottomOffset === 'number' && Number.isFinite(card.bottomOffset)) {
      const approxTop = Math.max(0, grid.scrollHeight - card.bottomOffset - grid.clientHeight / 3);
      grid.scrollTop = approxTop;
      grid.dispatchEvent(new Event('scroll', { bubbles: true }));
      const hit = await waitForElement(() => !active() || grid.querySelector(selector), 350, 35);
      if (!active()) return null;
      if (hit instanceof Element) return hit;
    }

    const step = Math.max(1, Math.floor(grid.clientHeight * 0.85));
    let from = Math.max(0, grid.scrollHeight - grid.clientHeight);
    const maxPages = 25;
    for (let page = 0; page <= maxPages && active(); page++) {
      for (let pos = from; active(); pos = Math.max(0, pos - step)) {
        grid.scrollTop = pos;
        grid.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(75);
        if (!active()) return null;
        const found = grid.querySelector(selector);
        if (found) return found;
        if (pos === 0) break;
      }
      if (!active() || page === maxPages) break;
      setAnkiStatus(`往前找原始訊息（第 ${page + 1} 頁）…`);
      const height = grid.scrollHeight;
      grid.scrollTop = 0;
      grid.dispatchEvent(new Event('scroll', { bubbles: true }));
      let grew = await waitForElement(() => !active() || grid.scrollHeight > height + 40, 3500, 70);
      if (active() && !grew) {
        grid.scrollTop = 12;
        await sleep(60);
        grid.scrollTop = 0;
        grid.dispatchEvent(new Event('scroll', { bubbles: true }));
        grew = await waitForElement(() => !active() || grid.scrollHeight > height + 40, 2000, 70);
      }
      if (!active() || !grew) break;
      from = Math.min(grid.scrollHeight - grid.clientHeight, grid.scrollHeight - height);
    }
    return null;
  }

  async function findAnkiMessageInHistory(card, active) {
    const grid = getMessageGrid();
    if (!grid || !active()) return null;
    const selector = `div[data-message-id="${CSS.escape(card.messageId)}"]`;
    const existing = grid.querySelector(selector);
    if (existing) return existing;

    let list = getNativeHistoryList(grid);
    if (!list) {
      return findMessageElementByScroll(grid, card, active);
    }
    for (let page = 1; list?.hasPrevious && page <= 40 && active(); page++) {
      if (list.items.some((item) => item.as_micg_interface?.message_id === card.messageId)) break;
      const oldest = Number(list.items[0]?.as_micg_interface?.timestamp_ms);
      const targetTime = card.sentAt || Date.parse(card.timestamp);
      if (targetTime && oldest < targetTime) break;
      setAnkiStatus(`往前找原始訊息（第 ${page} 頁）…`);
      list = await loadOlderAnkiPage(grid, active);
    }
    return active() ? ensureMessageElementVisible(card) : null;
  }

  async function jumpToAnkiMessage(card) {
    if (isLocatingAnkiMessage || isDrainingAnkiQueue || ankiSendQueue.length) {
      setAnkiStatus('請等目前的定位或背景送出完成');
      return;
    }
    const threadId = state.currentThreadId;
    const button = document.getElementById('tcf-anki-scan-7d');
    const active = () => ankiState.open && state.currentThreadId === threadId && !stop7dScan;
    isLocatingAnkiMessage = true;
    try {
      stop7dScan = ankiState.isScanning;
      while (ankiState.isScanning && ankiState.open) await sleep(50);
      stop7dScan = false;
      if (!active()) return;
      if (button) button.textContent = '⏹ 停止定位';
      const message = await findAnkiMessageInHistory(card, active);
      if (!active()) {
        if (ankiState.open && state.currentThreadId === threadId) setAnkiStatus('已停止定位');
        return;
      }
      if (!message) {
        setAnkiStatus('找不到這則訊息，已載入的聊天紀錄沒有相同訊息 ID');
        return;
      }
      closeAnkiMode();
      message.scrollIntoView({ block: 'center', behavior: 'instant' });
    } finally {
      isLocatingAnkiMessage = false;
      stop7dScan = false;
      if (button) button.textContent = '📅 撈近 7 天';
      if (ankiSendQueue.length) drainAnkiSendQueue();
    }
  }

  async function triggerNativeReply(msgEl, replyText) {
    const messageId = msgEl.getAttribute('data-message-id');
    const grid = getMessageGrid();
    const data = getNativeMessageData(msgEl, messageId);
    const list = grid && getNativeHistoryList(grid);
    const hasNative = Boolean(data && list);
    // 1. 掛載原生 hover gridcell 並點擊第 2 顆按鈕（無 aria-haspopup 的回覆鈕）
    const findReplyBtn = () => {
      const gc = msgEl.querySelector('div[role="gridcell"]');
      if (!gc) return null;
      const btns = Array.from(gc.querySelectorAll('div[role="button"]'));
      return btns.find((b) => !b.hasAttribute('aria-haspopup')) || btns[1] || null;
    };

    let replyBtn = findReplyBtn();
    if (!replyBtn) {
      hoverMessageRow(msgEl);
      replyBtn = await waitForElement(findReplyBtn, 500, 20);
    }
    if (!replyBtn) throw new Error('找不到原生回覆按鈕');

    simulateRealClick(replyBtn);
    await sleep(160);

    // 2. 找到聊天室底部 Lexical 輸入框並輸入文字
    const textbox = await waitForElement(
      () =>
        Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]')).find(
          (el) => !el.closest('#tcf-anki-modal')
        ) || null,
      600,
      25
    );
    if (!textbox) throw new Error('找不到聊天室輸入框');

    textbox.focus();
    await sleep(40);

    // 使用 execCommand('insertText') 相容 Meta Lexical Editor
    const inserted = document.execCommand('insertText', false, replyText);
    if (!inserted) {
      textbox.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: replyText,
          bubbles: true,
          cancelable: true,
        })
      );
    }
    await sleep(120);

    // 3. 送出（派發 Enter 鍵）
    const previousIds = hasNative
      ? new Set(list.items.map((item) => item.as_micg_interface?.message_id))
      : new Set(Array.from(grid?.querySelectorAll('div[data-message-id^="mid."]') || [], (el) => el.getAttribute('data-message-id')));
    const enterOpts = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    textbox.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
    textbox.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
    textbox.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
    const confirmed = hasNative
      ? await waitForElement(() => getNativeHistoryList(grid)?.items.some((item) => {
          const msg = item.as_micg_interface;
          if (!msg?.message_id || previousIds.has(msg.message_id)) return false;
          const native = data.source.get(data.source.get(item.__id)?.as_micg_interface?.__ref);
          const user = data.source.get(native?.sender?.__ref);
          if (user?.igid !== data.viewerIgId) return false;
          const target = data.source.get(native?.replied_to_message?.__ref)?.message_id;
          const content = data.source.get(native?.content?.__ref)?.text_body;
          return target === messageId && content?.trim() === replyText;
        }), 4000, 80)
      : await waitForElement(() => {
          const msgs = Array.from(grid?.querySelectorAll('div[data-message-id^="mid."]') || []);
          const matchedNew = msgs.some((el) => {
            const mid = el.getAttribute('data-message-id');
            return mid && !previousIds.has(mid) && (el.textContent || '').includes(replyText);
          });
          return matchedNew || !(textbox.textContent || '').trim();
        }, 4000, 80);
    if (!confirmed) throw new Error('Threads 尚未顯示這則引用回覆');
  }

  // 背景串行送出佇列：Anki 按表情或回覆時 0ms 立刻翻卡，背景依序確實送出
  const ankiSendQueue = [];
  const pendingAnkiReactions = new Set();
  let isDrainingAnkiQueue = false;

  async function drainAnkiSendQueue() {
    if (isDrainingAnkiQueue || isLocatingAnkiMessage) return;
    isDrainingAnkiQueue = true;
    let failCount = 0;
    let duplicateCount = 0;
    let lastFailReason = '';
    try {
      while (ankiSendQueue.length) {
        const job = ankiSendQueue.shift();
        setAnkiStatus(`⚡ 背景送出 ${job.label}${ankiSendQueue.length ? ` (待送 ${ankiSendQueue.length})` : ''}...`);
        try {
          const msgEl = await findAnkiMessageInHistory(job.card, () => state.currentThreadId === job.card.threadId);
          if (!msgEl) throw new Error('找不到訊息位置');
          if (job.type === 'emoji') {
            const nativeApplied = hasOwnNativeReaction(msgEl, job.card.messageId, job.emoji);
            const useDomFallback = nativeApplied === undefined;
            const alreadyApplied = useDomFallback ? hasDomReaction(msgEl, job.emoji) : nativeApplied;
            if (alreadyApplied) duplicateCount++;
            if (!alreadyApplied) {
              const result = await triggerQuickReaction(msgEl, job.emoji, false);
              if (!result?.ok) throw new Error(result?.reason || '未成功觸發');
              const confirmed = await waitForElement(
                () => (useDomFallback
                  ? hasDomReaction(msgEl, job.emoji)
                  : hasOwnNativeReaction(msgEl, job.card.messageId, job.emoji)),
                2500,
                60
              );
              if (!confirmed) throw new Error('Threads 尚未顯示這個表情');
            }
            job.card.ownReaction = job.emoji;
            job.card.hasReaction = true;
            if (!job.card.reactions?.some((reaction) => normalizeEmoji(reaction) === normalizeEmoji(job.emoji))) {
              job.card.reactions = [...(job.card.reactions || []), job.emoji];
            }
          } else if (job.type === 'reply') {
            await triggerNativeReply(msgEl, job.text);
            job.card.repliedByMe = true;
          }
          job.card.processedAt ||= Date.now();
          const { key, threadId, messageId, processedAt } = job.card;
          const processed = job.type === 'emoji'
            ? { ownReaction: job.emoji, hasReaction: true, reactions: job.card.reactions }
            : { repliedByMe: true };
          await saveMessagesBatch([{ key, threadId, messageId, processedAt, ...processed }]);
          ankiState.handledIds.add(job.card.messageId);
        } catch (err) {
          failCount++;
          lastFailReason = err?.message || String(err);
          job.card.doneInSession = false;
          console.error('[ThreadsFastChat] queue job failed:', err);
        } finally {
          if (job.type === 'emoji') pendingAnkiReactions.delete(job.reactionKey);
        }
      }
      if (ankiState.open) await rebuildAnkiDeck(false, false);
      if (failCount > 0) {
        setAnkiStatus(`⚠️ 有 ${failCount} 筆未確認 (${lastFailReason})`);
      } else if (duplicateCount) {
        setAnkiStatus(`✅ 已略過 ${duplicateCount} 筆重複表情`);
      } else {
        setAnkiStatus('✅ 全部已送出');
      }
    } finally {
      isDrainingAnkiQueue = false;
    }
  }

  function handleAnkiEmoji(emoji) {
    if (!ankiState.deck.length) return;
    const card = ankiState.deck[ankiState.index];
    if (!card) return;
    const target = normalizeEmoji(emoji);
    const reactionKey = `${card.messageId}::${target}`;
    if (pendingAnkiReactions.has(reactionKey)) {
      setAnkiStatus(`${emoji} 已在送出佇列中`);
      return;
    }
    pendingAnkiReactions.add(reactionKey);

    // 樂觀標記並 0ms 瞬間翻下一張卡片，不讓使用者等待！
    card.doneInSession = true;

    ankiSendQueue.push({ type: 'emoji', card, emoji, label: emoji, reactionKey });
    stepAnki(1);
    setTimeout(() => drainAnkiSendQueue(), 40);
  }

  function handleAnkiReply() {
    if (!ankiState.deck.length) return;
    const input = document.getElementById('tcf-anki-reply-input');
    const text = (input?.value || '').trim();
    if (!text) return;

    const card = ankiState.deck[ankiState.index];
    if (!card) return;

    input.value = '';
    input.blur();
    card.doneInSession = true;

    ankiSendQueue.push({ type: 'reply', card, text, label: '回覆' });
    stepAnki(1);
    setTimeout(() => drainAnkiSendQueue(), 40);
  }

  function getNativeHistoryList(grid) {
    for (let fiber = getReactFiber(grid); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (Array.isArray(props?.items) && typeof props.loadPrevious === 'function') return props;
    }
  }

  async function loadOlderAnkiPage(grid, active) {
    const previous = getNativeHistoryList(grid);
    if (!previous?.hasPrevious || !active()) return null;
    const first = previous.items[0]?.as_micg_interface?.message_id;
    if (!previous.isLoadingPrevious) previous.loadPrevious();
    const next = await waitForElement(() => {
      if (!active()) return { cancelled: true };
      const list = getNativeHistoryList(grid);
      if (list && (list.items[0]?.as_micg_interface?.message_id !== first || !list.hasPrevious)) return list;
      return null;
    }, 5000, 50);
    return next?.cancelled ? null : next;
  }

  let stop7dScan = false;
  let isLocatingAnkiMessage = false;
  let queuedAnkiPages = 0;

  async function scanIPhoneAnkiHistory(grid, { cutoff, pages, active, seen }) {
    let oldest = Infinity;
    let posts = 0;
    let senderKnown = 0;
    let nativeSender = 0;
    let domSender = 0;
    let from = Math.max(0, grid.scrollHeight - grid.clientHeight);
    const step = Math.max(1, Math.floor(grid.clientHeight * 0.85));
    const scan = () => scanVisibleMessages(seen, cutoff, (record) => {
      const time = record.sentAt || Date.parse(record.timestamp);
      if (time) oldest = Math.min(oldest, time);
      if (!record.hasPost || (cutoff && time && time < cutoff)) return;
      posts++;
      if (typeof record.sentByViewer === 'boolean') {
        senderKnown++;
        if (record.senderSource === 'native') nativeSender++;
        else if (record.senderSource === 'dom') domSender++;
      }
    });
    let failure = '';
    let complete = false;
    for (let page = 0; active(); page++) {
      let batch = 0;
      for (let pos = from; active(); pos = Math.max(0, pos - step)) {
        while ((state.isPreloading || isDrainingAnkiQueue) && active()) await sleep(50);
        if (!active()) break;
        grid.scrollTop = pos;
        await sleep(90);
        if (!active()) break;
        scan();
        if (++batch % 4 === 0 || pos === 0 || oldest <= cutoff) {
          await flushPendingMessageRecords();
          if (active()) await rebuildAnkiDeck(false, false);
        }
        if (pos === 0 || oldest <= cutoff) break;
      }
      if (!active()) break;
      if (oldest <= cutoff || (!cutoff && page >= pages)) {
        complete = true;
        break;
      }
      if (page >= pages) break;
      setAnkiStatus(`iPhone 往前載入（第 ${page + 1} 頁）…`);
      const height = grid.scrollHeight;
      grid.scrollTop = 0;
      grid.dispatchEvent(new Event('scroll', { bubbles: true }));
      const grew = await waitForElement(() => !active() || grid.scrollHeight > height + 40, 3500, 70);
      if (!active()) break;
      if (!grew) {
        failure = 'Threads 未再載入更舊的訊息';
        break;
      }
      from = Math.min(grid.scrollHeight - grid.clientHeight, grid.scrollHeight - height);
    }
    const summary = posts
      ? `掃到 ${posts} 則轉發，${senderKnown} 則確認發送者（原生 ${nativeSender} / 畫面 ${domSender}）`
      : '目前尚未掃到轉發貼文';
    const status = !active() ? '已停止撈取' : failure || (complete ? '撈取完成' : '尚未確認涵蓋近七天');
    return `${status}。${summary}`;
  }

  async function scanAnkiHistory({ days, pages = 40 }) {
    if (ankiState.isScanning || isLocatingAnkiMessage) {
      stop7dScan = true;
      return;
    }
    const grid = getMessageGrid();
    if (!ankiState.open) return;
    if (!grid) {
      setAnkiStatus('撈取停止：找不到 Threads 的聊天室列表');
      return;
    }
    const threadId = state.currentThreadId;
    const active = () => ankiState.open && state.currentThreadId === threadId && !stop7dScan;
    const button = document.getElementById('tcf-anki-scan-7d');
    const seen = new Set();
    const cutoff = days ? Date.now() - days * DAY_MS : 0;
    const originalTop = grid.scrollTop;
    const originalHeight = grid.scrollHeight;

    ankiState.isScanning = true;
    state.isBulkScanning = true;
    stop7dScan = false;
    if (button) button.textContent = '⏹ 停止撈取';

    let page = 0;
    let complete = false;
    let failure = '';
    let iPhoneStatus = '';
    let upperBoundary;
    const scrollHistoryOnIPhone = /iPhone|iPod/.test(navigator.userAgent);
    try {
      if (scrollHistoryOnIPhone) {
        iPhoneStatus = await scanIPhoneAnkiHistory(grid, { cutoff, pages, active, seen });
      }
      while (!scrollHistoryOnIPhone && active()) {
        while ((state.isPreloading || isDrainingAnkiQueue) && active()) await sleep(50);
        if (!active()) break;
        const list = getNativeHistoryList(grid);
        if (!list?.items.length) {
          failure = !getReactFiber(grid)
            ? '撈取停止：腳本讀不到 Threads 的原生頁面資料'
            : '撈取停止：讀不到 Threads 的原生歷史列表';
          break;
        }
        const items = list.items.map((item) => item.as_micg_interface);
        const first = items.findIndex((item) => Number(item?.timestamp_ms) >= cutoff);
        const end = upperBoundary ? items.findIndex((item) => item?.message_id === upperBoundary) : items.length;
        if (first >= 0 && end > first) {
          const topSlot = findMessageSlot(grid, items[first].message_id);
          const bottomSlot = findMessageSlot(grid, items[end - 1].message_id);
          if (!topSlot || !bottomSlot) {
            failure = '撈取停止：找不到這段歷史紀錄的訊息列';
            break;
          }
          const gridTop = grid.getBoundingClientRect().top;
          const to = Math.max(0, grid.scrollTop + topSlot.getBoundingClientRect().top - gridTop);
          const from = Math.min(grid.scrollHeight - grid.clientHeight,
            grid.scrollTop + bottomSlot.getBoundingClientRect().bottom - gridTop);
          const step = Math.max(1, Math.floor(grid.clientHeight * 0.85));
          let batch = 0;
          for (let pos = Math.max(to, from); active(); pos = Math.max(to, pos - step)) {
            while (isDrainingAnkiQueue && active()) await sleep(50);
            if (!active()) break;
            grid.scrollTop = pos;
            await sleep(65);
            scanVisibleMessages(seen, cutoff);
            if (++batch % 4 === 0 || pos === to) {
              await flushPendingMessageRecords();
              if (active()) await rebuildAnkiDeck(false, false);
            }
            if (pos === to) break;
          }
        }
        if (!active()) break;
        if (Number(items[0]?.timestamp_ms) <= cutoff || !list.hasPrevious) {
          complete = true;
          break;
        }
        if (page >= pages) {
          complete = !days;
          break;
        }
        upperBoundary = items[0]?.message_id;
        setAnkiStatus(`背景載入聊天紀錄（第 ${++page} 頁）…`);
        const older = await loadOlderAnkiPage(grid, active);
        if (!older) {
          if (active()) failure = '撈取停止：Threads 未回傳下一批舊訊息';
          break;
        }
        if (older.items[0]?.as_micg_interface?.message_id === upperBoundary && !older.hasPrevious) {
          complete = true;
          break;
        }
      }
    } finally {
      const cancelled = stop7dScan;
      if (state.currentThreadId === threadId && !isDrainingAnkiQueue) {
        grid.scrollTop = Math.max(0, originalTop + grid.scrollHeight - originalHeight);
      }
      state.isBulkScanning = false;
      ankiState.isScanning = false;
      if (!isLocatingAnkiMessage) stop7dScan = false;
      if (button && !isLocatingAnkiMessage) button.textContent = '📅 撈近 7 天';
      await flushPendingMessageRecords();
      const nextPages = queuedAnkiPages;
      queuedAnkiPages = 0;
      if (ankiState.open && state.currentThreadId === threadId && !isLocatingAnkiMessage) {
        await rebuildAnkiDeck(false, false);
        if (nextPages) {
          scanOlderForAnki(nextPages);
        } else if (!isDrainingAnkiQueue) {
          setAnkiStatus(iPhoneStatus || (cancelled ? '已停止撈取，已抓到的卡片可以繼續刷'
            : complete ? '背景撈取完成'
            : failure || '背景撈取尚未完成，可再按「撈近 7 天」繼續'));
        }
      }
    }
  }

  function scanRecentDaysForAnki(days = 7) {
    return scanAnkiHistory({ days });
  }

  function scanOlderForAnki(pages = 5) {
    if (isLocatingAnkiMessage) {
      setAnkiStatus('定位中，請等目前定位完成');
      return;
    }
    if (ankiState.isScanning) {
      queuedAnkiPages = pages;
      stop7dScan = true;
      setAnkiStatus(`正在切換為往前撈 ${pages} 頁…`);
      return;
    }
    return scanAnkiHistory({ pages });
  }

  async function openAnkiMode() {
    hideHoverPreview();
    ensureAnkiModalUI();
    ankiState.open = true;
    document.documentElement.classList.add('tcf-anki-open');
    document.getElementById('tcf-anki-modal')?.classList.add('tcf-open');
    const threadId = state.currentThreadId;
    const pruningKey = `tcf_anki_pruned::${threadId}`;
    const today = new Date().toLocaleDateString('sv-SE');
    const expireByAge = localStorage.getItem(pruningKey) !== today;
    setAnkiStatus('整理牌組中…');
    await rebuildAnkiDeck(true, true, expireByAge);
    if (expireByAge) localStorage.setItem(pruningKey, today);
    if (!ankiState.open || state.currentThreadId !== threadId || ankiState.isScanning || isLocatingAnkiMessage) return;
    setAnkiStatus('背景撈取近 7 天…');
    scanRecentDaysForAnki();
  }

  function closeAnkiMode() {
    ankiState.open = false;
    document.documentElement.classList.remove('tcf-anki-open');
    const modal = document.getElementById('tcf-anki-modal');
    if (modal) {
      modal.classList.remove('tcf-open');
      modal.querySelectorAll('video').forEach((v) => {
        try {
          v.pause();
        } catch {}
      });
    }
  }

  function removeUI() {
    hideHoverPreview();
    closeAnkiMode();
    document.getElementById('tcf-toolbar')?.remove();
    document.getElementById('tcf-drawer')?.remove();
    document.getElementById('tcf-hover-preview')?.remove();
    document.getElementById('tcf-anki-modal')?.remove();
    state.drawerOpen = false;
  }

  // ==================== 路由與觀察器掛載 ====================
  async function triggerAutoPreloadIfEnabled(threadId) {
    if (!state.autoPreload || autoPreloadedThreads.has(threadId)) return;
    // 等待聊天室訊息初次渲染完成
    const ready = await waitForElement(
      () => {
        const g = getMessageGrid();
        return g && g.querySelector('div[data-message-id^="mid."]') ? g : null;
      },
      6000,
      200
    );
    if (!ready || state.currentThreadId !== threadId || !state.autoPreload) return;
    autoPreloadedThreads.add(threadId);
    await sleep(600);
    if (state.currentThreadId === threadId && !state.isPreloading) {
      preloadOlderMessages(5, true);
    }
  }

  function attachToCurrentThread(threadId) {
    if (state.isPreloading) {
      state.stopPreloadRequested = true;
    }
    if (state.gridObserver) {
      state.gridObserver.disconnect();
      state.gridObserver = null;
    }

    state.currentThreadId = threadId;
    ensureUI();
    applyGlobalFlags();
    refreshCacheCount();

    // 觀察整個聊天室 DOM 變化（相容 Threads 虛擬化重繪；Anki 開啟或背景送出時暫停以免與翻卡搶主執行緒）
    let scanQueued = false;
    state.gridObserver = new MutationObserver(() => {
      if (scanQueued || ankiState.open || ankiState.isScanning || isDrainingAnkiQueue) return;
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        if (!ankiState.open && !ankiState.isScanning && !isDrainingAnkiQueue) scanVisibleMessages();
      });
    });

    state.gridObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 立即掃描一次
    scanVisibleMessages();
    // 進聊天室自動預載歷史
    triggerAutoPreloadIfEnabled(threadId);
  }

  function checkRoute() {
    const threadId = getThreadIdFromUrl();
    if (threadId) {
      if (threadId !== state.currentThreadId) {
        attachToCurrentThread(threadId);
      } else if (!ankiState.open && !ankiState.isScanning && !isDrainingAnkiQueue) {
        scanVisibleMessages();
      }
    } else if (state.currentThreadId) {
      state.currentThreadId = null;
      if (state.gridObserver) {
        state.gridObserver.disconnect();
        state.gridObserver = null;
      }
      removeUI();
    }
  }

  // 監聽 SPA 路由切換
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const res = origPushState.apply(this, args);
    setTimeout(checkRoute, 150);
    return res;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplaceState.apply(this, args);
    setTimeout(checkRoute, 150);
    return res;
  };
  window.addEventListener('popstate', () => setTimeout(checkRoute, 80));
  window.addEventListener('hashchange', () => setTimeout(checkRoute, 80));

  // 快速偵測 SPA 路徑切換（在 Safari Userscripts 隔離環境中攔不到 page world 的 pushState）
  let lastCheckedPathname = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastCheckedPathname) {
      lastCheckedPathname = location.pathname;
      checkRoute();
    }
  }, 180);

  // 保底定期檢查（應對初次渲染延遲與新訊息掃描）
  setInterval(checkRoute, 1000);
  checkRoute();
})();
