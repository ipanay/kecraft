// ============================================
// 设计图导出：消费者确认用（Canvas 合成长图）
// 布局：顶部品牌/编号 → 背面尺寸图 + 侧视图 → 参数摘要 → 免责行
// ============================================

import { state } from './state.js';
import { PETG_RULES } from './config.js';
import { PHONES } from './data/phones.js';

export function exportDesignSheet({ drawBack, drawSide, screenshot3D, designCode }) {
  const W = 1080, H = 1500;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // 背景
  ctx.fillStyle = '#101318';
  ctx.fillRect(0, 0, W, H);

  // 品牌行
  ctx.fillStyle = '#e8eaf0';
  ctx.font = '600 34px sans-serif';
  ctx.fillText('KECRAFT', 48, 72);
  ctx.fillStyle = '#8a93a3';
  ctx.font = '16px sans-serif';
  ctx.fillText('手机壳定制方案 · 消费者确认用', 48, 100);
  ctx.textAlign = 'right';
  ctx.fillText(designCode, W - 48, 72);
  const d = new Date();
  ctx.fillText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, W - 48, 100);
  ctx.textAlign = 'left';

  // 分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.moveTo(48, 124); ctx.lineTo(W - 48, 124); ctx.stroke();

  // 3D 截图（若当前在 3D 视图则有内容）
  let y = 150;
  const shot = screenshot3D ? screenshot3D() : null;
  if (shot) {
    const img = new Image();
    // 异步加载后重绘一次；首版直接同步画 2D，3D 截图可选
  }

  // 背面尺寸图（复用 2D 绘制）
  ctx.fillStyle = '#8a93a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('背面尺寸图（mm）', 48, y + 12);
  const box1 = { x: 48, y: y + 28, w: 560, h: 700 };
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(box1.x, box1.y, box1.w, box1.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(box1.x, box1.y, box1.w, box1.h);
  ctx.save();
  ctx.translate(box1.x, box1.y);
  ctx.beginPath(); ctx.rect(0, 0, box1.w, box1.h); ctx.clip();
  drawBack(ctx, box1.w, box1.h, { grid: true, rulers: true });
  ctx.restore();

  // 侧视图
  ctx.fillStyle = '#8a93a3';
  ctx.fillText('侧视图（mm）', 656, y + 12);
  const box2 = { x: 656, y: y + 28, w: 376, h: 340 };
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(box2.x, box2.y, box2.w, box2.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(box2.x, box2.y, box2.w, box2.h);
  ctx.save();
  ctx.translate(box2.x, box2.y);
  ctx.beginPath(); ctx.rect(0, 0, box2.w, box2.h); ctx.clip();
  drawSide(ctx, box2.w, box2.h, {});
  ctx.restore();

  // 参数摘要
  const rows = [
    ['机型', `${state.brand} ${state.model}`],
    ['机身 长×宽×厚', `${state.current.h} × ${state.current.w} × ${state.current.t} mm`],
    ['壳厚 背面 / 四周', `${state.backT.toFixed(1)} / ${state.sideT.toFixed(1)} mm`],
    ['壳角造型', state.cornerStyle === 'round' ? `圆角 R${state.current.cornerR}` : '直角'],
    ['充电口端', state.bottomOpen ? '开孔' : '封闭'],
    ['按键开孔', state.buttonStyle === 'open' ? '开放口' : '挖孔'],
    ['避让区数量', String(state.modules.length)],
    ['颜色', state.color],
    ['备注', state.note || '—'],
  ];
  let ry = 560;
  ctx.font = '17px sans-serif';
  for (const [k, v] of rows) {
    ctx.fillStyle = '#8a93a3'; ctx.fillText(k, 656, ry);
    ctx.fillStyle = '#e8eaf0'; ctx.fillText(v, 656 + 150, ry);
    ry += 34;
  }

  // 避让区明细
  y = 910;
  ctx.fillStyle = '#8a93a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('避让区明细', 48, y);
  ry = y + 34;
  ctx.font = '16px sans-serif';
  if (!state.modules.length) {
    ctx.fillStyle = '#5c6572';
    ctx.fillText('无', 48, ry);
  } else {
    for (const m of state.modules) {
      ctx.fillStyle = '#e8eaf0';
      ctx.fillText(`${m.name}　距左 ${m.x.toFixed(1)} · 距顶 ${m.y.toFixed(1)} · ${m.w.toFixed(1)}×${m.h.toFixed(1)}${m.depth ? ' · 深 ' + m.depth.toFixed(1) : ''} mm`, 48, ry);
      ry += 30;
    }
  }

  // 免责行
  ctx.fillStyle = '#5c6572';
  ctx.font = '14px sans-serif';
  ctx.fillText('本图所示为设计示意，最终以设计师建模复核为准。尺寸为参考值，不作为生产依据。', 48, H - 60);
  ctx.fillText('kecraft.com', 48, H - 36);

  // 下载
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = `${designCode}.png`;
  a.click();
}
