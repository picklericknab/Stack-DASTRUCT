/**
 * script.js — Stack Visualizer · DSA Lab
 * =========================================
 * Handles all stack logic, DOM manipulation,
 * animations, sound effects, undo, and controls.
 */

/* ═══════════════════════════════════════════════════════════
   AUDIO ENGINE  (Web Audio API — no external files)
════════════════════════════════════════════════════════════ */
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
    } catch (e) { /* silently ignore audio errors */ }
  }

  return {
    push  : () => { playTone(660, 'sine',    0.18, 0.14); playTone(880, 'sine', 0.12, 0.08); },
    pop   : () => { playTone(330, 'triangle', 0.22, 0.12); },
    peek  : () => { playTone(550, 'sine',    0.15, 0.10); playTone(770, 'sine', 0.10, 0.06); },
    clear : () => { playTone(220, 'sawtooth', 0.18, 0.06); },
    error : () => { playTone(180, 'square',  0.20, 0.08); },
  };
})();

/* ═══════════════════════════════════════════════════════════
   STACK DATA STRUCTURE
════════════════════════════════════════════════════════════ */
class Stack {
  #items = [];

  push(val)   { this.#items.push(val); }
  pop()       { return this.#items.pop(); }
  peek()      { return this.#items[this.#items.length - 1]; }
  isEmpty()   { return this.#items.length === 0; }
  size()      { return this.#items.length; }
  clear()     { this.#items = []; }
  getItems()  { return [...this.#items]; }          // copy (bottom → top)
  setItems(a) { this.#items = [...a]; }
}

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES
════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════ */
const stack    = new Stack();
let   isAnimating = false;
let   speedMs     = 400;   // default animation duration (ms)

// Undo history: each entry is { op: 'push'|'pop'|'clear', snapshot: [] }
const undoHistory = [];
const MAX_UNDO    = 20;
const MAX_STACK   = 20;   // visual cap

/* ═══════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function setSpeedCssVar() {
  document.documentElement.style.setProperty('--speed-ms', speedMs + 'ms');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveUndo() {
  undoHistory.push(stack.getItems());
  if (undoHistory.length > MAX_UNDO) undoHistory.shift();
}

/* ── UI info panel ─────────────────────────────────────────── */
function updateInfoPanel() {
  const size    = stack.size();
  const isEmpty = stack.isEmpty();
  const topVal  = isEmpty ? null : stack.peek();

  el.infoSize.textContent = size;
  el.infoTop.textContent  = isEmpty ? '—' : topVal;

  el.infoStatus.textContent = isEmpty ? 'Empty' : 'Not Empty';
  el.infoStatus.className   = 'info-value status-badge ' + (isEmpty ? 'empty' : 'not-empty');

  // Top label
  if (isEmpty) {
    el.topLabel.textContent  = '— Stack Empty —';
    el.topLabel.classList.remove('has-value');
  } else {
    el.topLabel.textContent  = `TOP → ${topVal}`;
    el.topLabel.classList.add('has-value');
  }

  // Empty state overlay
  el.emptyState.classList.toggle('hidden', !isEmpty);

  // Undo button
  el.btnUndo.disabled = undoHistory.length === 0;
}

/* ── Re-render the top frame highlight ─────────────────────── */
function refreshTopHighlight() {
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  frames.forEach(f => f.classList.remove('is-top', 'peeked'));
  if (frames.length > 0) {
    // The last child in the DOM = stack top (we use column-reverse on container)
    frames[frames.length - 1].classList.add('is-top');
  }
}

/* ── Build a frame element ──────────────────────────────────── */
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

/* ── Full re-render (used after undo/clear) ─────────────────── */
function rerenderStack() {
  el.stackTrack.innerHTML = '';
  const items = stack.getItems();
  items.forEach((val, i) => {
    const frame = createFrameEl(val, i);
    el.stackTrack.appendChild(frame);
  });
  refreshTopHighlight();
  updateInfoPanel();
}

/* ═══════════════════════════════════════════════════════════
   LOG
════════════════════════════════════════════════════════════ */
function addLog(msg, type = '') {
  // Remove hint item if present
  const hint = el.logList.querySelector('.hint');
  if (hint) hint.remove();

  const li = document.createElement('li');
  li.className = `log-item ${type}`;
  li.textContent = `${timestamp()} ${msg}`;
  el.logList.insertBefore(li, el.logList.firstChild); // newest on top
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

/* ═══════════════════════════════════════════════════════════
   ERROR
════════════════════════════════════════════════════════════ */
let errorTimer = null;
function showError(msg) {
  el.errorMsg.textContent = msg;
  el.errorMsg.classList.remove('hidden');
  el.errorMsg.style.animation = 'none';
  // Force reflow to re-trigger shake
  void el.errorMsg.offsetWidth;
  el.errorMsg.style.animation = '';
  AudioEngine.error();
  addLog(`✗ ${msg}`, 'error');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.errorMsg.classList.add('hidden'), 3000);
}

function clearError() {
  el.errorMsg.classList.add('hidden');
  clearTimeout(errorTimer);
}

/* ═══════════════════════════════════════════════════════════
   LOCK / UNLOCK (prevent mid-animation ops)
════════════════════════════════════════════════════════════ */
function lock() {
  isAnimating = true;
  [el.btnPush, el.btnPop, el.btnPeek, el.btnClear, el.btnUndo].forEach(b => b.disabled = true);
}

function unlock() {
  isAnimating = false;
  el.btnPush.disabled  = false;
  el.btnPop.disabled   = stack.isEmpty();
  el.btnPeek.disabled  = stack.isEmpty();
  el.btnClear.disabled = stack.isEmpty();
  el.btnUndo.disabled  = undoHistory.length === 0;
}

/* ═══════════════════════════════════════════════════════════
   OPERATIONS
════════════════════════════════════════════════════════════ */

/* ── PUSH ─────────────────────────────────────────────────── */
async function opPush() {
  if (isAnimating) return;
  clearError();

  const raw = el.input.value.trim();
  if (raw === '') { showError('Please enter a value first.'); return; }

  const num = Number(raw);
  if (!Number.isFinite(num) || raw === '') { showError('Invalid number. Try again.'); return; }
  if (num < -999 || num > 9999)            { showError('Value must be between -999 and 9999.'); return; }
  if (stack.size() >= MAX_STACK)            { showError(`Stack full (max ${MAX_STACK} items).`); return; }

  lock();
  saveUndo();

  // Remove current top highlight
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  if (frames.length > 0) frames[frames.length - 1].classList.remove('is-top');

  // Push to data structure
  stack.push(num);
  const idx   = stack.size() - 1;
  const frame = createFrameEl(num, idx);

  // Animate in
  el.stackTrack.appendChild(frame);
  frame.classList.add('entering', 'is-top');

  // Scroll to top
  el.stackTrack.scrollTop = 0;

  AudioEngine.push();
  addLog(`↑ Pushed  ${num}`, 'push');
  updateInfoPanel();

  await wait(speedMs);
  frame.classList.remove('entering');
  unlock();

  el.input.value = '';
  el.input.focus();
}

/* ── POP ──────────────────────────────────────────────────── */
async function opPop() {
  if (isAnimating) return;
  clearError();

  if (stack.isEmpty()) { showError('Stack is empty — nothing to pop!'); return; }

  lock();
  saveUndo();

  const val    = stack.pop();
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  const topEl  = frames[frames.length - 1];

  // Animate out
  topEl.classList.remove('is-top');
  topEl.classList.add('leaving');

  AudioEngine.pop();
  addLog(`↓ Popped  ${val}`, 'pop');

  await wait(speedMs);
  topEl.remove();

  // Update index labels
  updateIndexLabels();
  refreshTopHighlight();
  updateInfoPanel();
  unlock();
}

/* ── PEEK ─────────────────────────────────────────────────── */
async function opPeek() {
  if (isAnimating) return;
  clearError();

  if (stack.isEmpty()) { showError('Stack is empty — nothing to peek!'); return; }

  lock();
  const val    = stack.peek();
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  const topEl  = frames[frames.length - 1];

  // Add peek style (temporarily override is-top)
  topEl.classList.remove('is-top');
  topEl.classList.add('peeked');

  AudioEngine.peek();
  addLog(`◎ Peeked  → ${val}`, 'peek');

  // Peek effect duration ≈ 2 pulse cycles
  await wait(Math.max(speedMs, 1200));

  topEl.classList.remove('peeked');
  topEl.classList.add('is-top');
  unlock();
}

/* ── CLEAR ────────────────────────────────────────────────── */
async function opClear() {
  if (isAnimating) return;
  if (stack.isEmpty()) return;
  clearError();

  lock();
  saveUndo();

  const frames = [...el.stackTrack.querySelectorAll('.stack-frame')].reverse();

  // Stagger-clear from top to bottom
  const delay = Math.min(speedMs * 0.3, 100);
  frames.forEach((f, i) => {
    setTimeout(() => { f.classList.add('clearing'); }, i * delay);
  });

  AudioEngine.clear();
  stack.clear();
  addLog('✕ Stack cleared', 'clear');

  await wait(frames.length * delay + 300);
  el.stackTrack.innerHTML = '';

  updateInfoPanel();
  unlock();
}

/* ── UNDO ─────────────────────────────────────────────────── */
function opUndo() {
  if (undoHistory.length === 0) return;
  clearError();

  const snapshot = undoHistory.pop();
  stack.setItems(snapshot);

  rerenderStack();
  addLog('↺ Undo applied', 'undo');
  refreshTopHighlight();
  updateInfoPanel();

  // quick button re-check
  el.btnUndo.disabled  = undoHistory.length === 0;
  el.btnPop.disabled   = stack.isEmpty();
  el.btnPeek.disabled  = stack.isEmpty();
  el.btnClear.disabled = stack.isEmpty();
}

/* ── Helpers ─────────────────────────────────────────────── */
function updateIndexLabels() {
  const frames = el.stackTrack.querySelectorAll('.stack-frame');
  frames.forEach((f, i) => {
    f.querySelector('.frame-index').textContent = `[${i}]`;
  });
}

/* ═══════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════ */

el.btnPush.addEventListener('click', opPush);
el.btnPop.addEventListener('click', opPop);
el.btnPeek.addEventListener('click', opPeek);
el.btnClear.addEventListener('click', opClear);
el.btnUndo.addEventListener('click', opUndo);

// Enter key triggers push
el.input.addEventListener('keydown', e => {
  if (e.key === 'Enter') opPush();
});

// Random number
el.btnRandom.addEventListener('click', () => {
  const rand = Math.floor(Math.random() * 200) - 50; // -50 to 149
  el.input.value = rand;
  el.input.focus();
});

// Speed slider
el.speedSlider.addEventListener('input', () => {
  const v = parseInt(el.speedSlider.value, 10);
  el.speedVal.textContent = v;
  // Map 1–5 → 700ms–150ms
  speedMs = Math.round(700 - (v - 1) * 137.5);
  setSpeedCssVar();
});

// Clear log
el.btnClearLog.addEventListener('click', () => {
  el.logList.innerHTML = '<li class="log-item hint">Log cleared.</li>';
});

// Theme toggle
el.btnTheme.addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  el.btnTheme.textContent = document.body.classList.contains('light-theme') ? '◐' : '◑';
});

// Fullscreen toggle
el.btnFullscreen.addEventListener('click', () => {
  document.body.classList.toggle('fullscreen');
  el.btnFullscreen.textContent = document.body.classList.contains('fullscreen') ? '⛶' : '⛶';
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Don't trigger shortcuts when typing in input
  if (document.activeElement === el.input) return;

  switch (e.key.toLowerCase()) {
    case 'p': opPush();  break;
    case 'o': opPop();   break;
    case 'k': opPeek();  break;
    case 'c': opClear(); break;
    case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); opUndo(); } break;
  }
});

/* ═══════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
function init() {
  setSpeedCssVar();
  updateInfoPanel();
  el.btnPop.disabled   = true;
  el.btnPeek.disabled  = true;
  el.btnClear.disabled = true;
  el.btnUndo.disabled  = true;

  // Tooltip on keyboard shortcuts (desktop hint)
  el.btnPush.title  = 'Push  (P)';
  el.btnPop.title   = 'Pop   (O)';
  el.btnPeek.title  = 'Peek  (K)';
  el.btnClear.title = 'Clear (C)';
}

init();