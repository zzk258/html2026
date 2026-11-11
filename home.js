/* ============================================================
   home.js — 工作台主页（前端案例 / 网络日志 / 运维日志）
   设计要点：
   1. 唯一数据源 DATA —— 侧栏列表与预览均由它渲染
   2. 三个项目模块（前端 / 网络 / 运维）由顶栏切换，前端为默认
   3. 网络 / 运维 的图文日志交给「更新日志」组件（LogBoard）托管
   4. 事件委托 + hash 记忆 + 新窗口打开 + iframe 刷新
   ============================================================ */

'use strict';

/* ---------------- 数据：全部前端案例（唯一数据源） ---------------- */
const DATA = [
	{
		id: 'html',
		name: 'HTML 网页',
		icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
		items: [
			{ name: '响应式图文展示页', url: 'html/alshow/index.html', desc: '基于 Bootstrap 栅格实现，缩放窗口可观察排版与显隐变化（hidden-xs 等）' },
			{ name: '移动端购物商城', url: 'html/hm/index.html', desc: 'rem 响应式布局，flexible 适配，轮播动画用 swiper 实现，CSS 采用 less 预处理' },
			{ name: '学成在线教育首页', url: 'html/studyhtml/index.html', desc: 'PC 端传统布局练习：header / banner / 精品推荐等模块化切分' },
			{ name: '携程移动端首页', url: 'html/xh/index.html', desc: '移动端 flex 布局，本地导航、sprite 雪碧图与 flex-wrap 应用' },
			{ name: '京东移动端首页', url: 'html/jd/index.html', desc: '移动端首页练习，图标使用 icomoon 字体图标，swiper 轮播' }
		]
	},
	{
		id: 'js',
		name: 'JavaScript',
		icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l-4 3 4 3"/><path d="M16 9l4 3-4 3"/><path d="M13 5l-2 14"/></svg>',
		items: [
			{ name: '替换文本', url: 'js/contentFind/index.html', desc: '字符串查找与替换练习' },
			{ name: '文本移动', url: 'js/contentMove/index.html', desc: 'DOM 节点的上移 / 下移操作' },
			{ name: '动态生成元素', url: 'js/createDiv/index.html', desc: 'createElement 动态创建与插入 DOM 元素' },
			{ name: '拖动', url: 'js/draw/index.html', desc: 'mousedown / mousemove / mouseup 实现元素拖拽' },
			{ name: '图片切换', url: 'js/jpgChange/index.html', desc: '定时器切换图片的简易轮播' },
			{ name: '图片切换（索引版）', url: 'js/jpgChangeIndex/index.html', desc: '带索引指示的图片切换轮播' },
			{ name: '缓动移动', url: 'js/startMove/index.html', desc: '封装缓动动画函数，点击元素平滑移动' },
			{ name: '无缝轮播', url: 'js/swiper/index.html', desc: '原生 JS 无缝轮播图：自动播放、左右箭头、小圆点切换' }
		]
	},
	{
		id: 'jquery',
		name: 'jQuery',
		icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
		items: [
			{ name: '动画效果', url: 'jquery/animation/index.html', desc: 'jQuery show / hide / toggle 及自定义动画练习' },
			{ name: '留言板', url: 'jquery/event/index.html', desc: 'jQuery 事件与节点操作：发布留言、追加列表' },
			{ name: '电梯导航', url: 'jquery/nav/index.html', desc: '滚动监听 + 电梯式楼层导航联动高亮' },
			{ name: '购物计算卡', url: 'jquery/shopCart/index.html', desc: '全选、数量增减、删除、小计与总计实时计算' }
		]
	},
	{
		id: 'project',
		name: '项目开发案例',
		icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
		items: [
			{ name: '在线音乐播放器', url: 'vue/musicSeach/index.html', desc: '歌曲搜索 + 播放列表，支持搜索歌手/专辑、推荐榜单与响应式适配，桌面与移动端通用' },
			{ name: '极简阅读器', url: 'vue/极简阅读器/index.html', desc: '本地导入 EPUB 电子书，支持拖拽打开、阅读进度记录、笔记面板与排版主题切换' }
		]
	}
];

/* ---------------- 模块：前端 / 网络 / 运维 ---------------- */
const MODULE_IDS = ['front', 'net', 'ops'];

