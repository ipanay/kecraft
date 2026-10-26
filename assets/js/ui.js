// ============================================
// 界面主控：面板绑定、视图切换、渲染调度
// ============================================

import { PHONES } from './data/phones.js';
import { MODULE_TYPES, CASE_COLORS, PETG_RULES, CASE_DEFAULTS } from './config.js';
import {
  state, subscribe, notify, restore, applyPhone, setDim, resetDims,
  addModule, removeSelectedModule, getSelectedModule, designCode, syncURL,
} from './state.js';
import { drawBack, drawSide, BackViewInteraction, safetyChecks } from './view2d.js';
import { init3D, rebuild3D, screenshot3D } from './view3d.js';
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
      const o = new Option(`${p.model}（${p.statusLabel}）`, p.id);
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

// ---------- 尺寸输入 ----------
function bindDim(key) {
  const input = $('dim_' + key);
  input.addEventListener('input', () => { setDim(key, input.value); renderAll(); });
  input.addEventListener('change', () => { input.value = state.current[key]; });
}
function syncDimInputs() {
  for (const key of ['w', 'h', 't', 'cornerR']) {
    const input = $('dim_' + key);
    input.value = state.current[key];
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
  $('verifyTitle').textContent = state.statusLabel;
  $('verifyText').textContent = state.status === 'verified'
    ? '此机型已实物验证，可直接下单定制。'
    : '此机型尺寸来自公开资料，提交后设计师会人工复核，实际以实测为准。';
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
