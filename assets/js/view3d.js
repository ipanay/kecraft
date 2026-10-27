// ============================================
// 3D 预览：three.js
// 手机本体（圆角盒）+ 壳（背板 + 包边）+ 避让区（半透明凸块）
// 只做展示确认，不做几何布尔
// ============================================

import * as THREE from 'three';
import { OrbitControls } from '../../libs/OrbitControls.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { RoomEnvironment } from '../../libs/RoomEnvironment.js';
import { state } from './state.js';
import { PETG_RULES } from './config.js';
import { PHONES } from './data/phones.js';
import { shellRadius, rr } from './view2d.js';

let renderer, scene, camera, controls, root;
let phoneGroup, caseGroup, modGroup;
let inited = false;
let lastFitKey = '';
let containerEl = null;

// 屏幕壁纸：程序化生成，不加载任何图片文件
function makeScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 512);
  grad.addColorStop(0, '#2f6fd8');
  grad.addColorStop(0.45, '#4da3e8');
  grad.addColorStop(1, '#123252');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  // 一点光斑，避免看起来是纯色死板
  const r = g.createRadialGradient(200, 120, 10, 200, 120, 220);
  r.addColorStop(0, 'rgba(120,200,255,0.45)');
  r.addColorStop(1, 'rgba(120,200,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 真实屏幕图贴图：cover 式居中裁剪（不拉伸变形），按机型 screenImage 字段加载
const screenTexCache = {};
let currentScreenImg = null;                 // 当前机型用的壁纸 URL（加载完成后判断是否需要重建）
function applyCover(tex, screenAspect) {
  const img = tex.image;
  if (!img || !img.width) return;
  const imgAspect = img.width / img.height;
  if (imgAspect > screenAspect) {          // 图更宽 → 裁左右
    tex.repeat.set(screenAspect / imgAspect, 1);
    tex.offset.set((1 - screenAspect / imgAspect) / 2, 0);
  } else {                                  // 图更高 → 裁上下
    tex.repeat.set(1, imgAspect / screenAspect);
    tex.offset.set(0, (1 - imgAspect / screenAspect) / 2);
  }
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
}
function getScreenTexture(imgUrl, screenAspect) {
  if (!imgUrl) return makeScreenTexture();
  currentScreenImg = imgUrl;
  let entry = screenTexCache[imgUrl];
  if (!entry) entry = screenTexCache[imgUrl] = { tex: null, aspect: screenAspect, loading: false };
  if (entry.tex) {                          // 已加载完成：直接用缓存贴图
    if (entry.aspect !== screenAspect) { entry.aspect = screenAspect; applyCover(entry.tex, screenAspect); }
    return entry.tex;
  }
  if (!entry.loading) {                     // 首次：后台下载，下载完自动重建一次屏幕
    entry.loading = true;
    new THREE.TextureLoader().load(imgUrl, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      entry.tex = t;
      applyCover(t, entry.aspect);
      if (currentScreenImg === imgUrl) rebuild3D();   // 图到了且还在看这台机型 → 自动换上，不用手动刷新
    });
  }
  return makeScreenTexture();               // 下载中：先用程序化渐变占位
}

