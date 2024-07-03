const terminals = new Set();

self.state = () => chrome.runtime.sendMessage({
  cmd: 'state',
  active: terminals.size > 0
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'ping') {
    response('pong');
    chrome.runtime.sendMessage({
      cmd: 'bring-to-front'
    });
  }
});

chrome.storage.local.get({
  mode: 'vertical'
}, prefs => {
  document.body.dataset.mode = prefs.mode;
});

chrome.storage.onChanged.addListener(ps => {
  if (ps.mode) {
    document.body.dataset.mode = ps.mode.newValue;
    document.body.dispatchEvent(new Event('mode'));
  }
});
