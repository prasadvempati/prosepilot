const API_BASE = "https://prosepilot.io";

document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("checkBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");

  checkBtn.addEventListener("click", async () => {
    // Get selected text from active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: "getSelection" }, async (response) => {
      const text = response?.text;
      
      if (!text || text.trim().length === 0) {
        status.textContent = "No text selected. Select text first.";
        status.className = "status error";
        return;
      }

      status.textContent = "Checking...";
      status.className = "status ready";
      loading.style.display = "block";
      results.style.display = "none";

      try {
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
              <span class="original">${issue.original}</span> → 
              <span class="replacement">${issue.replacement}</span>
              <div>${issue.explanation}</div>
            </div>
          `).join("");
        } else {
          status.textContent = "No issues found!";
          status.className = "status ready";
          results.innerHTML = "";
        }
      } catch (err) {
        loading.style.display = "none";
        status.textContent = "Error connecting to ProsePilot";
        status.className = "status error";
        console.error(err);
      }
    });
  });

  settingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://prosepilot.io/dashboard" });
  });
});
