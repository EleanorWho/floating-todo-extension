const REPO = 'EleanorWho/floating-todo-extension';

async function checkForUpdates() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`);
    if (!res.ok) return;
    const { sha } = await res.json();
    await chrome.storage.local.set({ 'ftd-remote-sha': sha });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ftd-add',
      title: 'Add to Floating To-Do',
      contexts: ['selection', 'page'],
    });
  });
  checkForUpdates();
  chrome.alarms.create('ftd-update-check', { periodInMinutes: 360 }); // every 6 hours
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'ftd-update-check') checkForUpdates();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.tabs.sendMessage(tab.id, {
    type: 'FTD_CTX',
    selection: info.selectionText || '',
    url: tab.url,
    pageTitle: tab.title,
  }, () => { if (chrome.runtime.lastError) {} });
});
