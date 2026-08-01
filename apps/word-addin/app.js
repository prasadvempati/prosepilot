// ProsePilot Word Add-in — Main Application Logic
// Uses Office.js to read/write Word documents and ProsePilot API for grammar checking

const API_BASE = "https://prosepilot.io";
let currentMode = "suggest";
let currentIssues = [];
let isChecking = false;

// ==================== INITIALIZATION ====================

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    document.getElementById("btn-check").addEventListener("click", checkDocument);
    document.getElementById("btn-settings").addEventListener("click", toggleSettings);

    // Mode buttons
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
      });
    });

    updateStatus("Ready — click Check to scan your document");
  }
});

// ==================== DOCUMENT OPERATIONS ====================

async function getDocumentText() {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();
      resolve(body.text);
    }).catch(reject);
  });
}

async function replaceInDocument(original, replacement) {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      const searchResults = body.search(original, {
        matchCase: true,
        matchWholeWord: false,
        matchWildcards: false,
      });

      searchResults.load("items");
      await context.sync();

      if (searchResults.items.length > 0) {
        // Replace the first occurrence
        searchResults.items[0].insertText(replacement, "Replace");
        await context.sync();
        resolve(true);
      } else {
        resolve(false);
      }
    }).catch(reject);
  });
}

async function highlightRange(start, length) {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      const range = body.getRange("Start");
      range.load("text");
      await context.sync();

      // Create a range from the document start
      const searchRange = body.getRange("Whole");
      // Use search to find the text at this position
      resolve();
    }).catch(reject);
  });
}

async function scrollToText(text) {
  return new Promise((resolve, reject) => {
    Word.run(async (context) => {
      const body = context.document.body;
      const searchResults = body.search(text, {
        matchCase: true,
        matchWholeWord: false,
      });

      searchResults.load("items");
      await context.sync();

      if (searchResults.items.length > 0) {
        searchResults.items[0].select();
        await context.sync();
      }
      resolve();
    }).catch(reject);
  });
}

// ==================== GRAMMAR CHECKING ====================

async function checkDocument() {
  if (isChecking) return;
  isChecking = true;

  const btn = document.getElementById("btn-check");
  const label = document.getElementById("check-label");
  const icon = document.getElementById("check-icon");

  btn.disabled = true;
  icon.innerHTML = '<span class="spinner"></span>';
  label.textContent = "Checking...";

  try {
    updateStatus("Reading document...");
    const text = await getDocumentText();

    if (!text || text.trim().length < 10) {
      updateStatus("Document is too short to check");
      currentIssues = [];
      renderIssues();
      return;
    }

    updateStatus(`Checking ${countWords(text)} words...`);

    const issues = await checkText(text);
    currentIssues = issues;

    renderIssues();
    updateStatus(`Found ${issues.length} issue${issues.length !== 1 ? "s" : ""}`);
  } catch (error) {
    console.error("Check failed:", error);
    updateStatus("Check failed — try again");
  } finally {
    isChecking = false;
    btn.disabled = false;
    icon.textContent = "\u2713";
    label.textContent = "Check Document";
  }
}