function shapeFromRR(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// 以 (cx,cy) 为中心的圆角矩形路径——用于壳背板上的摄像头挖孔
function rrPath(cx, cy, w, h, r) {
  const s = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  const rr2 = Math.max(0.05, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  s.moveTo(x + rr2, y);
  s.lineTo(x + w - rr2, y);
  s.absarc(x + w - rr2, y + rr2, rr2, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - rr2);
  s.absarc(x + w - rr2, y + h - rr2, rr2, 0, Math.PI / 2, false);
  s.lineTo(x + rr2, y + h);
  s.absarc(x + rr2, y + h - rr2, rr2, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + rr2);
  s.absarc(x + rr2, y + rr2, rr2, Math.PI, Math.PI * 1.5, false);
  return s;
}

// 摄像头模组在 3D 世界里的中心坐标（机型数据以背面视角左上角为原点、y 向下）
function cameraSlabPos(cm, w, h) {
  return { x: w / 2 - cm.x - cm.w / 2, y: h / 2 - cm.y - cm.h / 2 };
}

function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  g.computeVertexNormals();
  return g;
}

// 带开口的环形轮廓（正确版）：环带被开口切成若干段，每段一条闭合路径
// 闭合路径 = 外圈弧段(顺时针) + 开口处径向切入 + 内圈弧段(逆时针返回) + 径向切出
// left/right 开口用"距顶部 mm"区间，bottom 开口用世界 x 区间
// innerDelta：内壁与机身的间隙（包边 0.6 = 包在机身外；顶缘 -0.8 = 抠进屏幕边缘上方）
// rI：内圈圆角半径
function rimProfile(w, h, sideT, rO, opts, innerDelta = 0.6, rI = 1) {
  const W2o = (w + 2 * sideT) / 2, H2o = (h + 2 * sideT) / 2;
  const W2i = (w + innerDelta) / 2, H2i = (h + innerDelta) / 2;
  rO = Math.min(rO, W2o - 0.5, H2o - 0.5);
  rI = Math.max(0.4, Math.min(rI, W2i - 0.5, H2i - 0.5));

  // 周界段表（顺时针），外/内圈共用同一拓扑，只是尺寸不同
  const segs = (W2, H2, r) => [
    { t: 'L', a: [-W2 + r, H2], b: [W2 - r, H2] },                                  // 0 顶边
    { t: 'A', c: [W2 - r, H2 - r], a0: Math.PI / 2, a1: 0 },                        // 1 右上角
    { t: 'L', a: [W2, H2 - r], b: [W2, -(H2 - r)] },                                // 2 右壁
    { t: 'A', c: [W2 - r, -(H2 - r)], a0: 0, a1: -Math.PI / 2 },                    // 3 右下角
    { t: 'L', a: [W2 - r, -H2], b: [-(W2 - r), -H2] },                              // 4 底边
    { t: 'A', c: [-(W2 - r), -(H2 - r)], a0: -Math.PI / 2, a1: -Math.PI },          // 5 左下角
    { t: 'L', a: [-W2, -(H2 - r)], b: [-W2, H2 - r] },                              // 6 左壁
    { t: 'A', c: [-(W2 - r), H2 - r], a0: Math.PI, a1: Math.PI / 2 },               // 7 左上角
  ];
  const SO = segs(W2o, H2o, rO), SI = segs(W2i, H2i, rI);
  const segLen = s => s.t === 'L'
    ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    : Math.abs(s.a0 - s.a1) * (s.c ? rO : rO);   // 弧长用 rO 近似（仅用于排序）
  const cum = []; let acc = 0;
  for (const s of SO) { cum.push(acc); acc += segLen(s); }

  // 开口边界点：每条边两个切口，side 决定所在壁，v 是世界坐标
  const cuts = [];
  if (opts.right) {
    cuts.push({ seg: 2, v: h / 2 - opts.right[0] });   // 右壁自上而下，先遇开口上沿
    cuts.push({ seg: 2, v: h / 2 - opts.right[1] });
  }
  for (const [top, bot] of (opts.left || [])) {
    cuts.push({ seg: 6, v: h / 2 - bot });             // 左壁自下而上，先遇开口下沿
    cuts.push({ seg: 6, v: h / 2 - top });
  }
  if (opts.bottom) {
    const half = Math.min(18, w / 2 - 8);
    cuts.push({ seg: 4, v: half });                    // 底边自右向左
    cuts.push({ seg: 4, v: -half });
  }
  if (!cuts.length) return null;

  // 切口在外/内圈上的具体坐标 + 沿外圈顺时针的累计位置（用于排序）+ 段内参数（0~1，用于判断走向）
  const lenO = SO.map(segLen);
  for (const c of cuts) {
    const so = SO[c.seg];
    if (c.seg === 2) { c.o = [W2o, c.v]; c.i = [W2i, c.v]; }
    else if (c.seg === 6) { c.o = [-W2o, c.v]; c.i = [-W2i, c.v]; }
    else { c.o = [c.v, -H2o]; c.i = [c.v, -H2i]; }
    const d = Math.hypot(c.o[0] - so.a[0], c.o[1] - so.a[1]);
    c.pos = cum[c.seg] + d;
    c.t = d / lenO[c.seg];
  }
  cuts.sort((p, q) => p.pos - q.pos);

  const arc = (s, sh, r, rev) => {                            // 整段圆弧
    const [a0, a1] = rev ? [s.a1, s.a0] : [s.a0, s.a1];
    sh.absarc(s.c[0], s.c[1], r, a0, a1, !rev);
  };

  const shapes = [];
  // 环带段：第 j 段从 cuts[j] 的"出口沿"到 cuts[j+1] 的"入口沿"（cuts 两两成对，奇偶交替）
  for (let j = 1; j < cuts.length; j += 2) {
    const A = cuts[j], B = cuts[(j + 1) % cuts.length];
    const sh = new THREE.Shape();
    sh.moveTo(A.o[0], A.o[1]);
    // 外圈 A → B（顺时针）。同段首步：B 在 A 前方 = 短线直连；否则走满本段，绕回后到 B 即收
    let seg = A.seg, first = true;
    while (true) {
      if (seg === B.seg && (first ? B.t > A.t : true)) { sh.lineTo(B.o[0], B.o[1]); break; }
      const s = SO[seg];
      if (s.t === 'L') sh.lineTo(s.b[0], s.b[1]);
      else arc(s, sh, rO, false);
      first = false;
      seg = (seg + 1) % SO.length;
    }
    sh.lineTo(B.i[0], B.i[1]);               // 径向切入
    // 内圈 B → A（逆时针返回）。同段首步：A 在 B 后方 = 短线直连；否则走满本段，绕回后到 A 即收
    seg = B.seg; first = true;
    while (true) {
      if (seg === A.seg && (first ? A.t < B.t : true)) { sh.lineTo(A.i[0], A.i[1]); break; }
      const s = SI[seg];
      if (s.t === 'L') sh.lineTo(s.a[0], s.a[1]);
      else arc(s, sh, rI, true);
      first = false;
      seg = (seg - 1 + SI.length) % SI.length;
    }
    sh.closePath();                          // 径向切出 + 闭合
    shapes.push(sh);
  }
  return shapes;
}

// 圆角矩形屏幕面片：ShapeGeometry 的 UV 是原始坐标，需重排成 0~1 才能正确贴图
function roundedPlane(sw, sh, r) {
  const geo = new THREE.ShapeGeometry(shapeFromRR(sw, sh, Math.max(0.5, Math.min(r, sw / 2 - 0.1, sh / 2 - 0.1))), 24);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + sw / 2) / sw, (pos.getY(i) + sh / 2) / sh);
  }
  uv.needsUpdate = true;
  return geo;
}

