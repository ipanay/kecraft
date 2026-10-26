// ============================================
// 2D 正投影视图：背面尺寸图 / 侧边
// Canvas2D 实现：毫米网格 + 边缘标尺 + 可拖拽避让区
// 绘制函数独立导出，供设计图导出复用
// ============================================

import { state, updateModule, notify } from './state.js';
import { PETG_RULES } from './config.js';

const HANDLE = 5;          // 角柄半径 px
const SNAP = 0.5;          // 吸附 0.5mm
const PAD = 46;            // 画布内边距（留给标尺）

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 外壳圆角半径（直角造型 = 2mm 小圆角）
export function shellRadius() {
  return state.cornerStyle === 'square' ? 2 : state.current.cornerR + state.sideT;
}

function fitScale(cw, ch, wmm, hmm) {
  return Math.min((cw - PAD * 2) / wmm, (ch - PAD * 2) / hmm);
}

// ---------- 背面视图 ----------
// ctx 已按 devicePixelRatio 缩放；W/H 为 CSS 像素
export function drawBack(ctx, W, H, opts = {}) {
  const s = state;
  const caseW = s.current.w + s.sideT * 2;
  const caseH = s.current.h + s.sideT * 2;
  const scale = opts.scale || fitScale(W, H, caseW, caseH);
  const ox = (W - caseW * scale) / 2, oy = (H - caseH * scale) / 2;
  const X = mm => ox + mm * scale, Y = mm => oy + mm * scale;

  const outerR = shellRadius();
  const innerR = s.cornerStyle === 'square' ? 2 : s.current.cornerR;

  // 网格（10mm）
  if (opts.grid !== false) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 0; gx <= caseW + 0.1; gx += 10) { ctx.moveTo(X(gx), Y(0)); ctx.lineTo(X(gx), Y(caseH)); }
    for (let gy = 0; gy <= caseH + 0.1; gy += 10) { ctx.moveTo(X(0), Y(gy)); ctx.lineTo(X(caseW), Y(gy)); }
    ctx.stroke();
  }

  // 壳体外轮廓（虚线）
  ctx.strokeStyle = 'rgba(150,200,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 5]);
  rr(ctx, X(0), Y(0), caseW * scale, caseH * scale, outerR * scale);
  ctx.stroke();
  ctx.setLineDash([]);

  // 手机本体（实线，代表壳内壁）
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  rr(ctx, X(s.sideT), Y(s.sideT), s.current.w * scale, s.current.h * scale, innerR * scale);
  ctx.stroke();

  // 镜头区（示意）
  if (s.cameraZone) {
    const c = s.cameraZone;
    ctx.strokeStyle = '#e2b93b';
    ctx.fillStyle = 'rgba(226,185,59,0.10)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    rr(ctx, X(s.sideT + c.x), Y(s.sideT + c.y), c.w * scale, c.h * scale, 6 * scale);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e2b93b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('镜头区(示意)', X(s.sideT + c.x + c.w / 2), Y(s.sideT + c.y + c.h / 2) + 4);
  }

  // 避让区模块
  for (const m of s.modules) {
    const sel = m.id === s.selectedModuleId;
    const mx = X(s.sideT + m.x), my = Y(s.sideT + m.y);
    ctx.fillStyle = hexA(m.color, 0.16);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = sel ? 2 : 1.4;
    rr(ctx, mx, my, m.w * scale, m.h * scale, m.round * scale);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = m.color;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.name, mx + (m.w * scale) / 2, my + (m.h * scale) / 2 + 4);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = hexA(m.color, 0.8);
    ctx.fillText(`${m.w.toFixed(1)} × ${m.h.toFixed(1)}${m.depth ? ' · 深' + m.depth.toFixed(1) : ''}`,
      mx + (m.w * scale) / 2, my + (m.h * scale) / 2 + 18);

    if (sel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([4, 4]);
      rr(ctx, mx - 4, my - 4, m.w * scale + 8, m.h * scale + 8, (m.round + 2) * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      // 四角控制柄
      ctx.fillStyle = '#fff';
      for (const [hx, hy] of cornerPts(mx, my, m.w * scale, m.h * scale)) {
        ctx.fillRect(hx - HANDLE, hy - HANDLE, HANDLE * 2, HANDLE * 2);
      }
    }
  }

  // 标尺
  if (opts.rulers !== false) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    // 左：总高
    ctx.beginPath();
    ctx.moveTo(X(0) - 16, Y(0)); ctx.lineTo(X(0) - 16, Y(caseH));
    ctx.moveTo(X(0) - 20, Y(0)); ctx.lineTo(X(0) - 12, Y(0));
    ctx.moveTo(X(0) - 20, Y(caseH)); ctx.lineTo(X(0) - 12, Y(caseH));
    ctx.stroke();
    ctx.save();
    ctx.translate(X(0) - 22, Y(caseH / 2)); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText(caseH.toFixed(1) + ' mm', 0, 0);
    ctx.restore();
    // 上：总宽
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0) - 16); ctx.lineTo(X(caseW), Y(0) - 16);
    ctx.moveTo(X(0), Y(0) - 20); ctx.lineTo(X(0), Y(0) - 12);
    ctx.moveTo(X(caseW), Y(0) - 20); ctx.lineTo(X(caseW), Y(0) - 12);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(caseW.toFixed(1) + ' mm', X(caseW / 2), Y(0) - 24);
  }

  return { scale, ox, oy, caseW, caseH };
}

