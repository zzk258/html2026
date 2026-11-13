/* ============================================================
   数据罗盘 DataCompass —— 单页数据分析应用
   ============================================================ */

/* ------------------------- 1. 工具函数 ------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* 图表引擎可能晚到：先给出等价的普通渐变对象，echarts 到位后再生成真正的 LinearGradient */
function gradient(x, y, x2, y2, stops) {
  if (window.echarts && window.echarts.graphic) return new window.echarts.graphic.LinearGradient(x, y, x2, y2, stops);
  return { type: 'linear', x, y, x2, y2, colorStops: stops };
}
const PALETTE = ['#4f46e5', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1'];
const FONT = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (v === null || v === undefined) return NaN;
  if (v instanceof Date) return NaN;
  let s = String(v).trim().replace(/[,，¥$€£\s]/g, '');
  if (s === '' || s === '-' || s === '—') return NaN;
  if (s.endsWith('%')) s = s.slice(0, -1);
  // 严格判定：整串必须是纯数字，避免 IP（10.20.4.121）、资产编号（IT-2023-0001）被误转
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function fmtParts(v, f) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) return { n: '—', u: '' };
  const n = typeof v === 'number' ? v : toNum(v);
  if (isNaN(n)) return { n: '—', u: '' };
  const kind = f && f.kind;
  if (kind === 'rate') return { n: n.toFixed(1), u: '%' };
  if (Math.abs(n) >= 1e8) return { n: (n / 1e8).toFixed(2), u: '亿' };
  if (Math.abs(n) >= 1e4) return { n: (n / 1e4).toFixed(1), u: '万' };
  if (kind === 'float') return { n: n.toFixed(2), u: '' };
  if (Number.isInteger(n)) return { n: n.toLocaleString('zh-CN'), u: '' };
  return { n: n.toFixed(2), u: '' };
}

function fmt(v, f) { const p = fmtParts(v, f); return p.n + p.u; }

function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(1) + '亿';
  if (a >= 1e4) return (v / 1e4).toFixed(1) + '万';
  if (a >= 1000) return Math.round(v).toLocaleString('zh-CN');
  if (!Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

function aggregate(rows, key, fn) {
  if (fn === 'count') return rows.length;
  const nums = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][key];
    if (typeof v === 'number' && isFinite(v)) nums.push(v);
  }
  if (!nums.length) return 0;
  let acc = 0;
  if (fn === 'max') { acc = -Infinity; for (const n of nums) if (n > acc) acc = n; return acc; }
  if (fn === 'min') { acc = Infinity; for (const n of nums) if (n < acc) acc = n; return acc; }
  for (const n of nums) acc += n;
  return fn === 'avg' ? acc / nums.length : acc;
}

function groupRows(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const raw = r[key];
    const k = (raw === null || raw === undefined || raw === '') ? '未分类' : String(raw);
    let arr = m.get(k);
    if (!arr) { arr = []; m.set(k, arr); }
    arr.push(r);
  }
  return m;
}

function isDateLike(v) {
  if (v instanceof Date) return true;
  const s = String(v).trim();
  return /^\d{4}[-/年]\d{1,2}([-/月]\d{1,2})?/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) || /^\d{4}Q[1-4]$/i.test(s);
}

function normalizeDate(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

function download(name, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function toCSV(fields, rows) {
  const q = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [fields.map(f => q(f.label)).join(',')];
  rows.forEach(r => lines.push(fields.map(f => q(r[f.key])).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

/* ------------------------- 2. 行业模板 ------------------------- */
const TEMPLATES = [
  {
    id: 'itops', name: 'IT 故障工单', icon: '🛠️', badge: '新',
    desc: '部门 × 故障类型的工单量、响应时效与满意度复盘',
    dataName: 'IT 故障维护统计表',
    time: { key: 'month', label: '报障月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'dept', label: '报障部门', values: ['研发中心', '市场部', '财务部', '人力资源部', '运维部', '销售一部'] },
      { key: 'ftype', label: '故障类型', values: ['网络中断', '硬件故障', '软件异常', '账号权限', '打印机/外设'] }
    ],
    metrics: [
      { key: 'tickets', label: '工单量', kind: 'int', base: 46, trend: 0.006, noise: 0.26, season: 0.12 },
      { key: 'response', label: '响应时间(分钟)', kind: 'float', base: 24, trend: -0.008, noise: 0.2 },
      { key: 'resolve', label: '处理耗时(小时)', kind: 'float', base: 5.6, trend: -0.005, noise: 0.24 },
      { key: 'downtime', label: '停机时长(小时)', kind: 'float', base: 3.2, trend: -0.01, noise: 0.3 },
      { key: 'satis', label: '满意度(1-5)', kind: 'float', base: 4.5, trend: 0.002, noise: 0.05 }
    ]
  },
  {
    id: 'itasset', name: 'IT 资产台账', icon: '💻', badge: '新',
    desc: '部门 × 设备类别的采购数量、金额与资产分布',
    dataName: 'IT 资产台账报表',
    time: { key: 'month', label: '采购月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'dept', label: '所属部门', values: ['研发中心', '市场部', '财务部', '人力资源部', '运维部', '销售一部'] },
      { key: 'etype', label: '设备类别', values: ['台式机', '笔记本', '显示器', '网络设备', '其他外设'] }
    ],
    metrics: [
      { key: 'qty', label: '采购数量', kind: 'int', base: 12, trend: 0.004, noise: 0.3 },
      { key: 'amount', label: '采购金额(元)', kind: 'money', base: 86000, trend: 0.008, noise: 0.28 },
      { key: 'avgprice', label: '平均单价(元)', kind: 'money', base: 5600, trend: -0.002, noise: 0.08 }
    ]
  },
  {
    id: 'retail', name: '零售电商', icon: '🛍️', badge: '热门',
    desc: '渠道 × 品类 × 月度销售，追踪销售额、订单与退货率',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'channel', label: '渠道', values: ['天猫', '京东', '抖音', '小程序', '线下门店'] },
      { key: 'category', label: '品类', values: ['数码家电', '美妆个护', '食品饮料', '服饰鞋包'] }
    ],
    metrics: [
      { key: 'sales', label: '销售额', kind: 'money', base: 480000, trend: 0.012, noise: 0.24, season: 0.16 },
      { key: 'orders', label: '订单量', kind: 'int', base: 3600, trend: 0.014, noise: 0.2, season: 0.18 },
      { key: 'aov', label: '客单价', kind: 'money', base: 145, trend: 0.002, noise: 0.12, season: 0.04 },
      { key: 'refund', label: '退货率', kind: 'rate', base: 3.6, trend: -0.012, noise: 0.32 }
    ]
  },
  {
    id: 'manufacturing', name: '智能制造', icon: '🏭', badge: '',
    desc: '车间 × 产品线的产量、合格率与单位成本监控',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'workshop', label: '车间', values: ['一号车间', '二号车间', '三号车间', '四号车间'] },
      { key: 'line', label: '产品线', values: ['A 系列', 'B 系列', 'C 系列'] }
    ],
    metrics: [
      { key: 'output', label: '产量', kind: 'int', base: 5200, trend: 0.008, noise: 0.16, season: 0.1 },
      { key: 'passrate', label: '合格率', kind: 'rate', base: 97.8, trend: 0.0008, noise: 0.02 },
      { key: 'cost', label: '单位成本', kind: 'money', base: 86, trend: -0.004, noise: 0.1 },
      { key: 'energy', label: '能耗', kind: 'float', base: 1240, trend: -0.006, noise: 0.14 }
    ]
  },
  {
    id: 'finance', name: '银行金融', icon: '🏦', badge: '',
    desc: '分行 × 产品类型的客户增长、存贷款与不良率',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'branch', label: '分行', values: ['北京分行', '上海分行', '深圳分行', '杭州分行', '成都分行'] },
      { key: 'product', label: '产品类型', values: ['个人存款', '企业贷款', '财富管理'] }
    ],
    metrics: [
      { key: 'newcust', label: '新增客户', kind: 'int', base: 1800, trend: 0.01, noise: 0.2 },
      { key: 'deposit', label: '存款余额', kind: 'money', base: 860000000, trend: 0.014, noise: 0.08 },
      { key: 'loan', label: '贷款余额', kind: 'money', base: 520000000, trend: 0.011, noise: 0.1 },
      { key: 'npl', label: '不良率', kind: 'rate', base: 1.32, trend: -0.008, noise: 0.28 }
    ]
  },
  {
    id: 'healthcare', name: '医疗健康', icon: '🏥', badge: '',
    desc: '科室维度的门诊住院量、平均住院日与满意度',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'dept', label: '科室', values: ['内科', '外科', '儿科', '妇产科', '骨科'] },
      { key: 'campus', label: '院区', values: ['本部院区', '东院区', '分院区'] }
    ],
    metrics: [
      { key: 'outpatient', label: '门诊量', kind: 'int', base: 8600, trend: 0.009, noise: 0.18, season: 0.14 },
      { key: 'inpatient', label: '住院量', kind: 'int', base: 620, trend: 0.006, noise: 0.16 },
      { key: 'los', label: '平均住院日', kind: 'float', base: 7.2, trend: -0.004, noise: 0.08 },
      { key: 'satis', label: '满意度', kind: 'rate', base: 94.5, trend: 0.0009, noise: 0.03 }
    ]
  },
  {
    id: 'education', name: '教育培训', icon: '🎓', badge: '',
    desc: '校区 × 课程品类的报名人数、续费率与营收',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-03', count: 9 },
    dims: [
      { key: 'campus', label: '校区', values: ['中关村校区', '望京校区', '国贸校区', '海淀校区'] },
      { key: 'course', label: '课程', values: ['少儿编程', '雅思托福', '考研辅导', '职业技能'] }
    ],
    metrics: [
      { key: 'enroll', label: '报名人数', kind: 'int', base: 420, trend: 0.016, noise: 0.22, season: 0.2 },
      { key: 'renew', label: '续费率', kind: 'rate', base: 68.5, trend: 0.002, noise: 0.06 },
      { key: 'revenue', label: '营收', kind: 'money', base: 960000, trend: 0.018, noise: 0.2, season: 0.18 },
      { key: 'price', label: '客单价', kind: 'money', base: 4800, trend: 0.003, noise: 0.1 }
    ]
  },
  {
    id: 'restaurant', name: '餐饮连锁', icon: '🍜', badge: '',
    desc: '城市 × 门店类型的订单量、客单价与翻台率',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'city', label: '城市', values: ['北京', '上海', '广州', '深圳', '成都'] },
      { key: 'store', label: '门店类型', values: ['标准店', '旗舰店', '社区店'] }
    ],
    metrics: [
      { key: 'orders', label: '订单量', kind: 'int', base: 5400, trend: 0.01, noise: 0.2, season: 0.22 },
      { key: 'aov', label: '客单价', kind: 'money', base: 68, trend: 0.003, noise: 0.1 },
      { key: 'turnover', label: '翻台率', kind: 'float', base: 3.4, trend: 0.004, noise: 0.14 },
      { key: 'revenue', label: '营收', kind: 'money', base: 368000, trend: 0.012, noise: 0.2, season: 0.2 }
    ]
  },
  {
    id: 'logistics', name: '物流运输', icon: '🚚', badge: '',
    desc: '线路 × 运输方式的单量、时效、破损率与成本',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'route', label: '线路', values: ['华东-华南', '华北-华东', '西南-华中', '东北-华北', '华南-西南'] },
      { key: 'mode', label: '运输方式', values: ['公路', '铁路', '航空'] }
    ],
    metrics: [
      { key: 'parcel', label: '单量', kind: 'int', base: 12400, trend: 0.013, noise: 0.18 },
      { key: 'leadtime', label: '平均时效', kind: 'float', base: 28.5, trend: -0.005, noise: 0.1 },
      { key: 'damage', label: '破损率', kind: 'rate', base: 0.42, trend: -0.01, noise: 0.4 },
      { key: 'freight', label: '运费', kind: 'money', base: 386000, trend: 0.009, noise: 0.16 }
    ]
  },
  {
    id: 'saas', name: 'SaaS 互联网', icon: '💻', badge: '',
    desc: '获客渠道 × 套餐的新增、活跃、付费率与 MRR',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'channel', label: '获客渠道', values: ['官网直购', '渠道代理', '内容营销', '活动获客'] },
      { key: 'plan', label: '套餐', values: ['基础版', '专业版', '企业版'] }
    ],
    metrics: [
      { key: 'newuser', label: '新增用户', kind: 'int', base: 1200, trend: 0.017, noise: 0.24 },
      { key: 'active', label: '活跃用户', kind: 'int', base: 8600, trend: 0.015, noise: 0.1 },
      { key: 'payrate', label: '付费率', kind: 'rate', base: 12.4, trend: 0.004, noise: 0.12 },
      { key: 'mrr', label: 'MRR', kind: 'money', base: 680000, trend: 0.02, noise: 0.14 }
    ]
  },
  {
    id: 'realestate', name: '房地产', icon: '🏙️', badge: '',
    desc: '城市 × 项目类型的成交套数、均价与去化率',
    time: { key: 'month', label: '季度', grain: 'quarter', start: '2024-01', count: 8 },
    dims: [
      { key: 'city', label: '城市', values: ['北京', '上海', '杭州', '成都'] },
      { key: 'ptype', label: '项目类型', values: ['刚需住宅', '改善住宅', '商业办公'] }
    ],
    metrics: [
      { key: 'units', label: '成交套数', kind: 'int', base: 320, trend: -0.004, noise: 0.24 },
      { key: 'price', label: '成交均价', kind: 'money', base: 48000, trend: 0.006, noise: 0.08 },
      { key: 'rate', label: '去化率', kind: 'rate', base: 62.5, trend: 0.003, noise: 0.12 },
      { key: 'gmv', label: '销售额', kind: 'money', base: 460000000, trend: 0.004, noise: 0.2 }
    ]
  },
  {
    id: 'hr', name: '人力资源', icon: '👥', badge: '',
    desc: '部门 × 职级的人数、招聘周期、离职率与人均产出',
    time: { key: 'month', label: '月份', grain: 'month', start: '2025-01', count: 12 },
    dims: [
      { key: 'dept', label: '部门', values: ['研发中心', '销售部', '市场部', '客服中心', '职能中心'] },
      { key: 'level', label: '职级', values: ['初级', '中级', '高级'] }
    ],
    metrics: [
      { key: 'headcount', label: '在岗人数', kind: 'int', base: 86, trend: 0.008, noise: 0.12 },
      { key: 'cycle', label: '招聘周期', kind: 'float', base: 24.5, trend: -0.004, noise: 0.12 },
      { key: 'attrition', label: '离职率', kind: 'rate', base: 8.6, trend: -0.006, noise: 0.24 },
      { key: 'output', label: '人均产出', kind: 'money', base: 128000, trend: 0.01, noise: 0.14 }
    ]
  },
  {
    id: 'marketing', name: '市场营销', icon: '📣', badge: '',
    desc: '渠道 × 广告形式的曝光、点击、转化与 ROI',
    time: { key: 'month', label: '周次', grain: 'week', start: '2025-03-03', count: 12 },
    dims: [
      { key: 'channel', label: '投放渠道', values: ['抖音', '小红书', '微信朋友圈', '百度搜索', 'B 站'] },
      { key: 'format', label: '广告形式', values: ['信息流', '开屏', 'KOL 合作', '搜索竞价'] }
    ],
    metrics: [
      { key: 'impression', label: '曝光量', kind: 'int', base: 2860000, trend: 0.012, noise: 0.2 },
      { key: 'click', label: '点击量', kind: 'int', base: 68000, trend: 0.014, noise: 0.22 },
      { key: 'convert', label: '转化数', kind: 'int', base: 2400, trend: 0.016, noise: 0.24 },
      { key: 'cost', label: '花费', kind: 'money', base: 186000, trend: 0.01, noise: 0.18 },
      { key: 'roi', label: 'ROI', kind: 'float', base: 3.8, trend: 0.005, noise: 0.16 }
    ]
  }
];