// 苹果 logo 贴图：canvas 矢量绘制（FontAwesome apple 路径，viewBox 384x512）
function makeAppleLogoTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 300;
  const g = c.getContext('2d');
  const p = new Path2D('M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z');
  const sc = Math.min(256 / 384, 300 / 512);
  g.save();
  g.translate((256 - 384 * sc) / 2, (300 - 512 * sc) / 2);
  g.scale(sc, sc);
  g.fillStyle = '#23272f';
  g.fill(p);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 背面 logo：属于手机本体，贴在手机背板上；套了壳会被壳盖住 → 由 body 逻辑按壳状态隐藏
function buildPhoneLogo(w, h, t, visible = true) {
  const planeH = h * 0.16;                     // logo 高约机身 16%
  const planeW = planeH * 256 / 300;
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeH),
    new THREE.MeshStandardMaterial({
      map: makeAppleLogoTexture(), transparent: true,
      roughness: 0.25, metalness: 0.7,
    })
  );
  logo.name = 'phone-logo';
  logo.rotation.y = Math.PI;                   // 朝 -z（背面朝外）
  logo.position.set(0, 0, -t / 2 - 0.08);      // 手机背板外表面
  logo.visible = visible;                      // 套壳时被壳盖住 → 不显示
  phoneGroup.add(logo);
}

