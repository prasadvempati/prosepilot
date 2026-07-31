// ProsePilot Inline Grammar Checker — Content Script
// Runs on every page, finds editable elements, checks grammar as you type
// Now with floating "Pp" icon and 3 grammar modes

// Listen for Clerk token handoff from the web app.
// This runs OUTSIDE the IIFE so it fires even when the content script early-returns
// on prosepilot.io, enabling the token bridge without injecting grammar-check UI.
window.addEventListener("message", (event) => {
  if (event.origin !== "https://prosepilot.io") return;
  if (event.data?.type === "CLERK_TOKEN_HANDOFF" && event.data?.token) {
    chrome.runtime.sendMessage({ action: "setClerkToken", token: event.data.token });
  }
});

(function () {
  "use strict";

  const API_BASE = "https://prosepilot.io";
  const DEBOUNCE_MS = 300;
  const MIN_TEXT_LENGTH = 10;
  const STORAGE_KEY = "prosepilot_grammar_mode";
  const MAX_CHECK_LENGTH = 100000; // 100K chars max per grammar check

  // Skip grammar-check UI on ProsePilot's own site
  if (window.location.hostname.includes("prosepilot.io")) return;

  // Track which elements we're monitoring
  const monitored = new WeakSet();
  // Track current issues per element
  const issueMap = new Map();
  // Track active popup
  let activePopup = null;
  // Track current mode
  let currentMode = "suggest";
  // Track focused element
  let focusedElement = null;
  // Flag to prevent feedback loop from MutationObserver during underline rendering
  let isRenderingUnderlines = false;
  // Flag to prevent MutationObserver from re-checking during auto-correct
  let isAutoCorrecting = false;
  // Cache last checked text per element to skip redundant API calls
  const lastCheckedText = new WeakMap();
  // Flag to stop checks when extension context is invalidated
  let isExtensionAlive = true;

  // ==================== MODE MANAGER ====================

  async function loadMode() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      currentMode = result[STORAGE_KEY] || "suggest";
    } catch {
      currentMode = "suggest";
    }
  }

  async function saveMode(mode) {
    currentMode = mode;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: mode });
    } catch {
      // Storage unavailable
    }
  }

  // ==================== FLOATING ICON ====================

  let floatingIcon = null;
  let popover = null;
  let pulseCount = 0;

  function createFloatingIcon() {
    if (floatingIcon) return;

    floatingIcon = document.createElement("div");
    floatingIcon.id = "prosepilot-floating-icon";
    floatingIcon.innerHTML = `
      <div style="
        position:fixed;bottom:24px;right:24px;z-index:2147483647;
        width:44px;height:44px;border-radius:50%;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:15px;font-weight:700;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 12px rgba(99,102,241,0.4);
        opacity:0;transform:scale(0.8);transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);
        pointer-events:none;user-select:none;
      " id="prosepilot-icon-btn">
        Pp
      </div>
    `;

    document.body.appendChild(floatingIcon);
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");

    // Hover effects
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.1)";
      btn.style.opacity = "1";
      btn.style.boxShadow = "0 4px 16px rgba(99,102,241,0.5)";
    });
    btn.addEventListener("mouseleave", () => {
      if (!popover) {
        btn.style.transform = "scale(1)";
        btn.style.opacity = "0.7";
        btn.style.boxShadow = "0 3px 12px rgba(99,102,241,0.4)";
      }
    });

    // Click to open popover
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popover) {
        closePopover();
      } else {
        openPopover();
      }
    });
  }

  function showIcon() {
    if (!floatingIcon) createFloatingIcon();
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");
    floatingIcon.style.display = "block";
    requestAnimationFrame(() => {
      btn.style.opacity = "0.7";
      btn.style.transform = "scale(1)";
      btn.style.pointerEvents = "auto";
    });

    // Pulse animation (first 3 times only)
    if (pulseCount < 3) {
      pulseCount++;
      btn.style.animation = "prosepilot-pulse 2s ease-in-out 1";
      setTimeout(() => {
        btn.style.animation = "";
      }, 2000);
    }
  }

  function hideIcon() {
    if (!floatingIcon) return;
    const btn = floatingIcon.querySelector("#prosepilot-icon-btn");
    btn.style.opacity = "0";
    btn.style.transform = "scale(0.8)";
    btn.style.pointerEvents = "none";
    closePopover();
  }

  // ==================== POPOVER (MODE SELECTOR) ====================

  function openPopover() {
    closePopover();

    popover = document.createElement("div");
    popover.id = "prosepilot-popover";

    const modes = [
      { id: "auto", label: "Auto-correct", color: "#10b981", dot: "#10b981", desc: "Fix grammar as you type" },
      { id: "suggest", label: "Suggest corrections", color: "#f59e0b", dot: "#f59e0b", desc: "Highlight errors, click to fix" },
      { id: "none", label: "No correction", color: "#ef4444", dot: "#ef4444", desc: "Grammar checking off" },
    ];

    const modesHtml = modes
      .map(
        (m) => `
      <div class="prosepilot-mode-option" data-mode="${m.id}" style="
        display:flex;align-items:center;gap:10px;padding:10px 12px;
        border-radius:8px;cursor:pointer;transition:background 0.15s;
        ${currentMode === m.id ? "background:rgba(99,102,241,0.08);" : ""}
      ">
        <div style="
          width:10px;height:10px;border-radius:50%;flex-shrink:0;
          background:${currentMode === m.id ? m.dot : "transparent"};
          border:2px solid ${m.dot};
        "></div>
        <div>
          <div style="font-size:13px;font-weight:500;color:#1f2937;">${m.label}</div>
          <div style="font-size:11px;color:#6b7280;">${m.desc}</div>
        </div>
      </div>
    `
      )
      .join("");

    popover.innerHTML = `
      <div style="
        position:fixed;bottom:80px;right:24px;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:12px;
        padding:8px;box-shadow:0 8px 30px rgba(0,0,0,0.12);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        width:220px;
        animation:prosepilot-popover-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
      ">
        <div style="padding:8px 12px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
          Grammar Mode
        </div>
        ${modesHtml}
      </div>
    `;

    document.body.appendChild(popover);

    // Mode click handlers
    popover.querySelectorAll(".prosepilot-mode-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const mode = opt.dataset.mode;
        saveMode(mode);
        closePopover();
        // Clear lastCheckedText so text is re-checked with new mode
        if (focusedElement) lastCheckedText.delete(focusedElement);
        // Re-check current element with new mode
        if (focusedElement) {
          triggerCheck(focusedElement);
        }
      });

      // Hover effect
      opt.addEventListener("mouseenter", () => {
        if (currentMode !== opt.dataset.mode) {
          opt.style.background = "#f3f4f6";
        }
      });
      opt.addEventListener("mouseleave", () => {
        if (currentMode !== opt.dataset.mode) {
          opt.style.background = "transparent";
        }
      });
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener("click", closePopoverOnOutside, { once: true });
    }, 10);
  }

  function closePopover() {
    if (popover) {
      popover.remove();
      popover = null;
    }
  }

  function closePopoverOnOutside(e) {
    if (popover && !popover.contains(e.target)) {
      closePopover();
    }
  }

  // ==================== INJECT ANIMATIONS ====================

  function injectStyles() {
    if (document.getElementById("prosepilot-styles")) return;
    const style = document.createElement("style");
    style.id = "prosepilot-styles";
    style.textContent = `
      @keyframes prosepilot-pulse {
        0%, 100% { box-shadow: 0 3px 12px rgba(99,102,241,0.4); }
        50% { box-shadow: 0 3px 20px rgba(99,102,241,0.7), 0 0 0 8px rgba(99,102,241,0.1); }
      }
      @keyframes prosepilot-popover-in {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes prosepilot-toast-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .prosepilot-underline {
        text-decoration-style: wavy;
        text-underline-offset: 3px;
        cursor: pointer;
        background: rgba(99,102,241,0.06);
        border-radius: 2px;
        padding: 0 1px;
        transition: background 0.15s;
      }
      .prosepilot-underline:hover {
        background: rgba(99,102,241,0.15);
      }
    `;
    document.head.appendChild(style);
  }

  // ==================== TOAST NOTIFICATIONS ====================

  function showToast(message, type = "success") {
    const existing = document.getElementById("prosepilot-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "prosepilot-toast";
    const bgColor = type === "success" ? "#059669" : type === "info" ? "#6366f1" : "#ef4444";
    toast.innerHTML = `
      <div style="
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;
        background:${bgColor};color:white;
        padding:10px 20px;border-radius:8px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;font-weight:500;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);
        animation:prosepilot-toast-in 0.3s ease-out;
      ">
        ${message}
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ==================== FIND EDITABLE ELEMENTS ====================

  function findEditables() {
    const selectors = [
      "[contenteditable='true']",
      "[contenteditable='']",
      "[contenteditable='plaintext-only']",
      "[contenteditable]",
      "textarea",
      "input[type='text']",
      "input:not([type])",
      "[role='textbox']",
    ];
    const elements = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!monitored.has(el) && isVisible(el) && isLargeEnough(el)) {
          elements.push(el);
        }
      });
    }
    return elements;
  }

  function isVisible(el) {
    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0
    );
  }

  function isLargeEnough(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.rows >= 2 || el.offsetHeight > 40;
    }
    return el.offsetHeight > 40;
  }

  function getElementText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value;
    }
    // For contentEditable: only return user text (before signature separator)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Outlook signature markers: <hr>, <div class="Signature">, HTML comments
        const tag = node.tagName;
        if (tag === "HR") break;
        if (tag === "DIV" && node.getAttribute("class") && /signature/i.test(node.getAttribute("class"))) break;
        if (tag === "DIV" && node.getAttribute("id") && /signature/i.test(node.getAttribute("id"))) break;
        continue;
      }
      const t = node.textContent;
      // Stop at signature separator ("--" or "—" on its own)
      if (t.match(/^\s*--\s*$/) || t.match(/^\s*—\s*$/)) break;
      // Outlook signature markers in text (e.g. copied HTML as text)
      if (t.match(/<hr[\s>]/i) || t.match(/<div\s+class\s*=\s*["']Signature/i) || t.match(/^<!--/)) break;
      text += t;
    }
    return text;
  }

  function setElementText(el, newText) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.selectionStart = Math.min(start, newText.length);
      el.selectionEnd = Math.min(end, newText.length);
    } else {
      // For contentEditable: save caret position, replace text, restore caret
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.match(/^\s*--/) || node.textContent.match(/^\s*—/)) break;
        if (node.textContent.trim().length > 0) textNodes.push(node);
      }

      if (textNodes.length === 0) return;

      let currentText = textNodes.map((n) => n.textContent).join("");
      if (currentText === newText) return;

      // Save caret offset relative to user text
      let savedOffset = currentText.length; // default: end of text
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          // Calculate offset from start of first text node
          const firstNode = textNodes[0];
          const startRange = document.createRange();
          startRange.setStart(firstNode, 0);
          startRange.setEnd(range.startContainer, range.startOffset);
          savedOffset = startRange.toString().length;
        }
      } catch (e) { /* fallback to end */ }

      // Replace: put all new text in first node, clear the rest
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) {
        textNodes[i].textContent = "";
      }
      el.normalize();

      // Restore caret — find the text node and offset in the new text
      try {
        const restored = findNodeAtOffset(el, Math.min(savedOffset, newText.length));
        if (restored.node) {
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStart(restored.node, restored.offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) { /* caret restore failed silently */ }

      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function findFirstTextNode(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim().length > 0) return node;
    }
    return null;
  }

  function findLastUserTextNode(el) {
    // Walk text nodes, stop at signature separator ("--" or "—")
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    let lastUserNode = null;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      // Stop at signature separator — standalone or start of signature line
      if (text.match(/^\s*--/) || text.match(/^\s*—/) || text.match(/^\s*--\s*$/)) break;
      if (text.trim().length > 0) lastUserNode = node;
    }
    return lastUserNode;
  }

  // ==================== DEBOUNCE ====================

  function createPerElementDebounce(fn, ms) {
    const timers = new WeakMap();
    return function (el) {
      if (timers.has(el)) clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => fn(el), ms));
    };
  }

  // ==================== GRAMMAR CHECK ====================

  async function checkText(text) {
    if (!isExtensionAlive) return [];
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "checkInline", text },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || "";
              if (msg.includes("Extension context invalidated") || msg.includes("Receiving end does not exist")) {
                isExtensionAlive = false;
                console.warn("[ProsePilot] Extension context invalidated. Please reload the page.");
              } else {
                console.warn("[ProsePilot] Runtime error:", msg);
              }
              resolve([]);
              return;
            }
            resolve(response?.issues || []);
          }
        );
      } catch (e) {
        isExtensionAlive = false;
        console.warn("[ProsePilot] Extension context invalidated. Please reload the page.");
        resolve([]);
      }
    });
  }

  // ==================== SUGGEST MODE ====================

  function renderUnderlines(el, issues) {
    isRenderingUnderlines = true;

    clearUnderlines(el);

    if (!issues || issues.length === 0) {
      // Delay reset so MutationObserver callbacks see the flag as true
      setTimeout(() => { isRenderingUnderlines = false; }, 0);
      return;
    }

    const text = getElementText(el);
    if (!text || text.trim().length === 0) {
      setTimeout(() => { isRenderingUnderlines = false; }, 0);
      return;
    }

    // For textarea/input, show floating indicator
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      showFloatingIndicator(el, issues);
      setTimeout(() => { isRenderingUnderlines = false; }, 0);
      return;
    }

    // For contentEditable, wrap issues in spans
    try {
      wrapIssuesInSpans(el, issues);
    } catch (e) {
      showFloatingIndicator(el, issues);
    }

    // Delay reset so MutationObserver callbacks see the flag as true
    setTimeout(() => { isRenderingUnderlines = false; }, 0);
  }

  function clearUnderlines(el) {
    if (!el) return;
    // Remove all ProsePilot underline spans and unwrap their content
    const spans = el.querySelectorAll(".prosepilot-underline");
    spans.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        parent.normalize();
      }
    });
    // Also remove floating indicator
    const indicator = el.parentNode?.querySelector(".prosepilot-indicator");
    if (indicator) indicator.remove();
  }

  function wrapIssuesInSpans(el, issues) {
    const text = getElementText(el);
    if (!text) return;

    // Filter to only user text issues (before signature)
    const sorted = [...issues]
      .map((issue) => {
        const idx = text.indexOf(issue.original);
        return { ...issue, idx };
      })
      .filter((i) => i.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (sorted.length === 0) return;

    // Use Range API to wrap issues without destroying HTML
    // Find the user text range (first text node to last text node before signature)
    const firstTextNode = findFirstTextNode(el);
    const lastTextNode = findLastUserTextNode(el);
    if (!firstTextNode || !lastTextNode) return;

    for (const issue of sorted) {
      try {
        const range = document.createRange();

        // Calculate the offset within the user text
        const userTextStart = getGlobalOffset(el, firstTextNode, 0);
        const issueGlobalStart = userTextStart + issue.idx;
        const issueGlobalEnd = issueGlobalStart + issue.original.length;

        // Find the start and end nodes/offsets for this range
        const { node: startNode, offset: startOff } = findNodeAtOffset(el, issueGlobalStart);
        const { node: endNode, offset: endOff } = findNodeAtOffset(el, issueGlobalEnd);

        if (!startNode || !endNode) continue;

        range.setStart(startNode, startOff);
        range.setEnd(endNode, endOff);

        // Check if range is within user text only
        const rangeText = range.toString();
        if (rangeText !== issue.original) continue;

        // Create the underline span
        const color =
          issue.category === "spelling"
            ? "#dc2626"
            : issue.category === "grammar"
              ? "#ea580c"
              : "#6366f1";

        const span = document.createElement("span");
        span.className = "prosepilot-underline";
        span.dataset.issueId = issue.id;
        span.style.textDecorationColor = color;
        span.style.textDecorationStyle = "wavy";
        span.style.textUnderlineOffset = "3px";
        span.style.cursor = "pointer";
        span.style.background = "rgba(99,102,241,0.06)";
        span.style.borderRadius = "2px";
        span.style.padding = "0 1px";

        range.surroundContents(span);

        // Add click handler
        span.addEventListener("click", (e) => {
          e.stopPropagation();
          const iss = issues.find((i) => i.id === span.dataset.issueId);
          if (iss) showSuggestionPopup(span, iss, el);
        });
      } catch (e) {
        // Range error — skip this issue
      }
    }
  }

  function getGlobalOffset(root, targetNode, targetOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let offset = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (node === targetNode) {
        return offset + targetOffset;
      }
      offset += node.textContent.length;
    }
    return 0;
  }

  function findNodeAtOffset(root, targetOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let offset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const nodeEnd = offset + node.textContent.length;
      if (targetOffset <= nodeEnd) {
        return { node, offset: targetOffset - offset };
      }
      offset = nodeEnd;
    }
    return { node: null, offset: 0 };
  }

  function showFloatingIndicator(el, issues) {
    const existing = el.parentNode?.querySelector(".prosepilot-indicator");
    if (existing) existing.remove();

    const indicator = document.createElement("div");
    indicator.className = "prosepilot-indicator";
    indicator.innerHTML = `
      <div style="
        position:absolute;top:-8px;right:-8px;
        background:#6366f1;color:white;
        border-radius:50%;width:22px;height:22px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      ">${issues.length}</div>
    `;

    const parent = el.parentNode;
    if (parent) {
      const pos = getComputedStyle(parent);
      if (pos.position === "static") parent.style.position = "relative";
      parent.appendChild(indicator);
    }

    indicator.addEventListener("click", (e) => {
      e.stopPropagation();
      showIssueListPopup(el, issues);
    });
  }

  // ==================== SUGGESTION POPUPS ====================

  function showSuggestionPopup(target, issue, editableEl) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";
    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;min-width:280px;max-width:360px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="color:#6366f1;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">${escapeHtml(issue.category)}</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        <div style="margin-bottom:8px;">
          <span style="color:#dc2626;text-decoration:line-through;">${escapeHtml(issue.original)}</span>
          <span style="color:#9ca3af;margin:0 6px;">→</span>
          <span style="color:#059669;font-weight:500;">${escapeHtml(issue.replacement)}</span>
        </div>
        <div style="color:#6b7280;font-size:11px;margin-bottom:10px;line-height:1.4;">${escapeHtml(issue.explanation)}</div>
        <div style="display:flex;gap:6px;">
          <button class="prosepilot-accept" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;
          ">Accept</button>
          <button class="prosepilot-skip" style="
            flex:1;padding:7px 12px;border:none;border-radius:6px;
            background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;
          ">Skip</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Position — get the inner div (not firstChild which may be whitespace)
    const popupInner = popup.querySelector("div");
    if (!popupInner) return;

    const rect = target.getBoundingClientRect();
    const popupRect = popupInner.getBoundingClientRect();
    let top = window.scrollY + rect.top - popupRect.height - 8;
    let left = window.scrollX + rect.left + (rect.width - popupRect.width) / 2;

    if (top < window.scrollY) top = window.scrollY + rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + popupRect.width > window.innerWidth - 8)
      left = window.innerWidth - popupRect.width - 8;

    popupInner.style.top = top + "px";
    popupInner.style.left = left + "px";

    // Handlers
    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-skip").addEventListener("click", () => {
      // Remove the underline span when user skips/dismisses
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${issue.id}"]`);
      if (span) {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(issue.original), span);
        parent.normalize();
      }
      hidePopup();
    });
    popup.querySelector(".prosepilot-accept").addEventListener("click", async () => {
      // Find the underline span for this issue and replace it directly
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${issue.id}"]`);
      if (span) {
        const parent = span.parentNode;
        const replacementNode = document.createTextNode(issue.replacement);
        parent.replaceChild(replacementNode, span);
        parent.normalize();
      } else {
        // Fallback: find and replace in text
        const text = getElementText(editableEl);
        const idx = text.indexOf(issue.original);
        if (idx !== -1) {
          const newText = text.slice(0, idx) + issue.replacement + text.slice(idx + issue.original.length);
          setElementText(editableEl, newText);
        }
      }
      hidePopup();
      showToast("✓ Correction applied");
      setTimeout(() => triggerCheck(editableEl), 300);
    });

    setTimeout(() => {
      document.addEventListener("click", hidePopup, { once: true });
    }, 10);
  }

  function showIssueListPopup(el, issues) {
    hidePopup();

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";

    const issuesHtml = issues
      .map(
        (issue) => `
      <div style="padding:8px;background:#f9fafb;border-radius:6px;margin-bottom:6px;border-left:3px solid ${
        issue.category === "spelling"
          ? "#dc2626"
          : issue.category === "grammar"
            ? "#ea580c"
            : "#6366f1"
      };">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${escapeHtml(issue.category)}</div>
        <div style="font-size:12px;">
          <span style="color:#dc2626;text-decoration:line-through;">${escapeHtml(issue.original)}</span>
          <span style="color:#9ca3af;"> → </span>
          <span style="color:#059669;font-weight:500;">${escapeHtml(issue.replacement)}</span>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${escapeHtml(issue.explanation)}</div>
      </div>
    `
      )
      .join("");

    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;min-width:300px;max-width:400px;max-height:400px;overflow-y:auto;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:600;">ProsePilot — ${issues.length} issue(s)</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        ${issuesHtml}
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    const popupInner = popup.querySelector("div");
    if (!popupInner) return;

    const rect = el.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;

    popupInner.style.top = top + "px";
    popupInner.style.left = left + "px";

    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    setTimeout(() => {
      document.addEventListener("click", (e) => {
        if (activePopup && !activePopup.contains(e.target)) {
          hidePopup();
        }
      }, { once: true });
    }, 50);
  }

  function hidePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }

  // ==================== CHECK TRIGGER (MODE-AWARE) ====================

  const triggerCheck = createPerElementDebounce(async (el) => {
    // Stop if extension context is dead
    if (!isExtensionAlive) return;

    // Respect current mode
    if (currentMode === "none") {
      clearUnderlines(el);
      issueMap.delete(el);
      return;
    }

    const text = getElementText(el);
    if (text.length > MAX_CHECK_LENGTH) {
      clearUnderlines(el);
      issueMap.delete(el);
      return;
    }
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      clearUnderlines(el);
      issueMap.delete(el);
      lastCheckedText.delete(el);
      return;
    }

    // Skip if text hasn't changed since last check
    if (lastCheckedText.get(el) === text) return;

    const issues = await checkText(text);
    issueMap.set(el, issues);
    lastCheckedText.set(el, text);

    console.log(`[ProsePilot] Mode: ${currentMode}, Issues found: ${issues.length}`, issues);

    if (currentMode === "auto") {
      // Auto-correct: apply high-confidence fixes silently
      const autoIssues = issues.filter(
        (i) => i.confidence >= 0.85 && i.category !== "style" && i.category !== "tone" && i.replacement && i.original !== i.replacement
      );
      console.log(`[ProsePilot] Auto-correctable issues: ${autoIssues.length}`, autoIssues);
      if (autoIssues.length > 0) {
        let newText = text;
        // Sort by offset descending (end-to-start) to preserve positions
        const sorted = [...autoIssues].sort((a, b) => b.startUtf16 - a.startUtf16);
        for (const issue of sorted) {
          // Use startUtf16 offset for precise matching (not indexOf which is fragile with duplicates)
          if (issue.startUtf16 !== null && issue.startUtf16 !== undefined) {
            const idx = issue.startUtf16;
            if (idx >= 0 && idx + issue.original.length <= newText.length && newText.substring(idx, idx + issue.original.length) === issue.original) {
              newText = newText.slice(0, idx) + issue.replacement + newText.slice(idx + issue.original.length);
            }
          } else {
            // Fallback to indexOf if offset not available
            const idx = newText.indexOf(issue.original);
            if (idx !== -1) {
              newText = newText.slice(0, idx) + issue.replacement + newText.slice(idx + issue.original.length);
            }
          }
        }
        if (newText !== text) {
          isAutoCorrecting = true;
          isRenderingUnderlines = true;
          setElementText(el, newText);
          // Update lastCheckedText to the corrected text so MutationObserver doesn't re-check
          lastCheckedText.set(el, newText);
          showToast(`✓ ${autoIssues.length} correction${autoIssues.length > 1 ? "s" : ""} applied`);
          // Delay reset flags so MutationObserver callbacks see them as true
          setTimeout(() => { isAutoCorrecting = false; isRenderingUnderlines = false; }, 0);
          return;
        }
      }
      // Fallback: show underlines for issues that couldn't be auto-applied
      renderUnderlines(el, issues);
    } else if (currentMode === "suggest") {
      // Suggest: show underlines
      renderUnderlines(el, issues);
    }
  }, DEBOUNCE_MS);

  // ==================== ELEMENT OBSERVER ====================

  function observeElement(el) {
    monitored.add(el);

    el.addEventListener("input", () => triggerCheck(el));
    el.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        triggerCheck(el);
      }
    });

    // Focus/blur for icon visibility
    el.addEventListener("focus", () => {
      focusedElement = el;
      showIcon();
    });
    el.addEventListener("blur", () => {
      // Delay hide so user can click icon
      setTimeout(() => {
        if (!popover && document.activeElement === document.body) {
          focusedElement = null;
          hideIcon();
        }
      }, 300);
    });

    // For contentEditable, observe DOM mutations
    if (el.contentEditable === "true" || el.contentEditable === "") {
      const observer = new MutationObserver(() => {
        if (!isRenderingUnderlines && !isAutoCorrecting) triggerCheck(el);
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
  }

  // ==================== INITIALIZE ====================

  async function init() {
    injectStyles();
    await loadMode();
    createFloatingIcon();
    // Don't show icon until a text field is focused

    // Find and monitor existing editable elements
    findEditables().forEach(observeElement);

    // Watch for new editable elements
    const bodyObserver = new MutationObserver(() => {
      findEditables().forEach(observeElement);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Listen for mode changes from popup
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "setMode") {
          saveMode(msg.mode);
          // Clear lastCheckedText so text is re-checked with new mode
          lastCheckedText.delete(focusedElement);
          if (focusedElement) triggerCheck(focusedElement);
        }
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ==================== UTILITIES ====================

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