function cornerPts(x, y, w, h) {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 侧边视图 ----------
export function drawSide(ctx, W, H, opts = {}) {
  const s = state;
  const totalZ = s.backT + s.current.t + PETG_RULES.lip; // 总厚
  const viewW = totalZ + 6 + 14; // 预留模块深度标注空间
  const caseH = s.current.h + s.sideT * 2;
  const scale = opts.scale || fitScale(W, H, viewW, caseH);
  const ox = (W - viewW * scale) / 2, oy = (H - caseH * scale) / 2;
  const X = mm => ox + mm * scale, Y = mm => oy + mm * scale;

  const outerR = shellRadius();

  // 手机本体
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, X(s.backT), Y(s.sideT), s.current.t * scale, s.current.h * scale, Math.min(s.current.cornerR, s.current.t / 2) * scale);
  ctx.fill(); ctx.stroke();

  // 壳轮廓：背板 + 上下包边 + 前包边
  ctx.strokeStyle = 'rgba(150,200,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(s.sideT + outerR));
  ctx.lineTo(X(0), Y(caseH - s.sideT - outerR));
  ctx.quadraticCurveTo(X(0), Y(caseH - s.sideT), X(0 + Math.min(2, s.sideT)), Y(caseH - s.sideT));
  ctx.lineTo(X(totalZ), Y(caseH - s.sideT));
  ctx.lineTo(X(totalZ), Y(caseH - s.sideT - PETG_RULES.lip * scale / scale)); // 前包边（视觉）
  ctx.lineTo(X(totalZ), Y(caseH - s.sideT));
  ctx.stroke();

  // 背板厚度标注
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '10px sans-serif';
  ctx.beginPath();
  ctx.moveTo(X(0), Y(caseH) + 14); ctx.lineTo(X(s.backT), Y(caseH) + 14);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillText('背 ' + s.backT.toFixed(1), X(s.backT / 2), Y(caseH) + 26);

  // 总厚标注
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0) - 14); ctx.lineTo(X(totalZ), Y(0) - 14);
  ctx.stroke();
  ctx.fillText('总厚 ' + totalZ.toFixed(2) + ' mm', X(totalZ / 2), Y(0) - 20);

  // 选中模块的避让深度（虚线凸出）
  const sel = s.modules.find(m => m.id === s.selectedModuleId);
  if (sel && sel.depth > 0) {
    ctx.strokeStyle = sel.color;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(X(0 - sel.depth), Y(s.sideT + 8), sel.depth * scale, caseH - s.sideT * 2 - 16);
    ctx.setLineDash([]);
    ctx.fillStyle = sel.color;
    ctx.fillText('避让深 ' + sel.depth.toFixed(1), X(-sel.depth / 2), Y(s.sideT + 4));
  }
  return { scale, ox, oy };
}

