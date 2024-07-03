chrome.action.onClicked.addListener(tab => {
  chrome.runtime.sendMessage({
    cmd: 'ping'
  }, r => {
    chrome.runtime.lastError;
    if (r !== 'pong') {
      chrome.tabs.create({
        url: '/data/window/index.html',
        index: tab.index + 1
      });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.cmd === 'bring-to-front') {
    chrome.tabs.update(sender.tab.id, {
      active: true
    });
    chrome.windows.update(sender.tab.windowId, {
      focused: true
    });
  }
  else if (request.cmd === 'state') {
    chrome.action.setIcon({
      tabId: sender.tab.id,
      path: {
        '16': '/data/icons' + (request.active ? '/active' : '') + '/16.png',
        '32': '/data/icons' + (request.active ? '/active' : '') + '/32.png',
        '48': '/data/icons' + (request.active ? '/active' : '') + '/48.png'
      }
    });
  }
});

{
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;

    chrome.contextMenus.create({
      id: 'mode',
      title: 'Mode',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'mode:vertical',
      title: 'Vertical',
      contexts: ['action'],
      parentId: 'mode',
      type: 'radio'
    });
    chrome.contextMenus.create({
      id: 'mode:horizontal',
      title: 'Horizontal',
      contexts: ['action'],
      parentId: 'mode',
      type: 'radio'
    });
  };
  chrome.runtime.onInstalled.addListener(once);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId.startsWith('mode:')) {
    chrome.storage.local.set({
      mode: info.menuItemId.slice(5)
    });
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