// 裸机细节：侧按键 / 扬声器 / 充电口 / 话筒 / 听筒（视觉示意，位置按真机目视比例）
function buildPhoneHardware(w, h, t) {
  const g = new THREE.Group();
  g.name = 'phone-hardware';
  const matBtn = new THREE.MeshStandardMaterial({ color: 0x76828d, roughness: 0.3, metalness: 0.8 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.45, metalness: 0.35 });
  const addBox = (sx, sy, sz, x, y, z, mat, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.name = name;
    g.add(m);
  };
  // 左侧：静音拨片 / 音量+ / 音量-（凸出机身 0.6mm，距壳外表面凹 0.6mm，挖孔时可见）
  addBox(1.6, 9, 1.8, -w / 2 + 0.2, h / 2 - 25, 0, matBtn, 'key-mute');
  addBox(1.6, 14, 1.8, -w / 2 + 0.2, h / 2 - 40, 0, matBtn, 'key-volup');
  addBox(1.6, 14, 1.8, -w / 2 + 0.2, h / 2 - 58, 0, matBtn, 'key-voldn');
  // 右侧：电源键
  addBox(1.6, 24, 1.8, w / 2 - 0.2, h / 2 - 45, 0, matBtn, 'key-power');
  // 底部按真机布局：中间 USB-C 胶囊槽 + 两侧圆孔（左 4+2 / 右 2+4 共 12 孔），贴面深色凹槽
  const portShape = new THREE.Shape();               // USB-C 胶囊：长 10、宽 2.8，长轴沿 x
  const pHW = 1.4, pS = 5 - pHW;
  portShape.moveTo(-pS, -pHW);
  portShape.lineTo(pS, -pHW);
  portShape.absarc(pS, 0, pHW, -Math.PI / 2, Math.PI / 2, true);
  portShape.lineTo(-pS, pHW);
  portShape.absarc(-pS, 0, pHW, Math.PI / 2, Math.PI * 1.5, true);
  portShape.closePath();
  const portGeom = new THREE.ExtrudeGeometry(portShape, { depth: 0.15, bevelEnabled: false, curveSegments: 16 });
  portGeom.rotateX(Math.PI / 2);                     // 宽度 -> 世界 z，厚度沿 y
  const port = new THREE.Mesh(portGeom, matDark);
  port.position.set(0, -h / 2, 0);
  port.name = 'port-lightning';
  g.add(port);
  const holeGeom = new THREE.CylinderGeometry(0.85, 0.85, 0.15, 20);   // Ø1.7 圆孔
  const holeXs = [-23.5, -20.9, -18.3, -15.7, -11.5, -8.9, 8.9, 11.5, 15.7, 18.3, 20.9, 23.5];
  holeXs.forEach((x, i) => {
    const m = new THREE.Mesh(holeGeom, matDark);
    m.position.set(x, -h / 2 - 0.075, 0);
    m.name = 'port-hole-' + i;
    g.add(m);
  });
  // 听筒：顶部正面细缝
  addBox(18, 1.0, 0.12, 0, h / 2 - 2.3, t / 2 + 0.08, matDark, 'port-earpiece');
  phoneGroup.add(g);
}

// 挖孔（cutout）：胶囊形按键孔，真正穿透壁厚，露出按键
// ExtrudeGeometry 的轮廓内孔只能沿挤出方向（前后）穿透，做不了径向通孔——必须走 CSG 布尔减
function stadiumHole(cx, cy, halfW, halfL) {
  const s = new THREE.Shape();
  const straight = halfL - halfW;                          // 直段半长（半圆帽半径 = halfW）
  s.moveTo(cx - halfW, cy - straight);
  s.lineTo(cx - halfW, cy + straight);
  s.absarc(cx, cy + straight, halfW, Math.PI, 0, true);    // 顶帽
  s.lineTo(cx + halfW, cy - straight);
  s.absarc(cx, cy - straight, halfW, 0, Math.PI, true);    // 底帽
  s.closePath();
  return s;
}

const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = false;

