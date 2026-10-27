// ============================================
// 界面主控：面板绑定、视图切换、渲染调度
// ============================================

import { PHONES } from './data/phones.js';
import { MODULE_TYPES, CASE_COLORS, PETG_RULES, CASE_DEFAULTS } from './config.js';
import {
  state, subscribe, notify, restore, applyPhone, setDim, resetDims, DIM_LIMITS,
  addModule, removeSelectedModule, getSelectedModule, designCode, syncURL,
} from './state.js';
import { drawBack, drawSide, BackViewInteraction, safetyChecks } from './view2d.js';
import { init3D, rebuild3D, screenshot3D } from './view3d.js?v=1027l';
import { exportDesignSheet } from './design-export.js';

const $ = id => document.getElementById(id);

// ---------- 机型下拉 ----------
function fillPhoneSelect() {
  const sel = $('phoneSelect');
  sel.innerHTML = '';
  const brands = [...new Set(PHONES.map(p => p.brand))];
  for (const b of brands) {
    const g = document.createElement('optgroup');
    g.label = b;
    PHONES.filter(p => p.brand === b).forEach(p => {
      const o = new Option(p.model, p.id);
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
  sel.value = state.phoneId;
}

function onPhoneChange() {
  const phone = PHONES.find(p => p.id === $('phoneSelect').value);
  if (!phone) return;
  applyPhone(phone);
  // 切机型后避让区位置可能越界 → clamp 由 updateModule 处理，这里直接 notify
  notify();
  renderAll();
}

// ---------- 3D 背景主题 ----------
const BG_THEMES = [
  { key: 'dots', label: '网点' },
  { key: 'dark', label: '深色' },
  { key: 'white', label: '纯白' },
];
function applyBg() {
  const pane = $('pane3d');
  if (!pane) return;
  pane.classList.remove('bg-dots', 'bg-dark', 'bg-white');
  pane.classList.add('bg-' + state.bg);
  const t = BG_THEMES.find(x => x.key === state.bg);
  const btn = $('bgBtn');
  if (btn) btn.textContent = '背景 · ' + (t ? t.label : state.bg);
}

// ---------- 尺寸输入 ----------
function bindDim(key) {
  const input = $('dim_' + key);
  const lim = DIM_LIMITS[key];
  if (lim) input.title = `可填 ${lim.min}–${lim.max}mm，超出自动钳回边界`;
  let timer = null;
  // 失焦/回车：解析 → 钳制 → 回写规范值；空值还原上一次有效值
  const commit = () => {
    clearTimeout(timer);
    const raw = input.value.trim();
    const v = parseFloat(raw);
    if (raw === '' || isNaN(v)) { input.value = state.current[key]; return; }
    setDim(key, v);                       // setDim 负责钳回边界
    input.value = state.current[key];
    renderAll();
  };
  // 输入中：允许空/半截数字，不被 syncDimInputs 覆盖；停手 350ms 再更新 3D（手机端避免每键重建卡顿）
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    clearTimeout(timer);
    if (input.value.trim() === '' || isNaN(v)) return;
    timer = setTimeout(() => { setDim(key, v, { clamp: false }); renderAll(); }, 350);
  });
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}
function syncDimInputs() {
  for (const key of ['w', 'h', 't', 'cornerR']) {
    const input = $('dim_' + key);
    if (document.activeElement !== input) input.value = state.current[key];   // 正在输入的框不覆盖
    const dot = $('dot_' + key);
    if (dot) dot.style.display = state.edited[key] ? '' : 'none';
  }
  $('dimReset').style.display = Object.values(state.edited).some(Boolean) ? '' : 'none';
  $('dimSource').textContent = state.edited.w || state.edited.h || state.edited.t
    ? `官方值 ${state.official.w} × ${state.official.h} × ${state.official.t}，可点「取回官方值」还原`
    : state.source;

  // 官方补充参数（重量/屏幕/年份），没有就不显示，绝不补空数字
  const specEl = $('phoneSpec');
  if (specEl) {
    const p = PHONES.find(p => p.id === state.phoneId);
    const parts = [];
    if (p && p.weight) parts.push(`${p.weight} g`);
    if (p && p.screen) parts.push(p.screen);
    if (p && p.releaseYear) parts.push(`${p.releaseYear} 年`);
    specEl.textContent = parts.join(' · ');
    specEl.style.display = parts.length ? '' : 'none';
  }
}

// ---------- 壳参数 ----------
function bindShellControls() {
  $('backT').value = state.backT; $('backTv').textContent = state.backT.toFixed(1);
  $('sideT').value = state.sideT; $('sideTv').textContent = state.sideT.toFixed(1);
  $('backT').oninput = e => { state.backT = parseFloat(e.target.value) || 1.6; $('backTv').textContent = state.backT.toFixed(1); notify(); renderAll(); };
  $('sideT').oninput = e => { state.sideT = parseFloat(e.target.value) || 1.2; $('sideTv').textContent = state.sideT.toFixed(1); notify(); renderAll(); };
  $('cornerStyle').onchange = e => { state.cornerStyle = e.target.value; notify(); renderAll(); };
  $('bottomOpen').onchange = e => { state.bottomOpen = e.target.checked; notify(); renderAll(); };
  $('buttonStyle').onchange = e => { state.buttonStyle = e.target.value; notify(); renderAll(); };
  const sw = $('colorSwatches');
  CASE_COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.title = c;
    b.onclick = () => { state.color = c; markSwatch(c); notify(); renderAll(); };
    sw.appendChild(b);
  });
  markSwatch(state.color);
}
function markSwatch(color) {
  document.querySelectorAll('.swatch').forEach(b => {
    b.classList.toggle('active', b.title.toLowerCase() === color.toLowerCase());
  });
}