/* ------------------------- 3. 示例数据生成 ------------------------- */
function periodLabel(tl, p) {
  const iso = tl.start.length === 7 ? tl.start + '-01' : tl.start;
  const start = new Date(iso + 'T00:00:00');
  if (tl.grain === 'month') {
    const d = new Date(start); d.setMonth(d.getMonth() + p);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (tl.grain === 'quarter') {
    const d = new Date(start); d.setMonth(d.getMonth() + p * 3);
    return `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}`;
  }
  if (tl.grain === 'week') {
    const d = new Date(start.getTime() + p * 7 * 86400000);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(p);
}

function buildDataset(tpl) {
  const rand = mulberry32(hashStr(tpl.id));
  const rows = [];
  const n = tpl.time.count;
  const d0 = tpl.dims[0].values.length;

  for (let p = 0; p < n; p++) {
    for (let i = 0; i < d0; i++) {
      const row = {};
      row[tpl.time.key] = periodLabel(tpl.time, p);
      tpl.dims.forEach((dim, di) => {
        const idx = di === 0 ? i : Math.floor(rand() * dim.values.length);
        row[dim.key] = dim.values[idx];
      });
      const dimFactor = 0.62 + i * 0.17;
      tpl.metrics.forEach(m => {
        const seasonal = 1 + (m.season || 0) * Math.sin((p / n) * Math.PI * 2 - Math.PI / 2);
        const trend = 1 + (m.trend || 0) * p;
        let v;
        if (m.kind === 'rate') {
          v = m.base * trend * (1 + (rand() - 0.5) * (m.noise || 0.2));
          v = Math.max(m.base * 0.25, Math.min(m.base * 1.9, v));
          v = Math.round(v * 100) / 100;
        } else {
          v = m.base * trend * seasonal * (1 + (rand() - 0.5) * (m.noise || 0.2)) * dimFactor;
          if (m.kind === 'int' || m.kind === 'money') v = Math.round(v);
          else v = Math.round(v * 100) / 100;
        }
        row[m.key] = v;
      });
      rows.push(row);
    }
  }

  const fields = [{ key: tpl.time.key, label: tpl.time.label, type: 'date', kind: 'date' }];
  tpl.dims.forEach(d => fields.push({ key: d.key, label: d.label, type: 'string', kind: 'string' }));
  tpl.metrics.forEach(m => fields.push({ key: m.key, label: m.label, type: 'number', kind: m.kind }));

  return {
    name: tpl.dataName || (tpl.name + '经营数据'),
    industry: tpl.name,
    icon: tpl.icon,
    fields,
    rows,
    source: 'template',
    tplId: tpl.id
  };
}

/* ------------------------- 4. 外部数据解析 ------------------------- */
function parseDelimited(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const firstLine = (text.split(/\r?\n/).find(l => l.trim() !== '') || '');
  const counts = [
    { d: ',', c: (firstLine.match(/,/g) || []).length },
    { d: '\t', c: (firstLine.match(/\t/g) || []).length },
    { d: ';', c: (firstLine.match(/;/g) || []).length },
    { d: '|', c: (firstLine.match(/\|/g) || []).length }
  ].sort((a, b) => b.c - a.c);
  const delim = counts[0].c > 0 ? counts[0].d : ',';

  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function detectFields(headers, keys, raw) {
  const out = [];
  for (let i = 0; i < headers.length; i++) {
    const vals = raw.map(r => r[i]).filter(v => v !== '' && v !== null && v !== undefined);
    if (!vals.length) continue;
    const numRatio = vals.filter(v => !isNaN(toNum(v)) && String(v).trim() !== '').length / vals.length;
    const dateRatio = vals.filter(v => isDateLike(v)).length / vals.length;
    let type = 'string', kind = 'string';
    if (dateRatio > 0.8) { type = 'date'; kind = 'date'; }
    else if (numRatio > 0.85) {
      type = 'number';
      kind = /率|占比|比例|转化率/.test(headers[i]) ? 'rate' : (/价|额|收入|成本|费用/.test(headers[i]) ? 'money' : 'number');
    }
    out.push({ key: keys[i], label: headers[i], type, kind });
  }
  return out;
}

function looksLikeHeader(arr, restRows) {
  const cells = arr.map(c => String(c === null || c === undefined ? '' : c).trim()).filter(Boolean);
  if (cells.length < 2) return false;
  const nonNumRatio = cells.filter(c => isNaN(toNum(c))).length / cells.length;
  if (nonNumRatio < 0.8) return false;
  if (new Set(cells).size / cells.length < 0.6) return false;
  return restRows.some(r => r.some(c => { const s = String(c).trim(); return s !== '' && !isNaN(toNum(s)); }));
}

/* 自动修正表头：
   情况1 —— 表头全是空/占位符「列N」（粘贴时未勾选表头）
   情况2 —— 首行只有一个单元格有内容（Excel 合并大标题行），真正表头在其下面
   两种情况都检查下一行是否像表头，是则提升为表头 */
function autoFixHeader(matrix) {
  if (matrix.length < 3) return matrix;
  const headRow = matrix[0] || [];
  const head = headRow.map(h => String(h === null || h === undefined ? '' : h).trim());
  const filled = head.filter(Boolean);
  const allPlaceholder = filled.length === 0 || filled.every(h => /^列\d+$/.test(h));
  const mergedTitle = filled.length === 1 && headRow.length > 2;
  if (!allPlaceholder && !mergedTitle) return matrix;

  const body = matrix.slice(1);
  if (looksLikeHeader(body[0] || [], body.slice(1))) {
    return [body[0], ...body.slice(1)];
  }
  // 只有合并标题行、下面直接是数据：丢弃标题，列名用占位符
  if (mergedTitle) {
    return [headRow.map(() => ''), ...body];
  }
  return matrix;
}

function datasetFromMatrix(matrix, name) {
  const headRow = matrix[0] || [];
  const seen = {};
  const rawHeaders = headRow.map((h, i) => {
    let s = String(h === null || h === undefined ? '' : h).trim();
    return s || ('列' + (i + 1));
  });
  const keys = rawHeaders.map(h => {
    let k = h.replace(/\s+/g, '_'), n = 1;
    const base = k;
    while (seen[k]) { k = base + '_' + (++n); }
    seen[k] = 1;
    return k;
  });

  const width = Math.max(...matrix.map(r => r.length), rawHeaders.length);
  while (rawHeaders.length < width) { rawHeaders.push('列' + (rawHeaders.length + 1)); }
  while (keys.length < width) { keys.push('c' + keys.length); }

  const raw = matrix.slice(1).map(r => {
    const arr = [];
    for (let i = 0; i < width; i++) arr.push(r[i] === undefined ? '' : r[i]);
    return arr;
  });

  let fields = detectFields(rawHeaders, keys, raw);
  fields = fields.filter(f => {
    const idx = keys.indexOf(f.key);
    return raw.some(r => String(r[idx] === null || r[idx] === undefined ? '' : r[idx]).trim() !== '');
  });

  const rows = raw.map(r => {
    const o = {};
    fields.forEach((f, i) => {
      const idx = keys.indexOf(f.key);
      const v = r[idx];
      if (f.type === 'number') {
        const n = toNum(v);
        o[f.key] = isNaN(n) ? '' : n;
      } else if (f.type === 'date') {
        o[f.key] = normalizeDate(v);
      } else {
        o[f.key] = v === null || v === undefined ? '' : String(v).trim();
      }
    });
    return o;
  });

  const ret = { name: name || '导入数据', industry: '自定义', icon: '📄', fields, rows, source: 'import', rawMatrix: matrix };
  return ret;
}

function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Excel 解析库加载失败，请检查网络后重试'));
    document.head.appendChild(s);
  });
}