// ---------- 交互（背面视图拖拽） ----------
export class BackViewInteraction {
  constructor(canvas) {
    this.canvas = canvas;
    this.tf = null;       // drawBack 返回的变换
    this.drag = null;     // {mode:'move'|'resize', mod, corner}
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    canvas.addEventListener('pointerup', () => this.onUp());
    canvas.addEventListener('pointerleave', () => this.onUp());
  }
  toMM(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    return { x: (px - this.tf.ox) / this.tf.scale - state.sideT, y: (py - this.tf.oy) / this.tf.scale - state.sideT };
  }
  snap(v) { return Math.round(v / SNAP) * SNAP; }

  hit(e) {
    if (!this.tf) return null;
    const p = this.toMM(e);
    // 优先命中选中模块的角柄
    for (const m of state.modules) {
      if (m.id !== state.selectedModuleId) continue;
      const corners = [[m.x, m.y, 'nw'], [m.x + m.w, m.y, 'ne'], [m.x, m.y + m.h, 'sw'], [m.x + m.w, m.y + m.h, 'se']];
      for (const [cx, cy, pos] of corners) {
        if (Math.abs(p.x - cx) * this.tf.scale < 10 && Math.abs(p.y - cy) * this.tf.scale < 10) {
          return { mode: 'resize', mod: m, corner: pos };
        }
      }
    }
    // 再命中模块本体（后画的优先）
    for (let i = state.modules.length - 1; i >= 0; i--) {
      const m = state.modules[i];
      if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
        return { mode: 'move', mod: m };
      }
    }
    return null;
  }

  onDown(e) {
    if (state.view !== 'back') return;
    const hit = this.hit(e);
    if (!hit) return;
    this.drag = hit;
    state.selectedModuleId = hit.mod.id;
    this.canvas.setPointerCapture(e.pointerId);
    this.dragStart = this.toMM(e);
    this.dragOrig = { x: hit.mod.x, y: hit.mod.y, w: hit.mod.w, h: hit.mod.h };
    notify();
  }

  onMove(e) {
    if (!this.drag) {
      // 悬停光标
      if (this.tf && state.view === 'back') {
        const hit = this.hit(e);
        this.canvas.style.cursor = hit ? (hit.mode === 'resize' ? 'nwse-resize' : 'move') : 'default';
      }
      return;
    }
    const p = this.toMM(e);
    const m = this.drag.mod, o = this.dragOrig;
    if (this.drag.mode === 'move') {
      m.x = this.snap(o.x + (p.x - this.dragStart.x));
      m.y = this.snap(o.y + (p.y - this.dragStart.y));
    } else {
      const c = this.drag.corner;
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (c.includes('w')) x0 = this.snap(p.x);
      if (c.includes('e')) x1 = this.snap(p.x);
      if (c.includes('n')) y0 = this.snap(p.y);
      if (c.includes('s')) y1 = this.snap(p.y);
      m.x = Math.min(x0, x1); m.y = Math.min(y0, y1);
      m.w = Math.max(5, Math.abs(x1 - x0));
      m.h = Math.max(5, Math.abs(y1 - y0));
    }
    updateModule(m.id, {});   // clamp + notify
    this.renderHook && this.renderHook();
  }

  onUp() { this.drag = null; }
}

// ---------- 打印安全检查 ----------
export function safetyChecks() {
  const s = state;
  const out = [];
  for (const m of s.modules) {
    // 距壳内壁（手机边缘）
    const dEdge = Math.min(m.x, s.current.w - m.x - m.w, m.y, s.current.h - m.y - m.h);
    out.push({
      ok: dEdge >= PETG_RULES.minSideWall,
      text: `${m.name} 距壳边 ${dEdge.toFixed(1)} mm（需 ≥ ${PETG_RULES.minSideWall}）`,
    });
    // 距镜头区
    if (s.cameraZone) {
      const c = s.cameraZone;
      const dx = Math.max(c.x - (m.x + m.w), m.x - (c.x + c.w), 0);
      const dy = Math.max(c.y - (m.y + m.h), m.y - (c.y + c.h), 0);
      const d = Math.hypot(dx, dy);
      out.push({
        ok: d >= PETG_RULES.lensClearance,
        text: `${m.name} 距镜头区 ${d.toFixed(1)} mm（需 ≥ ${PETG_RULES.lensClearance}）`,
      });
    }
  }
  return out;
}