async function checkText(text) {
  // Try API first, fall back to local rules
  try {
    const response = await fetch(`${API_BASE}/v1/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.issues || [];
    }
  } catch (e) {
    // API unavailable, use local fallback
  }

  return localGrammarCheck(text);
}

// ==================== LOCAL GRAMMAR FALLBACK ====================

function localGrammarCheck(text) {
  const issues = [];

  // Double word
  const doubleWord = text.match(/\b(\w+)\s+\1\b/gi);
  if (doubleWord) {
    doubleWord.forEach((match) => {
      const words = match.split(/\s+/);
      const idx = text.indexOf(match);
      issues.push({
        id: `dw-${idx}`,
        original: match,
        replacement: words[0],
        category: "grammar",
        explanation: "Duplicate word detected.",
        startUtf16: idx,
        confidence: 0.95,
      });
    });
  }

  // Capitalize after period
  const capAfterPeriod = text.match(/([.!?])\s+([a-z])/g);
  if (capAfterPeriod) {
    capAfterPeriod.forEach((match) => {
      const idx = text.indexOf(match);
      const original = match;
      const replacement = match.charAt(0) + " " + match.charAt(2).toUpperCase();
      issues.push({
        id: `cap-${idx}`,
        original,
        replacement,
        category: "grammar",
        explanation: "Capitalize the first word of a sentence.",
        startUtf16: idx,
        confidence: 0.98,
      });
    });
  }

  // Missing period at end
  const trimmed = text.trim();
  if (trimmed.length > 0 && !/[.!?…]$/.test(trimmed) && !trimmed.endsWith("--")) {
    issues.push({
      id: "period-end",
      original: trimmed.slice(-20),
      replacement: trimmed.slice(-20) + ".",
      category: "grammar",
      explanation: "Sentences should end with a period.",
      startUtf16: text.length - 20,
      confidence: 0.9,
    });
  }

  // Comma after conditional clause
  const commaPattern = /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+[^,]+?\s+(?=[a-z])/gi;
  let match;
  while ((match = commaPattern.exec(text)) !== null {
    const clause = match[0];
    if (!clause.includes(",")) {
      // Find where the clause likely ends (before the next subject)
      issues.push({
        id: `comma-${match.index}`,
        original: clause.trim(),
        replacement: clause.trim() + ",",
        category: "grammar",
        explanation: "Add a comma after an introductory clause.",
        startUtf16: match.index,
        confidence: 0.88,
      });
    }
  }

  return issues;
}

// ==================== UI RENDERING ====================

function renderIssues() {
  const container = document.getElementById("issues-list");
  const empty = document.getElementById("issues-empty");
  const countEl = document.getElementById("issue-count");

  if (currentIssues.length === 0) {
    container.innerHTML = "";
    empty.style.display = "block";
    countEl.textContent = "0 issues";
    return;
  }

  empty.style.display = "none";
  countEl.textContent = `${currentIssues.length} issue${currentIssues.length !== 1 ? "s" : ""}`;

  container.innerHTML = currentIssues
    .map(
      (issue) => `
    <div class="issue-card" data-id="${escapeHtml(issue.id)}">
      <div class="issue-header">
        <span class="issue-category ${escapeHtml(issue.category)}">${escapeHtml(issue.category)}</span>
        <span class="issue-text">${Math.round((issue.confidence || 0.8) * 100)}% confident</span>
      </div>
      <div class="issue-original">
        <span class="wrong">${escapeHtml(issue.original)}</span>
        <span class="arrow">&rarr;</span>
        <span class="correct">${escapeHtml(issue.replacement)}</span>
      </div>
      <div class="issue-explanation">${escapeHtml(issue.explanation)}</div>
      <div class="issue-actions">
        <button class="issue-btn accept" data-action="accept" data-id="${escapeHtml(issue.id)}">Accept</button>
        <button class="issue-btn skip" data-action="skip" data-id="${escapeHtml(issue.id)}">Skip</button>
      </div>
    </div>
  `
    )
    .join("");

  // Attach click handlers
  container.querySelectorAll(".issue-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const issue = currentIssues.find((i) => i.id === id);
      if (issue) {
        scrollToText(issue.original);
      }
    });
  });

  container.querySelectorAll(".issue-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      handleIssueAction(id, action);
    });
  });
}

async function handleIssueAction(issueId, action) {
  const issue = currentIssues.find((i) => i.id === issueId);
  if (!issue) return;

  if (action === "accept") {
    try {
      const replaced = await replaceInDocument(issue.original, issue.replacement);
      if (replaced) {
        currentIssues = currentIssues.filter((i) => i.id !== issueId);
        renderIssues();
        updateStatus(`Fixed: ${issue.original} → ${issue.replacement}`);
      } else {
        updateStatus(`Could not find "${issue.original}" in document`);
      }
    } catch (e) {
      console.error("Replace failed:", e);
      updateStatus("Failed to apply fix");
    }
  } else {
    // Skip — remove from list
    currentIssues = currentIssues.filter((i) => i.id !== issueId);
    renderIssues();
  }
}

// ==================== AUTO-CORRECT ====================

async function autoCorrect() {
  if (isChecking) return;

  try {
    updateStatus("Auto-fixing all issues...");
    const text = await getDocumentText();
    const issues = await checkText(text);

    const highConfidence = issues.filter(
      (i) => i.confidence >= 0.85 && i.original !== i.replacement
    );

    if (highConfidence.length === 0) {
      updateStatus("No auto-fixable issues found");
      return;
    }

    let fixCount = 0;
    // Apply from end to start to preserve positions
    const sorted = [...highConfidence].sort((a, b) => b.startUtf16 - a.startUtf16);

    for (const issue of sorted) {
      try {
        const replaced = await replaceInDocument(issue.original, issue.replacement);
        if (replaced) fixCount++;
      } catch (e) {
        // Skip failed replacements
      }
    }

    updateStatus(`Auto-fixed ${fixCount} issue${fixCount !== 1 ? "s" : ""}`);

    // Re-check to show remaining issues
    await checkDocument();
  } catch (error) {
    console.error("Auto-correct failed:", error);
    updateStatus("Auto-fix failed");
  }
}

// Expose for ribbon button
Office.actions.associate("autoCorrect", autoCorrect);

// ==================== UTILITIES ====================

function updateStatus(text) {
  document.getElementById("status-text").textContent = text;
}

function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function toggleSettings() {
  // Placeholder for settings panel
  updateStatus("Settings coming soon");
}
