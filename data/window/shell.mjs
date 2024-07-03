/* global state, terminals */

// Documentation
// https://tango-adb.github.io/docs/

import {AdbDaemonWebUsbDeviceManager} from '/data/window/resources/@yume-chan/adb-daemon-webusb/esm/index.js';
import {Adb, AdbDaemonTransport, encodeUtf8} from '/data/window/resources/@yume-chan/adb/esm/index.js';
import AdbWebCredentialStore from '/data/window/resources/@yume-chan/adb-credential-web/esm/index.js';
import {Consumable} from '/data/window/resources/@yume-chan/stream-extra/esm/index.js';
import {addTerminal} from './terminal.mjs';

const Manager = AdbDaemonWebUsbDeviceManager.BROWSER;
const credentialStore = new AdbWebCredentialStore();
const toast = document.getElementById('toast');

document.getElementById('connect').addEventListener('click', async ({target}) => {
  target.disabled = true;
  toast.clean();
  try {
    const device = await Manager.requestDevice();
    if (!device) {
      throw Error('No device selected');
    }
    const connection = await device.connect();

    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore
    });
    document.body.classList.add('ready');

    const adb = new Adb(transport);

    const shell = async () => {
      const terminal = addTerminal();
      terminal.focus();
      // remove old terminals
      for (const div of document.querySelectorAll('.cmd.completed')) {
        div.remove();
      }
      // process
      const ps = await adb.subprocess.shell();
      terminals.add(terminal);
      state();
      ps.stdout.pipeTo(
        new WritableStream({
          write(chunk) {
            terminal.write(chunk);
          }
        })
      ).then(() => {
        terminal.dispose();
        terminals.delete(terminal);
        state();
      });

      const writer = ps.stdin.getWriter();
      terminal.onData(data => {
        const buffer = encodeUtf8(data);
        const consumable = new Consumable(buffer);
        writer.write(consumable);
      });
      terminal.textarea.onkeydown = async e => {
        const modifier = (e.metaKey || e.ctrlKey) && e.shiftKey;
        if (modifier && e.code === 'KeyS') {
          e.preventDefault();
          shell();
        }
        else if (modifier && e.code === 'KeyC') {
          const {remove} = toast.notify('Taking screenshot...', 'info', 10000);
          e.preventDefault();
          const screenshot = await adb.framebuffer();
          const canvas = document.createElement('canvas');
          canvas.width = screenshot.width;
          canvas.height = screenshot.height;
          const context = canvas.getContext('2d');
          const imageData = new ImageData(
            new Uint8ClampedArray(screenshot.data),
            screenshot.width,
            screenshot.height
          );
          context.putImageData(imageData, 0, 0);
          const url = canvas.toDataURL();
          const a = document.createElement('a');
          a.href = url;
          a.download = `screenshot.png`;
          a.click();
          remove();
        }
        else if (modifier && e.code === 'KeyX') {
          e.preventDefault();
          const path = prompt('Enter path', '/storage/emulated/0/');
          if (path) {
            const sync = await adb.sync();
            // const stat = await sync.stat(path);
            // console.log(stat);
            const content = sync.read(path);
            const chunks = [];
            content.pipeTo(new WritableStream({
              write(chunk) {
                chunks.push(chunk);
              }
            })).then(() => {
              const filename = path.split('/').at(-1);
              const blob = new Blob(chunks);
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(blobUrl);
              sync.dispose();
            }).catch(e => toast.notify(e.message, 'error', 5000));
          }
        }
        else if (modifier && e.code === 'KeyZ') {
          e.preventDefault();
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.oninput = async () => {
            const path = prompt('Directory to place file(s)', '/storage/emulated/0/Download/');
            if (path) {
              for (const uf of input.files) {
                const {update, remove} = toast.notify('Sending...', 'info', -1);
                try {
                  const response = new Response(uf);
                  const reader = response.body.getReader();
                  let transferred = 0;
                  const file = new ReadableStream({
                    start(controller) {
                      const pump = () => {
                        return reader.read().then(({done, value}) => {
                          if (done) {
                            controller.close();
                            return;
                          }
                          controller.enqueue(new Consumable(value));
                          transferred += value.byteLength;
                          update('Sending ' + (transferred / uf.size * 100).toFixed(0) + '%...');
                          return pump();
                        });
                      };
                      return pump();
                    }
                  });
                  const sync = await adb.sync();
                  await sync.write({
                    filename: path + '/' + uf.name,
                    file
                  });
                  sync.dispose();
                  remove();
                }
                catch (e) {
                  remove();
                  toast.notify(e.message, 'error', 5000);
                }
              }
            }
          };
          input.click();
        }
      };
    };
    shell();
  }
  catch (e) {
    target.disabled = false;
    document.body.classList.remove('ready');
    state();
    console.error(e);
    toast.notify(e.message, 'error', 10000);
  }
});

document.addEventListener('keydown', e => {
  const modifier = (e.metaKey || e.ctrlKey) && e.shiftKey;
  if (modifier && e.code === 'KeyO') {
    document.getElementById('connect').click();
  }
});
