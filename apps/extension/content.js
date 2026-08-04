// ProsePilot Inline Grammar Checker — Content Script
// Runs on every page, finds editable elements, checks grammar as you type
// Now with floating "Pp" icon and 3 grammar modes

// Listen for Clerk token handoff from the web app.
// This runs OUTSIDE the IIFE so it fires even when the content script early-returns
// on prosepilot.io, enabling the token bridge without injecting grammar-check UI.
//
// `var` (not `let`) + a window-level guard flag: unpacked-extension reloads (and some
// SPA navigations) cause Chrome to re-inject this same script into a tab that already
// has a live copy running. A top-level `let` would throw "already declared" on the
// second injection and permanently break the whole script for that page — `var`
// re-declares silently without resetting the current value, and the guard stops the
// message listener from being registered twice.
var clerkToken;
if (!window.__prosepilot_bridge_installed) {
  window.__prosepilot_bridge_installed = true;
  clerkToken = null;
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://prosepilot.io") return;
    if (event.data?.type === "CLERK_TOKEN_HANDOFF" && event.data?.token) {
      clerkToken = event.data.token;
      chrome.storage.local.set({ prosepilot_clerk_token: event.data.token });
      chrome.runtime.sendMessage({ action: "setClerkToken", token: event.data.token });
    }
  });
}

