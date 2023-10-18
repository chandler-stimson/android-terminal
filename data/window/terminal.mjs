/* global Terminal */

const m = new Map();

Terminal.prototype.dispose = new Proxy(Terminal.prototype.dispose, {
  apply(target, self, args) {
    self.write(`\r\n[Process completed]\r\n`);
    const p = self.element.closest('.cmd');
    p.classList.add('completed');
    const n = p.previousElementSibling ||
      p.nextElementSibling ||
      document.querySelector('.cmd:not(.completed)');
    if (n) {
      findTerminal(n).focus();
      setTimeout(() => {
        Reflect.apply(target, self, args);
        m.delete(p);
        p.remove();
        resize();
      }, 300);
    }

    return;
  }
});


const resize = () => {
  clearTimeout(resize.id);
  resize.id = setTimeout(resize.act, 100);
};
resize.act = () => {
  for (const [div, terminal] of m.entries()) {
    const {clientWidth, clientHeight} = div;

    const cols = Math.floor(clientWidth / terminal._core._renderService.dimensions.css.cell.width);
    const rows = Math.floor(clientHeight / terminal._core._renderService.dimensions.css.cell.height);

    terminal.resize(cols, rows - 1);
  }
};

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(document.getElementById('windows'));
document.body.addEventListener('mode', resize);

const addTerminal = () => {
  const terminal = new Terminal();
  const div = document.createElement('div');

  // div.setAttribute('tabindex', '-1');
  div.classList.add('cmd');
  document.getElementById('windows').append(div);
  m.set(div, terminal);
  terminal.open(div);
  // event
  terminal.textarea.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.code.startsWith('Digit')) {
      e.preventDefault();
      const n = document.querySelector(`.cmd:nth-child(${e.key})`);
      if (n) {
        findTerminal(n).focus();
      }
    }
  });
  // resize
  resize();

  return terminal;
};

const findTerminal = div => m.get(div);

export {
  addTerminal
};