// ---------- 特殊需求模块 ----------
function bindModuleButtons() {
  const wrap = $('moduleButtons');
  MODULE_TYPES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'addBtn';
    b.innerHTML = `<span>${t.name}</span><small>${t.w}×${t.h}mm 占位</small>`;
    b.onclick = () => { addModule(t); renderAll(); };
    wrap.appendChild(b);
  });
  $('removeModule').onclick = () => { removeSelectedModule(); renderAll(); };
}

// ---------- 右栏：选中模块属性 ----------
function syncModuleProps() {
  const m = getSelectedModule();
  const empty = $('propsEmpty'), box = $('propsBox');
  if (!m) { empty.style.display = ''; box.style.display = 'none'; return; }
  empty.style.display = 'none'; box.style.display = '';
  $('modName').textContent = m.name;
  $('modX').value = m.x.toFixed(1);
  $('modY').value = m.y.toFixed(1);
  $('modW').value = m.w.toFixed(1);
  $('modH').value = m.h.toFixed(1);
  $('modD').value = m.depth.toFixed(1);
}
function bindModuleProps() {
  const bind = (id, key, isInt) => {
    $(id).oninput = e => {
      const m = getSelectedModule(); if (!m) return;
      const v = parseFloat(e.target.value); if (isNaN(v)) return;
      m[key] = v; notify(); renderAll();
    };
  };
  bind('modX', 'x'); bind('modY', 'y'); bind('modW', 'w'); bind('modH', 'h'); bind('modD', 'depth');
}

// ---------- 安全检查 ----------
function syncSafety() {
  const list = $('safetyList');
  list.innerHTML = '';
  const checks = safetyChecks();
  if (!state.modules.length) {
    list.innerHTML = '<div class="muted">尚未添加避让区，无碰撞项。</div>';
    return;
  }
  checks.forEach(c => {
    const d = document.createElement('div');
    d.className = 'check ' + (c.ok ? 'ok' : 'bad');
    d.textContent = (c.ok ? '✓ ' : '✕ ') + c.text;
    list.appendChild(d);
  });
}

// ---------- 视图渲染 ----------
let ctxBack, ctxSide, canvasBack, canvasSide;