(function () {
  "use strict";

  const API_BASE = "https://prosepilot.io";
  const DEBOUNCE_MS = 300;
  const MIN_TEXT_LENGTH = 10;
  const STORAGE_KEY = "prosepilot_grammar_mode";
  const DISABLED_KEY = "prosepilot_disabled";
  const MAX_CHECK_LENGTH = 100000; // 100K chars max per grammar check

  // Kill switch: Rewrite is currently timing out in production (server-side, not yet root
  // caused) and the user asked to hide it from view until it's actually fixed and verified,
  // rather than leaving a visibly-broken feature live on a commercial product. Flip back to
  // true once the timeout issue is resolved and tested — no other code needs to change.
  const REWRITE_FEATURE_ENABLED = false;

  // Tones the /v1/rewrite backend accepts (mirrors RewriteTone in packages/writing-core/src/types.ts,
  // minus "custom" — custom instructions need a text input, left for a later iteration).
  const REWRITE_TONES = [
    { id: "professional", label: "Professional", desc: "Clear and polished for work" },
    { id: "concise", label: "Concise", desc: "Trim it down to the essentials" },
    { id: "diplomatic", label: "Diplomatic", desc: "Soften a sensitive message" },
    { id: "friendly", label: "Friendly", desc: "Warm and approachable" },
    { id: "firm", label: "Firm", desc: "Direct, no room for pushback" },
    { id: "formal", label: "Formal", desc: "Buttoned-up, no contractions" },
    { id: "confident", label: "Confident", desc: "Assertive, decisive tone" },
    { id: "persuasive", label: "Persuasive", desc: "Make the case more compelling" },
    { id: "empathetic", label: "Empathetic", desc: "Lead with understanding" },
    { id: "casual", label: "Casual", desc: "Relaxed, conversational" },
    { id: "affirmative", label: "Affirmative", desc: "Lean positive and encouraging" },
    { id: "executive", label: "Executive", desc: "Short, high-level summary tone" },
  ];

  // Skip grammar-check UI on ProsePilot's own site
  if (window.location.hostname.includes("prosepilot.io")) return;

  // Prevent double-injection (Edge may inject content scripts twice)
  if (window.__prosepilot_loaded) return;
  window.__prosepilot_loaded = true;

  // Track which elements we're monitoring
  const monitored = new WeakSet();
  // Track current issues per element
  const issueMap = new WeakMap();
  // Track active popup
  let activePopup = null;
  // Track current mode
  let currentMode = "auto";
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
  // Interval ID for periodic scan — must be stored so it can be cleared
  let periodicScanIntervalId = null;
  // MutationObserver for detecting new editable elements — stored for cleanup
  let bodyObserver = null;

  // ==================== MODE MANAGER ====================

  let isDisabled = false;

  async function loadMode() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, DISABLED_KEY]);
      currentMode = result[STORAGE_KEY] || "auto";
      isDisabled = !!result[DISABLED_KEY];
    } catch {
      currentMode = "suggest";
      isDisabled = false;
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
  let rewritePopover = null;
  let pulseCount = 0;
  let pulseTimerId = null;
  // Guards against firing a second rewrite request while one is already in flight
  let rewriteInFlight = false;

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
      if (pulseTimerId) clearTimeout(pulseTimerId);
      btn.style.animation = "prosepilot-pulse 2s ease-in-out 1";
      pulseTimerId = setTimeout(() => {
        btn.style.animation = "";
        pulseTimerId = null;
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
        ${REWRITE_FEATURE_ENABLED ? `
        <div style="border-top:1px solid #e5e7eb;margin:4px 0;"></div>
        <div class="prosepilot-mode-option" id="prosepilot-rewrite-open" style="
          display:flex;align-items:center;gap:10px;padding:10px 12px;
          border-radius:8px;cursor:pointer;transition:background 0.15s;
        ">
          <div style="
            width:10px;height:10px;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;line-height:1;
          ">&#10024;</div>
          <div>
            <div style="font-size:13px;font-weight:500;color:#1f2937;">Rewrite with AI</div>
            <div style="font-size:11px;color:#6b7280;">Change tone: professional, concise, diplomatic...</div>
          </div>
        </div>
        ` : ""}
        <div style="border-top:1px solid #e5e7eb;margin:4px 0;"></div>
        <div class="prosepilot-mode-option" id="prosepilot-turnoff" style="
          display:flex;align-items:center;gap:10px;padding:10px 12px;
          border-radius:8px;cursor:pointer;transition:background 0.15s;
        ">
          <div style="
            width:10px;height:10px;border-radius:50%;flex-shrink:0;
            background:transparent;border:2px solid #9ca3af;
          "></div>
          <div>
            <div style="font-size:13px;font-weight:500;color:#6b7280;">Turn off ProsePilot</div>
            <div style="font-size:11px;color:#9ca3af;">Stop all grammar checking</div>
          </div>
        </div>
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

    // Open the rewrite tone picker
    const rewriteOpenBtn = popover.querySelector("#prosepilot-rewrite-open");
    if (rewriteOpenBtn) {
      rewriteOpenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!focusedElement) {
          showToast("Click into a text field first, then try Rewrite.", "info");
          return;
        }
        closePopover();
        openRewritePopover();
      });
      rewriteOpenBtn.addEventListener("mouseenter", () => { rewriteOpenBtn.style.background = "#f3f4f6"; });
      rewriteOpenBtn.addEventListener("mouseleave", () => { rewriteOpenBtn.style.background = "transparent"; });
    }

    // Turn off ProsePilot
    const turnOffBtn = popover.querySelector("#prosepilot-turnoff");
    if (turnOffBtn) {
      turnOffBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.storage.local.set({ [DISABLED_KEY]: true });
        isDisabled = true;
        closePopover();
        // Clear all underlines on the current element
        if (focusedElement) clearUnderlines(focusedElement);
        showToast("ProsePilot turned off. Re-enable from the extension icon.", "info");
      });
      turnOffBtn.addEventListener("mouseenter", () => { turnOffBtn.style.background = "#f3f4f6"; });
      turnOffBtn.addEventListener("mouseleave", () => { turnOffBtn.style.background = "transparent"; });
    }

  // Close on click outside — use persistent listener removed on close
  document.addEventListener("click", closePopoverOnOutside);
}

  function closePopover() {
    if (popover) {
      popover.remove();
      popover = null;
      document.removeEventListener("click", closePopoverOnOutside);
    }
  }

  function closePopoverOnOutside(e) {
    if (popover && !popover.contains(e.target)) {
      closePopover();
    }
  }

  // ==================== REWRITE (TONE PICKER + PREVIEW) ====================

  function openRewritePopover() {
    closeRewritePopover();

    rewritePopover = document.createElement("div");
    rewritePopover.id = "prosepilot-rewrite-popover";

    const tonesHtml = REWRITE_TONES
      .map(
        (t) => `
      <div class="prosepilot-rewrite-tone" data-tone="${t.id}" style="
        display:flex;align-items:center;gap:10px;padding:9px 12px;
        border-radius:8px;cursor:pointer;transition:background 0.15s;
      ">
        <div>
          <div style="font-size:13px;font-weight:500;color:#1f2937;">${t.label}</div>
          <div style="font-size:11px;color:#6b7280;">${t.desc}</div>
        </div>
      </div>
    `
      )
      .join("");

    rewritePopover.innerHTML = `
      <div style="
        position:fixed;bottom:80px;right:24px;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:12px;
        padding:8px;box-shadow:0 8px 30px rgba(0,0,0,0.12);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        width:240px;max-height:70vh;overflow-y:auto;
        animation:prosepilot-popover-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
      ">
        <div class="prosepilot-rewrite-back" style="
          display:flex;align-items:center;gap:6px;padding:8px 12px;margin-bottom:2px;
          border-radius:8px;cursor:pointer;color:#6366f1;font-size:12px;font-weight:600;
        ">&larr; Back</div>
        <div style="padding:2px 12px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
          Rewrite tone
        </div>
        ${tonesHtml}
      </div>
    `;

    document.body.appendChild(rewritePopover);

    const backBtn = rewritePopover.querySelector(".prosepilot-rewrite-back");
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRewritePopover();
      openPopover();
    });
    backBtn.addEventListener("mouseenter", () => { backBtn.style.background = "#f3f4f6"; });
    backBtn.addEventListener("mouseleave", () => { backBtn.style.background = "transparent"; });

    rewritePopover.querySelectorAll(".prosepilot-rewrite-tone").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const tone = opt.dataset.tone;
        closeRewritePopover();
        startRewrite(tone);
      });
      opt.addEventListener("mouseenter", () => { opt.style.background = "#f3f4f6"; });
      opt.addEventListener("mouseleave", () => { opt.style.background = "transparent"; });
    });

    document.addEventListener("click", closeRewritePopoverOnOutside);
  }

  function closeRewritePopover() {
    if (rewritePopover) {
      rewritePopover.remove();
      rewritePopover = null;
      document.removeEventListener("click", closeRewritePopoverOnOutside);
    }
  }

  function closeRewritePopoverOnOutside(e) {
    if (rewritePopover && !rewritePopover.contains(e.target)) {
      closeRewritePopover();
    }
  }

  async function startRewrite(tone) {
    if (rewriteInFlight) return;
    const el = focusedElement;
    if (!el) {
      showToast("Click into a text field first, then try Rewrite.", "info");
      return;
    }

    const text = getElementText(el);
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      showToast("Write a bit more before rewriting.", "info");
      return;
    }

    rewriteInFlight = true;
    showToast("Rewriting...", "info");

    const response = await rewriteTextRequest(text, tone);

    rewriteInFlight = false;

    if (!response || response.error) {
      showToast(response?.error || "Rewrite failed. Please try again.", "error");
      return;
    }

    showRewritePreview(el, tone, response);
  }

  async function rewriteTextRequest(text, tone) {
    if (!isExtensionAlive) return { error: "Extension not available. Please reload the page." };
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "rewriteText", text, tone, token: clerkToken },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || "";
              if (msg.includes("Extension context invalidated") || msg.includes("Receiving end does not exist")) {
                isExtensionAlive = false;
                resolve({ error: "Extension was reloaded — please refresh this page." });
                return;
              }
              resolve({ error: "Rewrite failed. Please try again." });
              return;
            }
            resolve(response || { error: "No response from ProsePilot." });
          }
        );
      } catch (e) {
        isExtensionAlive = false;
        resolve({ error: "Extension not available. Please reload the page." });
      }
    });
  }

  function showRewritePreview(el, tone, response) {
    hidePopup();

    const result = response.result;
    if (!result || typeof result.rewritten !== "string") {
      showToast("Rewrite failed. Please try again.", "error");
      return;
    }

    const toneLabel = (REWRITE_TONES.find((t) => t.id === tone) || {}).label || tone;
    const warningHtml = result.factMismatch
      ? `<div style="
          background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;
          border-radius:8px;padding:8px 10px;font-size:11px;margin-bottom:10px;line-height:1.4;
        ">&#9888; This rewrite may have changed a name, date, or number. Review carefully before applying.</div>`
      : "";

    const popup = document.createElement("div");
    popup.className = "prosepilot-popup";
    popup.innerHTML = `
      <div style="
        position:fixed;z-index:2147483647;
        background:white;border:1px solid #e5e7eb;border-radius:10px;
        padding:14px;box-shadow:0 8px 30px rgba(0,0,0,0.15);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:13px;width:360px;max-height:70vh;
        bottom:80px;right:24px;
        display:flex;flex-direction:column;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <span style="color:#6366f1;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;">Rewrite &middot; ${escapeHtml(toneLabel)}</span>
          <button class="prosepilot-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:0;line-height:1;">&times;</button>
        </div>
        ${warningHtml}
        <div style="
          overflow-y:auto;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
          padding:10px;margin-bottom:10px;white-space:pre-wrap;line-height:1.5;color:#065f46;
        ">${escapeHtml(result.rewritten)}</div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="prosepilot-rewrite-apply" style="
            flex:1;padding:8px 12px;border:none;border-radius:6px;
            background:#059669;color:white;font-size:12px;font-weight:500;cursor:pointer;
          ">Apply</button>
          <button class="prosepilot-rewrite-discard" style="
            flex:1;padding:8px 12px;border:none;border-radius:6px;
            background:#f3f4f6;color:#374151;font-size:12px;font-weight:500;cursor:pointer;
          ">Discard</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
    activePopup = popup;

    popup.querySelector(".prosepilot-close").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-rewrite-discard").addEventListener("click", hidePopup);
    popup.querySelector(".prosepilot-rewrite-apply").addEventListener("click", () => {
      setElementText(el, result.rewritten);
      lastCheckedText.set(el, result.rewritten);
      hidePopup();
      showToast("✓ Rewrite applied");
      // Re-check the new text so any remaining grammar issues still get flagged
      setTimeout(() => triggerCheck(el), 300);
    });

    setTimeout(() => {
      document.addEventListener("click", (e) => {
        if (activePopup && !activePopup.contains(e.target)) {
          hidePopup();
        }
      }, { once: true });
    }, 10);
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

  let toastTimerId = null;
  let toastFadeTimerId = null;

  function showToast(message, type = "success") {
    if (toastTimerId) clearTimeout(toastTimerId);
    if (toastFadeTimerId) clearTimeout(toastFadeTimerId);

    const existing = document.getElementById("prosepilot-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "prosepilot-toast";
    const bgColor = type === "success" ? "#059669" : type === "info" ? "#6366f1" : "#ef4444";
    const safeMessage = escapeHtml(String(message));
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
        ${safeMessage}
      </div>
    `;
    document.body.appendChild(toast);
    toastTimerId = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      toastFadeTimerId = setTimeout(() => {
        toast.remove();
        toastFadeTimerId = null;
      }, 300);
      toastTimerId = null;
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
    const seen = new Set();

    // Recursively search shadow DOMs
    function searchRoot(root) {
      for (const sel of selectors) {
        root.querySelectorAll(sel).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          if (!monitored.has(el) && isVisible(el) && isLargeEnough(el)) {
            elements.push(el);
          }
        });
      }
      // Recurse into shadow roots
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) searchRoot(el.shadowRoot);
      });
    }

    searchRoot(document);
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

    // Strategy 1: Try innerText (most reliable for contentEditable — gives rendered text)
    let raw = "";
    try {
      raw = el.innerText || "";
    } catch (e) { /* fallback below */ }

    // Strategy 2: If innerText empty, try textContent
    if (!raw || raw.trim().length === 0) {
      try {
        raw = el.textContent || "";
      } catch (e) { return ""; }
    }

    // Strategy 3: If still empty, walk into shadow roots
    if (!raw || raw.trim().length === 0) {
      try {
        const textNodes = collectTextNodes(el);
        for (const node of textNodes) raw += node.textContent;
      } catch (e) { return ""; }
    }

    if (!raw || raw.trim().length === 0) return "";

    // Remove Outlook signature: everything after "--" or "—" on its own line
    const dashIdx = raw.search(/^\s*--\s*$/m);
    if (dashIdx !== -1) raw = raw.substring(0, dashIdx);
    const emDashIdx = raw.search(/^\s*—\s*$/m);
    if (emDashIdx !== -1) raw = raw.substring(0, emDashIdx);

    return raw;
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
      for (const node of collectTextNodes(el)) {
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

  // Recursive text node finder — crosses shadow DOM boundaries
  function walkAllTextNodes(el, yieldFn) {
    const stack = [el];
    while (stack.length) {
      const node = stack.pop();
      if (node.shadowRoot) {
        for (let i = node.shadowRoot.childNodes.length - 1; i >= 0; i--) stack.push(node.shadowRoot.childNodes[i]);
      }
      if (node.nodeType === Node.TEXT_NODE) {
        if (yieldFn(node)) return node;
      } else if (node.childNodes) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
      }
    }
    return null;
  }

  // Collect ALL text nodes under el (crossing shadow DOM)
  function collectTextNodes(el) {
    const nodes = [];
    const walk = (n) => {
      if (n.shadowRoot) { for (const c of n.shadowRoot.childNodes) walk(c); }
      if (n.nodeType === Node.TEXT_NODE) { nodes.push(n); return; }
      if (n.childNodes) { for (const c of n.childNodes) walk(c); }
    };
    walk(el);
    return nodes;
  }

  function findFirstTextNode(el) {
    return walkAllTextNodes(el, (n) => n.textContent.trim().length > 0);
  }

  function applyAutoCorrectToContentEditable(el, issues) {
    // Surgical replacement: find each issue by UTF-16 offset and replace only that text
    // This preserves Outlook's formatting (bold, links, signature, etc.)
    const text = getElementText(el);
    if (!text) return false;

    const autoIssues = issues
      // "missing_period" fires on ANY line that looks sentence-shaped but has no trailing
      // punctuation — including the line the user is still actively typing. Auto-applying
      // it mid-keystroke inserts a period into text that isn't finished yet, corrupting
      // what the user types next. Leave it for Suggest mode / manual review instead.
      //
      // safeAuto: the API marks every AI (DeepSeek) suggestion safeAuto:false on purpose —
      // AI offsets/rewrites can be wrong or based on already-corrupted text, so the server
      // is telling the client not to apply them without review. Only rule-engine issues
      // (regex-based, deterministic) come back safeAuto:true. Honor that.
      .filter((i) => i.safeAuto === true && i.confidence >= 0.85 && i.category !== "style" && i.category !== "tone" && i.rule !== "missing_period" && i.replacement && i.original !== i.replacement)
      .filter((i) => i.startUtf16 !== null && i.startUtf16 !== undefined);

    if (autoIssues.length === 0) return false;

    // Save the caret's character offset (if the user is actively focused in this field)
    // BEFORE mutating the DOM. Replacing a text node the live selection is anchored to
    // silently invalidates the browser's cursor, causing it to jump elsewhere and the
    // next keystrokes to land in the wrong place. We restore it after editing, below.
    let caretOffset = null;
    const hadFocus = document.activeElement === el || el.contains(document.activeElement);
    if (hadFocus) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          caretOffset = getGlobalOffset(el, range.startContainer, range.startOffset);
        }
      }
    }

    // Sort by offset descending (end-to-start to preserve positions)
    const sorted = [...autoIssues].sort((a, b) => b.startUtf16 - a.startUtf16);

    let applied = 0;
    let caretDelta = 0; // net character shift to apply to the saved caret offset
    for (const issue of sorted) {
      const idx = issue.startUtf16;
      // Verify the text matches
      if (idx < 0 || idx + issue.original.length > text.length) continue;
      if (text.substring(idx, idx + issue.original.length) !== issue.original) continue;

      // Find the text node and offset for this position
      const { node: startNode, offset: startOff } = findNodeAtOffset(el, idx);
      const { node: endNode, offset: endOff } = findNodeAtOffset(el, idx + issue.original.length);
      if (!startNode || !endNode) continue;

      try {
        const range = document.createRange();
        range.setStart(startNode, startOff);
        range.setEnd(endNode, endOff);

        // Verify range text matches
        if (range.toString() !== issue.original) continue;

        // Delete the old text and insert the replacement
        range.deleteContents();
        range.insertNode(document.createTextNode(issue.replacement));
        applied++;

        // Only corrections that land entirely before the caret's original position
        // shift where the caret should end up. Corrections after it don't matter.
        if (caretOffset !== null && idx + issue.original.length <= caretOffset) {
          caretDelta += issue.replacement.length - issue.original.length;
        }
      } catch (e) {
        // Range error — skip this issue
      }
    }

    if (applied > 0) {
      el.dispatchEvent(new Event("input", { bubbles: true }));

      // Restore the caret to its logical position, shifted by however much the
      // text before it grew or shrank. Skip if focus moved elsewhere in the meantime.
      if (caretOffset !== null && (document.activeElement === el || el.contains(document.activeElement))) {
        restoreCaretOffset(el, caretOffset + caretDelta);
      }
    }
    return applied > 0;
  }

  function restoreCaretOffset(el, offset) {
    try {
      const { node, offset: localOffset } = findNodeAtOffset(el, Math.max(0, offset));
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, Math.min(localOffset, node.textContent.length));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      // Selection restore failed — non-fatal, correction is still applied
    }
  }

  function findLastUserTextNode(el) {
    // Walk text nodes (crossing shadow DOM), stop at signature separator ("--" or "—")
    const textNodes = collectTextNodes(el);
    let lastUserNode = null;
    for (const node of textNodes) {
      const text = node.textContent;
      if (text.match(/^\s*--/) || text.match(/^\s*—/) || text.match(/^\s*--\s*$/)) break;
      if (text.trim().length > 0) lastUserNode = node;
    }
    return lastUserNode || findFirstTextNode(el);
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

  async function checkText(text, lightweight = false) {
    if (!isExtensionAlive) return [];
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "checkInline", text, token: clerkToken, lightweight },
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
      isRenderingUnderlines = false;
      return;
    }

    const text = getElementText(el);
    if (!text || text.trim().length === 0) {
      isRenderingUnderlines = false;
      return;
    }

    // For textarea/input, show floating indicator
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      showFloatingIndicator(el, issues);
      isRenderingUnderlines = false;
      return;
    }

    // For contentEditable, wrap issues in spans
    try {
      wrapIssuesInSpans(el, issues);
    } catch (e) {
      console.warn("[ProsePilot] wrapIssuesInSpans failed:", e);
      showFloatingIndicator(el, issues);
    }

    // Delay reset so MutationObserver callbacks see the flag as true during DOM mutations
    setTimeout(() => { isRenderingUnderlines = false; }, 0);
  }

  function clearUnderlines(el) {
    if (!el) return;
    // Unwrap all underline and stale spans, restoring plain text nodes
    // Crosses shadow DOM boundaries for Outlook compatibility
    const clearInRoot = (root) => {
      const spans = root.querySelectorAll(".prosepilot-underline, .prosepilot-stale");
      spans.forEach((span) => {
        const parent = span.parentNode;
        if (!parent) return;
        const textNode = document.createTextNode(span.textContent);
        parent.replaceChild(textNode, span);
      });
      root.querySelectorAll("*").forEach((child) => {
        if (child.shadowRoot) clearInRoot(child.shadowRoot);
      });
    };
    clearInRoot(el);
    // Merge adjacent text nodes left by unwrapping
    el.normalize();
    // Also remove floating indicator
    const indicator = el.parentNode?.querySelector(".prosepilot-indicator");
    if (indicator) indicator.remove();
  }

  function wrapIssuesInSpans(el, issues) {
    const text = getElementText(el);
    if (!text) { console.warn("[ProsePilot] wrapIssuesInSpans: no text"); return; }

    const sorted = [...issues]
      .map((issue) => {
        let idx = -1;
        if (issue.startUtf16 !== null && issue.startUtf16 !== undefined && issue.startUtf16 >= 0) {
          if (text.substring(issue.startUtf16, issue.startUtf16 + issue.original.length) === issue.original) {
            idx = issue.startUtf16;
          }
        }
        if (idx === -1) idx = text.indexOf(issue.original);
        return { ...issue, idx };
      })
      .filter((i) => i.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (sorted.length === 0) { console.warn("[ProsePilot] No issues matched in text"); return; }

    // Save the caret's character offset before splitting any text nodes. Underlining
    // works by replacing a live text node with three new nodes (before + <span> + after)
    // — if the browser's selection was anchored inside the node we just removed, the
    // cursor silently jumps and subsequent keystrokes land wherever it ends up. Wrapping
    // doesn't change the total text length, so no offset delta is needed on restore.
    let caretOffset = null;
    const hadFocus = document.activeElement === el || el.contains(document.activeElement);
    if (hadFocus) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          caretOffset = getGlobalOffset(el, range.startContainer, range.startOffset);
        }
      }
    }

    const textNodes = collectTextNodes(el);
    console.log("[ProsePilot] wrapIssuesInSpans:", textNodes.length, "text nodes,", sorted.length, "issues");

    // For each issue, search each text node individually — no offset mapping
    for (const issue of sorted) {
      let wrapped = false;
      for (const node of textNodes) {
        if (wrapped) break;
        const tc = node.textContent;
        const localIdx = tc.indexOf(issue.original);
        if (localIdx === -1) continue;

        // Found the issue text in this text node — split and wrap
        try {
          const parent = node.parentNode;
          if (!parent) continue;

          const before = tc.substring(0, localIdx);
          const problem = tc.substring(localIdx, localIdx + issue.original.length);
          const after = tc.substring(localIdx + issue.original.length);

          const color = issue.category === "spelling" ? "#dc2626" : issue.category === "grammar" ? "#ea580c" : "#6366f1";
          const span = document.createElement("span");
          span.className = "prosepilot-underline";
          span.dataset.issueId = issue.id;
          span.textContent = problem;
          span.style.textDecorationLine = "underline";
          span.style.textDecorationStyle = "wavy";
          span.style.textDecorationColor = color;
          span.style.textUnderlineOffset = "3px";
          span.style.cursor = "pointer";
          span.style.background = "rgba(99,102,241,0.06)";
          span.style.borderRadius = "2px";
          span.style.padding = "0 1px";

          if (before) parent.insertBefore(document.createTextNode(before), node);
          parent.insertBefore(span, node);
          if (after) parent.insertBefore(document.createTextNode(after), node);
          parent.removeChild(node);

          span.addEventListener("click", (e) => {
            e.stopPropagation();
            const iss = issues.find((i) => i.id === span.dataset.issueId);
            if (iss) showSuggestionPopup(span, iss, el);
          });

          console.log("[ProsePilot] Underline CREATED:", issue.original, "->", issue.replacement);
          wrapped = true;
        } catch (e) {
          console.warn("[ProsePilot] wrap error:", issue.original, e);
        }
      }
      if (!wrapped) {
        console.warn("[ProsePilot] Could not find text node containing:", JSON.stringify(issue.original));
      }
    }

    // Restore the caret to its original logical position now that the text nodes it may
    // have been anchored to have been replaced. Skip if focus moved elsewhere meanwhile.
    if (caretOffset !== null && (document.activeElement === el || el.contains(document.activeElement))) {
      restoreCaretOffset(el, caretOffset);
    }
  }

  function getGlobalOffset(root, targetNode, targetOffset) {
    // Use shadow-DOM-aware traversal instead of TreeWalker
    let offset = 0;
    const textNodes = collectTextNodes(root);
    for (const node of textNodes) {
      if (node === targetNode) return offset + targetOffset;
      offset += node.textContent.length;
    }
    return 0;
  }

  function findNodeAtOffset(root, targetOffset) {
    // Use shadow-DOM-aware traversal instead of TreeWalker
    let offset = 0;
    const textNodes = collectTextNodes(root);
    for (const node of textNodes) {
      const nodeEnd = offset + node.textContent.length;
      if (targetOffset <= nodeEnd) return { node, offset: targetOffset - offset };
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
      const safeId = CSS.escape(String(issue.id));
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${safeId}"]`);
      if (span) {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(issue.original), span);
        parent.normalize();
      }
      hidePopup();
    });
    popup.querySelector(".prosepilot-accept").addEventListener("click", async () => {
      // Find the underline span for this issue and replace it directly
      const safeId = CSS.escape(String(issue.id));
      const span = editableEl.querySelector(`.prosepilot-underline[data-issue-id="${safeId}"]`);
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
      <div class="prosepilot-list-issue" data-issue-id="${escapeHtml(String(issue.id))}" style="padding:8px;background:#f9fafb;border-radius:6px;margin-bottom:6px;border-left:3px solid ${
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
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="prosepilot-list-accept" data-issue-id="${escapeHtml(String(issue.id))}" style="flex:1;padding:5px 8px;border:none;border-radius:5px;background:#dcfce7;color:#166534;font-size:11px;font-weight:500;cursor:pointer;">Accept</button>
          <button class="prosepilot-list-skip" data-issue-id="${escapeHtml(String(issue.id))}" style="flex:1;padding:5px 8px;border:none;border-radius:5px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:500;cursor:pointer;">Skip</button>
        </div>
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

    // Accept: this popup only ever appears for textarea/input elements (the contentEditable
    // path uses showSuggestionPopup's per-underline click instead), so a direct value splice
    // is safe here — no DOM-node surgery needed like applyAutoCorrectToContentEditable does.
    popup.querySelectorAll(".prosepilot-list-accept").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const issueId = btn.dataset.issueId;
        const issue = issues.find((i) => String(i.id) === issueId);
        if (!issue) return;

        const text = getElementText(el);
        let idx = -1;
        if (issue.startUtf16 !== null && issue.startUtf16 !== undefined && text.substring(issue.startUtf16, issue.startUtf16 + issue.original.length) === issue.original) {
          idx = issue.startUtf16;
        } else {
          idx = text.indexOf(issue.original);
        }

        if (idx === -1) {
          showToast("Couldn't find that text — it may have already changed.", "error");
          return;
        }

        const newText = text.slice(0, idx) + issue.replacement + text.slice(idx + issue.original.length);
        isAutoCorrecting = true;
        isRenderingUnderlines = true;
        setElementText(el, newText);
        lastCheckedText.set(el, newText);
        setTimeout(() => { isAutoCorrecting = false; isRenderingUnderlines = false; }, 0);

        hidePopup();
        showToast("✓ Correction applied");
        // Re-check rather than try to patch up offsets for any remaining issues in this
        // list — a fresh check against the corrected text is simpler and always accurate.
        setTimeout(() => triggerCheck(el), 300);
      });
    });

    // Skip: just dismiss that one row locally — no server round-trip needed, this only
    // affects what's shown in this popup instance.
    popup.querySelectorAll(".prosepilot-list-skip").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".prosepilot-list-issue");
        if (row) row.remove();
        if (popup.querySelectorAll(".prosepilot-list-issue").length === 0) hidePopup();
      });
    });

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

    // Stop if extension is disabled
    if (isDisabled) return;

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

    // Tier-0 fast pass: Auto mode + contentEditable only. Fires a lightweight check (rule
    // engine + LanguageTool, skips the slower DeepSeek call) so obvious, high-confidence
    // typos/grammar fixes land in a few hundred ms instead of waiting on the full
    // multi-second round-trip below. Scoped narrowly on purpose — Suggest mode and
    // textarea/input elements are untouched, and the full check immediately after this
    // block runs exactly as it did before, unchanged, picking up anything DeepSeek finds.
    let text2 = text;
    if (currentMode === "auto" && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") {
      const fastIssues = await checkText(text, true);
      // Staleness guard: only apply if the live text still matches what we checked.
      if (fastIssues.length > 0 && getElementText(el) === text2) {
        isAutoCorrecting = true;
        isRenderingUnderlines = true;
        const fixedFast = applyAutoCorrectToContentEditable(el, fastIssues);
        if (fixedFast) {
          showToast("✓ Correction applied");
        }
        setTimeout(() => { isAutoCorrecting = false; isRenderingUnderlines = false; }, 0);
        // Re-snapshot so the full check below runs against current (possibly fast-pass
        // corrected) text rather than the now-stale pre-fix snapshot.
        text2 = getElementText(el);
      }
    }

    console.log(`[ProsePilot] Checking text (${text2.length} chars): "${text2.substring(0, 80)}..."`);
    const issues = await checkText(text2);
    issueMap.set(el, issues);
    lastCheckedText.set(el, text2);

    console.log(`[ProsePilot] Mode: ${currentMode}, Issues found: ${issues.length}`, issues);

    // Staleness guard: `text2` above was snapshotted BEFORE the await checkText() network
    // round-trip (post fast-pass, for contentEditable in auto mode; otherwise identical to
    // the original `text`). If the user kept typing while that request was in flight, every
    // offset in `issues` describes positions in text that no longer exists — applying them
    // can land mid-word (e.g. splitting "table" into "ta.ble") even though the substring
    // check inside the apply functions happens to pass on short/common fragments. If the
    // live text has moved on, drop this round's corrections; the next debounced check
    // (which will fire once typing settles) will re-check the current text correctly.
    if (currentMode === "auto" && getElementText(el) !== text2) {
      return;
    }

    if (currentMode === "auto") {
      // Auto-correct: textarea/input use full replacement, contentEditable uses surgical replacement
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const autoIssues = issues.filter(
          (i) => i.safeAuto === true && i.confidence >= 0.85 && i.category !== "style" && i.category !== "tone" && i.rule !== "missing_period" && i.replacement && i.original !== i.replacement
        );
        if (autoIssues.length > 0) {
          let newText = text2;
          const sorted = [...autoIssues].sort((a, b) => b.startUtf16 - a.startUtf16);
          for (const issue of sorted) {
            if (issue.startUtf16 !== null && issue.startUtf16 !== undefined) {
              const idx = issue.startUtf16;
              if (idx >= 0 && idx + issue.original.length <= newText.length && newText.substring(idx, idx + issue.original.length) === issue.original) {
                newText = newText.slice(0, idx) + issue.replacement + newText.slice(idx + issue.original.length);
              }
            } else {
              const idx = newText.indexOf(issue.original);
              if (idx !== -1) {
                newText = newText.slice(0, idx) + issue.replacement + newText.slice(idx + issue.original.length);
              }
            }
          }
          if (newText !== text2) {
            isAutoCorrecting = true;
            isRenderingUnderlines = true;
            setElementText(el, newText);
            lastCheckedText.set(el, newText);
            showToast(`✓ ${autoIssues.length} correction${autoIssues.length > 1 ? "s" : ""} applied`);
            setTimeout(() => { isAutoCorrecting = false; isRenderingUnderlines = false; }, 0);
            return;
          }
        }
      } else {
        // contentEditable: surgical replacement (preserves formatting)
        isAutoCorrecting = true;
        isRenderingUnderlines = true;
        const fixed = applyAutoCorrectToContentEditable(el, issues);
        if (fixed) {
          lastCheckedText.set(el, getElementText(el));
          showToast("✓ Corrections applied");
        }
        // Show underlines for issues that couldn't be auto-fixed
        const remaining = issues.filter((i) => i.safeAuto !== true || i.confidence < 0.85 || i.category === "style" || i.category === "tone" || i.rule === "missing_period" || !i.replacement || i.original === i.replacement);
        if (remaining.length > 0) {
          setTimeout(() => {
            isAutoCorrecting = false;
            isRenderingUnderlines = false;
            renderUnderlines(el, remaining);
            // Catch-up: the mutation observer ignores DOM changes while the flags above
            // are true (so it doesn't react to our own underline-drawing edits) — but that
            // means real keystrokes typed during this window were silently dropped and
            // never re-checked, leaving stale underlines on text that's since changed.
            // If the live text has moved on from what we just rendered against, re-check now.
            if (getElementText(el) !== lastCheckedText.get(el)) triggerCheck(el);
          }, 100);
          return;
        }
        setTimeout(() => {
          isAutoCorrecting = false;
          isRenderingUnderlines = false;
          if (getElementText(el) !== lastCheckedText.get(el)) triggerCheck(el);
        }, 0);
        return;
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
    if (monitored.has(el)) return;
    monitored.add(el);

    // Diagnostic: log what the element contains
    const diagText = el.innerText || el.textContent || "(empty)";
    const diagLen = diagText.length;
    console.log(`[ProsePilot] Monitoring ${el.tagName} ce=${el.contentEditable} h=${el.offsetHeight} text="${diagText.substring(0, 60)}" len=${diagLen}`);

    el.addEventListener("input", () => triggerCheck(el));
    el.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        triggerCheck(el);
      }
    });

    // Focus/blur — just track focused element
    el.addEventListener("focus", () => {
      focusedElement = el;
    });
    el.addEventListener("blur", () => {
      setTimeout(() => {
        if (document.activeElement === document.body) {
          focusedElement = null;
        }
      }, 300);
    });

    // For contentEditable, observe DOM mutations (but debounce aggressively)
    if (el.contentEditable === "true" || el.contentEditable === "") {
      const observer = new MutationObserver(() => {
        if (!isRenderingUnderlines && !isAutoCorrecting) triggerCheck(el);
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });

      // KEY FIX: Trigger an initial check after a short delay
      // This catches text that was already present before the listener was attached
      setTimeout(() => {
        if (isDisabled || currentMode === "none") return;
        const text = getElementText(el);
        if (text && text.trim().length >= MIN_TEXT_LENGTH && lastCheckedText.get(el) !== text) {
          triggerCheck(el);
        }
      }, 1000);
    }
  }

  // ==================== INITIALIZE ====================

  // Detect if an element is an editable text field
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return true;
    const ce = el.getAttribute("contenteditable");
    if (ce === "true" || ce === "" || ce === "plaintext-only") return true;
    if (el.getAttribute("role") === "textbox") return true;
    return false;
  }

  // Walk up from target to find the closest editable container (crosses shadow DOM boundaries)
  function findClosestEditable(target) {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isEditable(el)) return el;
      // Try parentElement first (normal DOM)
      if (el.parentElement) {
        el = el.parentElement;
      } else if (el.parentNode && el.parentNode.nodeType === 11) {
        // We're inside a shadow root — jump to the host element
        el = el.parentNode.host;
      } else {
        break;
      }
    }
    return null;
  }

  async function init() {
    injectStyles();
    await loadMode();

    // Load cached Clerk token from storage
    try {
      const tokenResult = await chrome.storage.local.get("prosepilot_clerk_token");
      clerkToken = tokenResult.prosepilot_clerk_token || null;
    } catch (e) { /* ignore */ }

    if (isDisabled) return;

    // Find and monitor existing editable elements
    const editables = findEditables();
    editables.forEach(observeElement);

    // Method 2: MutationObserver for new elements
    bodyObserver = new MutationObserver(() => {
      if (isDisabled) {
        if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
        return;
      }
      findEditables().forEach(observeElement);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Method 3: Document-level event delegation (catches shadow DOM elements)
    // This is the KEY fix for Outlook — shadow DOM elements aren't found by querySelectorAll
    document.addEventListener("focusin", (e) => {
      if (isDisabled) return;
      const editable = findClosestEditable(e.target);
      if (editable && !monitored.has(editable)) {
        observeElement(editable);
        // Trigger a check after a short delay (text may already be present)
        setTimeout(() => {
          const text = getElementText(editable);
          if (text && text.trim().length >= MIN_TEXT_LENGTH) {
            triggerCheck(editable);
          }
        }, 500);
      }
    }, true); // Use capture to fire before Outlook's handlers

    // Method 4: Periodic scan as fallback (every 3 seconds)
    periodicScanIntervalId = setInterval(() => {
      if (isDisabled) {
        if (periodicScanIntervalId) { clearInterval(periodicScanIntervalId); periodicScanIntervalId = null; }
        return;
      }
      findEditables().forEach(observeElement);
      // Also re-scan for elements in shadow DOMs
      document.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll("[contenteditable='true'], [contenteditable=''], textarea, input[type='text']").forEach((shadowEl) => {
            if (!monitored.has(shadowEl) && isVisible(shadowEl) && isLargeEnough(shadowEl)) {
              observeElement(shadowEl);
            }
          });
        }
      });
    }, 3000);

    // Listen for mode changes and re-enable from popup
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "setMode") {
          saveMode(msg.mode);
          lastCheckedText.delete(focusedElement);
          if (focusedElement) triggerCheck(focusedElement);
        } else if (msg.action === "enable") {
          isDisabled = false;
          chrome.storage.local.remove(DISABLED_KEY);
          findEditables().forEach(observeElement);
          showToast("ProsePilot enabled");
          // Re-check focused element with fresh text
          if (focusedElement) {
            lastCheckedText.delete(focusedElement);
            triggerCheck(focusedElement);
          }
        } else if (msg.action === "disable") {
          isDisabled = true;
          chrome.storage.local.set({ [DISABLED_KEY]: true });
          // Clear underlines on ALL monitored elements
          for (const [el] of issueMap) {
            clearUnderlines(el);
          }
          issueMap.clear();
          hideIcon();
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
