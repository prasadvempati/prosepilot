const API_BASE = "https://prosepilot.io";

document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("checkBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");

  checkBtn.addEventListener("click", async () => {
    status.textContent = "Getting selection...";
    status.className = "status ready";
    loading.style.display = "none";
    results.style.display = "none";

    try {
      // Get selected text from the active tab using scripting API
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          return selection ? selection.toString() : "";
        }
      });

      const text = injectionResults?.[0]?.result || "";

      if (!text || text.trim().length === 0) {
        status.textContent = "No text selected. Select text first.";
        status.className = "status error";
        return;
      }

      status.textContent = `Checking ${text.length} characters...`;
      status.className = "status ready";
      loading.style.display = "block";

      const res = await fetch(`${API_BASE}/v1/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: "review" }),
      });

      const data = await res.json();
      
      loading.style.display = "none";
      results.style.display = "block";

      if (data.issues && data.issues.length > 0) {
        status.textContent = `Found ${data.issues.length} issue(s)`;
        status.className = "status ready";
        
        results.innerHTML = data.issues.map(issue => `
          <div class="issue">
            <span class="category">${issue.category}</span>: 
            <span class="original">${escapeHtml(issue.original)}</span> → 
            <span class="replacement">${escapeHtml(issue.replacement)}</span>
            <div>${escapeHtml(issue.explanation)}</div>
          </div>
        `).join("");
      } else {
        status.textContent = "No issues found!";
        status.className = "status ready";
        results.innerHTML = '<div class="issue" style="background:#ecfdf5;color:#065f46;">Your text looks good!</div>';
      }
    } catch (err) {
      loading.style.display = "none";
      status.textContent = "Error: " + err.message;
      status.className = "status error";
      console.error("ProsePilot error:", err);
    }
  });

  settingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://prosepilot.io" });
  });
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
