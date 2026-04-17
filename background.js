chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ftd-add',
      title: 'Add to Floating To-Do',
      contexts: ['selection', 'page'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.tabs.sendMessage(tab.id, {
    type: 'FTD_CTX',
    selection: info.selectionText || '',
    url: tab.url,
    pageTitle: tab.title,
  }, () => { if (chrome.runtime.lastError) {} });
});
