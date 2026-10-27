// ============================================
// 机型库（首版）
// source 必填：每个尺寸必须能指到来源，没有来源的不许入库
// camera 为示意位置，建模前需实物校准
// ============================================

export const PHONES = [
  {
    id: 'sony-xperia-1v',
    brand: 'Sony',
    model: 'Xperia 1 V',
    w: 75, h: 161.4, t: 8.6, cornerR: 8,
    source: '官方公开资料（161.4 × 75 × 8.6 mm）',
    // 镜头区示意位置（距壳左上角 mm），建模前需校准
    camera: { x: 11, y: 11, w: 30, h: 46 },
  },
  {
    id: 'honor-power2',
    brand: '荣耀',
    model: 'Power 2',
    w: 76.3, h: 162.1, t: 7.98, cornerR: 9,
    source: '用户提供（162.1 × 76.3 × 7.98 mm）',
    camera: null,
  },
  {
    id: 'iphone-13-pro',
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    // 官方尺寸：宽 × 高 × 厚（Apple 技术规格 KB SP852）
    w: 71.5, h: 146.7, t: 7.65,
    weight: 203,              // g，官方
    screen: '6.1 英寸 OLED 2532×1170 460ppi 120Hz',
    body: '超瓷晶面板 / 不锈钢中框 / 亚光玻璃背板',
    releaseYear: 2021,
    cornerR: 7,               // 官方未公布，目视为示意值
    source: 'Apple 官方技术规格（宽 71.5 × 高 146.7 × 厚 7.65 mm，重 203 g）',
    sourceUrl: 'https://support.apple.com/kb/SP852',
    verifiedAt: '2026-10-26',
    screenImage: 'assets/img/screen-iphone-13-pro.png',   // 屏幕贴图：原装 Sierra Blue 浅色壁纸（本地预览用）
    // 镜头区为目视估算，Apple 未公布模组尺寸，建模前需实物校准
    camera: { x: 10, y: 10, w: 28, h: 30, estimated: true },
  },
];