function setupCanvas(canvas) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function render2D() {
  if (state.view === 'back') {
    ctxBack = setupCanvas(canvasBack);
    state.cameraZone = cameraZoneOrNull();
    interaction.tf = drawBack(ctxBack, canvasBack.clientWidth, canvasBack.clientHeight);
  } else if (state.view === 'side') {
    ctxSide = setupCanvas(canvasSide);
    drawSide(ctxSide, canvasSide.clientWidth, canvasSide.clientHeight);
  }
}

function cameraZoneOrNull() {
  const p = PHONES.find(p => p.id === state.phoneId);
  return p && p.camera ? p.camera : null;
}

function syncMeta() {
  $('crumbModel').textContent = `${state.brand} ${state.model}`;
}

function renderAll() {
  syncMeta();
  syncDimInputs();
  syncModuleProps();
  syncSafety();
  const views = { back: $('paneBack'), side: $('paneSide'), '3d': $('pane3d') };
  for (const [key, el] of Object.entries(views)) el.classList.toggle('active', state.view === key);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === state.view));
  if (state.view === 'back' || state.view === 'side') render2D();
  if (state.view === '3d') rebuild3D();
}

// ---------- 白天/夜间主题 ----------
const THEME_KEY = 'kecraft-theme';
function applyTheme(t, { save = true } = {}) {
  document.documentElement.dataset.theme = t;
  if (save) localStorage.setItem(THEME_KEY, t);
  const btn = $('themeBtn');
  if (btn) btn.innerHTML = t === 'light' ? '🌙 <span class="themeTxt">夜间</span>' : '☀️ <span class="themeTxt">白天</span>';
  // 2D 图纸线条颜色跟随主题，当前正显示 2D 视图时立即重绘
  if (state.view === 'back' || state.view === 'side') render2D();
}
function bindTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', { save: false });
  $('themeBtn').onclick = () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  };
}

// ---------- 左栏宽度拖拽 ----------
const STEPS_W_KEY = 'kecraft-steps-w';
const STEPS_W_MIN = 210, STEPS_W_MAX = 560;
function bindColDrag() {
  const handle = $('stepsDrag');
  const wb = document.querySelector('.workbench');
  if (!handle || !wb) return;
  // 恢复上次宽度
  const saved = parseInt(localStorage.getItem(STEPS_W_KEY), 10);
  if (saved >= STEPS_W_MIN && saved <= STEPS_W_MAX) wb.style.setProperty('--steps-w', saved + 'px');

  let startX = 0, startW = 264, dragging = false, pid = null, raf = 0;
  const apply = () => {
    raf = 0;
    renderAll();   // 画布尺寸变了，2D 重算 / 3D 重新取景
  };
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    startX = e.clientX;
    startW = parseFloat(getComputedStyle(wb).getPropertyValue('--steps-w')) || 264;
    dragging = true; pid = e.pointerId;
    handle.setPointerCapture(pid);
    document.body.classList.add('col-resizing');
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pid) return;
    const w = Math.round(Math.max(STEPS_W_MIN, Math.min(STEPS_W_MAX, startW + e.clientX - startX)));
    wb.style.setProperty('--steps-w', w + 'px');
    if (!raf) raf = requestAnimationFrame(apply);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; pid = null;
    document.body.classList.remove('col-resizing');
    const w = parseInt(wb.style.getPropertyValue('--steps-w'), 10);
    if (w) localStorage.setItem(STEPS_W_KEY, String(w));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// ---------- 壳预览开关 / 一键重置 ----------
