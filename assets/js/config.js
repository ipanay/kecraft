// ============================================
// 全局常量与 PETG 规则
// 数值来源见注释，未标注来源的不要乱改
// ============================================

// PETG 打印安全规则（来源：工作台式设计稿既有标注）
export const PETG_RULES = {
  minSideWall: 1.6,   // 侧边最小壁厚 mm
  lensClearance: 3,   // 模块距镜头区最小距离 mm
  lip: 0.5,           // 包边高出屏幕 mm（用户口述默认值）
};

// 默认壳参数（用户口述：背面/四周壳厚可调，lip 固定）
export const CASE_DEFAULTS = {
  backT: 1.6,
  sideT: 1.2,
};

// 特殊需求模块预设（尺寸为占位默认值，用户可调）
export const MODULE_TYPES = [
  { id: 'cooler',  name: '散热模块避让区', w: 46, h: 22, depth: 4,   round: 6,  color: '#37c8a3' },
  { id: 'magsafe', name: 'MagSafe 安全区', w: 56, h: 56, depth: 1.5, round: 28, color: '#37c8a3' },
  { id: 'battery', name: '改装电池区',     w: 60, h: 80, depth: 5,   round: 8,  color: '#37c8a3' },
  { id: 'hole',    name: '自定义开孔',     w: 20, h: 20, depth: 0,   round: 4,  color: '#e2b93b' },
  { id: 'text',    name: '文字区',         w: 60, h: 14, depth: 0.8, round: 3,  color: '#7fa7e8' },
];

// 壳体颜色（TPU/PETG 常见色系，可改）
export const CASE_COLORS = [
  '#2f3b47', '#1a1c20', '#e8e6df', '#2f6f5e',
  '#b8552f', '#8f3d5c', '#c9922e', '#3d6fb8',
];

// URL 参数键名规范（上线后不可再改，否则老链接作废）
export const URL_KEYS = {
  phone: 'm', brand: 'b',
  w: 'w', h: 'h', t: 't', cornerR: 'r',
  backT: 'bt', sideT: 'st',
  color: 'c',
  edited: 'e',
  modules: 'mods',
};