// 胶囊减具：截面为胶囊（宽 bw 沿机身厚度 z 向、长 2*halfLen 沿机身长度 y 向），沿径向 x 打穿
function capsulePrismGeometry(bw, halfLen, cx, cy, prismLen) {
  const g = new THREE.ExtrudeGeometry(stadiumHole(0, 0, bw / 2, halfLen),
    { depth: prismLen, bevelEnabled: false, curveSegments: 12 });
  g.rotateY(Math.PI / 2);                    // 挤出轴 -> 世界 x（挤出范围 0..prismLen）
  g.translate(cx - prismLen / 2, cy, 0);     // 居中到壁厚中线 cx
  return g;
}

// 胶囊减具（底部）：截面为胶囊（长 2*halfLen 沿机身宽度 x 向、宽 bw 沿厚度 z 向），沿径向 y 打穿底壁
function capsulePrismGeometryY(bw, halfLen, cx, cy, prismLen) {
  const g = new THREE.ExtrudeGeometry(stadiumHole(0, 0, bw / 2, halfLen),
    { depth: prismLen, bevelEnabled: false, curveSegments: 12 });
  g.rotateZ(Math.PI / 2);                    // 长轴 y -> x
  g.rotateX(Math.PI / 2);                    // 宽 x -> z，挤出轴 z -> -y
  g.translate(cx, cy + prismLen / 2, 0);     // 居中到底壁中线 cy
  return g;
}

function mergeGeoms(geoms) {
  const total = geoms.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// 从壁体几何（世界坐标）上减去 按键胶囊柱 + 底部充电口/扬声器胶囊柱，返回新几何
function subtractCutouts(geom, w, h, sideT) {
  const bw = Math.min(3.8, sideT + 2.2);              // 孔宽：沿机身厚度向（开大，壁太薄时收窄）
  const prismLen = sideT + 4;
  const bandMid = w / 2 + (sideT + 0.3) / 2;          // 壁厚中线到机身中线
  // 左侧一个整体大胶囊孔（静音+音量+音量− 全覆盖），右侧电源一个
  const keys = [                                       // [左右侧, y 中心(世界), 胶囊全长]
    [-1, h / 2 - 43, 48],                              // 静音(距顶20.5) ~ 音量−(距顶65) 整体
    [ 1, h / 2 - 45, 28],                              // 电源
  ];
  const prisms = keys.map(([side, cy, len]) =>
    capsulePrismGeometry(bw, len / 2, side * bandMid, cy, prismLen));
  // 底部：一个整体大胶囊孔（覆盖 扬声器 + 充电口 + 话筒 全部底部件）
  const bandMidY = h / 2 + (sideT + 0.3) / 2;
  prisms.push(capsulePrismGeometryY(bw, 18.5, -2.5, -bandMidY, prismLen));  // 中心 x=-2.5，全长 37
  const target = new Brush(geom);
  const tool = new Brush(mergeGeoms(prisms));
  target.updateMatrixWorld();
  tool.updateMatrixWorld();
  const res = csgEvaluator.evaluate(target, tool, SUBTRACTION);
  geom.dispose();
  prisms.forEach(g => g.dispose());
  return res.geometry;
}

// 摄像头模组（视觉示意）：等效"壳背开孔、模组从孔中露出"
// 坐标换算：机型数据以"模组左上角"为原点、y 向下；3D 以中心为原点、y 向上
function buildCameraModule(meta, w, h, t, backT, caseOn = true) {
  const cm = meta && meta.cameraModule;
  if (!cm || !(cm.lenses || []).length) return;
  const g = new THREE.Group();
  g.name = 'phone-camera-module';

  // 模组长在手机背板上：有壳时以壳背外表面为基准（相当于从壳的摄像头孔里露出），裸机时贴手机背
  const zSlab = -t / 2 - (caseOn ? backT : 0);

  // 模组本体：圆角方块浮出壳背
  const slab = new THREE.Mesh(
    extrude(shapeFromRR(cm.w, cm.h, Math.min(cm.round, cm.w / 2 - 0.5, cm.h / 2 - 0.5)), cm.depth),
    new THREE.MeshStandardMaterial({ color: 0x3b424c, roughness: 0.3, metalness: 0.65 })
  );
  slab.name = 'cam-slab';
  // 模组颜色跟随机身提亮（远峰蓝观感）
  slab.material.color.set(0xa3b4c4);
  slab.material.roughness = 0.26;
  g.add(slab);

  // 模组内局部坐标 -> 3D 世界坐标
  // 注意镜像：机型数据 (x,y) 以"背面视角左上角"为原点，背面视角的世界 x 与 3D 相反
  const slabX = w / 2 - cm.x - cm.w / 2;
  const slabY = h / 2 - cm.y - cm.h / 2;
  slab.position.set(slabX, slabY, zSlab - cm.depth);
  const to3 = (px, py) => ({ x: slabX - cm.w / 2 + px, y: slabY + cm.h / 2 - py });

  const matRing = new THREE.MeshStandardMaterial({ color: 0x1d2129, roughness: 0.35, metalness: 0.85 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.08, metalness: 0.4 });
  for (const L of cm.lenses) {
    const p = to3(L.x, L.y);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(L.r, L.r, 1.1, 40), matRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, p.y, zSlab - 0.55);
    ring.name = 'cam-lens-ring';
    g.add(ring);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(L.r * 0.72, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      matGlass
    );
    glass.rotation.x = -Math.PI / 2;           // 凸面朝外（-z）
    glass.position.set(p.x, p.y, zSlab - 1.0);
    glass.name = 'cam-lens-glass';
    g.add(glass);
  }

  if (cm.flash) {
    const p = to3(cm.flash.x, cm.flash.y);
    const f = new THREE.Mesh(
      new THREE.CylinderGeometry(cm.flash.r, cm.flash.r, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: 0xf3eeda, roughness: 0.5, metalness: 0.1 })
    );
    f.rotation.x = Math.PI / 2;
    f.position.set(p.x, p.y, zSlab - 0.25);
    f.name = 'cam-flash';
    g.add(f);
  }

  if (cm.lidar) {
    const p = to3(cm.lidar.x, cm.lidar.y);
    const li = new THREE.Mesh(
      new THREE.CylinderGeometry(cm.lidar.r, cm.lidar.r, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0x090c12, roughness: 0.15, metalness: 0.6 })
    );
    li.rotation.x = Math.PI / 2;
    li.position.set(p.x, p.y, zSlab - 0.22);
    li.name = 'cam-lidar';
    g.add(li);
  }

  phoneGroup.add(g);
}

