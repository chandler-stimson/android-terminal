self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const fix = content => {
  content = content.replace(
    'from "@yume-chan/stream-extra"',
    'from "/data/window/resources/@yume-chan/stream-extra/esm/index.js"'
  ).replace(
    'from "@yume-chan/event"',
    'from "/data/window/resources/@yume-chan/event/esm/index.js"'
  ).replace(
    'from "@yume-chan/struct"',
    'from "/data/window/resources/@yume-chan/struct/esm/index.js"'
  ).replace(
    'from "@yume-chan/async"',
    'from "/data/window/resources/@yume-chan/async/esm/index.js"'
  ).replace(
    'from "@yume-chan/no-data-view"',
    'from "/data/window/resources/@yume-chan/no-data-view/esm/index.js"'
  ).replace(
    'from "@yume-chan/adb"',
    'from "/data/window/resources/@yume-chan/adb/esm/index.js"'
  )
    .replace('./async-operation-manager', './async-operation-manager.js')
    .replace('./delay', './delay.js')
    .replace('./promise-resolver', './promise-resolver.js');

  return content;
};

self.addEventListener('fetch', e => {
  if (e.request.url.endsWith('.js') && e.request.url.includes('/@yume-chan/')) {
    e.respondWith(fetch(e.request).then(r => r.text()).then(content => {
      return new Response(fix(content), {
        'status': 200,
        'headers': {
          'Content-Type': 'text/javascript'
        }
      });
    }));
  }
  else {
    e.respondWith(fetch(e.request));
  }
});