function bindPhoneToggle() {
  const btn = $('phoneBtn');
  if (!btn) return;
  const sync = () => {
    const on = state.showPhone !== false;
    btn.classList.toggle('on', on);
    btn.classList.toggle('off', !on);
    btn.innerHTML = `<i class="led"></i>手机预览<b class="st">${on ? '开' : '关'}</b>`;
  };
  btn.onclick = () => { state.showPhone = !(state.showPhone !== false); sync(); notify(); renderAll(); };
  sync();
}
function bindCaseToggle() {
  const btn = $('caseBtn');
  if (!btn) return;
  const sync = () => {
    const on = state.showCase !== false;
    btn.classList.toggle('on', on);
    btn.classList.toggle('off', !on);
    btn.innerHTML = `<i class="led"></i>壳预览<b class="st">${on ? '开' : '关'}</b>`;
  };
  btn.onclick = () => { state.showCase = !(state.showCase !== false); sync(); notify(); renderAll(); };
  sync();
}
function bindResetCase() {
  const btn = $('resetCaseBtn');
  const modal = $('resetModal');
  if (!btn || !modal) return;
  const doReset = () => {
    // 只保留一个默认普通壳：壳参数回默认、清空避让区/备注/手改尺寸，机型不动
    state.backT = CASE_DEFAULTS.backT;
    state.sideT = CASE_DEFAULTS.sideT;
    state.cornerStyle = 'round';
    state.bottomOpen = true;
    state.buttonStyle = 'open';
    state.color = '#2f3b47';
    state.note = '';
    state.modules = [];
    state.selectedModuleId = null;
    state.current = { ...state.official };
    state.edited = { w: false, h: false, t: false, cornerR: false };
    $('noteInput').value = '';
    markSwatch(state.color);
    notify(); renderAll();
  };
  btn.onclick = () => { modal.hidden = false; };
  $('resetCancel').onclick = () => { modal.hidden = true; };
  $('resetConfirm').onclick = () => { modal.hidden = true; doReset(); };
  // 点遮罩空白处 / Esc 关闭
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
}

// ---------- 3D 区全屏（类切换，iOS 兼容） ----------
function bindFullscreen() {
  const stage = document.querySelector('.stage');
  const fsBtn = $('fsBtn'), exitBtn = $('fsExit');
  if (!stage || !fsBtn || !exitBtn) return;
  const render = () => requestAnimationFrame(renderAll);   // 容器尺寸变了，画布重算
  const toggle = force => {
    const on = force !== undefined ? force : !stage.classList.contains('fs');
    stage.classList.toggle('fs', on);
    fsBtn.textContent = on ? '⛶ 退出全屏' : '⛶ 全屏';
    render();
  };
  fsBtn.onclick = () => toggle();
  exitBtn.onclick = () => toggle(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
}

// ---------- 初始化 ----------
function start() {
  restore();
  fillPhoneSelect();
  $('phoneSelect').value = state.phoneId;
  $('phoneSelect').onchange = onPhoneChange;

  bindDim('w'); bindDim('h'); bindDim('t'); bindDim('cornerR');
  $('dimReset').onclick = () => { resetDims(); renderAll(); };
  bindShellControls();
  bindModuleButtons();
  bindModuleProps();
  $('noteInput').value = state.note || '';
  $('noteInput').oninput = e => { state.note = e.target.value; notify(); };

  canvasBack = $('viewBack'); canvasSide = $('viewSide');
  window.interaction = new BackViewInteraction(canvasBack);
  window.interaction.renderHook = renderAll;

  init3D($('pane3d'));

  bindTheme();
  bindColDrag();
  bindFullscreen();
  bindCaseToggle();
  bindPhoneToggle();
  bindResetCase();

  // 背景主题：旧草稿可能没有 bg 字段，兜底回默认
  if (!BG_THEMES.some(t => t.key === state.bg)) state.bg = 'dots';
  $('bgBtn').onclick = () => {
    const i = BG_THEMES.findIndex(t => t.key === state.bg);
    state.bg = BG_THEMES[(i + 1) % BG_THEMES.length].key;
    applyBg(); notify();
  };
  applyBg();

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { state.view = t.dataset.view; notify(); renderAll(); };
  });

  $('exportBtn').onclick = () => exportDesignSheet({ drawBack, drawSide, screenshot3D, designCode: designCode() });
  $('shareBtn').onclick = () => {
    syncURL();
    navigator.clipboard.writeText(location.href).then(() => {
      $('shareBtn').textContent = '链接已复制';
      setTimeout(() => $('shareBtn').textContent = '复制方案链接', 1500);
    });
  };

  subscribe(() => { /* notify 已在各处手动 renderAll，这里留作扩展 */ });
  renderAll();
}

window.addEventListener('resize', () => renderAll());
start();
