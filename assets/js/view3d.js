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
  const innerR = Math.min(s.cornerStyle === 'square' ? 2 : s.cornerR, w / 2 - 1, h / 2 - 1);
  const outerR = Math.min(shellRadius(), (w + 2 * s.sideT) / 2 - 1, (h + 2 * s.sideT) / 2 - 1);

  // 手机本体：中心在原点，屏幕朝 +z
  const body = new THREE.Mesh(
    extrude(shapeFromRR(w, h, innerR), t),
    new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.4, metalness: 0.55 })
  );
  body.position.z = -t / 2;
  phoneGroup.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 4, h - 4),
    new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.2, metalness: 0.7 })
  );
  screen.position.z = t / 2 + 0.05;
  phoneGroup.add(screen);

  // 壳背板（z: -t/2-backT .. -t/2）
  const back = new THREE.Mesh(
    extrude(shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR), s.backT),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 })
  );
  back.position.z = -t / 2 - s.backT;
  caseGroup.add(back);

  // 包边（环形）
  const ring = shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR);
  ring.holes.push(shapeFromRR(w + 0.6, h + 0.6, Math.min(innerR + 0.3, outerR - 0.3)));
  const rim = new THREE.Mesh(
    extrude(ring, s.backT + t * 0.72),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5, metalness: 0.15 })
  );
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

  // 前包边顶缘视觉（0.5mm lip，简化为正面一圈薄片）
  const lip = new THREE.Mesh(
    extrude(shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR).holes.length ? shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR) : shapeFromRR(w + 2 * s.sideT, h + 2 * s.sideT, outerR), 0.2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.5 })
  );
  lip.position.z = t / 2 + PETG_RULES.lip;
  caseGroup.add(lip);
}

export function rebuild3D() { build(); }

export function screenshot3D() {
  if (!inited) return null;
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