export function init3D(container) {
  containerEl = container;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 1, 3000);
  camera.position.set(90, 60, 300);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // 环境贴图：金属材质没有 envMap 会渲染成近黑，必须给 PBR 提供 IBK 反射源
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(150, 200, 250);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
  rim.position.set(-180, -80, -160);
  scene.add(rim);

  root = new THREE.Group();
  scene.add(root);
  phoneGroup = new THREE.Group();
  caseGroup = new THREE.Group();
  modGroup = new THREE.Group();
  root.add(phoneGroup, caseGroup, modGroup);

  inited = true;
  resize3D(container);
  new ResizeObserver(() => resize3D(container)).observe(container);
  animate();
  // 调试探针：控制台/CDP 可用 window.__kc 检查场景与相机
  window.__kc = {
    get scene() { return scene; }, get root() { return root; },
    get camera() { return camera; }, get phoneGroup() { return phoneGroup; },
    get caseGroup() { return caseGroup; }, get modGroup() { return modGroup; },
    THREE,   // 调试用：射线检测等
  };
}

function resize3D(container) {
  if (!inited) return;
  const w = container.clientWidth || 600, h = container.clientHeight || 500;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  if (!inited) return;
  controls.update();
  renderer.render(scene, camera);
}

function clearGroup(g) {
  while (g.children.length) {
    const o = g.children.pop();
    o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
  }
}

