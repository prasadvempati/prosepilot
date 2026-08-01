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
        searchResults.items[0].insertText(replacement, "Replace");
        await context.sync();
        resolve(true);
      } else {
        resolve(false);
      }
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
  // Try API first (same endpoint as the Chrome extension)
  try {
    const response = await fetch(`${API_BASE}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
// Mirrors the API's detectRuleBasedIssues exactly

function localGrammarCheck(text) {
  const issues = [];

  const rules = [
    // === CAPITALIZATION ===
    { pattern: /([.!?]\s+)([a-z])/g, replacement: (_m, p1, p2) => p1 + p2.toUpperCase(), category: "grammar", explanation: "Capitalize the first word of a new sentence." },
    { pattern: /^([a-z])/, replacement: (_m, letter) => letter.toUpperCase(), category: "grammar", explanation: "Capitalize the first word of a sentence." },
    { pattern: /\bProsepilot\b/g, replacement: "ProsePilot", category: "spelling", explanation: "Proper noun 'ProsePilot' should be capitalized correctly." },
    { pattern: /\bGrammarly\b/gi, replacement: "Grammarly", category: "spelling", explanation: "Proper noun 'Grammarly' should be capitalized correctly." },
    { pattern: /\bMicrosoft\b/gi, replacement: "Microsoft", category: "spelling", explanation: "Proper noun 'Microsoft' should be capitalized correctly." },
    { pattern: /\bGoogle\b/gi, replacement: "Google", category: "spelling", explanation: "Proper noun 'Google' should be capitalized correctly." },
    { pattern: /\bOpenai\b/g, replacement: "OpenAI", category: "spelling", explanation: "Proper noun 'OpenAI' should be capitalized correctly." },
    { pattern: /\bDeepseek\b/g, replacement: "DeepSeek", category: "spelling", explanation: "Proper noun 'DeepSeek' should be capitalized correctly." },
    { pattern: /\bthe edge\b/gi, replacement: "The Edge", category: "grammar", explanation: "'The Edge' is a proper noun (product name) and should be capitalized." },

    // === PUNCTUATION ===
    { pattern: /(\w) ,/g, replacement: "$1,", category: "punctuation", explanation: "Remove space before comma." },
    { pattern: /(\w) \./g, replacement: "$1.", category: "punctuation", explanation: "Remove space before period." },
    { pattern: /(\w) ;/g, replacement: "$1;", category: "punctuation", explanation: "Remove space before semicolon." },
    { pattern: /(\w) :/g, replacement: "$1:", category: "punctuation", explanation: "Remove space before colon." },
    { pattern: /(\w) \)/g, replacement: "$1)", category: "punctuation", explanation: "Remove space before closing parenthesis." },
    { pattern: /  +/g, replacement: " ", category: "style", explanation: "Remove extra spaces." },
    { pattern: /^([A-Z][^.!?}\n"]+)$/m, replacement: "$1.", category: "punctuation", explanation: "Sentences should end with a period." },
    { pattern: /\.\./g, replacement: "...", category: "punctuation", explanation: "Use an ellipsis (...) not double periods." },
    { pattern: /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+([^,]+?)\s+([A-Z][a-z]*)/g, replacement: "$1 $2, $3", category: "punctuation", explanation: "Use a comma after an introductory or conditional clause." },

    // === WORD FORM ERRORS ===
    { pattern: /\bour discussing\b/gi, replacement: "our discussion", category: "grammar", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
    { pattern: /\btheir discussing\b/gi, replacement: "their discussion", category: "grammar", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
    { pattern: /\bthe discussing\b/gi, replacement: "the discussion", category: "grammar", explanation: "Use the noun form 'discussion' after 'the', not the gerund 'discussing'." },
    { pattern: /\ba discussing\b/gi, replacement: "a discussion", category: "grammar", explanation: "Use the noun form 'discussion' after 'a', not the gerund 'discussing'." },
    { pattern: /\bduring discussing\b/gi, replacement: "during the discussion", category: "grammar", explanation: "Use 'during the discussion', not 'during discussing'." },
    { pattern: /\bper our discussing\b/gi, replacement: "Per our discussion", category: "grammar", explanation: "Use the noun form 'discussion' after 'our', not the gerund 'discussing'." },

    // === UNCOUNTABLE NOUNS ===
    { pattern: /\bfoods\b/gi, replacement: "food", category: "grammar", explanation: "'Food' is typically uncountable. Use 'food' not 'foods'." },
    { pattern: /\binformations\b/gi, replacement: "information", category: "grammar", explanation: "'Information' is uncountable. Use 'information' not 'informations'." },
    { pattern: /\badvices\b/gi, replacement: "advice", category: "grammar", explanation: "'Advice' is uncountable. Use 'advice' not 'advices'." },
    { pattern: /\bequipments\b/gi, replacement: "equipment", category: "grammar", explanation: "'Equipment' is uncountable. Use 'equipment' not 'equipments'." },
    { pattern: /\bfurnitures\b/gi, replacement: "furniture", category: "grammar", explanation: "'Furniture' is uncountable. Use 'furniture' not 'furnitures'." },
    { pattern: /\bstaffs\b/gi, replacement: "staff", category: "grammar", explanation: "'Staff' is typically uncountable. Use 'staff' not 'staffs'." },
    { pattern: /\bhomeworks\b/gi, replacement: "homework", category: "grammar", explanation: "'Homework' is uncountable. Use 'homework' not 'homeworks'." },
    { pattern: /\bmails\b/g, replacement: "mail", category: "grammar", explanation: "'Mail' is typically uncountable. Use 'mail' not 'mails'." },
    { pattern: /\bprogresses\b/gi, replacement: "progress", category: "grammar", explanation: "'Progress' is uncountable. Use 'progress' not 'progresses'." },
    { pattern: /\bresearches\b/gi, replacement: "research", category: "grammar", explanation: "'Research' is uncountable. Use 'research' not 'researches'." },

    // === MISSING OBJECT PRONOUN ===
    { pattern: /\b(finished|completed|submitted|reviewed|approved|processed|resolved|addressed|handled|finished up|wrapped up) (on time|early|late|before|after|today|yesterday|this week|last week|this month|next week)\b/gi, replacement: "$1 it $2", category: "grammar", explanation: "This verb typically needs a direct object. Add 'it' to clarify what was finished." },

    // === ADJECTIVE-NOUN WORD ORDER ===
    { pattern: /\bupgrade premium\b/gi, replacement: "premium upgrade", category: "style", explanation: "Adjective before noun: 'premium upgrade' not 'upgrade premium'." },
    { pattern: /\breport inspection\b/gi, replacement: "inspection report", category: "style", explanation: "Adjective before noun: 'inspection report' not 'report inspection'." },
    { pattern: /\binspection site visit\b/gi, replacement: "site visit inspection", category: "style", explanation: "Reorder: 'site visit inspection' not 'inspection site visit'." },
    { pattern: /\btile shower\b/gi, replacement: "shower tile", category: "style", explanation: "Adjective before noun: 'shower tile' not 'tile shower'." },
    { pattern: /\bschedule gate\b/gi, replacement: "gate schedule", category: "style", explanation: "Adjective before noun: 'gate schedule' not 'schedule gate'." },
    { pattern: /\btrim border\b/gi, replacement: "border trim", category: "style", explanation: "Adjective before noun: 'border trim' not 'trim border'." },
    { pattern: /\blist units\b/gi, replacement: "unit list", category: "style", explanation: "Adjective before noun: 'unit list' not 'list units'." },
    { pattern: /\bcondition exterior\b/gi, replacement: "exterior condition", category: "style", explanation: "Adjective before noun: 'exterior condition' not 'condition exterior'." },
    { pattern: /\breadiness unit\b/gi, replacement: "unit readiness", category: "style", explanation: "Adjective before noun: 'unit readiness' not 'readiness unit'." },
    { pattern: /\bupdates progress\b/gi, replacement: "progress updates", category: "style", explanation: "Adjective before noun: 'progress updates' not 'updates progress'." },
  ];

  for (const rule of rules) {
    let match;
    rule.pattern.lastIndex = 0;
    while ((match = rule.pattern.exec(text)) !== null) {
      const start = match.index;
      let fixed;
      if (typeof rule.replacement === "function") {
        fixed = match[0].replace(rule.pattern, rule.replacement);
      } else if (match.length > 1) {
        fixed = match[0].replace(rule.pattern, rule.replacement);
      } else {
        fixed = rule.replacement;
      }

      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `rule_${issues.length}`,
          original: match[0],
          replacement: fixed,
          category: rule.category,
          explanation: rule.explanation,
          startUtf16: start,
          confidence: 0.99,
        });
      }
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

  container.querySelectorAll(".issue-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const issue = currentIssues.find((i) => i.id === id);
      if (issue) scrollToText(issue.original);
    });
  });

  container.querySelectorAll(".issue-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleIssueAction(btn.dataset.id, btn.dataset.action);
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
        updateStatus(`Fixed: ${issue.original} \u2192 ${issue.replacement}`);
      } else {
        updateStatus(`Could not find "${issue.original}" in document`);
      }
    } catch (e) {
      console.error("Replace failed:", e);
      updateStatus("Failed to apply fix");
    }
  } else {
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
    await checkDocument();
  } catch (error) {
    console.error("Auto-correct failed:", error);
    updateStatus("Auto-fix failed");
  }
}

Office.actions.associate("autoCorrect", autoCorrect);

// ==================== UTILITIES ====================

function updateStatus(text) {
  document.getElementById("status-text").textContent = text;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function toggleSettings() {
  updateStatus("Settings coming soon");
}