/* ------------------------- 5. 状态 ------------------------- */
const state = {
  dataset: null,
  view: 'overview',
  /* 全局时间范围：概览 / 图表分析 / 数据透视 共用 */
  range: { range: 'all', custom: null },   // custom: { start:'YYYY-MM-DD', end:'YYYY-MM-DD' }
  chart: { type: 'bar', x: '', col: '', ys: [], agg: 'sum', sort: 'desc', topN: 10, showLabel: true },
  pivot: { row: '', col: '', val: '', agg: 'sum' },
  table: { page: 1, size: 20, q: '', sort: null, dir: 'desc' },
  hidden: new Set(),
  charts: new Map()
};

const getField = key => (state.dataset ? state.dataset.fields.find(f => f.key === key) : undefined);
const stringFields = () => state.dataset.fields.filter(f => f.type === 'string');
const numberFields = () => state.dataset.fields.filter(f => f.type === 'number');
const dateFields = () => state.dataset.fields.filter(f => f.type === 'date');

/* 虚拟指标：记录数（计数）——用于「每个部门报了多少故障/多少单」这类统计 */
const COUNT_METRIC = { key: '__count__', label: '记录数(计数)', type: 'number', kind: 'int', virtual: true };
const isCount = f => f && f.key === COUNT_METRIC.key;
const metricField = key => getField(key) || (key === COUNT_METRIC.key ? COUNT_METRIC : null);
const metricFields = () => [...numberFields(), COUNT_METRIC];
const aggForMetric = f => (isCount(f) ? 'count' : aggForField(f));

/* 单价 / 均值 / 比率类指标求和无业务意义，默认按平均聚合 */
const AVG_LIKE_RE = /均价|客单价|平均|均值|ROI|转化率|满意度|翻台|时效|周期|人均|留存/;
function isAvgLike(f) { return f.kind === 'rate' || AVG_LIKE_RE.test(f.label); }
function aggForField(f) { return isAvgLike(f) ? 'avg' : 'sum'; }

function syncAggDefault() {
  const ys = state.chart.ys.map(metricField).filter(Boolean);
  if (!ys.length) return;
  if (ys.some(isCount)) { state.chart.agg = 'sum'; return; }  // 计数指标固定按记录数统计
  if (ys.every(isAvgLike)) state.chart.agg = 'avg';
  else if (ys.every(f => !isAvgLike(f)) && state.chart.agg === 'avg') state.chart.agg = 'sum';
}

/* ------------------------- 6. ECharts 基础设施 ------------------------- */
let ECHARTS_OK = typeof window.echarts !== 'undefined';

function mount(id, option) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!ECHARTS_OK) {
    el.innerHTML = '<div class="empty">图表引擎加载中…（首次打开需下载图表库，稍等几秒）</div>';
    return null;
  }
  let inst = window.echarts.getInstanceByDom(el);
  if (!inst) {
    el.innerHTML = '';                     // 清掉"加载中"占位再初始化
    inst = window.echarts.init(el, null, { renderer: 'canvas' });
  }
  inst.setOption(option, true);
  state.charts.set(id, inst);
  return inst;
}

function resizeCharts() {
  state.charts.forEach(inst => { try { inst.resize(); } catch (e) { /* noop */ } });
}

function baseOption() {
  return {
    color: PALETTE,
    textStyle: { fontFamily: FONT, color: '#64748b', fontSize: 12 },
    animationDuration: 520,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,.93)',
      borderWidth: 0,
      padding: [9, 13],
      textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(79,70,229,.06)' } }
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 8, itemHeight: 8, itemGap: 12, textStyle: { color: '#64748b', fontSize: 11.5 } },
    grid: { left: 8, right: 18, top: 36, bottom: 6, containLabel: true }
  };
}

function catAxis() {
  return {
    type: 'category',
    axisLine: { lineStyle: { color: '#e6eaf2' } },
    axisTick: { show: false },
    axisLabel: { color: '#8a94a6', fontSize: 11, margin: 10, hideOverlap: true }
  };
}

function valAxis(fields) {
  const allRate = fields && fields.length && fields.every(f => f.kind === 'rate');
  return {
    type: 'value',
    splitLine: { lineStyle: { color: '#f1f4f9' } },
    axisLabel: { color: '#8a94a6', fontSize: 11, formatter: v => allRate ? v + '%' : fmtAxis(v) }
  };
}

function emptyOption(text) {
  return {
    title: {
      text: text || '当前配置暂无数据',
      left: 'center', top: 'middle',
      textStyle: { color: '#a3abbd', fontSize: 13, fontWeight: 'normal', fontFamily: FONT }
    }
  };
}

/* ------------------------- 7. 数据准备 ------------------------- */
function initChartState() {
  const ds = state.dataset;
  const dims = stringFields();
  const dates = dateFields();
  const metrics = numberFields();
  state.chart.x = dims[0] ? dims[0].key : (dates[0] ? dates[0].key : (ds.fields[0] && ds.fields[0].key));
  state.chart.col = '';   // 默认不拆分列维度
  const primary = pickPrimaryMetric();
  state.chart.ys = primary ? [primary.key] : [];
  state.chart.type = dims.length ? 'bar' : 'line';
  state.chart.agg = 'sum';
  syncAggDefault();
  state.chart.topN = 10;
  state.chart.sort = 'desc';
  state.chart.showLabel = true;
  state.range = { range: 'all', custom: null };   // 换数据集 / 改字段类型后重置全局时间范围
  state.table.page = 1;
  state.hidden = new Set();
}

function initPivotState() {
  const dims = stringFields();
  const metrics = numberFields();
  state.pivot.row = dims[0] ? dims[0].key : (dateFields()[0] ? dateFields()[0].key : '');
  state.pivot.col = dims[1] ? dims[1].key : '';
  state.pivot.val = metrics[0] ? metrics[0].key : COUNT_METRIC.key;
  state.pivot.agg = 'sum';
}

function pickPrimaryMetric() {
  const metrics = numberFields();
  if (!metrics.length) return COUNT_METRIC;   // 纯维度数据：用记录数计数
  const score = f => {
    let s = 0;
    if (/销售额|营收|收入|成交额|GMV|MRR|运费|花费|金额/.test(f.label)) s += 12;
    if (/量|人数|用户|客户|订单|产量|套数/.test(f.label)) s += 7;
    if (f.kind === 'rate') s -= 5;
    if (f.kind === 'money') s += 3;
    return s;
  };
  return [...metrics].sort((a, b) => score(b) - score(a))[0];
}

/* 时间范围筛选：all / last3 / last6 / YYYY-MM / custom{start,end} */
function toDay(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v === null || v === undefined ? '' : v).trim();
  const pad = n => String(n).padStart(2, '0');
  let m = s.match(/^(\d{4})[-/年.](\d{1,2})(?:[-/月.](\d{1,2}))?/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3] || 1)}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return '';
}

/* 数据集中时间字段的实际起止日期，用作自定义范围的默认值与可选边界 */
function dateBounds() {
  const tf = dateFields()[0];
  let min = '', max = '';
  if (!tf || !state.dataset) return { min, max };
  state.dataset.rows.forEach(r => {
    const d = toDay(r[tf.key]);
    if (!d) return;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  });
  return { min, max };
}

/* 全局时间范围过滤（概览 / 图表分析 / 数据透视 共用） */
const applyGlobalRange = rows => rangeRows(rows, state.range.range, state.range.custom);

