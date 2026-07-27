// ProsePilot Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "prosepilot-check",
    title: "Check grammar with ProsePilot",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prosepilot-check") {
    chrome.action.openPopup();
  }
});
