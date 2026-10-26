// ============================================
// 机型库（首版）
// status: 'verified' 已实物验证 / 'pending' 资料待验证 / 'unsupported' 暂不支持
// source 必填：每个尺寸必须能指到来源，没有来源的不许入库
// camera 为示意位置，建模前需实物校准
// ============================================

export const PHONES = [
  {
    id: 'sony-xperia-1v',
    brand: 'Sony',
    model: 'Xperia 1 V',
    w: 75, h: 161.4, t: 8.6, cornerR: 8,
    status: 'pending',
    statusLabel: '资料待验证',
    source: '官方公开资料（161.4 × 75 × 8.6 mm），实物待验证',
    // 镜头区示意位置（距壳左上角 mm），建模前需校准
    camera: { x: 11, y: 11, w: 30, h: 46 },
  },
  {
    id: 'honor-power2',
    brand: '荣耀',
    model: 'Power 2',
    w: 76.3, h: 162.1, t: 7.98, cornerR: 9,
    status: 'pending',
    statusLabel: '资料待验证',
    source: '用户提供（162.1 × 76.3 × 7.98 mm）',
    camera: null,
  },
  {
    id: 'iphone-13-pro',
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    w: 71.5, h: 146.7, t: 7.65, cornerR: 7,
    status: 'pending',
    statusLabel: '资料待验证',
    source: '官方公开规格（146.7 × 71.5 × 7.65 mm）',
    camera: { x: 10, y: 10, w: 28, h: 30 },
  },
];