function rangeRows(rows, range, custom) {
  const tf = dateFields()[0];
  if (!tf || !range || range === 'all') return rows;
  const mo = v => toDay(v).slice(0, 7);
  if (range === 'custom') {
    const s = custom && custom.start ? toDay(custom.start) : '';
    const e = custom && custom.end ? toDay(custom.end) : '';
    if (!s && !e) return rows;
    return rows.filter(r => {
      const d = toDay(r[tf.key]);
      if (!d) return false;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }
  if (range === 'last3' || range === 'last6') {
    const months = Array.from(new Set(rows.map(r => mo(r[tf.key])).filter(m => /^\d{4}-\d{2}$/.test(m)))).sort();
    const keep = new Set(months.slice(-(range === 'last3' ? 3 : 6)));
    return rows.filter(r => keep.has(mo(r[tf.key])));
  }
  return rows.filter(r => mo(r[tf.key]) === range);
}

function rangeSelectHtml(range) {
  const tf = dateFields()[0];
  const sel = v => (v === range ? ' selected' : '');
  let html = `<option value="all"${sel('all')}>全部时间</option>`
    + `<option value="last3"${sel('last3')}>近 3 个月</option>`
    + `<option value="last6"${sel('last6')}>近 6 个月</option>`
    + `<option value="custom"${sel('custom')}>自定义日期…</option>`;
  if (tf) {
    const months = Array.from(new Set(state.dataset.rows
      .map(r => String(r[tf.key] === null || r[tf.key] === undefined ? '' : r[tf.key]).slice(0, 7))
      .filter(m => /^\d{4}-\d{2}$/.test(m)))).sort().reverse();
    months.forEach(m => { html += `<option value="${m}"${sel(m)}>${m}</option>`; });
  }
  return html;
}

/* 同步「自定义日期」这两个输入框：显隐、边界、默认值、命中行数 */
function syncCustomRange(st, cfg) {
  const tf = dateFields()[0];
  const wrap = $(cfg.wrap), sEl = $(cfg.start), eEl = $(cfg.end), hit = $(cfg.hit);
  const on = !!tf && st.range === 'custom';
  if (wrap) wrap.hidden = !on;
  if (!on) {
    st.custom = st.custom || null;
    return;
  }
  const b = dateBounds();
  [sEl, eEl].forEach(el => {
    if (!el) return;
    el.min = b.min || '';
    el.max = b.max || '';
  });
  if (!st.custom) st.custom = { start: b.min, end: b.max };
  if (st.custom.start && st.custom.end && st.custom.start > st.custom.end) {
    st.custom = { start: st.custom.end, end: st.custom.start };
  }
  if (sEl) sEl.value = st.custom.start || '';
  if (eEl) eEl.value = st.custom.end || '';
  if (hit) {
    const n = rangeRows(state.dataset.rows, 'custom', st.custom).length;
    hit.textContent = `命中 ${n.toLocaleString('zh-CN')} / ${state.dataset.rows.length.toLocaleString('zh-CN')} 行`;
  }
}

/* 日期输入变更：读取 → 校正起止顺序 → 写入全局 state → 按所在视图重绘 */
function applyCustomDate(view) {
  const ids = view === 'pivot' ? { start: '#pv-start', end: '#pv-end' }
    : view === 'overview' ? { start: '#ov-start', end: '#ov-end' }
    : { start: '#range-start', end: '#range-end' };
  let s = ($(ids.start) || {}).value || '';
  let e = ($(ids.end) || {}).value || '';
  if (s && e && s > e) {
    [s, e] = [e, s];
    toast('开始日期晚于结束日期，已自动对调');
  }
  if (!s && !e) toast('未选择日期，已按全部时间显示');
  state.range.custom = { start: s, end: e };
  state.range.range = 'custom';
  if (view === 'pivot') renderPivot();
  else if (view === 'overview') renderOverview();
  else renderMainChart();
}

/* 下拉选择时间范围（三处共用） */
function onRangeSelect(v) {
  state.range.range = v;
  if (v === 'custom' && !state.range.custom) {
    const b = dateBounds();
    state.range.custom = { start: b.min, end: b.max };
    if (!b.min) toast('数据里没有可识别的日期，无法自定义范围');
  }
}

/* 各视图时间范围控件的公共同步：下拉选项 + 自定义输入框 */
function syncRangeSelect(selId, labelId) {
  const tf = dateFields()[0];
  const rs = $(selId);
  if (rs) {
    rs.style.display = tf ? '' : 'none';
    const lbl = labelId ? $(labelId) : null;
    if (lbl) lbl.style.display = tf ? '' : 'none';
    rs.innerHTML = tf ? rangeSelectHtml(state.range.range || 'all') : '';
  }
  if (!tf) state.range.range = 'all';
}

function buildSeries() {
  const ds = state.dataset, c = state.chart;
  const xf = getField(c.x);
  const colF = c.col ? getField(c.col) : null;
  const mfs = c.ys.map(metricField).filter(Boolean);
  if (!xf || !mfs.length) return null;

  const groups = groupRows(applyGlobalRange(ds.rows), c.x);
  let cats = Array.from(groups.keys());

  /* 每个行值内部的列值分桶：cat -> (colVal -> rows[]) */
  const idx = new Map();
  groups.forEach((arr, k) => {
    idx.set(k, colF ? groupRows(arr, colF.key) : new Map([['__all__', arr]]));
  });

  /* 序列定义：无列维度 = 每个指标一条；有列维度 = 列值 × 指标（最多 8 条） */
  let defs = [];
  if (colF) {
    const totals = new Map();
    idx.forEach(m => m.forEach((rowsArr, cv) => {
      totals.set(cv, (totals.get(cv) || 0) + Math.abs(rowsArr.reduce((a, r) => a + (Number(r[mfs[0].key]) || 0), 0)));
    }));
    const colVals = Array.from(totals.keys()).sort((a, b) => totals.get(b) - totals.get(a))
      .slice(0, mfs.length > 1 ? 3 : 6);
    mfs.forEach(f => colVals.forEach(v => {
      defs.push({ name: mfs.length > 1 ? `${f.label}·${v}` : v, field: f, colVal: v });
    }));
    defs = defs.slice(0, 8);
  } else {
    defs = mfs.map(f => ({ name: f.label, field: f, colVal: '__all__' }));
  }

  const cellVal = (k, d) => {
    const rowsArr = idx.get(k).get(d.colVal) || [];
    return rowsArr.length ? aggregate(rowsArr, d.field.key, isCount(d.field) ? 'count' : c.agg) : 0;
  };

  /* 单序列图表（饼图 / 环形图 / 漏斗 / 树图）用的「整行合计」值，不受列维度影响 */
  const aggByCat = new Map();
  cats.forEach(k => aggByCat.set(k, aggregate(groups.get(k) || [], mfs[0].key, isCount(mfs[0]) ? 'count' : c.agg)));

  const matrix = new Map();
  cats.forEach(k => matrix.set(k, defs.map(d => cellVal(k, d))));

  const isTime = xf.type === 'date';
  if (isTime) cats.sort((a, b) => String(a).localeCompare(String(b)));
  else if (c.sort !== 'none') {
    cats.sort((a, b) => {
      const va = (matrix.get(a) && matrix.get(a)[0]) || 0, vb = (matrix.get(b) && matrix.get(b)[0]) || 0;
      return c.sort === 'desc' ? vb - va : va - vb;
    });
  }
  if (c.topN < cats.length) cats = cats.slice(0, c.topN);
  return { cats, mfs, defs, matrix, aggByCat, isTime, xf, colF };
}

/* ------------------------- 8. 图表渲染 ------------------------- */
function chartOption() {
  const prepared = buildSeries();
  if (!prepared) return emptyOption('请选择行维度与统计指标');
  const { cats, mfs, defs, matrix, aggByCat, isTime, xf, colF } = prepared;
  const c = state.chart;
  const base = baseOption();
  const multi = defs.length > 1;
  const type = c.type;

  if (type === 'pie' || type === 'donut') {
    const data = cats.map(k => ({ name: k, value: aggByCat.get(k) }));
    const total = data.reduce((a, b) => a + (b.value || 0), 0) || 1;
    return {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      animationDuration: 600,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0,
        padding: [9, 13], textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${p.name}<br/><b>${fmt(p.value, mfs[0])}</b> · ${(p.value / total * 100).toFixed(1)}%`
      },
      legend: {
        bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8,
        itemGap: 14, textStyle: { color: '#7b8598', fontSize: 11.5 }
      },
      series: [{
        type: 'pie',
        radius: type === 'donut' ? ['46%', '70%'] : ['0%', '64%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2.5, borderRadius: 6 },
        label: {
          show: true, fontSize: 11, color: '#64748b', lineHeight: 16,
          formatter: p => `{b|${p.name}}\n{c|${(p.percent).toFixed(1)}%}`,
          rich: { b: { fontSize: 11, color: '#64748b' }, c: { fontSize: 11.5, color: '#0f172a', fontWeight: 600 } }
        },
        labelLine: { length: 8, length2: 10, lineStyle: { color: '#dbe1ee' } },
        emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 18, shadowColor: 'rgba(15,23,42,.18)' } },
        data
      }]
    };
  }

  if (type === 'treemap') {
    return {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0, padding: [9, 13],
        textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${p.name}<br/><b>${fmt(p.value, mfs[0])}</b>`
      },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%', height: '100%', top: 4, bottom: 4, left: 4, right: 4,
        itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3, borderRadius: 8 },
        label: {
          show: true, fontSize: 12, lineHeight: 17, color: '#fff',
          formatter: p => `{a|${p.name}}\n{b|${fmt(p.value, mfs[0])}}`,
          rich: { a: { fontSize: 12, fontWeight: 600, color: '#fff' }, b: { fontSize: 11, color: 'rgba(255,255,255,.85)' } }
        },
        data: cats.map((k, i) => ({
          name: k, value: aggByCat.get(k),
          itemStyle: { color: PALETTE[i % PALETTE.length] }
        }))
      }]
    };
  }

  if (type === 'funnel') {
    const data = cats.map(k => ({ name: k, value: aggByCat.get(k) }))
      .sort((a, b) => b.value - a.value);
    return {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0,
        padding: [9, 13], textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${p.name}<br/><b>${fmt(p.value, mfs[0])}</b>`
      },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#7b8598', fontSize: 11.5 } },
      series: [{
        type: 'funnel', left: '8%', right: '8%', top: 24, bottom: 40,
        minSize: '22%', sort: 'descending', gap: 3,
        label: { show: true, position: 'inside', fontSize: 11.5, color: '#fff', formatter: p => `${p.name} ${fmt(p.value, mfs[0])}` },
        itemStyle: { borderWidth: 0, borderRadius: 6 },
        data
      }]
    };
  }

  if (type === 'radar') {
    let rf = mfs.slice(0, 5);
    if (rf.length < 3) rf = numberFields().slice(0, 5);
    if (rf.length < 3) return emptyOption('雷达图至少需要 3 个数值指标');
    const topCats = cats.slice(0, 5);
    const grouped = groupRows(applyGlobalRange(state.dataset.rows), c.x);
    const maxes = rf.map(f => {
      const vals = topCats.map(k => aggregate(grouped.get(k) || [], f.key, aggForMetric(f)));
      return Math.max(...vals, 0) * 1.15 || 1;
    });
    return {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0, padding: [9, 13],
        textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT }
      },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#7b8598', fontSize: 11.5 } },
      radar: {
        center: ['50%', '46%'],
        radius: '62%',
        indicator: rf.map((f, i) => ({ name: f.label, max: maxes[i] })),
        axisName: { color: '#7b8598', fontSize: 11 },
        splitLine: { lineStyle: { color: '#eef1f7' } },
        splitArea: { areaStyle: { color: ['#fff', '#fbfcff'] } },
        axisLine: { lineStyle: { color: '#eef1f7' } }
      },
      series: [{
        type: 'radar',
        symbolSize: 4,
        lineStyle: { width: 2 },
        areaStyle: { opacity: .12 },
        data: topCats.map(k => ({
          name: k,
          value: rf.map(f => aggregate(grouped.get(k) || [], f.key, aggForMetric(f)))
        }))
      }]
    };
  }

  if (type === 'heatmap') {
    const yf = colF || state.dataset.fields.find(f => f.key !== c.x);   // 优先用「列维度」作为第二维度
    if (!yf) return emptyOption('热力图需要行维度 + 列维度');
    const hRows = applyGlobalRange(state.dataset.rows);
    const yVals = Array.from(new Set(hRows.map(r => String(r[yf.key] ?? '未分类')))).slice(0, 12);
    let maxV = 0;
    const cells = [];
    cats.forEach((cx, xi) => {
      yVals.forEach((cy, yi) => {
        const sub = hRows.filter(r => String(r[c.x] ?? '未分类') === String(cx) && String(r[yf.key] ?? '未分类') === cy);
        if (!sub.length) return;
        const v = aggregate(sub, mfs[0].key, isCount(mfs[0]) ? 'count' : c.agg);
        if (v > maxV) maxV = v;
        cells.push([xi, yi, Math.round(v * 100) / 100]);
      });
    });
    const data = cells.map(([xi, yi, v]) => ({
      value: [xi, yi, v],
      label: { color: maxV && v / maxV > 0.55 ? '#ffffff' : '#334155' }
    }));
    return {
      textStyle: { fontFamily: FONT },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0, padding: [9, 13],
        textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${cats[p.value[0]]} · ${yVals[p.value[1]]}<br/><b>${fmt(p.value[2], mfs[0])}</b>`
      },
      grid: { left: 8, right: 18, top: 16, bottom: 56, containLabel: true },
      xAxis: { ...catAxis(), data: cats, splitArea: { show: true } },
      yAxis: { type: 'category', data: yVals, splitArea: { show: true }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#8a94a6', fontSize: 11 } },
      visualMap: {
        min: 0, max: maxV || 1,
        calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
        itemWidth: 12, itemHeight: 80,
        textStyle: { color: '#8a94a6', fontSize: 11 },
        formatter: v => fmtAxis(v),
        inRange: { color: ['#eef2ff', '#c7d2fe', '#818cf8', '#4f46e5'] }
      },
      series: [{
        type: 'heatmap',
        data,
        label: {
          show: true, fontSize: 10.5,
          formatter: p => fmtAxis(p.value[2])
        },
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(15,23,42,.25)' } }
      }]
    };
  }

  if (type === 'scatter') {
    const xm = mfs[0];
    const ym = mfs[1] || mfs[0];
    const data = applyGlobalRange(state.dataset.rows).map(r => ({
      name: String(r[c.x] ?? ''),
      value: [Number(r[xm.key]) || 0, Number(r[ym.key]) || 0]
    }));
    const base2 = baseOption();
    base2.tooltip = {
      trigger: 'item', backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0,
      padding: [9, 13], textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
      formatter: p => `${p.data.name}<br/>${xm.label}: <b>${fmtAxis(p.value[0])}</b><br/>${ym.label}: <b>${fmtAxis(p.value[1])}</b>`
    };
    base2.legend = { show: false };
    base2.xAxis = { type: 'value', name: xm.label, nameTextStyle: { color: '#a3abbd', fontSize: 11 }, nameLocation: 'middle', nameGap: 26, splitLine: { lineStyle: { color: '#f1f4f9' } }, axisLabel: { color: '#8a94a6', fontSize: 11, formatter: v => fmtAxis(v) } };
    base2.yAxis = { type: 'value', name: ym.label, nameTextStyle: { color: '#a3abbd', fontSize: 11 }, splitLine: { lineStyle: { color: '#f1f4f9' } }, axisLabel: { color: '#8a94a6', fontSize: 11, formatter: v => fmtAxis(v) } };
    base2.grid = { left: 14, right: 24, top: 30, bottom: 34, containLabel: true };
    base2.series = [{
      type: 'scatter',
      symbolSize: 9,
      itemStyle: { color: 'rgba(79,70,229,.72)', borderColor: '#fff', borderWidth: 1.5 },
      emphasis: { itemStyle: { color: '#4f46e5' } },
      data
    }];
    return base2;
  }

  // ---------- 柱状 / 条形 / 折线 / 面积 ----------
  const isHBar = type === 'hbar';
  const defFields = defs.map(d => d.field);
  base.xAxis = isHBar ? valAxis(defFields) : catAxis();
  base.yAxis = isHBar
    ? { ...catAxis(), inverse: true, data: cats }
    : valAxis(defFields);
  if (!isHBar) base.xAxis.data = cats;

  base.series = defs.map((d, i) => {
    const f = d.field;
    const color = PALETTE[i % PALETTE.length];
    const values = cats.map(k => matrix.get(k)[i]);
    const series = {
      name: d.name,
      type: (type === 'line' || type === 'area') ? 'line' : 'bar',
      data: values,
      itemStyle: { color },
      emphasis: { focus: 'series' }
    };

    if (series.type === 'bar') {
      series.barMaxWidth = defs.length > 3 ? 14 : 34;
      series.itemStyle = {
        borderRadius: isHBar ? [0, 5, 5, 0] : [5, 5, 0, 0],
        color: gradient(
          isHBar ? 0 : 0, isHBar ? 0 : 0, isHBar ? 1 : 0, isHBar ? 0 : 1,
          [{ offset: 0, color: hexA(color, .95) }, { offset: 1, color: hexA(color, .62) }]
        )
      };
    } else {
      series.smooth = .32;
      series.symbol = 'circle';
      series.symbolSize = 6;
      series.lineStyle = { width: 2.6, color };
      series.itemStyle = { color, borderColor: '#fff', borderWidth: 1.5 };
      if (type === 'area' || defs.length === 1) {
        series.areaStyle = {
          color: gradient(0, 0, 0, 1, [
            { offset: 0, color: hexA(color, .26) },
            { offset: 1, color: hexA(color, .01) }
          ])
        };
      }
      if (cats.length > 14) series.symbol = 'none';
    }

    if (c.showLabel && defs.length <= 3) {
      series.label = {
        show: true,
        position: isHBar ? 'right' : (series.type === 'line' ? 'top' : 'top'),
        fontSize: 10,
        color: '#8a94a6',
        formatter: p => fmtAxis(p.value)
      };
    }
    return series;
  });

  if (isHBar) base.grid = { left: 8, right: 44, top: multi ? 34 : 20, bottom: 8, containLabel: true };
  if (multi) base.legend = { ...base.legend, show: true, type: 'scroll', left: 0, right: 0 };
  else base.legend = { show: false };

  return base;
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ------------------------- 9. 概览 ------------------------- */
function renderOverview() {
  const ds = state.dataset;
  if (!ds) return;

  const dims = stringFields();
  const dates = dateFields();
  const timeField = dates[0];
  const primary = pickPrimaryMetric();
  const rowsIn = applyGlobalRange(ds.rows);   // 概览同样遵循全局时间范围

  $('#ov-title').textContent = ds.name;
  $('#ov-sub').textContent = state.range.range === 'all'
    ? `${ds.rows.length} 条记录 · ${ds.fields.length} 个字段 · 本地实时计算`
    : `${rowsIn.length} / ${ds.rows.length} 条记录 · ${ds.fields.length} 个字段 · 本地实时计算`;
  $('#ov-industry').textContent = ds.source === 'import' ? '自定义导入' : '示例数据';
  const bnd = dateBounds();
  $('#ov-time').textContent = bnd.min ? `数据时间 ${bnd.min} ~ ${bnd.max}` : '无时间字段';

  /* 概览自己的时间范围控件（与图表分析 / 数据透视共用同一全局范围） */
  const ovSel = $('#ov-range');
  if (ovSel) {
    syncRangeSelect('#ov-range', null);
    syncCustomRange(state.range, { wrap: '#ov-custom', start: '#ov-start', end: '#ov-end', hit: '#ov-hit' });
  }

  /* --- KPI --- */
  const kpis = pickKpis().length ? pickKpis() : [COUNT_METRIC];
  $('#kpi-grid').innerHTML = kpis.map((f, i) => {
    const aggFn = aggForMetric(f);
    const total = aggregate(rowsIn, f.key, aggFn);
    const series = metricSeries(f, aggFn, rowsIn);
    let delta = null;
    if (series.values.length >= 2) {
      const a = series.values[series.values.length - 2];
      const b = series.values[series.values.length - 1];
      if (a) delta = (b - a) / Math.abs(a) * 100;
    }
    const dir = delta === null || Math.abs(delta) < 0.05 ? 'flat' : (delta > 0 ? 'up' : 'down');
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
    const p = fmtParts(total, f);
    const color = dir === 'up' ? '#e11d48' : dir === 'down' ? '#059669' : '#94a3b8';
    return `
      <div class="kpi">
        <div class="kpi-top">
          <span class="kpi-label">${esc(f.label)}</span>
          <span class="kpi-delta ${dir}">${arrow} ${delta === null ? '—' : Math.abs(delta).toFixed(1) + '%'}</span>
        </div>
        <div class="kpi-val">${p.n}<em>${p.u}</em></div>
        <div class="kpi-foot">
          <span class="kpi-sub">较上期 · ${aggFn === 'avg' ? '均值' : '合计'}</span>
          ${sparkline(series.values, color)}
        </div>
      </div>`;
  }).join('');

  /* --- 趋势 --- */
  const trendMetric = primary;
  if (timeField && trendMetric) {
    const s = metricSeries(trendMetric, aggForMetric(trendMetric), rowsIn);
    const opt = baseOption();
    opt.grid = { left: 8, right: 16, top: 26, bottom: 6, containLabel: true };
    opt.legend = { show: false };
    opt.xAxis = { ...catAxis(), data: s.labels, boundaryGap: false };
    opt.yAxis = valAxis([trendMetric]);
    const color = PALETTE[0];
    opt.series = [{
      type: 'line', name: trendMetric.label, data: s.values,
      smooth: .35, symbol: 'circle', symbolSize: 5.5,
      lineStyle: { width: 2.8, color },
      itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: gradient(0, 0, 0, 1, [
          { offset: 0, color: hexA(color, .3) },
          { offset: 1, color: hexA(color, .01) }
        ])
      }
    }];
    mount('chart-trend', opt);
    $('#trend-sub').textContent = `${timeField.label} · ${trendMetric.label}`;
    const growth = s.values.length > 1 && s.values[0]
      ? (s.values[s.values.length - 1] - s.values[0]) / Math.abs(s.values[0]) * 100 : null;
    $('#trend-chip').textContent = growth === null ? '—' : `累计 ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
    $('#trend-chip').className = 'chip ' + (growth === null ? '' : growth >= 0 ? 'accent' : 'accent');
  } else {
    mount('chart-trend', emptyOption('缺少时间或数值字段，无法生成趋势'));
    $('#trend-sub').textContent = '需要时间字段';
    $('#trend-chip').textContent = '—';
  }

  /* --- 结构占比 --- */
  const shareDim = dims.find(d => d.key !== state.chart.x) || dims[0];
  if (shareDim && primary) {
    const g = groupRows(rowsIn, shareDim.key);
    const data = Array.from(g.keys())
      .map(k => ({ name: k, value: aggregate(g.get(k), primary.key, aggForMetric(primary)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const total = data.reduce((a, b) => a + b.value, 0);
    mount('chart-share', {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0,
        padding: [9, 13], textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${p.name}<br/><b>${fmt(p.value, primary)}</b> · ${(p.value / total * 100).toFixed(1)}%`
      },
      legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 7, itemHeight: 7, itemGap: 10, textStyle: { color: '#7b8598', fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['44%', '66%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2.5, borderRadius: 5 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 600, formatter: p => `${p.name}\n${p.percent}%` } },
        data
      }]
    });
    $('#share-sub').textContent = `${shareDim.label} · ${primary.label}`;
    $('#share-chip').textContent = `${data.length} 类`;
  } else {
    mount('chart-share', emptyOption('缺少分类字段'));
    $('#share-sub').textContent = '需要分类维度';
    $('#share-chip').textContent = '—';
  }

  /* --- 排名 --- */
  const rankDim = dims[0];
  if (rankDim && primary) {
    const g = groupRows(rowsIn, rankDim.key);
    const data = Array.from(g.keys())
      .map(k => ({ name: k, value: aggregate(g.get(k), primary.key, aggForMetric(primary)) }))
      .sort((a, b) => a.value - b.value)
      .slice(-6);
    mount('chart-top', {
      color: [PALETTE[0]],
      textStyle: { fontFamily: FONT },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(79,70,229,.06)' } },
        backgroundColor: 'rgba(15,23,42,.93)', borderWidth: 0, padding: [9, 13],
        textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: FONT },
        formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value, primary)}</b>`
      },
      grid: { left: 8, right: 52, top: 8, bottom: 6, containLabel: true },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f4f9' } }, axisLabel: { color: '#a3abbd', fontSize: 10.5, formatter: v => fmtAxis(v) } },
      yAxis: { type: 'category', data: data.map(d => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#5c6779', fontSize: 11.5 } },
      series: [{
        type: 'bar',
        data: data.map(d => d.value),
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: gradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(79,70,229,.55)' },
            { offset: 1, color: 'rgba(79,70,229,1)' }
          ])
        },
        label: { show: true, position: 'right', fontSize: 10.5, color: '#7b8598', formatter: p => fmtAxis(p.value) }
      }]
    });
    $('#top-sub').textContent = `${rankDim.label} · ${primary.label}`;
  } else {
    mount('chart-top', emptyOption('缺少排名维度'));
    $('#top-sub').textContent = '需要分类维度';
  }

  renderQuality();
}

function pickKpis() {
  const metrics = numberFields();
  const score = f => {
    let s = 0;
    if (/销售额|营收|收入|成交额|GMV|MRR|运费|花费/.test(f.label)) s += 12;
    if (/量|人数|用户|客户|订单|产量|套数/.test(f.label)) s += 8;
    if (f.kind === 'rate') s -= 6;
    if (f.kind === 'money') s += 3;
    return s;
  };
  return [...metrics].sort((a, b) => score(b) - score(a)).slice(0, 4);
}

function metricSeries(field, aggFn, rows) {
  const ds = state.dataset;
  const tf = dateFields()[0];
  const src = rows || ds.rows;
  if (tf) {
    const g = groupRows(src, tf.key);
    const labels = Array.from(g.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    return { labels, values: labels.map(k => aggregate(g.get(k), field.key, aggFn)) };
  }
  const chunk = Math.max(1, Math.ceil(src.length / 12));
  const labels = [], values = [];
  for (let i = 0; i < src.length; i += chunk) {
    labels.push('#' + (labels.length + 1));
    values.push(aggregate(src.slice(i, i + chunk), field.key, aggFn));
  }
  return { labels, values };
}

function sparkline(values, color) {
  const w = 74, h = 26;
  if (!values || values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 6)
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${w} ${h} L0 ${h} Z`;
  const id = 'sg' + Math.random().toString(36).slice(2, 7);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".22"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
  </svg>`;
}

function renderQuality() {
  const ds = state.dataset;
  let missing = 0;
  const totalCells = ds.rows.length * ds.fields.length;
  ds.rows.forEach(r => ds.fields.forEach(f => {
    const v = r[f.key];
    if (v === '' || v === null || v === undefined) missing++;
  }));
  const seen = new Set();
  let dup = 0;
  ds.rows.forEach(r => {
    const k = ds.fields.map(f => String(r[f.key])).join('\u0001');
    if (seen.has(k)) dup++; else seen.add(k);
  });
  const completeness = totalCells ? (1 - missing / totalCells) * 100 : 0;
  const numCols = numberFields().length;

  const row = (k, v, extra = '') => `<div class="q-row"><span class="q-k">${k}</span><span class="q-v">${v}</span>${extra}</div>`;

  $('#quality').innerHTML = `
    <div class="q-row">
      <span class="q-k">完整度</span>
      <span class="q-v">${completeness.toFixed(1)}%</span>
      <div class="q-bar"><i style="width:${completeness}%"></i></div>
      <span class="q-tag ${completeness < 98 ? 'warn' : ''}">${completeness >= 99 ? '优秀' : completeness >= 96 ? '良好' : '需清洗'}</span>
    </div>
    ${row('记录行数', ds.rows.length.toLocaleString('zh-CN') + ' 行')}
    ${row('字段数量', ds.fields.length + ' 列 · 数值 ' + numCols + ' 列')}
    ${row('缺失单元格', missing.toLocaleString('zh-CN') + ' 个', `<span class="q-tag ${missing ? 'warn' : ''}" style="margin-left:auto">${missing ? '待处理' : '无缺失'}</span>`)}
    ${row('重复记录', dup + ' 条', `<span class="q-tag ${dup ? 'warn' : ''}" style="margin-left:auto">${dup ? '建议去重' : '无重复'}</span>`)}
    ${row('数据来源', ds.source === 'template' ? '行业模板 · 示例数据' : '本地导入文件')}
  `;
}

/* ------------------------- 10. 图表分析 ------------------------- */
const CHART_TYPES = [
  { id: 'bar', label: '柱状图' },
  { id: 'hbar', label: '条形图' },
  { id: 'line', label: '折线图' },
  { id: 'area', label: '面积图' },
  { id: 'pie', label: '饼图' },
  { id: 'donut', label: '环形图' },
  { id: 'scatter', label: '散点图' },
  { id: 'radar', label: '雷达图' },
  { id: 'funnel', label: '漏斗图' },
  { id: 'treemap', label: '矩形树图' },
  { id: 'heatmap', label: '热力图' }
];

/* 单序列图表：只用一个统计指标（点谁选谁），避免多指标混排 */
const SINGLE_METRIC_TYPES = ['pie', 'donut', 'funnel', 'treemap', 'heatmap'];

function renderChartControls() {
  const dims = state.dataset.fields;   // 维度可选任意字段（文本 / 日期 / 数值）
  const metrics = metricFields();
  const c = state.chart;

  if (!dims.find(d => d.key === c.x) && dims[0]) c.x = dims[0].key;
  if (c.col && !dims.find(d => d.key === c.col)) c.col = '';   // 列维度失效则清空
  if (c.col === c.x) c.col = '';                               // 行/列不能是同一字段
  c.ys = c.ys.filter(k => metrics.find(m => m.key === k));
  if (!c.ys.length && metrics[0]) c.ys = [metrics[0].key];

  $('#sel-x').innerHTML = dims.map(d => `<option value="${esc(d.key)}" ${d.key === c.x ? 'selected' : ''}>${esc(d.label)}（${FIELD_TYPE_LABEL[d.type] || d.type}）</option>`).join('');
  const colSel = $('#sel-col');
  if (colSel) {
    colSel.innerHTML = `<option value="">（无 · 单序列）</option>` + dims
      .filter(d => d.key !== c.x)
      .map(d => `<option value="${esc(d.key)}" ${d.key === c.col ? 'selected' : ''}>${esc(d.label)}（${FIELD_TYPE_LABEL[d.type] || d.type}）</option>`).join('');
  }
  const colHint = $('#col-hint');
  if (colHint) {
    const single = SINGLE_METRIC_TYPES.includes(c.type) && c.type !== 'heatmap';
    colHint.textContent = !c.col ? '列维度用于拆分多序列'
      : c.type === 'heatmap' ? '热力图按 行维度 × 列维度 交叉着色'
      : single ? '当前图表只画单序列，列维度仅对热力图生效'
      : '已按列维度拆分多序列（最多 8 条）';
  }

  syncRangeSelect('#sel-range', '#range-label');
  syncCustomRange(state.range, { wrap: '#range-custom', start: '#range-start', end: '#range-end', hit: '#range-hit' });

  $$('#type-chips .chip-btn').forEach(b => b.classList.toggle('on', b.dataset.type === c.type));
  renderMetricPicker(metrics, c.ys);

  $('#sel-agg').value = c.agg;
  $('#sel-sort').value = c.sort;
  $('#sel-top').value = String(c.topN);
  $('#chk-label').checked = c.showLabel;
}

const FIELD_TYPE_LABEL = { string: '文本', date: '日期', number: '数值' };

/* 统计指标多选下拉（复选框式，至少保留一个） */
function renderMetricPicker(metrics, ys) {
  const pop = $('#metric-pop');
  if (!pop) return;
  pop.innerHTML = metrics.map(m =>
    `<label><input type="checkbox" data-metric="${esc(m.key)}" ${ys.includes(m.key) ? 'checked' : ''}> ${esc(m.label)}</label>`
  ).join('');
  $$('#metric-pop input').forEach(cb => {
    cb.onchange = () => {
      const key = cb.dataset.metric;
      const ysNow = state.chart.ys;
      if (cb.checked) {
        if (SINGLE_METRIC_TYPES.includes(state.chart.type)) {
          state.chart.ys = [key];   // 单序列图表：只保留一个指标
        } else {
          state.chart.ys = [...ysNow, key].slice(-4);   // 最多同时 4 个指标
        }
      } else {
        if (ysNow.length <= 1) { cb.checked = true; toast('至少保留一个统计指标'); return; }
        state.chart.ys = ysNow.filter(k => k !== key);
      }
      syncAggDefault();
      renderMainChart();
    };
  });
  updateMetricBtnText();
}

function updateMetricBtnText() {
  const el = $('#metric-btn-text');
  if (!el) return;
  const labels = state.chart.ys.map(k => (metricField(k) || {}).label).filter(Boolean);
  const text = labels.join('、');
  el.textContent = text.length > 14 ? text.slice(0, 13) + '…' : (text || '请选择');
  el.parentElement.title = labels.length ? `已选指标：${text}` : '请选择统计指标';
}

function renderRecs() {
  const dims = stringFields();
  const t = dateFields()[0];
  const primary = pickPrimaryMetric();
  if (!primary) { $('#recs').innerHTML = ''; return; }

  const recs = [];
  if (t) recs.push({ t: `${t.label}趋势`, d: `折线 · ${primary.label}`, type: 'line', x: t.key, ys: [primary.key] });
  if (dims[0]) recs.push({ t: `${dims[0].label}对比`, d: `条形 · ${primary.label}`, type: 'hbar', x: dims[0].key, ys: [primary.key] });
  if (dims[1]) recs.push({ t: `${dims[1].label}占比`, d: `环形 · ${primary.label}`, type: 'donut', x: dims[1].key, ys: [primary.key] });
  if (dims[0] && numberFields().length >= 3) recs.push({ t: '多维能力雷达', d: `雷达 · ${dims[0].label}`, type: 'radar', x: dims[0].key, ys: numberFields().slice(0, 4).map(f => f.key) });

  const icon = id => {
    const map = {
      line: '<path d="M3 16l5-5 4 3 6-8" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      hbar: '<path d="M4 7h13M4 12h9M4 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      donut: '<circle cx="12" cy="12" r="7.2" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M12 4.8V12l5 3.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      radar: '<path d="M12 4l7 5-2.7 8.2H7.7L5 9z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none">${map[id] || map.line}</svg>`;
  };

  $('#recs').innerHTML = recs.map((r, i) => `
    <button class="rec" data-rec="${i}">
      <span class="rec-ico">${icon(r.type)}</span>
      <span><span class="rec-t">${esc(r.t)}</span><span class="rec-d">${esc(r.d)}</span></span>
    </button>
  `).join('');

  $$('#recs .rec').forEach(btn => {
    btn.onclick = () => {
      const r = recs[Number(btn.dataset.rec)];
      state.chart.type = r.type;
      state.chart.x = r.x;
      state.chart.ys = r.ys;
      state.chart.sort = 'desc';
      state.chart.topN = 10;
      syncAggDefault();
      renderChartControls();
      renderMainChart();
      toast('已应用推荐配置');
    };
  });
}

