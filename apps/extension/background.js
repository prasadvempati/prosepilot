// ProsePilot Background Service Worker

const API_BASE = "https://prosepilot.io";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "prosepilot-check",
    title: "Check grammar with ProsePilot",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prosepilot-check") {
    try { chrome.action.openPopup(); } catch(e) { /* Edge doesn't support openPopup */ }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "setClerkToken") {
    chrome.storage.local.set({ clerkToken: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "getClerkToken") {
    chrome.storage.local.get("clerkToken", (data) => {
      sendResponse({ clerkToken: data.clerkToken || null });
    });
    return true;
  }

  if (message.action === "getSelection") {
    handleGetSelection(sendResponse);
    return true;
  }

  if (message.action === "applyFix") {
    handleApplyFix(message.original, message.replacement, sendResponse);
    return true;
  }

  if (message.action === "checkInline") {
    handleCheckInline(message.text, sendResponse);
    return true;
  }

  if (message.action === "injectContentScript") {
    handleInjectContentScript(sendResponse);
    return true;
  }
});

async function handleGetSelection(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ error: "No active tab found" });
      return;
    }

    if (tab.url && /^(chrome|edge|chrome-extension):\/\//.test(tab.url)) {
      sendResponse({ error: "Cannot check grammar on browser pages." });
      return;
    }

    if (typeof chrome.scripting === "undefined") {
      sendResponse({ error: "Extension API not ready. Please reload the extension." });
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return "";
        return sel.toString();
      }
    });

    sendResponse({ text: results?.[0]?.result || "" });
  } catch (err) {
    sendResponse({ error: "Failed to get selection: " + err.message });
  }
}

async function handleApplyFix(original, replacement, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ error: "No active tab found" });
      return;
    }

    if (typeof chrome.scripting === "undefined") {
      sendResponse({ error: "Extension API not ready." });
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (orig, repl) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { success: false, reason: "no-selection" };

        const selRange = sel.getRangeAt(0);

        // Collect all text nodes within the selection
        const textNodes = [];
        function collectNodes(node) {
          if (node.nodeType === 3) {
            textNodes.push(node);
          } else {
            for (const child of node.childNodes) collectNodes(child);
          }
        }
        collectNodes(selRange.commonAncestorContainer);

        // Build full text and track each node's position
        let fullText = "";
        const nodeInfo = [];
        for (const node of textNodes) {
          nodeInfo.push({ node, start: fullText.length, end: fullText.length + node.textContent.length });
          fullText += node.textContent;
        }

        // Find the original text in the full selection text
        const idx = fullText.indexOf(orig);
        if (idx === -1) return { success: false, reason: "not-found" };

        // Map the character offsets back to DOM nodes
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        for (const info of nodeInfo) {
          if (startNode === null && idx >= info.start && idx < info.end) {
            startNode = info.node;
            startOffset = idx - info.start;
          }
          if (idx + orig.length > info.start && idx + orig.length <= info.end) {
            endNode = info.node;
            endOffset = idx + orig.length - info.start;
            break;
          }
        }

        if (!startNode || !endNode) return { success: false, reason: "range-error" };

        // Create a range for JUST the original text
        const fixRange = document.createRange();
        fixRange.setStart(startNode, startOffset);
        fixRange.setEnd(endNode, endOffset);

        // Delete only the original text
        fixRange.deleteContents();

        // Insert replacement — preserve line breaks as <br>
        if (repl.includes("\n")) {
          const html = repl.replace(/\n/g, "<br>");
          document.execCommand("insertHTML", false, html);
        } else {
          document.execCommand("insertText", false, repl);
        }

        return { success: true };
      },
      args: [original, replacement]
    });

    sendResponse(results?.[0]?.result || { success: false, reason: "script-error" });
  } catch (err) {
    sendResponse({ error: "Failed to apply fix: " + err.message });
  }
}

// --- Inline grammar check (called by content script) ---
const inlineCache = new Map();

async function handleCheckInline(text, sendResponse) {
  try {
    // Cache check — don't re-check same text
    const cacheKey = text.trim().toLowerCase();
    if (inlineCache.has(cacheKey)) {
      sendResponse({ issues: inlineCache.get(cacheKey) });
      return;
    }

    // Try ProsePilot API first
    let issues = [];
    try {
      const { clerkToken } = await chrome.storage.local.get("clerkToken");
      const headers = { "Content-Type": "application/json" };
      if (clerkToken) headers["Authorization"] = `Bearer ${clerkToken}`;

      const response = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, mode: "review" }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        issues = (data.issues || []).map((i) => ({
          id: i.id,
          category: i.category,
          original: i.original,
          replacement: i.replacement,
          explanation: i.explanation,
          startUtf16: i.startUtf16 ?? i.start ?? null,
          confidence: i.confidence ?? 0.85,
          safeAuto: i.safeAuto ?? ((i.category === "spelling" || i.category === "grammar") && (i.confidence ?? 0.85) >= 0.85),
        }));
      }
    } catch (e) {
      // ProsePilot API unavailable — fall through to LanguageTool
    }

    // Fallback: LanguageTool public API (free, no key needed)
    if (issues.length === 0) {
      issues = await checkWithLanguageTool(text);
    }

    // Cache for 60 seconds
    inlineCache.set(cacheKey, issues);
    setTimeout(() => inlineCache.delete(cacheKey), 60000);

    sendResponse({ issues });
  } catch (err) {
    sendResponse({ issues: [] });
  }
}

async function checkWithLanguageTool(text) {
  try {
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("language", "en-US");
    params.append("enabledOnly", "false");

    const response = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.matches || []).map((match) => {
      const category = mapLTCategory(match.rule?.category?.id || "");
      const confidence = match.replacements?.length > 0 ? 0.95 : 0.7;
      const replacement = match.replacements?.[0]?.value || text.slice(match.offset, match.offset + match.length);

      return {
        id: `lt_${match.rule?.id || "unknown"}`,
        category,
        original: text.slice(match.offset, match.offset + match.length),
        replacement,
        explanation: match.message || "Grammar issue detected",
        startUtf16: match.offset,
        confidence,
        safeAuto: confidence >= 0.85 && (category === "spelling" || category === "grammar") && match.replacements?.length <= 2,
      };
    });
  } catch (e) {
    return [];
  }
}

function mapLTCategory(categoryId) {
  if (!categoryId) return "grammar";
  const id = categoryId.toUpperCase();
  if (id.includes("SPELL") || id.includes("TYPO")) return "spelling";
  if (id.includes("GRAMMAR")) return "grammar";
  if (id.includes("PUNCT")) return "punctuation";
  if (id.includes("STYLE")) return "style";
  if (id.includes("CASING")) return "spelling";
  return "grammar";
}

// --- Inject content script on demand (no host_permissions needed) ---
async function handleInjectContentScript(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ error: "No active tab" });
      return;
    }

    if (tab.url && /^(chrome|edge|chrome-extension):\/\//.test(tab.url)) {
      sendResponse({ error: "Cannot run on browser pages" });
      return;
    }

    // Inject content.js into the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}
