const AudioEngine = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function playTone(freq, type, duration, gain = 0.18, fadeIn = 0.005) {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(gain, ac.currentTime + fadeIn);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch (e) {}
  }

  return {
    push  : () => { playTone(660, 'sine', 0.18, 0.14); playTone(880, 'sine', 0.12, 0.08); },
    pop   : () => { playTone(330, 'triangle', 0.22, 0.12); },
    peek  : () => { playTone(550, 'sine', 0.15, 0.10); playTone(770, 'sine', 0.10, 0.06); },
    clear : () => { playTone(220, 'sawtooth', 0.18, 0.06); },
    error : () => { playTone(180, 'square', 0.20, 0.08); },
  };
})();

class Stack {
  #items = [];

  push(val)   { this.#items.push(val); }
  pop()       { return this.#items.pop(); }
  peek()      { return this.#items[this.#items.length - 1]; }
  isEmpty()   { return this.#items.length === 0; }
  size()      { return this.#items.length; }
  clear()     { this.#items = []; }
  getItems()  { return [...this.#items]; }
  setItems(a) { this.#items = [...a]; }
}

const el = {
  input        : document.getElementById('val-input'),
  btnPush      : document.getElementById('btn-push'),
  btnPop       : document.getElementById('btn-pop'),
  btnPeek      : document.getElementById('btn-peek'),
  btnClear     : document.getElementById('btn-clear'),
  btnRandom    : document.getElementById('btn-random'),
  btnUndo      : document.getElementById('btn-undo'),
  btnTheme     : document.getElementById('btn-theme'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  btnClearLog  : document.getElementById('btn-clear-log'),
  speedSlider  : document.getElementById('speed-slider'),
  speedVal     : document.getElementById('speed-val'),
  stackTrack   : document.getElementById('stack-track'),
  emptyState   : document.getElementById('empty-state'),
  topLabel     : document.getElementById('top-label'),
  infoSize     : document.getElementById('info-size'),
  infoTop      : document.getElementById('info-top'),
  infoStatus   : document.getElementById('info-status'),
  logList      : document.getElementById('log-list'),
  errorMsg     : document.getElementById('error-msg'),
};

const stack = new Stack();
let isAnimating = false;
let speedMs = 400;

const undoHistory = [];
const MAX_UNDO = 20;
const MAX_STACK = 20;

function setSpeedCssVar() {
  document.documentElement.style.setProperty('--speed-ms', speedMs + 'ms');
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function saveUndo() {
  undoHistory.push(stack.getItems());
  if (undoHistory.length > MAX_UNDO) undoHistory.shift();
}

function updateInfoPanel() {
  const size = stack.size();
  const isEmpty = stack.isEmpty();
  const topVal = isEmpty ? null : stack.peek();

  el.infoSize.textContent = size;
  el.infoTop.textContent = isEmpty ? '—' : topVal;

  el.infoStatus.textContent = isEmpty ? 'Empty' : 'Not Empty';
  el.infoStatus.className = 'info-value status-badge ' + (isEmpty ? 'empty' : 'not-empty');

  if (isEmpty) {
    el.topLabel.textContent = '— Stack Empty —';
    el.topLabel.classList.remove('has-value');
  } else {
    el.topLabel.textContent = `TOP → ${topVal}`;
    el.topLabel.classList.add('has-value');
  }

  el.emptyState.classList.toggle('hidden', !isEmpty);
  el.btnUndo.disabled = undoHistory.length === 0;
}

function refreshTopHighlight() {
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  frames.forEach(f => f.classList.remove('is-top', 'peeked'));
  if (frames.length > 0) frames[frames.length - 1].classList.add('is-top');
}

function createFrameEl(value, index) {
  const frame = document.createElement('li');
  frame.className = 'stack-frame';
  frame.dataset.value = value;

  frame.innerHTML = `
    <span class="frame-index">[${index}]</span>
    <span class="frame-value">${value}</span>
    <span class="frame-top-badge">TOP</span>
  `;
  return frame;
}

function rerenderStack() {
  el.stackTrack.innerHTML = '';
  stack.getItems().forEach((v, i) => {
    el.stackTrack.appendChild(createFrameEl(v, i));
  });
  refreshTopHighlight();
  updateInfoPanel();
}

function addLog(msg, type = '') {
  const hint = el.logList.querySelector('.hint');
  if (hint) hint.remove();

  const li = document.createElement('li');
  li.className = `log-item ${type}`;
  li.textContent = `${timestamp()} ${msg}`;
  el.logList.insertBefore(li, el.logList.firstChild);
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

let errorTimer = null;

function showError(msg) {
  el.errorMsg.textContent = msg;
  el.errorMsg.classList.remove('hidden');
  void el.errorMsg.offsetWidth;
  AudioEngine.error();
  addLog(`✗ ${msg}`, 'error');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.errorMsg.classList.add('hidden'), 3000);
}

function clearError() {
  el.errorMsg.classList.add('hidden');
  clearTimeout(errorTimer);
}

function lock() {
  isAnimating = true;
  [el.btnPush, el.btnPop, el.btnPeek, el.btnClear, el.btnUndo].forEach(b => b.disabled = true);
}

function unlock() {
  isAnimating = false;
  el.btnPush.disabled = false;
  el.btnPop.disabled = stack.isEmpty();
  el.btnPeek.disabled = stack.isEmpty();
  el.btnClear.disabled = stack.isEmpty();
  el.btnUndo.disabled = undoHistory.length === 0;
}

async function opPush() {
  if (isAnimating) return;
  clearError();

  const raw = el.input.value.trim();
  if (raw === '') return showError('Please enter a value first.');

  const num = Number(raw);
  if (!Number.isFinite(num)) return showError('Invalid number.');
  if (num < -999 || num > 9999) return showError('Out of range.');
  if (stack.size() >= MAX_STACK) return showError('Stack full.');

  lock();
  saveUndo();

  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  if (frames.length) frames[frames.length - 1].classList.remove('is-top');

  stack.push(num);
  const frame = createFrameEl(num, stack.size() - 1);

  el.stackTrack.appendChild(frame);
  frame.classList.add('entering', 'is-top');

  el.stackTrack.scrollTop = 0;

  AudioEngine.push();
  addLog(`↑ Pushed ${num}`, 'push');
  updateInfoPanel();

  await wait(speedMs);
  frame.classList.remove('entering');
  unlock();

  el.input.value = '';
}

async function opPop() {
  if (isAnimating) return;
  clearError();
  if (stack.isEmpty()) return showError('Stack empty.');

  lock();
  saveUndo();

  const val = stack.pop();
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  const topEl = frames[frames.length - 1];

  topEl.classList.add('leaving');
  AudioEngine.pop();
  addLog(`↓ Popped ${val}`, 'pop');

  await wait(speedMs);
  topEl.remove();

  refreshTopHighlight();
  updateInfoPanel();
  unlock();
}

async function opPeek() {
  if (isAnimating) return;
  clearError();
  if (stack.isEmpty()) return showError('Stack empty.');

  lock();

  const val = stack.peek();
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  const topEl = frames[frames.length - 1];

  topEl.classList.add('peeked');
  AudioEngine.peek();
  addLog(`◎ Peek → ${val}`, 'peek');

  await wait(Math.max(speedMs, 1200));

  topEl.classList.remove('peeked');
  unlock();
}

async function opClear() {
  if (isAnimating || stack.isEmpty()) return;
  clearError();

  lock();
  saveUndo();

  const frames = [...el.stackTrack.querySelectorAll('.stack-frame')].reverse();
  const delay = Math.min(speedMs * 0.3, 100);

  frames.forEach((f, i) => {
    setTimeout(() => f.classList.add('clearing'), i * delay);
  });

  AudioEngine.clear();
  stack.clear();
  addLog('✕ Cleared', 'clear');

  await wait(frames.length * delay + 300);
  el.stackTrack.innerHTML = '';

  updateInfoPanel();
  unlock();
}

function opUndo() {
  if (!undoHistory.length) return;
  clearError();

  stack.setItems(undoHistory.pop());
  rerenderStack();

  addLog('↺ Undo', 'undo');
  updateInfoPanel();
}

function updateIndexLabels() {
  el.stackTrack.querySelectorAll('.stack-frame').forEach((f, i) => {
    f.querySelector('.frame-index').textContent = `[${i}]`;
  });
}

el.btnPush.addEventListener('click', opPush);
el.btnPop.addEventListener('click', opPop);
el.btnPeek.addEventListener('click', opPeek);
el.btnClear.addEventListener('click', opClear);
el.btnUndo.addEventListener('click', opUndo);

el.input.addEventListener('keydown', e => {
  if (e.key === 'Enter') opPush();
});

el.btnRandom.addEventListener('click', () => {
  el.input.value = Math.floor(Math.random() * 200) - 50;
});

el.speedSlider.addEventListener('input', () => {
  const v = +el.speedSlider.value;
  el.speedVal.textContent = v;
  speedMs = Math.round(700 - (v - 1) * 137.5);
  setSpeedCssVar();
});

el.btnClearLog.addEventListener('click', () => {
  el.logList.innerHTML = '<li class="log-item hint">Log cleared.</li>';
});

el.btnTheme.addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
});

el.btnFullscreen.addEventListener('click', () => {
  document.body.classList.toggle('fullscreen');
});

document.addEventListener('keydown', e => {
  if (document.activeElement === el.input) return;

  switch (e.key.toLowerCase()) {
    case 'p': opPush(); break;
    case 'o': opPop(); break;
    case 'k': opPeek(); break;
    case 'c': opClear(); break;
    case 'z': if (e.ctrlKey || e.metaKey) opUndo(); break;
  }
});

function init() {
  setSpeedCssVar();
  updateInfoPanel();

  el.btnPop.disabled = true;
  el.btnPeek.disabled = true;
  el.btnClear.disabled = true;
  el.btnUndo.disabled = true;
}

init();