/* 网络、运维各自的日志面板配置（存储键 = id） */
const LOG_MODULES = {
	net: {
		id: 'net',
		title: '网络日志',
		desc: '用一篇文章介绍一个网络项目：背景、做法、结果',
		tags: ['项目介绍', '网络', '交换机', '出口链路', '故障处理', '配置变更']
	},
	ops: {
		id: 'ops',
		title: '运维日志',
		desc: '用一篇文章介绍一个运维项目：变更、巡检与复盘',
		tags: ['项目介绍', '运维', '部署发布', '巡检', '备份恢复', '故障处理']
	}
};

/* ---------------- 工具 ---------------- */
const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
	return s.replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	}[c]));
}

/* 高亮搜索命中片段 */
function highlight(name, kw) {
	const safe = escapeHtml(name);
	if (!kw) return safe;
	const i = name.toLowerCase().indexOf(kw.toLowerCase());
	if (i < 0) return safe;
	return escapeHtml(name.slice(0, i)) + '<mark>' + escapeHtml(name.slice(i, i + kw.length)) + '</mark>' + escapeHtml(name.slice(i + kw.length));
}

/* ---------------- 状态 ---------------- */
const state = {
	module: 'front',
	keyword: '',
	current: null   // { catId, index }
};

/* ---------------- 渲染：侧栏 ---------------- */
function renderNav() {
	const nav = $('#nav');
	const kw = state.keyword.trim();
	nav.classList.toggle('searching', !!kw);

	const cats = DATA.map((cat) => {
		const items = cat.items
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => !kw
				|| item.name.toLowerCase().includes(kw.toLowerCase())
				|| item.desc.toLowerCase().includes(kw.toLowerCase()));

		if (!items.length) return '';

		const listHtml = items.map(({ item, index }) => `
			<li>
				<a class="item" href="${item.url}" target="preview" title="${escapeHtml(item.desc)}"
				   data-cat="${cat.id}" data-index="${index}">${highlight(item.name, kw)}</a>
			</li>`).join('');

		return `
			<section class="cat${kw || cat.id === 'html' || cat.id === 'project' ? ' open' : ''}" data-cat="${cat.id}">
				<button type="button" class="cat-head" data-cat="${cat.id}">
					<span class="cat-icon">${cat.icon}</span>
					<span>${escapeHtml(cat.name)}</span>
					<span class="cat-count">${cat.items.length}</span>
					<span class="cat-arrow">▶</span>
				</button>
				<ul class="cat-items">${listHtml}</ul>
			</section>`;
	}).join('');

	nav.innerHTML = cats || '<div class="nav-empty">没有匹配的案例<br>换个关键词试试～</div>';
}

/* ---------------- 渲染：预览区 ---------------- */
/**
 * 选中某个案例
 * @param {string} catId  分类 id
 * @param {number} index  分类内序号
 * @param {object} opt    { loadFrame: 是否由 JS 设置 iframe.src（点击 <a> 时为 false，交给浏览器默认行为）,
 *                          updateHash: 是否写入地址栏 hash }
 */
function loadPreview(catId, index, { loadFrame = true, updateHash = true } = {}) {
	const cat = DATA.find((c) => c.id === catId);
	if (!cat || !cat.items[index]) return;

	state.current = { catId, index };
	const item = cat.items[index];

	// 工具栏信息
	$('#curTitle').textContent = item.name;
	$('#curDesc').textContent = item.desc;
	$('#btnOpen').href = item.url;

	// iframe（点击真实链接时浏览器已通过 target="preview" 加载，无需重复赋值）
	if (loadFrame) $('#preview').src = item.url;
	$('#stageEmpty').classList.add('hidden');

	// 侧栏高亮
	document.querySelectorAll('.item.active').forEach((el) => el.classList.remove('active'));
	const link = document.querySelector(`.item[data-cat="${catId}"][data-index="${index}"]`);
	if (link) {
		link.classList.add('active');
		const catEl = link.closest('.cat');
		if (catEl) catEl.classList.add('open');
	}

	if (updateHash) {
		try {
			history.replaceState(null, '', '#' + encodeURIComponent(item.url));
		} catch (_) {
			/* file:// 协议下部分浏览器禁止改写 history，忽略即可，不影响预览 */
		}
	}
	try {
		localStorage.setItem('home.last', JSON.stringify(state.current));
	} catch (_) { /* 隐私模式忽略 */ }
}