// 坐标映射：2D 的 (x,y) 以手机左上角为原点、y 向下；3D 以中心为原点、y 向上
function build() {
  if (!inited) return;
  clearGroup(phoneGroup); clearGroup(caseGroup); clearGroup(modGroup);
  const s = state;
  const { w, h, t } = s.current;
  // 两个显示开关：手机预览（手机本体显隐）/ 壳预览（壳体显隐，关=只看裸机）
  const showCase = s.showCase !== false;
  const showPhone = s.showPhone !== false;
  phoneGroup.visible = showPhone;
  caseGroup.visible = showCase;
  modGroup.visible = showCase;
  const innerR = Math.min(s.cornerStyle === 'square' ? 2 : s.current.cornerR, w / 2 - 1, h / 2 - 1);
  const outerR = Math.min(shellRadius(), (w + 2 * s.sideT) / 2 - 1, (h + 2 * s.sideT) / 2 - 1);

  // 手机本体：中心在原点，屏幕朝 +z
  const body = new THREE.Mesh(
    extrude(shapeFromRR(w, h, innerR), t),
    new THREE.MeshStandardMaterial({ color: 0xb6c5d3, roughness: 0.28, metalness: 0.7 })
  );
  body.name = 'phone-body';
  body.position.z = -t / 2;
  phoneGroup.add(body);
  const phoneMeta = PHONES.find(p => p.id === s.phoneId);
  const screenAspect = (w - 3.6) / (h - 3.6);
  const hasReal = !!(phoneMeta && phoneMeta.screenImage);   // 真实壁纸自带亮度，别再叠加发光洗白
  const screen = new THREE.Mesh(
    roundedPlane(w - 3.6, h - 3.6, innerR - 1.8),
    new THREE.MeshStandardMaterial({
      map: getScreenTexture(phoneMeta && phoneMeta.screenImage, screenAspect),
      emissive: hasReal ? 0x000000 : 0x9fc8ee,
      emissiveIntensity: hasReal ? 0 : 0.5,
      roughness: 0.18, metalness: 0.1,
    })
  );
  screen.name = 'phone-screen';
  screen.position.z = t / 2 + 0.05;
  phoneGroup.add(screen);

  // 摄像头模组 + 背面 logo + 裸机细节（背面视觉示意）
  buildCameraModule(phoneMeta, w, h, t, s.backT, showCase);
  // logo 属于手机本体：套壳后被壳盖住 → 有壳时不显示（裸机才显示）
  if (phoneMeta && phoneMeta.brand === 'Apple') buildPhoneLogo(w, h, t, !showCase);
  buildPhoneHardware(w, h, t);

  // 壳背板（z: -t/2-backT .. -t/2）
  // 摄像头位置挖穿一个圆角孔：模组在孔里；手机预览关掉时孔是空的，看得见壳内部
  const backShape = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
  const camMeta = phoneMeta && phoneMeta.cameraModule;
  if (camMeta && (camMeta.lenses || []).length) {
    const cp = cameraSlabPos(camMeta, w, h);
    const gap = 0.6;                                   // 孔比模组大 0.6mm/边，留装配缝
    const hr = Math.min(camMeta.round + gap, camMeta.w / 2 - 0.3, camMeta.h / 2 - 0.3);
    backShape.holes.push(rrPath(cp.x, cp.y, camMeta.w + gap * 2, camMeta.h + gap * 2, hr));
  }
  const back = new THREE.Mesh(
    extrude(backShape, s.backT),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 })
  );
  back.name = 'case-back';
  back.position.z = -t / 2 - s.backT;
  caseGroup.add(back);

  // 包边：open=一条贯通长口；cutout=按键位置开胶囊通孔（露出按键，孔不贯通到顶缘）；底部开孔独立开关
  // 挖孔模式下底部不整段切空（充电口/扬声器走胶囊孔），否则胶囊孔落在切空区里看不见
  const cutoutMode = s.buttonStyle === 'cutout';
  const notchOpts = { left: [], right: null, bottom: !!s.bottomOpen && !cutoutMode };
  if (s.buttonStyle === 'open') {
    notchOpts.left = [[17, 69]];
    notchOpts.right = [31, 59];              // 电源键
  }
  const hasNotch = notchOpts.left.length || notchOpts.right || notchOpts.bottom;
  let rimShape;
  if (hasNotch) {
    rimShape = rimProfile(w, h, s.sideT, outerR, notchOpts, 0.6, Math.min(innerR + 0.3, outerR - 0.3));
  } else {
    rimShape = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
    rimShape.holes.push(shapeFromRR(w + 0.6, h + 0.6, Math.min(innerR + 0.3, outerR - 0.3)));
  }
  const matCase = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 });
  let rimGeom = extrude(rimShape, s.backT + t);   // 从背板外表面一直延伸到手机正面，与 lip 底面接平
  let rimZ = -t / 2 - s.backT;
  if (s.buttonStyle === 'cutout') {               // 挖孔：世界坐标下布尔减出按键孔
    rimGeom.translate(0, 0, rimZ);
    rimGeom = subtractCutouts(rimGeom, w, h, s.sideT);
    rimZ = 0;
  }
  const rim = new THREE.Mesh(rimGeom, matCase);
  rim.name = 'case-rim';
  rim.position.z = rimZ;
  caseGroup.add(rim);

  // 避让区：贴在背板外侧的半透明凸块
  for (const m of s.modules) {
    if (m.depth <= 0) continue;
    const mm = new THREE.Mesh(
      extrude(shapeFromRR(m.w, m.h, Math.min(m.round, m.w / 2 - 0.5, m.h / 2 - 0.5)), m.depth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color), transparent: true, opacity: 0.4,
        roughness: 0.4, depthWrite: false,
      })
    );
    mm.position.set(-w / 2 + m.x + m.w / 2, h / 2 - m.y - m.h / 2, -t / 2 - s.backT - m.depth);
    modGroup.add(mm);
    // 边框线
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(extrude(shapeFromRR(m.w, m.h, Math.min(m.round, m.w / 2 - 0.5, m.h / 2 - 0.5)), m.depth)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(m.color) })
    );
    edge.position.copy(mm.position);
    modGroup.add(edge);
  }

  // 前包边顶缘：只做一圈薄环，不能盖住屏幕；有开口时与包边同步开槽，避免 U 形口上方残留横料
  const lipShape = hasNotch
    ? rimProfile(w, h, s.sideT, outerR, notchOpts, -0.8, Math.min(innerR + 0.4, outerR - 0.4))
    : (() => {
        const sh = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
        sh.holes.push(shapeFromRR(w - 0.8, h - 0.8, Math.min(innerR + 0.4, outerR - 0.4)));
        return sh;
      })();
  let lipGeom = extrude(lipShape, PETG_RULES.lip);
  let lipZ = t / 2;
  if (s.buttonStyle === 'cutout') {               // 前包边同步开孔
    lipGeom.translate(0, 0, lipZ);
    lipGeom = subtractCutouts(lipGeom, w, h, s.sideT);
    lipZ = 0;
  }
  const lip = new THREE.Mesh(lipGeom, matCase);
  lip.name = 'case-lip';
  lip.position.z = lipZ;
  caseGroup.add(lip);

  fitCamera(w, h, t, s.sideT);

  // 自检：哪个几何体出现 NaN 直接点名，方便排查
  root.traverse(o => {
    if (!o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (!isFinite(o.geometry.boundingSphere?.radius)) console.warn('[KECRAFT] NaN 几何体:', o.name || o.type);
  });
}

// 按机型尺寸自动取景：换机型才重新取景，用户手动转过之后不打断
function fitCamera(w, h, t, sideT) {
  const key = `${w.toFixed(1)}x${h.toFixed(1)}`;
  if (key === lastFitKey) return;
  lastFitKey = key;
  const vFov = camera.fov * Math.PI / 180;
  const needH = h + 2 * sideT + 6;
  const needW = (w + 2 * sideT + 6) / camera.aspect;
  const dist = (Math.max(needH, needW) / 2) / Math.tan(vFov / 2) * 1.25;
  const dir = new THREE.Vector3(-0.30, 0.16, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  controls.target.set(0, 0, 0);
  controls.update();
}

export function rebuild3D() {
  if (!inited) return;
  if (containerEl) resize3D(containerEl);   // 从 2D 页签切回时容器刚可见，需重算尺寸
  build();
}

export function screenshot3D() {
  if (!inited) return null;
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