function renderMainChart() {
  if (!state.dataset) return;
  renderChartControls();
  const c = state.chart;
  const xf = getField(c.x);
  const colF = c.col ? getField(c.col) : null;
  const mfs = c.ys.map(metricField).filter(Boolean);
  const typeLabel = (CHART_TYPES.find(t => t.id === c.type) || {}).label || '图表';
  const aggLabel = mfs.some(isCount) ? '记录数'
    : ({ sum: '求和', avg: '平均', max: '最大', min: '最小', count: '计数' })[c.agg];

  $('#chart-title').textContent = typeLabel;
  $('#chart-desc').textContent = xf && mfs.length
    ? `${mfs.map(f => f.label).join(' + ')} 按 ${xf.label}${colF ? ` × ${colF.label}` : ''} 分组 · ${aggLabel}`
    : '请选择维度与指标';
  $('#chart-meta').textContent = `${CHART_TYPES.findIndex(t => t.id === c.type) + 1} / ${CHART_TYPES.length}`;

  mount('chart-main', chartOption());
  setTimeout(resizeCharts, 60);
}

/* ------------------------- 11. 数据透视 ------------------------- */
function renderPivotControls() {
  const dims = state.dataset.fields;   // 行 / 列维度可选任意字段（文本 / 日期 / 数值）
  const metrics = metricFields();
  const p = state.pivot;

  if (!dims.find(d => d.key === p.row) && dims[0]) p.row = dims[0].key;
  if (p.col && !dims.find(d => d.key === p.col)) p.col = '';
  if (!metrics.find(m => m.key === p.val) && metrics[0]) p.val = metrics[0].key;

  $('#pv-row').innerHTML = dims.map(d => `<option value="${esc(d.key)}" ${d.key === p.row ? 'selected' : ''}>${esc(d.label)}（${FIELD_TYPE_LABEL[d.type] || d.type}）</option>`).join('');
  $('#pv-col').innerHTML = `<option value="">（无）</option>` + dims.map(d => `<option value="${esc(d.key)}" ${d.key === p.col ? 'selected' : ''}>${esc(d.label)}（${FIELD_TYPE_LABEL[d.type] || d.type}）</option>`).join('');
  $('#pv-val').innerHTML = metrics.map(m => `<option value="${esc(m.key)}" ${m.key === p.val ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  $('#pv-agg').value = p.agg;

  syncRangeSelect('#pv-range', '#pv-range-label');
  syncCustomRange(state.range, { wrap: '#pv-custom', start: '#pv-start', end: '#pv-end', hit: '#pv-hit' });
}

function buildPivot() {
  const ds = state.dataset, p = state.pivot;
  const rowF = getField(p.row), valF = metricField(p.val), colF = p.col ? getField(p.col) : null;
  if (!rowF || !valF) return null;
  const aggFn = isCount(valF) ? 'count' : p.agg;

  const rowKeys = new Map();
  const colKeys = new Map();
  const cells = new Map();

  const rowsIn = applyGlobalRange(ds.rows);
  rowsIn.forEach(r => {
    const rk = String(r[rowF.key] ?? '未分类');
    const ck = colF ? String(r[colF.key] ?? '未分类') : '值';
    if (!rowKeys.has(rk)) rowKeys.set(rk, []);
    rowKeys.get(rk).push(r);
    colKeys.set(ck, true);
    const id = rk + '\u0001' + ck;
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(r);
  });

  const cols = Array.from(colKeys.keys()).slice(0, 10);
  const rows = Array.from(rowKeys.keys()).map(k => {
    const values = cols.map(c => {
      const arr = cells.get(k + '\u0001' + c);
      return arr ? aggregate(arr, valF.key, aggFn) : null;
    });
    const total = aggregate(rowKeys.get(k), valF.key, aggFn);
    return { key: k, values, total };
  }).sort((a, b) => b.total - a.total).slice(0, 24);

  return { rows, cols, rowF, colF, valF };
}

function renderPivot() {
  if (!state.dataset) return;
  renderPivotControls();
  const data = buildPivot();
  const wrap = $('#pivot-wrap');
  if (!data) {
    wrap.innerHTML = '<div class="empty">请选择行维度与值字段</div>';
    return;
  }
  const { rows, cols, rowF, colF, valF } = data;
  let max = 0;
  rows.forEach(r => r.values.forEach(v => { if (v !== null && Math.abs(v) > max) max = Math.abs(v); }));

  const head = `<thead><tr><th>${esc(rowF.label)}</th>${cols.map(c => `<th class="metric">${esc(colF ? c : valF.label)}</th>`).join('')}<th class="metric">合计</th></tr></thead>`;

  const body = rows.map(r => {
    const tds = r.values.map(v => {
      if (v === null) return `<td class="v"><span class="pv-val" style="color:#cbd2de">—</span></td>`;
      const w = max ? Math.max(2, Math.abs(v) / max * 100) : 0;
      return `<td class="v"><span class="pv-bar" style="width:${w}%"></span><span class="pv-val">${fmt(v, valF)}</span></td>`;
    }).join('');
    return `<tr><td class="dim">${esc(r.key)}</td>${tds}<td class="v"><span class="pv-val">${fmt(r.total, valF)}</span></td></tr>`;
  }).join('');

  const colTotals = cols.map((c, i) => {
    let s = 0, has = false;
    rows.forEach(r => { if (r.values[i] !== null) { s += r.values[i]; has = true; } });
    return has ? s : null;
  });
  const grand = rows.reduce((a, r) => a + r.total, 0);

  const foot = `<tr class="total"><td>合计</td>${colTotals.map(v => `<td class="v">${v === null ? '—' : fmt(v, valF)}</td>`).join('')}<td class="v">${fmt(grand, valF)}</td></tr>`;

  wrap.innerHTML = `<table class="pivot">${head}<tbody>${body}${foot}</tbody></table>`;
}

/* ------------------------- 12. 明细表格 ------------------------- */
function currentTableRows() {
  const ds = state.dataset;
  let rows = applyGlobalRange(ds.rows);   // 明细同样遵循全局时间范围
  const q = state.table.q.trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => ds.fields.some(f => String(r[f.key] ?? '').toLowerCase().includes(q)));
  }
  const sortKey = state.table.sort;
  if (sortKey) {
    const f = getField(sortKey);
    if (f) {
      rows = [...rows].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        let cmp;
        if (f.type === 'number') cmp = (Number(va) || 0) - (Number(vb) || 0);
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'zh-CN');
        return state.table.dir === 'asc' ? cmp : -cmp;
      });
    }
  }
  return rows;
}

function renderTable() {
  const ds = state.dataset;
  if (!ds) return;

  const allRows = currentTableRows();
  const size = state.table.size;
  const pages = Math.max(1, Math.ceil(allRows.length / size));
  if (state.table.page > pages) state.table.page = pages;
  const page = state.table.page;
  const slice = allRows.slice((page - 1) * size, page * size);

  const cols = ds.fields.filter(f => !state.hidden.has(f.key));
  const s = state.table.sort;

  const thead = `<thead><tr><th class="idx">#</th>${cols.map(f => `
    <th data-key="${esc(f.key)}" class="${f.type === 'number' ? 'num' : ''} ${s === f.key ? 'sorted' : ''}">
      ${esc(f.label)}<span class="sort-ind">${s === f.key ? (state.table.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${slice.map((r, i) => `
    <tr>
      <td class="idx">${(page - 1) * size + i + 1}</td>
      ${cols.map(f => f.type === 'number'
        ? `<td class="num">${fmt(r[f.key], f)}</td>`
        : `<td>${esc(r[f.key] === '' ? '—' : r[f.key])}</td>`).join('')}
    </tr>`).join('')}</tbody>`;

  const numericCols = cols.filter(f => f.type === 'number');
  const tfoot = numericCols.length ? `<tfoot><tr><td class="idx lbl">汇总</td>${cols.map(f => {
    if (f.type !== 'number') return '<td class="lbl"></td>';
    const sum = aggregate(allRows, f.key, aggForField(f));
    return `<td class="num">${fmt(sum, f)}</td>`;
  }).join('')}</tr></tfoot>` : '';

  $('#data-table').innerHTML = thead + tbody + tfoot;

  $('#table-sub').textContent = `${allRows.length} 条记录`
    + (state.range.range !== 'all' ? '（已按时间范围筛选）' : '')
    + ` · ${cols.length} 列展示 · 点击表头排序`;
  $('#table-count').textContent = `共 ${allRows.length} 条，第 ${page} / ${pages} 页` + (numericCols.length ? ' · 底部合计为当前筛选结果' : '');
  $('#pager').innerHTML = pagerHTML(page, pages);

  $$('#data-table thead th[data-key]').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.key;
      if (state.table.sort === k) state.table.dir = state.table.dir === 'asc' ? 'desc' : 'asc';
      else { state.table.sort = k; state.table.dir = 'desc'; }
      renderTable();
    };
  });
}

function pagerHTML(page, pages) {
  const out = [];
  out.push(`<button data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>`);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const list = Array.from(set).filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  let prev = 0;
  list.forEach(n => {
    if (n - prev > 1) out.push('<span class="gap">…</span>');
    out.push(`<button data-p="${n}" class="${n === page ? 'on' : ''}">${n}</button>`);
    prev = n;
  });
  out.push(`<button data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>`);
  return out.join('');
}

/* ------------------------- 13. 数据源 ------------------------- */
function renderTemplates() {
  const cur = state.dataset && state.dataset.tplId;
  $('#tpl-grid').innerHTML = TEMPLATES.map(t => `
    <div class="tpl ${cur === t.id ? 'on' : ''}" data-tpl="${t.id}">
      ${t.badge ? `<span class="tpl-badge">${t.badge}</span>` : ''}
      <div class="tpl-head">
        <div class="tpl-ico">${t.icon}</div>
        <div class="tpl-name">${t.name}</div>
      </div>
      <div class="tpl-desc">${t.desc}</div>
      <div class="tpl-foot">
        <span class="chip">${t.time.count} 期</span>
        <span class="chip">${t.dims.length} 维度</span>
        <span class="chip">${t.metrics.length} 指标</span>
      </div>
    </div>
  `).join('');

  $$('#tpl-grid .tpl').forEach(el => {
    el.onclick = () => {
      const tpl = TEMPLATES.find(t => t.id === el.dataset.tpl);
      if (!tpl) return;
      applyDataset(buildDataset(tpl));
      showView('overview');
      toast(`已载入「${tpl.name}」示例数据`);
    };
  });
}

function renderFields() {
  const ds = state.dataset;
  if (!ds) return;
  $('#field-list').innerHTML = ds.fields.map(f => `
    <div class="field-row">
      <span class="field-name">
        <input class="field-rename" data-field="${esc(f.key)}" value="${esc(f.label)}" title="点击修改列名">
        <span class="field-key">${esc(f.key)}</span>
      </span>
      <span class="field-type-tag">${f.type === 'number' ? '数值' : f.type === 'date' ? '日期' : '文本'}</span>
      <select class="sel" data-field="${esc(f.key)}">
        <option value="string" ${f.type === 'string' ? 'selected' : ''}>文本 / 维度</option>
        <option value="number" ${f.type === 'number' ? 'selected' : ''}>数值 / 指标</option>
        <option value="date" ${f.type === 'date' ? 'selected' : ''}>日期 / 时间</option>
      </select>
    </div>
  `).join('');

  $$('#field-list .field-rename').forEach(inp => {
    inp.onchange = () => {
      const f = getField(inp.dataset.field);
      if (!f) return;
      const v = inp.value.trim();
      if (!v || v === f.label) { inp.value = f.label; return; }
      f.label = v;
      if (f.type === 'number') f.kind = /率|占比|比例/.test(v) ? 'rate' : (/价|额|收入|成本|费用/.test(v) ? 'money' : 'number');
      renderColumnPicker();
      renderFields();
      renderCurrentView();
      toast(`列名已改为「${v}」`);
    };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
  });

  $$('#field-list .sel').forEach(sel => {
    sel.onchange = () => {
      const f = getField(sel.dataset.field);
      if (!f) return;
      f.type = sel.value;
      if (f.type === 'number') f.kind = /率|占比|比例/.test(f.label) ? 'rate' : (/价|额|收入|成本|费用/.test(f.label) ? 'money' : 'number');
      else if (f.type === 'date') f.kind = 'date';
      else f.kind = 'string';
      initChartState();
      initPivotState();
      renderFields();
      renderCurrentView();
      toast(`「${f.label}」已设为${sel.value === 'number' ? '数值指标' : sel.value === 'date' ? '时间维度' : '文本维度'}`);
    };
  });

  const ph = $('#btn-promote-header');
  if (ph) ph.style.display = (ds.rawMatrix && ds.rawMatrix.length > 2) ? '' : 'none';
}

/* 把首行数据提升为表头（导入时未勾选/未识别出表头的补救） */
function promoteFirstRowHeader() {
  const ds = state.dataset;
  const m = ds && ds.rawMatrix;
  if (!m || m.length < 3) { toast('没有可用的原始数据行'); return; }
  const nd = datasetFromMatrix([m[1], ...m.slice(2)], ds.name);
  if (!nd.fields.length) { toast('提升失败：请检查首行数据'); return; }
  nd.industry = ds.industry; nd.icon = ds.icon;
  applyDataset(nd);
  toast(`已将首行提升为表头：${nd.fields.length} 列 · ${nd.rows.length} 行`);
}

function renderColumnPicker() {
  const ds = state.dataset;
  $('#col-pop').innerHTML = ds.fields.map(f => `
    <label><input type="checkbox" data-col="${esc(f.key)}" ${state.hidden.has(f.key) ? '' : 'checked'}> ${esc(f.label)}</label>
  `).join('');
  $$('#col-pop input').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) state.hidden.delete(cb.dataset.col);
      else state.hidden.add(cb.dataset.col);
      renderTable();
    };
  });
}

/* ------------------------- 14. 视图切换与整体刷新 ------------------------- */
function applyDataset(ds) {
  state.dataset = ds;
  initChartState();
  initPivotState();
  updateTopbar();
  renderTemplates();
  renderFields();
  renderColumnPicker();
  renderCurrentView();
  setTimeout(resizeCharts, 80);
}

function updateTopbar() {
  const ds = state.dataset;
  if (!ds) return;
  $('#top-ds-name').textContent = ds.name;
  $('#top-ds-meta').textContent = `${ds.rows.length} 行 × ${ds.fields.length} 列`;
}

function renderCurrentView() {
  switch (state.view) {
    case 'overview': renderOverview(); break;
    case 'charts': renderRecs(); renderMainChart(); break;
    case 'pivot': renderPivot(); break;
    case 'table': renderTable(); break;
    case 'source': renderFields(); break;
  }
}

function showView(name) {
  state.view = name;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  renderCurrentView();
  requestAnimationFrame(() => { resizeCharts(); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------- 15. 导入流程 ------------------------- */
function loadMatrix(matrix, name) {
  const clean = matrix.filter(r => r && r.some(c => String(c === null || c === undefined ? '' : c).trim() !== ''));
  if (clean.length < 2) { toast('数据不足：至少需要表头和一行数据'); return; }
  const ds = datasetFromMatrix(autoFixHeader(clean), name);
  if (!ds.fields.length) { toast('未能识别出有效字段，请检查数据格式'); return; }
  applyDataset(ds);
  showView('overview');
  toast(`导入成功：${ds.rows.length} 行 × ${ds.fields.length} 列`);
}

function handleText(text, name) {
  const trimmed = String(text).trim();
  if (!trimmed) { toast('内容为空'); return; }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json) ? json : [json];
      const keys = Array.from(arr.reduce((s, o) => {
        Object.keys(o || {}).forEach(k => s.add(k));
        return s;
      }, new Set()));
      const matrix = [keys, ...arr.map(o => keys.map(k => o ? o[k] : ''))];
      loadMatrix(matrix, name || 'JSON 数据');
      return;
    } catch (e) { /* 继续按分隔符解析 */ }
  }
  const headerChecked = $('#paste-header').checked;
  let matrix = parseDelimited(trimmed);
  if (!headerChecked) {
    const width = Math.max(...matrix.map(r => r.length));
    matrix = [Array.from({ length: width }, (_, i) => '列' + (i + 1)), ...matrix];
  }
  loadMatrix(matrix, name || '粘贴数据');
}

async function handleFile(file) {
  const name = file.name;
  const lower = name.toLowerCase();
  try {
    if (/\.(xlsx|xls)$/.test(lower)) {
      toast('正在解析 Excel…');
      await ensureXLSX();
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      loadMatrix(matrix, name.replace(/\.(xlsx|xls)$/i, ''));
    } else if (/\.json$/.test(lower)) {
      const text = await file.text();
      handleText(text, name.replace(/\.json$/i, ''));
    } else {
      const text = await file.text();
      handleText(text, name.replace(/\.(csv|tsv|txt)$/i, ''));
    }
  } catch (err) {
    console.error(err);
    toast(err.message || '文件解析失败');
  }
}

/* ------------------------- 16. 事件绑定 ------------------------- */
function bindEvents() {
  $$('.nav-item').forEach(b => b.onclick = () => showView(b.dataset.view));
  $$('[data-view]').forEach(b => {
    if (!b.classList.contains('nav-item')) b.onclick = () => showView(b.dataset.view);
  });

  // 图表控件
  $('#type-chips').innerHTML = CHART_TYPES.map(t => `<button class="chip-btn" data-type="${t.id}">${t.label}</button>`).join('');
  $$('#type-chips .chip-btn').forEach(b => {
    b.onclick = () => {
      state.chart.type = b.dataset.type;
      if (b.dataset.type === 'radar' && state.chart.ys.length < 3) {
        state.chart.ys = numberFields().slice(0, 4).map(f => f.key);
        syncAggDefault();
      }
      // 单序列图表只保留一个指标，避免饼图/环形图等出现多指标混排
      if (SINGLE_METRIC_TYPES.includes(b.dataset.type) && state.chart.ys.length > 1) {
        state.chart.ys = [state.chart.ys[0]];
        syncAggDefault();
      }
      renderChartControls();
      renderMainChart();
    };
  });

  $('#sel-x').onchange = e => {
    state.chart.x = e.target.value;
    if (state.chart.col === state.chart.x) state.chart.col = '';
    renderMainChart();
  };
  const selCol = $('#sel-col');
  if (selCol) selCol.onchange = e => {
    state.chart.col = e.target.value;
    if (state.chart.col && state.chart.col === state.chart.x) {
      // 行/列同一字段时自动换一个行维度，避免无意义的自我交叉
      const other = state.dataset.fields.find(f => f.key !== state.chart.col);
      if (other) state.chart.x = other.key;
    }
    // 热力图 / 多序列都需要列维度，换成柱/线/热力时给个提示
    renderMainChart();
  };
  // 统计指标多选下拉：点击按钮开合，点击选项由 renderMetricPicker 内的 checkbox onchange 处理
  $('#btn-metrics').onclick = e => {
    e.stopPropagation();
    $('#metric-pop').classList.toggle('open');
  };
  $('#metric-pop').onclick = e => e.stopPropagation();
  $('#sel-agg').onchange = e => { state.chart.agg = e.target.value; renderMainChart(); };
  $('#sel-sort').onchange = e => { state.chart.sort = e.target.value; renderMainChart(); };
  $('#sel-top').onchange = e => { state.chart.topN = Number(e.target.value); renderMainChart(); };
  $('#chk-label').onchange = e => { state.chart.showLabel = e.target.checked; renderMainChart(); };
  $('#sel-range').onchange = e => {
    onRangeSelect(e.target.value);
    renderMainChart();
  };
  ['#range-start', '#range-end'].forEach(id => {
    $(id).onchange = () => applyCustomDate('charts');
  });

  // 概览：时间范围（与图表分析 / 数据透视共用同一全局范围）
  $('#ov-range').onchange = e => {
    onRangeSelect(e.target.value);
    renderOverview();
  };
  ['#ov-start', '#ov-end'].forEach(id => {
    $(id).onchange = () => applyCustomDate('overview');
  });

  $('#btn-png').onclick = () => {
    const inst = state.charts.get('chart-main');
    if (!inst) { toast('图表尚未生成'); return; }
    const url = inst.getDataURL({ pixelRatio: 2, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `图表_${Date.now()}.png`;
    a.click();
    toast('图表已导出为 PNG');
  };

  // 透视
  ['pv-row', 'pv-col', 'pv-val', 'pv-agg'].forEach(id => {
    $('#' + id).onchange = e => {
      const k = id.replace('pv-', '');
      state.pivot[k] = e.target.value;
      renderPivot();
    };
  });
  $('#pv-range').onchange = e => {
    onRangeSelect(e.target.value);
    renderPivot();
  };
  ['#pv-start', '#pv-end'].forEach(id => {
    $(id).onchange = () => applyCustomDate('pivot');
  });
  $('#btn-pivot-csv').onclick = () => {
    const data = buildPivot();
    if (!data) { toast('暂无透视结果'); return; }
    const fields = [{ key: 'key', label: data.rowF.label },
      ...data.cols.map((c, i) => ({ key: 'c' + i, label: data.colF ? c : data.valF.label })),
      { key: 'total', label: '合计' }];
    const rows = data.rows.map(r => {
      const o = { key: r.key, total: r.total };
      r.values.forEach((v, i) => o['c' + i] = v === null ? '' : v);
      return o;
    });
    download(`透视表_${data.rowF.label}_${Date.now()}.csv`, toCSV(fields, rows));
    toast('透视表已导出');
  };

  // 表格
  $('#table-search').oninput = e => {
    state.table.q = e.target.value;
    state.table.page = 1;
    renderTable();
  };
  $('#page-size').onchange = e => {
    state.table.size = Number(e.target.value);
    state.table.page = 1;
    renderTable();
  };
  $('#pager').onclick = e => {
    const btn = e.target.closest('button[data-p]');
    if (!btn || btn.disabled) return;
    state.table.page = Number(btn.dataset.p);
    renderTable();
  };
  $('#btn-cols').onclick = e => {
    e.stopPropagation();
    $('#col-pop').classList.toggle('open');
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('#col-picker')) $('#col-pop').classList.remove('open');
    if (!e.target.closest('#metric-picker')) $('#metric-pop').classList.remove('open');
  });
  $('#btn-table-csv').onclick = () => {
    const cols = state.dataset.fields.filter(f => !state.hidden.has(f.key));
    download(`${state.dataset.name}_${Date.now()}.csv`, toCSV(cols, currentTableRows()));
    toast('当前结果已导出');
  };

  // 数据源 tabs
  $$('#src-tabs .tab').forEach(t => {
    t.onclick = () => {
      $$('#src-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
      $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + t.dataset.tab));
    };
  });

  $('#btn-parse-paste').onclick = () => handleText($('#paste-area').value, '粘贴数据');
  $('#paste-area').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('#btn-parse-paste').click();
  });

  const dz = $('#dropzone'), fi = $('#file-input');
  dz.onclick = () => fi.click();
  fi.onchange = () => { if (fi.files[0]) handleFile(fi.files[0]); fi.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  $('#btn-import').onclick = () => {
    showView('source');
    $$('#src-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === 'upload'));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-upload'));
  };

  $('#btn-export').onclick = () => {
    const ds = state.dataset;
    download(`${ds.name}_${Date.now()}.csv`, toCSV(ds.fields, ds.rows));
    toast('已导出全部数据');
  };

  $('#btn-promote-header').onclick = () => promoteFirstRowHeader();

  $('#btn-reset-fields').onclick = () => {
    const ds = state.dataset;
    if (ds.source === 'template') {
      const tpl = TEMPLATES.find(t => t.id === ds.tplId);
      if (tpl) { applyDataset(buildDataset(tpl)); toast('已恢复模板字段类型'); }
    } else {
      toast('自定义数据请手动设置字段类型');
    }
  };

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(resizeCharts, 150);
  });
}

/* ------------------------- 18. 图表引擎迟到加载 ------------------------- */
/* echarts 异步加载完成后调用：置位标志并重画当前视图的图表 */
window.__dcEchartsReady = function () {
  if (!window.echarts) return;
  ECHARTS_OK = true;
  state.charts.forEach(inst => { try { inst.dispose(); } catch (e) { /* noop */ } });
  state.charts.clear();
  try { renderCurrentView(); } catch (e) { /* noop */ }
  requestAnimationFrame(resizeCharts);
};

/* ------------------------- 17. 初始化 ------------------------- */
function init() {
  bindEvents();
  if (!ECHARTS_OK) toast('图表引擎加载中，稍等几秒图表会自动出现');
  applyDataset(buildDataset(TEMPLATES[0]));
  const hash = (location.hash || '').replace('#', '');
  const [v, param] = hash.split('/');
  showView(['overview', 'charts', 'pivot', 'table', 'source'].includes(v) ? v : 'overview');
  if (v === 'charts' && param && CHART_TYPES.some(t => t.id === param)) {
    state.chart.type = param;
    syncAggDefault();
    renderMainChart();
  }
}

init();
