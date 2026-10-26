// ============================================
// 全局状态：唯一数据源，URL hash 是持久层
// 任何改动 → set() → 通知订阅者 → URL/localStorage 同步
// ============================================

import { PHONES } from './data/phones.js';
import { CASE_DEFAULTS, URL_KEYS } from './config.js';

let listeners = [];
let saveTimer = null;

function freshState() {
  const phone = PHONES[0];
  return {
    phoneId: phone.id,
    brand: phone.brand,
    model: phone.model,
    official: { w: phone.w, h: phone.h, t: phone.t, cornerR: phone.cornerR },
    current: { w: phone.w, h: phone.h, t: phone.t, cornerR: phone.cornerR },
    edited: { w: false, h: false, t: false, cornerR: false },
    source: phone.source,
    status: phone.status,
    statusLabel: phone.statusLabel,
    backT: CASE_DEFAULTS.backT,
    sideT: CASE_DEFAULTS.sideT,
    cornerStyle: 'round',           // round 圆角 / square 直角
    bottomOpen: true,               // 充电口端：true 开孔 / false 封闭
    buttonStyle: 'open',            // open 开放口 / cutout 挖孔
    color: '#2f3b47',
    note: '',
    modules: [],                    // {id,type,name,x,y,w,h,depth,round,color}
    selectedModuleId: null,
    view: '3d',                     // 3d / back / side —— 默认进 3D，选完机型就能看到手机
  };
}

export const state = freshState();

export function subscribe(fn) { listeners.push(fn); }
export function notify() {
  listeners.forEach(fn => fn(state));
  schedulePersist();
}

// ---- URL hash 序列化（方案 = 链接）----
export function toHash() {
  const k = URL_KEYS;
  const p = [
    `${k.phone}=${state.phoneId}`,
    `${k.w}=${state.current.w}`, `${k.h}=${state.current.h}`,
    `${k.t}=${state.current.t}`, `${k.r}=${state.current.cornerR}`,
    `${k.backT}=${state.backT}`, `${k.sideT}=${state.sideT}`,
    `${k.color}=${state.color.replace('#', '')}`,
  ];
  const edited = Object.entries(state.edited).filter(([, v]) => v).map(([key]) => key).join('');
  if (edited) p.push(`${k.edited}=${edited}`);
  if (state.modules.length) {
    p.push(`${k.modules}=` + encodeURIComponent(JSON.stringify(state.modules)));
  }
  return '#' + p.join('&');
}

export function syncURL() {
  history.replaceState(null, '', toHash());
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    syncURL();
    try { localStorage.setItem('kecraft-draft', JSON.stringify(state)); } catch (e) { /* 隐私模式忽略 */ }
    const el = document.getElementById('saveBadge');
    if (el) { el.textContent = '草稿已保存'; }
  }, 400);
}

// 从 URL 或本地草稿恢复
export function restore() {
  // 1) URL 优先
  if (location.hash.length > 2) {
    try { loadHash(location.hash); return true; } catch (e) { console.warn('URL 恢复失败', e); }
  }
  // 2) 本地草稿
  try {
    const raw = localStorage.getItem('kecraft-draft');
    if (raw) { Object.assign(state, JSON.parse(raw)); return true; }
  } catch (e) { /* 忽略 */ }
  return false;
}

function loadHash(hash) {
  const k = URL_KEYS;
  const q = new URLSearchParams(hash.slice(1));
  const id = q.get(k.phone);
  const phone = PHONES.find(p => p.id === id);
  if (phone) applyPhone(phone);
  const num = (key, cur) => { const v = parseFloat(q.get(key)); return isNaN(v) ? cur : v; };
  state.current.w = num(k.w, state.current.w);
  state.current.h = num(k.h, state.current.h);
  state.current.t = num(k.t, state.current.t);
  state.current.cornerR = num(k.r, state.current.cornerR);
  state.backT = num(k.backT, state.backT);
  state.sideT = num(k.sideT, state.sideT);
  const c = q.get(k.color);
  if (c && /^[0-9a-fA-F]{6}$/.test(c)) state.color = '#' + c;
  const e = q.get(k.edited);
  if (e) { for (const ch of e) if (ch in state.edited) state.edited[ch] = true; }
  const mods = q.get(k.modules);
  if (mods) {
    const arr = JSON.parse(decodeURIComponent(mods));
    if (Array.isArray(arr)) state.modules = arr;
  }
}

// ---- 切换机型：预填官方数据，保留已有模块 ----
export function applyPhone(phone) {
  state.phoneId = phone.id;
  state.brand = phone.brand;
  state.model = phone.model;
  state.official = { w: phone.w, h: phone.h, t: phone.t, cornerR: phone.cornerR };
  state.current = { w: phone.w, h: phone.h, t: phone.t, cornerR: phone.cornerR };
  state.edited = { w: false, h: false, t: false, cornerR: false };
  state.source = phone.source;
  state.status = phone.status;
  state.statusLabel = phone.statusLabel;
}

// 更新尺寸字段（客户手改 → 标记 edited）
export function setDim(key, value) {
  if (!(key in state.current)) return;
  const v = parseFloat(value);
  if (isNaN(v) || v <= 0) return;
  state.current[key] = v;
  state.edited[key] = Math.abs(v - state.official[key]) > 0.01;
  notify();
}

export function resetDims() {
  state.current = { ...state.official };
  state.edited = { w: false, h: false, t: false, cornerR: false };
  notify();
}

// ---- 模块操作 ----
let modSeq = 1;
export function addModule(typeDef) {
  const phone = state.current;
  const m = {
    id: 'mod' + (modSeq++) + '-' + Date.now().toString(36),
    type: typeDef.id,
    name: typeDef.name,
    w: typeDef.w, h: typeDef.h, depth: typeDef.depth, round: typeDef.round,
    color: typeDef.color,
    // 默认放在背板下半部居中
    x: (phone.w - typeDef.w) / 2,
    y: phone.h - typeDef.h - 24,
  };
  state.modules.push(m);
  state.selectedModuleId = m.id;
  notify();
  return m;
}

export function removeSelectedModule() {
  if (!state.selectedModuleId) return;
  state.modules = state.modules.filter(m => m.id !== state.selectedModuleId);
  state.selectedModuleId = null;
  notify();
}

export function updateModule(id, patch) {
  const m = state.modules.find(m => m.id === id);
  if (!m) return;
  Object.assign(m, patch);
  clampModule(m);
  notify();
}

// 模块不得越出背板（壳内壁范围）
export function clampModule(m) {
  const w = state.current.w, h = state.current.h;
  m.w = Math.max(5, Math.min(m.w, w));
  m.h = Math.max(5, Math.min(m.h, h));
  m.x = Math.max(0, Math.min(m.x, w - m.w));
  m.y = Math.max(0, Math.min(m.y, h - m.h));
  m.depth = Math.max(0, Math.min(m.depth, 20));
}

export function getSelectedModule() {
  return state.modules.find(m => m.id === state.selectedModuleId) || null;
}

// 方案编号：KC-日期-序号（会话内自增，仅示意）
export function designCode() {
  const d = new Date();
  const ds = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  if (!designCode.n) designCode.n = Math.floor(Math.random() * 90) + 10;
  return `KC-${ds}-${designCode.n}`;
}
