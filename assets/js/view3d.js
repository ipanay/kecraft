// ============================================
// 3D 预览：three.js
// 手机本体（圆角盒）+ 壳（背板 + 包边）+ 避让区（半透明凸块）
// 只做展示确认，不做几何布尔
// ============================================

import * as THREE from 'three';
import { OrbitControls } from '../../libs/OrbitControls.js';
import { state } from './state.js';
import { PETG_RULES } from './config.js';
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

function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  g.computeVertexNormals();
  return g;
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
  const innerR = Math.min(s.cornerStyle === 'square' ? 2 : s.current.cornerR, w / 2 - 1, h / 2 - 1);
  const outerR = Math.min(shellRadius(), (w + 2 * s.sideT) / 2 - 1, (h + 2 * s.sideT) / 2 - 1);

  // 手机本体：中心在原点，屏幕朝 +z
  const body = new THREE.Mesh(
    extrude(shapeFromRR(w, h, innerR), t),
    new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.35, metalness: 0.7 })
  );
  body.name = 'phone-body';
  body.position.z = -t / 2;
  phoneGroup.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 3.6, h - 3.6),
    new THREE.MeshStandardMaterial({
      map: makeScreenTexture(),
      emissive: 0x9fc8ee, emissiveIntensity: 0.5,
      roughness: 0.18, metalness: 0.1,
    })
  );
  screen.name = 'phone-screen';
  screen.position.z = t / 2 + 0.05;
  phoneGroup.add(screen);

  // 壳背板（z: -t/2-backT .. -t/2）
  const back = new THREE.Mesh(
    extrude(shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR), s.backT),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 })
  );
  back.name = 'case-back';
  back.position.z = -t / 2 - s.backT;
  caseGroup.add(back);

  // 包边（环形）
  const ring = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
  ring.holes.push(shapeFromRR(w + 0.6, h + 0.6, Math.min(innerR + 0.3, outerR - 0.3)));
  const rim = new THREE.Mesh(
    extrude(ring, s.backT + t * 0.72),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 })
  );
  rim.name = 'case-rim';
  rim.position.z = -t / 2 - s.backT;
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

  // 前包边顶缘：只做一圈薄环，不能盖住屏幕
  const lipRing = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
  lipRing.holes.push(shapeFromRR(w - 0.8, h - 0.8, Math.min(innerR + 0.4, outerR - 0.4)));
  const lip = new THREE.Mesh(
    extrude(lipRing, PETG_RULES.lip),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5 })
  );
  lip.name = 'case-lip';
  lip.position.z = t / 2;
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