/* ---------------- 模块切换（前端 / 网络 / 运维） ---------------- */
const logBoards = {};   // 已挂载的日志面板，切换模块时复用，避免重复渲染

function getLogBoard(modId) {
	if (logBoards[modId]) return logBoards[modId];

	const slot = document.querySelector(`.lb-slot[data-slot="${modId}"]`);
	if (!slot) return null;

	if (!window.LogBoard) {
		slot.innerHTML = '<div class="lb-empty"><strong>日志组件未加载</strong>请确认「更新日志/log-board.js」已正确引入</div>';
		return null;
	}

	logBoards[modId] = window.LogBoard.mount(slot, LOG_MODULES[modId]);
	return logBoards[modId];
}

function setModule(id) {
	const target = MODULE_IDS.includes(id) ? id : 'front';

	MODULE_IDS.forEach((m) => document.body.classList.toggle('module-' + m, m === target));
	document.querySelectorAll('.module-btn').forEach((btn) => {
		const on = btn.dataset.module === target;
		btn.classList.toggle('active', on);
		btn.setAttribute('aria-selected', on ? 'true' : 'false');
	});

	state.module = target;

	// 第一次进入网络 / 运维时才挂载日志面板
	if (target !== 'front') getLogBoard(target);
}

/* ---------------- 事件 ---------------- */
function bindEvents() {
	const nav = $('#nav');

	// 项目切换
	$('#modules').addEventListener('click', (e) => {
		const btn = e.target.closest('.module-btn');
		if (btn) setModule(btn.dataset.module);
	});

	// 分类折叠 / 选中案例（事件委托，只绑一次）
	nav.addEventListener('click', (e) => {
		const link = e.target.closest('.item');
		if (link) {
			// <a target="preview"> 由浏览器负责加载 iframe，这里只同步界面状态
			loadPreview(link.dataset.cat, Number(link.dataset.index), { loadFrame: false });
			return;
		}
		const headBtn = e.target.closest('.cat-head');
		if (headBtn) {
			headBtn.closest('.cat').classList.toggle('open');
		}
	});

	// 搜索
	const input = $('#searchInput');
	const clearBtn = $('#searchClear');
	let timer = null;

	input.addEventListener('input', () => {
		clearBtn.hidden = !input.value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			state.keyword = input.value;
			renderNav();
		}, 150);
	});
	clearBtn.addEventListener('click', () => {
		input.value = '';
		clearBtn.hidden = true;
		state.keyword = '';
		renderNav();
		input.focus();
	});

	// 刷新 iframe
	$('#btnReload').addEventListener('click', () => {
		const ifr = $('#preview');
		ifr.src = ifr.src; // 重新赋值即重载（file:// 下无跨域限制问题）
	});

	// 侧栏收起 / 展开
	$('#btnMenu').addEventListener('click', () => {
		document.querySelector('.layout').classList.toggle('nav-collapsed');
	});

	// hash 恢复（刷新页面保持当前案例）
	window.addEventListener('hashchange', () => {
		const url = decodeURIComponent(location.hash.slice(1));
		if (!url) return;
		for (const cat of DATA) {
			const index = cat.items.findIndex((it) => it.url === url);
			if (index >= 0) { loadPreview(cat.id, index, { updateHash: false }); return; }
		}
	});
}

/* ---------------- 启动 ---------------- */
function init() {
	const total = DATA.reduce((n, c) => n + c.items.length, 0);
	$('#statTotal').textContent = `共 ${total} 个案例`;

	// 打开主页默认停在前端模块
	setModule('front');
	renderNav();
	bindEvents();

	// 恢复上次浏览的案例：hash > localStorage > 默认第一个
	const hashUrl = decodeURIComponent(location.hash.slice(1));
	if (hashUrl) {
		for (const cat of DATA) {
			const index = cat.items.findIndex((it) => it.url === hashUrl);
			if (index >= 0) { loadPreview(cat.id, index, { updateHash: false }); return; }
		}
	}
	try {
		const last = JSON.parse(localStorage.getItem('home.last') || 'null');
		if (last) { loadPreview(last.catId, last.index, { updateHash: false }); return; }
	} catch (_) { /* ignore */ }

	loadPreview(DATA[0].id, 0, { updateHash: false });
}

document.addEventListener('DOMContentLoaded', init);
