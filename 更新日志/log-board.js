/* ============================================================
   更新日志组件 log-board.js（博客版）
   ------------------------------------------------------------
   用途：网络 / 运维模块的项目介绍日志——像写博客一样，一篇一篇图文介绍项目
   依赖：无（原生 JS），样式见同目录 log-board.css
   用法：
       LogBoard.mount(document.querySelector('#logStage'), {
           id: 'net',                 // 模块标识，决定存储键
           title: '网络日志',
           desc: '用一篇文章介绍一个项目',
           tags: ['项目介绍', '故障处理']
       });
   存储：localStorage 键 `zzk.log.<id>`；图片经 canvas 压缩后以 dataURL 保存
   数据：{ id, date, title, summary, tags[], content, images[], createdAt, updatedAt }
   正文语法（轻量 Markdown）：
       空行分段、## 小标题、> 引用、- 列表、**加粗**、`代码`、[文字](链接)、
       单独一行写 [[1]] 可把第 1 张图插到该位置
   ============================================================ */

'use strict';

(function (global) {

	const STORE_PREFIX = 'zzk.log.';
	const MAX_IMAGES = 9;          // 单篇最多图片数（第 1 张作封面）
	const MAX_SIDE = 1600;         // 图片压缩后最长边
	const JPEG_QUALITY = 0.8;      // 压缩质量
	const DEFAULT_TAGS = ['项目介绍', '网络', '运维', '故障处理', '配置变更', '日常巡检'];

	/* 线上部署（http/https 且非本地地址）按只读处理：不允许删除，也不写墓碑，刷新即恢复 */
	const ONLINE_READONLY = (() => {
		try {
			if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
			const host = String(location.hostname || '');
			return !/^(localhost|127\.0\.0\.1|::1)$/.test(host);
		} catch (e) {
			return false;
		}
	})();

	/* ---------------- 通用工具 ---------------- */

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
		}[c]));
	}

	function uid() {
		return 'l_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
	}

	/* ---------------- 附件目录授权（File System Access） ----------------
	   浏览器不能凭空写磁盘，但可以经用户授权某个目录后写文件。
	   授权一次后句柄存 IndexedDB，下次打开自动复用；选附件即写入
	   files/<日志ID>/，删除日志即递归删除该目录，不留残文件。
	   该 API 需要 localhost / https 这类安全上下文，file:// 下不可用，
	   此时退化为手动拷贝，并在编辑器里给出确切目录。
	   ---------------------------------------------------------------- */

	const IDB_NAME = 'lb-fs';
	const IDB_STORE = 'handles';
	const DIR_KEY = 'files';
	let dirHandle = null;
	let dirLoading = null;

	function fsSupported() {
		return typeof window.showDirectoryPicker === 'function' && location.protocol !== 'file:';
	}

	function idbOpen() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(IDB_NAME, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	function idbGet(key) {
		return idbOpen().then((db) => new Promise((resolve, reject) => {
			const tx = db.transaction(IDB_STORE, 'readonly');
			const req = tx.objectStore(IDB_STORE).get(key);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => reject(req.error);
		})).catch(() => null);
	}

	function idbSet(key, value) {
		return idbOpen().then((db) => new Promise((resolve, reject) => {
			const tx = db.transaction(IDB_STORE, 'readwrite');
			tx.objectStore(IDB_STORE).put(value, key);
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => reject(tx.error);
		})).catch(() => false);
	}

	/* 恢复上次授权的目录；权限还在就直接用 */
	function loadDirHandle() {
		if (!fsSupported()) return Promise.resolve(null);
		if (dirHandle) return Promise.resolve(dirHandle);
		if (dirLoading) return dirLoading;

		dirLoading = idbGet(DIR_KEY).then(async (handle) => {
			if (!handle) return null;
			try {
				const perm = await handle.queryPermission({ mode: 'readwrite' });
				if (perm === 'granted') { dirHandle = handle; return handle; }
			} catch (e) { /* 句柄失效，忽略 */ }
			return null;
		}).catch(() => null).then((h) => {
			dirLoading = null;
			return h;
		});
		return dirLoading;
	}

	/* 弹目录选择器，授权 更新日志/files */
	async function pickDirHandle() {
		if (!fsSupported()) {
			return { ok: false, reason: 'unsupported' };
		}
		let handle;
		try {
			handle = await window.showDirectoryPicker({ id: 'lb-files', mode: 'readwrite' });
		} catch (e) {
			return { ok: false, reason: 'cancel' };
		}
		dirHandle = handle;
		await idbSet(DIR_KEY, handle);
		return { ok: true, handle: handle };
	}

	/* 把文件写进 files/<日志ID>/<文件名> */
	async function writeAttachFile(entryId, file) {
		if (!dirHandle || !file) return false;
		try {
			const dir = await dirHandle.getDirectoryHandle(String(entryId), { create: true });
			const fh = await dir.getFileHandle(file.name, { create: true });
			const stream = await fh.createWritable();
			await stream.write(file);
			await stream.close();
			return true;
		} catch (e) {
			return false;
		}
	}

	/* 删除整篇日志的附件目录 */
	async function removeAttachDir(entryId) {
		if (!dirHandle) return false;
		try {
			await dirHandle.removeEntry(String(entryId), { recursive: true });
			return true;
		} catch (e) {
			return false;
		}
	}

	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
		}
		return Promise.resolve(false);
	}

	function pad2(n) { return n < 10 ? '0' + n : '' + n; }

	function todayStr() {
		const d = new Date();
		return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
	}

	/* 只放行组件自己产生的图片 dataURL，以及仓库内的相对图片路径，避免导入的 JSON 里写入恶意地址 */
	function safeImg(src) {
		if (typeof src !== 'string' || !src) return '';
		if (/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/i.test(src)) return src;
		// 仓库内相对路径：更新日志/files/... ；禁止协议前缀、绝对路径与上跳
		if (/^[^:/\\]+(\/[^:/\\]+)*\.(png|jpe?g|gif|webp|bmp)$/i.test(src) && src.indexOf('..') < 0) return src;
		return '';
	}

	/* ---------------- 正文渲染（轻量 Markdown） ---------------- */

	/* 行内语法：`代码`、**加粗**、[文字](链接)，入参必须已转义 */
	function inlineMd(text) {
		return text
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|#(?:[^)\s]+)?)\)/g,
				'<a href="$2" target="_blank" rel="noopener">$1</a>');
	}

	/* 去掉标记，用于摘要与字数统计 */
	function plainOf(text) {
		return String(text || '')
			.replace(/\[\[(\d+)\]\]/g, ' ')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/^[#>*\-]+\s*/gm, '')
			.replace(/[`*]/g, '');
	}

	function excerptOf(text, limit) {
		const plain = plainOf(text).replace(/\s+/g, ' ').trim();
		const max = limit || 96;
		return plain.length > max ? plain.slice(0, max) + '…' : plain;
	}

	function minutesOf(text) {
		const n = plainOf(text).replace(/\s+/g, '').length;
		return Math.max(1, Math.round(n / 300));
	}

	/**
	 * 把正文转成 HTML 块
	 * @param {string} content 正文
	 * @param {string[]} images 该篇的图片（[[n]] 按 1 开始计数）
	 * @returns {{html:string, used:Set<number>}} used 记录正文里已经引用过的图片下标
	 */
	function renderBody(content, images) {
		const pics = images || [];
		const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
		const used = new Set();
		let html = '';
		let para = [];
		let list = [];

		const flushPara = () => {
			if (!para.length) return;
			html += '<p>' + para.map((t) => inlineMd(esc(t))).join('<br>') + '</p>';
			para = [];
		};
		const flushList = () => {
			if (!list.length) return;
			html += '<ul>' + list.map((t) => '<li>' + inlineMd(esc(t)) + '</li>').join('') + '</ul>';
			list = [];
		};
		const flushAll = () => { flushPara(); flushList(); };

		lines.forEach((raw) => {
			const line = raw.replace(/[ \t]+$/, '');
			if (!line.trim()) { flushAll(); return; }

			// 单独一行 [[n]]：插入第 n 张图片
			const picToken = line.trim().match(/^\[\[(\d+)\]\]$/);
			if (picToken) {
				const idx = Number(picToken[1]) - 1;
				flushAll();
				if (pics[idx]) { used.add(idx); html += '<figure class="lb-fig" data-idx="' + idx + '"></figure>'; }
				return;
			}

			const head = line.match(/^(#{2,4})\s+(.+)$/);
			if (head) {
				flushAll();
				const level = Math.min(5, head[1].length + 1);
				html += '<h' + level + ' class="lb-h">' + inlineMd(esc(head[2])) + '</h' + level + '>';
				return;
			}

			const quote = line.match(/^>\s?(.+)$/);
			if (quote) {
				flushAll();
				html += '<blockquote>' + inlineMd(esc(quote[1])) + '</blockquote>';
				return;
			}

			const li = line.match(/^[-*]\s+(.+)$/);
			if (li) {
				flushPara();
				list.push(li[1]);
				return;
			}

			flushList();
			para.push(line);
		});

		flushAll();
		return { html: html, used: used };
	}

	/* ---------------- 存储 ---------------- */

	function normalizeEntry(raw) {
		if (!raw || typeof raw !== 'object') return null;
		const images = Array.isArray(raw.images) ? raw.images.map(safeImg).filter(Boolean).slice(0, MAX_IMAGES) : [];

		let tags = Array.isArray(raw.tags)
			? raw.tags
			: (typeof raw.tags === 'string' ? raw.tags.split(/[,，、\s]+/) : []);
		if (!tags.length && raw.type) tags = [String(raw.type)];   // 兼容旧字段 type
		tags = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6);

		const attachments = Array.isArray(raw.attachments)
			? raw.attachments.map(normalizeAttach).filter(Boolean)
			: [];

		return {
			id: String(raw.id || uid()),
			date: String(raw.date || todayStr()).slice(0, 10),
			title: String(raw.title || ''),
			summary: String(raw.summary || ''),
			content: String(raw.content != null ? raw.content : (raw.text || '')),
			tags: tags,
			images: images,
			attachments: attachments,
			attachDir: String(raw.attachDir || '').replace(/[\\/]/g, ''),
			createdAt: Number(raw.createdAt) || Date.now(),
			updatedAt: Number(raw.updatedAt) || Date.now()
		};
	}

	/* 附件只记元信息，文件本体放在 更新日志/files/ 目录里，走相对路径下载 */
	function normalizeAttach(raw) {
		if (!raw || typeof raw !== 'object') return null;
		const name = String(raw.name || '').replace(/[\\/]/g, '_').replace(/^\.+/, '').trim();
		if (!name) return null;
		return {
			name: name.slice(0, 120),
			size: Number(raw.size) || 0,
			type: String(raw.type || '').slice(0, 80)
		};
	}

	function fmtSize(n) {
		const v = Number(n) || 0;
		if (v < 1024) return v + ' B';
		if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
		return (v / 1024 / 1024).toFixed(1) + ' MB';
	}

	/* 附件目录：
	   · 手动方式：文件直接放 更新日志/files/，链接就是 files/<文件名>
	   · 自动写入：给该篇建 files/<日志ID>/ 子目录，并把目录名记在 attachDir */
	function attachDir(entryId) {
		return '更新日志/files/' + encodeURIComponent(String(entryId));
	}

	function attachHref(entry, name) {
		const sub = entry && entry.attachDir ? encodeURIComponent(String(entry.attachDir)) + '/' : '';
		return '更新日志/files/' + sub + encodeURIComponent(name);
	}

	function displayDir(entry) {
		return entry && entry.attachDir
			? '更新日志/files/' + entry.attachDir + '/'
			: '更新日志/files/';
	}

	function fileExt(name) {
		const m = String(name || '').match(/\.([a-z0-9]{1,5})$/i);
		return m ? m[1].toUpperCase() : 'FILE';
	}

	function readEntries(modId) {
		try {
			const raw = localStorage.getItem(STORE_PREFIX + modId);
			const list = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(list)) return [];
			return list.map(normalizeEntry).filter(Boolean);
		} catch (e) {
			return [];
		}
	}

	function writeEntries(modId, list) {
		localStorage.setItem(STORE_PREFIX + modId, JSON.stringify(list));
	}

	/* ---------------- 站点数据（GitHub Pages 用） ----------------
	   仓库里 更新日志/data/<id>.json 是「已发布」的内容，页面启动时 fetch 它；
	   浏览器 localStorage 里只放本地写/改过的条目（locals），二者按 id 合并：
	     · 已发布条目 + 本地条目，同 id 取 updatedAt 更新的那份
	     · 删除已发布条目记一条墓碑（<id>.del），避免刷新后又冒出来
	   本地双击（file://）没有 fetch，就只用本地数据。
	   ---------------------------------------------------------- */

	function delKey(modId) {
		return STORE_PREFIX + modId + '.del';
	}

	function readTombstones(modId) {
		try {
			const raw = localStorage.getItem(delKey(modId));
			const list = raw ? JSON.parse(raw) : [];
			return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
		} catch (e) {
			return [];
		}
	}

	function writeTombstones(modId, ids) {
		// 线上只读：不落墓碑，删了刷新就恢复
		if (ONLINE_READONLY) return;
		try {
			localStorage.setItem(delKey(modId), JSON.stringify(ids.slice(0, 500)));
		} catch (e) { /* 空间不足时忽略，不影响正文 */ }
	}

	function fetchSeed(modId) {
		if (typeof fetch !== 'function' || location.protocol === 'file:') {
			return Promise.resolve(null);
		}
		return fetch('更新日志/data/' + modId + '.json', { cache: 'no-cache' })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!data) return [];
				const list = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : []);
				const entries = list.map(normalizeEntry).filter(Boolean);
				writeSeedCache(modId, entries);
				return entries;
			})
			.catch(() => []);
	}

	/* ---------------- 已发布数据缓存（让第二次打开瞬间出内容） ---------------- */

	const SEED_CACHE_TTL = 12 * 60 * 60 * 1000;   // 12 小时
	const SEED_CACHE_MAX = 400 * 1024;            // 单模块缓存上限，防止塞满配额

	function seedKey(modId) {
		return 'zzk.seed.' + modId;
	}

	function readSeedCache(modId) {
		try {
			const raw = localStorage.getItem(seedKey(modId));
			if (!raw) return [];
			const obj = JSON.parse(raw);
			if (!obj || !Array.isArray(obj.entries)) return [];
			if (Date.now() - (obj.at || 0) > SEED_CACHE_TTL) return [];
			return obj.entries;
		} catch (e) {
			return [];
		}
	}

	function writeSeedCache(modId, entries) {
		try {
			const raw = JSON.stringify({ at: Date.now(), entries });
			if (raw.length > SEED_CACHE_MAX) return;
			localStorage.setItem(seedKey(modId), raw);
		} catch (e) {
			/* 配额满时忽略，不影响显示 */
		}
	}

	/* ---------------- 图片压缩 ---------------- */

	function compressImage(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error('图片读取失败'));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error('图片解析失败'));
				img.onload = () => {
					try {
						const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
						const w = Math.max(1, Math.round(img.width * scale));
						const h = Math.max(1, Math.round(img.height * scale));
						const canvas = document.createElement('canvas');
						canvas.width = w;
						canvas.height = h;
						const ctx = canvas.getContext('2d');
						ctx.fillStyle = '#fff';           // 透明 PNG 转 JPEG 时铺白底
						ctx.fillRect(0, 0, w, h);
						ctx.drawImage(img, 0, 0, w, h);
						resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
					} catch (err) {
						reject(err);
					}
				};
				img.src = reader.result;
			};
			reader.readAsDataURL(file);
		});
	}

	/* ---------------- 模板 ---------------- */

	function shellHtml(opt, listId) {
		return `
			<div class="lb">
				<div class="lb-head">
					<div class="lb-title">
						<strong>${esc(opt.title)}</strong>
						<span class="lb-count" data-role="count">共 0 篇</span>
						<span class="lb-sub">${ONLINE_READONLY ? '线上只读：修改请在本地 index.html 完成' : esc(opt.desc)}</span>
					</div>
					<div class="lb-tools">
						<div class="lb-search">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
							<input type="search" data-role="search" placeholder="搜索标题 / 标签 / 正文" autocomplete="off">
						</div>
						${ONLINE_READONLY ? '' : `<button type="button" class="lb-btn" data-act="import" title="从 JSON 文件导入">导入</button>
						<button type="button" class="lb-btn" data-act="export" title="导出站点数据：覆盖 更新日志/data/&lt;id&gt;.json 后推送">导出</button>
						<button type="button" class="lb-btn lb-btn-primary" data-act="new">＋ 写日志</button>`}
					</div>
				</div>
				<div class="lb-body">
					<div class="lb-list"></div>
				</div>
				<input type="file" accept="application/json,.json" data-role="import-file" hidden>
				<datalist id="${esc(listId)}">${opt.tags.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
			</div>`;
	}

	function editorHtml(listId) {
		return `
			<div class="lb-mask" data-role="editor" hidden>
				<div class="lb-dialog" role="dialog" aria-modal="true" aria-label="日志编辑">
					<div class="lb-dialog-head">
						<strong data-role="ed-head">写日志</strong>
						<button type="button" class="lb-x" data-act="ed-close" aria-label="关闭">&times;</button>
					</div>
					<div class="lb-dialog-body">
						<div class="lb-row">
							<label class="lb-field lb-field-sm">
								<span>日期</span>
								<input type="date" data-role="ed-date">
							</label>
							<label class="lb-field lb-field-sm">
								<span>标签 <em class="lb-field-hint">逗号或空格分隔，最多 6 个</em></span>
								<input type="text" data-role="ed-tags" list="${esc(listId)}" maxlength="60" placeholder="网络 交换机 项目介绍">
							</label>
						</div>
						<label class="lb-field">
							<span>标题</span>
							<input type="text" data-role="ed-title" maxlength="80" placeholder="例如：办公网出口链路改造复盘">
						</label>
						<label class="lb-field">
							<span>摘要 <em class="lb-field-hint">留空则自动截取正文开头</em></span>
							<input type="text" data-role="ed-summary" maxlength="120" placeholder="列表卡片上展示的一句话简介">
						</label>
						<label class="lb-field">
							<span>正文 <button type="button" class="lb-link-btn" data-act="ed-template">插入模板</button></span>
							<textarea data-role="ed-text" rows="12" placeholder="像写博客一样介绍这个项目：背景、做了什么、结果如何…（可直接 Ctrl+V 粘贴截图）"></textarea>
							<em class="lb-md-hint">空行分段 · <code>## 小标题</code> · <code>- 列表</code> · <code>**加粗**</code> · <code>[文字](链接)</code> · 单独一行写 <code>[[1]]</code> 把第 1 张图插到此处</em>
						</label>
						<div class="lb-field">
							<span>图片 <em class="lb-field-hint">最多 ${MAX_IMAGES} 张，第 1 张自动作封面</em></span>
							<div class="lb-drop" data-role="ed-drop">
								<input type="file" accept="image/*" multiple data-role="ed-file" hidden>
								<button type="button" class="lb-drop-btn" data-act="ed-pick">点击选择图片，或拖到这里 / Ctrl+V 粘贴</button>
								<div class="lb-thumbs" data-role="ed-thumbs"></div>
							</div>
						</div>
						<div class="lb-field">
							<span>附件 <em class="lb-field-hint" data-role="ed-att-dir"></em></span>
							<div class="lb-drop">
								<input type="file" multiple data-role="ed-att-file" hidden>
								<div class="lb-att-tools">
									<button type="button" class="lb-drop-btn" data-act="ed-att-pick">选择附件</button>
									<button type="button" class="lb-btn lb-btn-ghost" data-act="ed-att-connect">连接项目目录</button>
									<button type="button" class="lb-btn lb-btn-ghost" data-act="ed-att-copy">复制路径</button>
								</div>
								<p class="lb-att-state" data-role="ed-att-state"></p>
								<div class="lb-atts" data-role="ed-atts"></div>
							</div>
						</div>
					</div>
					<div class="lb-dialog-foot">
						<span class="lb-form-err" data-role="ed-err"></span>
						<button type="button" class="lb-btn" data-act="ed-close">取消</button>
						<button type="button" class="lb-btn lb-btn-primary" data-act="ed-save">保存</button>
					</div>
				</div>
			</div>`;
	}

	const READER_HTML = `
		<div class="lb-mask lb-reader-mask" data-role="reader" hidden>
			<div class="lb-reader" role="dialog" aria-modal="true" aria-label="日志正文">
				<div class="lb-reader-bar">
					<span class="lb-reader-module" data-role="rd-module"></span>
					<div class="lb-reader-acts">
						${ONLINE_READONLY ? '' : `<button type="button" class="lb-btn" data-act="rd-edit">编辑</button>
						<button type="button" class="lb-btn lb-btn-danger-ghost" data-act="rd-del">删除</button>`}
						<button type="button" class="lb-x" data-act="rd-close" aria-label="关闭">&times;</button>
					</div>
				</div>
				<div class="lb-reader-scroll" data-role="rd-scroll">
					<div data-role="rd-content"></div>
				</div>
			</div>
		</div>`;

	const VIEWER_HTML = `
		<div class="lb-mask" data-role="viewer" hidden>
			<div class="lb-viewer">
				<button type="button" class="lb-viewer-nav prev" data-act="view-prev" aria-label="上一张" hidden>&lsaquo;</button>
				<img data-role="view-img" alt="">
				<button type="button" class="lb-viewer-nav next" data-act="view-next" aria-label="下一张" hidden>&rsaquo;</button>
				<div class="lb-viewer-foot">
					<p class="lb-viewer-cap" data-role="view-cap"></p>
					<a class="lb-btn lb-btn-ghost" data-role="view-dl" download="image.jpg">下载原图</a>
				</div>
			</div>
		</div>`;

	const TOAST_HTML = '<div class="lb-toast" data-role="toast" hidden></div>';

	const CONFIRM_HTML = `
		<div class="lb-mask" data-role="confirm" hidden>
			<div class="lb-confirm">
				<p data-role="cf-text"></p>
				<div class="lb-confirm-acts">
					<button type="button" class="lb-btn" data-act="cf-cancel">取消</button>
					<button type="button" class="lb-btn lb-btn-danger" data-act="cf-ok">确定</button>
				</div>
			</div>
		</div>`;

	/* ---------------- 主体 ---------------- */

	function mount(container, options) {
		if (!container) throw new Error('LogBoard.mount: 缺少容器元素');

		const opt = Object.assign({
			id: 'default',
			title: '更新日志',
			desc: '',
			tags: DEFAULT_TAGS
		}, options || {});

		const listId = 'lb-tags-' + opt.id;

		const inst = {
			id: opt.id,
			title: opt.title,
			seed: [],              // 仓库里已发布的内容（data/<id>.json）
			seedLoaded: false,
			seedLoading: location.protocol !== 'file:' && typeof fetch === 'function',			locals: readEntries(opt.id),   // 本浏览器写/改过的条目
			entries: [],           // 合并后的展示数据
			keyword: '',
			draft: null,
			readerId: '',
			view: null,
			confirmCb: null,
			els: {}
		};

		/* 有上次的缓存就先画出来，网络数据回来后覆盖，体感上「秒开」 */
		inst.seed = readSeedCache(opt.id).map(normalizeEntry).filter(Boolean);

		container.innerHTML = shellHtml(opt, listId);

		const root = container.querySelector('.lb');
		const $ = (sel) => root.querySelector(sel);
		const els = inst.els;
		els.list = $('.lb-list');
		els.count = $('[data-role="count"]');
		els.search = $('[data-role="search"]');
		els.importInput = $('[data-role="import-file"]');

		/* 编辑器 / 阅读页 / 查看器 / 确认框挂到 body，避免被父容器 overflow 裁切 */
		const layers = document.createElement('div');
		layers.className = 'lb-layers';
		layers.innerHTML = editorHtml(listId) + READER_HTML + VIEWER_HTML + CONFIRM_HTML + TOAST_HTML;
		document.body.appendChild(layers);
		inst.layers = layers;

		const L = (sel) => layers.querySelector(sel);
		els.edMask = L('[data-role="editor"]');
		els.edHead = L('[data-role="ed-head"]');
		els.edDate = L('[data-role="ed-date"]');
		els.edTags = L('[data-role="ed-tags"]');
		els.edSummary = L('[data-role="ed-summary"]');
		els.edTitle = L('[data-role="ed-title"]');
		els.edText = L('[data-role="ed-text"]');
		els.edFile = L('[data-role="ed-file"]');
		els.edDrop = L('[data-role="ed-drop"]');
		els.edThumbs = L('[data-role="ed-thumbs"]');
		els.edAtts = L('[data-role="ed-atts"]');
		els.edAttFile = L('[data-role="ed-att-file"]');
		els.edAttDir = L('[data-role="ed-att-dir"]');
		els.edAttState = L('[data-role="ed-att-state"]');
		els.toast = L('[data-role="toast"]');
		els.edErr = L('[data-role="ed-err"]');

		els.rdMask = L('[data-role="reader"]');
		els.rdModule = L('[data-role="rd-module"]');
		els.rdContent = L('[data-role="rd-content"]');
		els.rdScroll = L('[data-role="rd-scroll"]');

		els.viewMask = L('[data-role="viewer"]');
		els.viewImg = L('[data-role="view-img"]');
		els.viewCap = L('[data-role="view-cap"]');
		els.viewDl = L('[data-role="view-dl"]');
		els.viewPrev = L('[data-act="view-prev"]');
		els.viewNext = L('[data-act="view-next"]');

		els.cfMask = L('[data-role="confirm"]');
		els.cfText = L('[data-role="cf-text"]');

		/* ---------- 数据操作 ---------- */

		/* 合并「已发布 + 本地」：同 id 取 updatedAt 更新的；墓碑里的 id 一律隐藏 */
		function rebuild() {
			let dead = readTombstones(inst.id);

			// 已发布数据加载成功时，顺手清掉指向已不存在条目的旧墓碑
			if (inst.seedLoaded) {
				const seedIds = new Set(inst.seed.map((e) => e.id));
				const kept = dead.filter((id) => seedIds.has(id));
				if (kept.length !== dead.length) writeTombstones(inst.id, kept);
				dead = kept;
			}

			const deadSet = new Set(dead);
			const byId = new Map();

			inst.seed.forEach((e) => { if (!deadSet.has(e.id)) byId.set(e.id, e); });
			inst.locals.forEach((e) => {
				if (deadSet.has(e.id)) return;
				const prev = byId.get(e.id);
				if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(e.id, e);
			});

			inst.entries = Array.from(byId.values());
		}

		/* 只写本地那份；已发布内容不进 localStorage，免得占配额 */
		function persistLocals(nextLocals) {
			try {
				writeEntries(inst.id, nextLocals);
			} catch (e) {
				alert('保存失败：浏览器本地存储空间可能已满。\n请先删除部分旧日志，或减少图片数量后重试。');
				return false;
			}
			inst.locals = nextLocals;
			rebuild();
			return true;
		}

		function findEntry(id) {
			return inst.entries.find((x) => x.id === id) || null;
		}

		/* ---------- 列表 ---------- */

		function sortEntries(a, b) {
			const d = String(b.date || '').localeCompare(String(a.date || ''));
			return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
		}

		function matchEntry(e) {
			const kw = inst.keyword.trim().toLowerCase();
			if (!kw) return true;
			return (e.title || '').toLowerCase().includes(kw)
				|| (e.content || '').toLowerCase().includes(kw)
				|| (e.tags || []).join(' ').toLowerCase().includes(kw);
		}

		function cardHtml(e) {
			const cover = (e.images || [])[0]
				? `<img src="${esc(e.images[0])}" alt="${esc(e.title)} 封面" loading="lazy">`
				: `<span class="lb-post-ph">${esc((e.title || '项目').slice(0, 1))}</span>`;

			const tags = (e.tags || []).map((t) => `<span class="lb-tag">${esc(t)}</span>`).join('');
			const ex = e.summary ? e.summary : excerptOf(e.content);
			const pics = (e.images || []).length;
			const files = (e.attachments || []).length;

			return `
				<article class="lb-post" data-act="read" data-id="${esc(e.id)}">
					<div class="lb-post-cover">${cover}</div>
					<div class="lb-post-body">
						<div class="lb-post-meta">
							<span class="lb-date">${esc(e.date || '')}</span>
							${tags}
						</div>
						<h3 class="lb-post-title">${esc(e.title)}</h3>
						${ex ? `<p class="lb-post-ex">${esc(ex)}</p>` : ''}
						<div class="lb-post-foot">
							<span>${pics ? pics + ' 张图 · ' : ''}${files ? files + ' 个附件 · ' : ''}约 ${minutesOf(e.content)} 分钟</span>
							<span class="lb-read">阅读全文 →</span>
						</div>
					</div>
					<div class="lb-post-acts">
						${ONLINE_READONLY ? '' : `<button type="button" class="lb-mini" data-act="edit" data-id="${esc(e.id)}">编辑</button>
						<button type="button" class="lb-mini danger" data-act="del" data-id="${esc(e.id)}">删除</button>`}
					</div>
				</article>`;
		}

		function emptyHtml(searching, loading) {
			if (searching) return '<div class="lb-empty"><strong>没有匹配的日志</strong>换个关键词试试</div>';
			if (loading) return '<div class="lb-empty"><strong>正在加载已发布的文章…</strong>首次打开需要下载文章列表，稍等一下</div>';
			if (ONLINE_READONLY) return '<div class="lb-empty"><strong>还没有日志</strong>发布入口在本地：写完导出后双击「发布日志.bat」</div>';
			if (location.protocol === 'file:') {
				return '<div class="lb-empty"><strong>双击打开读不到已发布文章</strong>file:// 没有 fetch，浏览器不允许读 更新日志/data/notes.json。请双击项目根目录的「本地预览.js」，用 http://localhost 打开本页，就能看到全部已发布文章；已发布内容在线上是安全的，不会被本地空列表覆盖。</div>';
			}
			return `<div class="lb-empty"><strong>还没有日志</strong>点击右上角「＋ 写日志」，用一篇文章介绍一个项目</div>`;
		}

		function render() {
			const all = inst.entries.slice().sort(sortEntries);
			const shown = all.filter(matchEntry);
			const kw = inst.keyword.trim();

			const loading = inst.seedLoading && !inst.seedLoaded && !all.length;
			els.count.textContent = loading
				? '加载中…'
				: (kw ? `命中 ${shown.length} / 共 ${all.length} 篇` : `共 ${all.length} 篇`);
			els.list.innerHTML = shown.length ? shown.map(cardHtml).join('') : emptyHtml(!!kw, loading);
		}

		/* ---------- 阅读页 ---------- */

		function paintReader() {
			const entry = findEntry(inst.readerId);
			if (!entry) { closeReader(); return; }

			const body = renderBody(entry.content, entry.images || []);

			const cover = (entry.images || [])[0]
				? `<img class="lb-reader-cover" src="${esc(entry.images[0])}" alt="${esc(entry.title)} 封面">`
				: '';

			const tags = (entry.tags || []).map((t) => `<span class="lb-tag">${esc(t)}</span>`).join('');

			// 正文没引用到的图片（封面除外）统一放在文末图集
			const gallery = (entry.images || [])
				.map((src, i) => ({ src, i }))
				.filter(({ i }) => i > 0 && !body.used.has(i))
				.map(({ src, i }) => `
					<button type="button" class="lb-thumb" data-act="rd-view" data-i="${i}" title="查看大图">
						<img src="${esc(src)}" alt="${esc(entry.title)} 配图" loading="lazy">
					</button>`).join('');

			// 附件区：文件本体在 更新日志/files/，这里只给下载链接
			const atts = (entry.attachments || []).map((a) => `
				<a class="lb-attach" href="${esc(attachHref(entry, a.name))}" download="${esc(a.name)}" target="_blank" rel="noopener">
					<span class="lb-attach-icon">${esc(fileExt(a.name))}</span>
					<span class="lb-attach-main">
						<strong>${esc(a.name)}</strong>
						<em>${esc(fmtSize(a.size))} · 点击下载</em>
					</span>
				</a>`).join('');

			els.rdModule.textContent = opt.title;
			els.rdContent.innerHTML = `
				${cover}
				<h1 class="lb-reader-title">${esc(entry.title)}</h1>
				<div class="lb-reader-meta">
					<span>${esc(entry.date || '')}</span>
					${tags}
					<span>约 ${minutesOf(entry.content)} 分钟</span>
				</div>
				<article class="lb-article">${body.html || '<p class="lb-article-empty">（还没有正文）</p>'}</article>
				${atts ? `<div class="lb-reader-atts"><h2 class="lb-att-title">附件</h2>${atts}</div>` : ''}
				${gallery ? `<div class="lb-reader-gallery">${gallery}</div>` : ''}`;

			// 正文中 [[n]] 占位符 → 填充对应图片
			els.rdContent.querySelectorAll('.lb-fig').forEach((fig) => {
				const idx = Number(fig.dataset.idx);
				const src = (entry.images || [])[idx];
				if (!src) { fig.remove(); return; }
				fig.innerHTML = `<img src="${esc(src)}" alt="${esc(entry.title)} 配图" data-act="rd-fig" data-i="${idx}">`;
			});
		}

		function openReader(id) {
			const entry = findEntry(id);
			if (!entry) return;
			inst.readerId = id;
			paintReader();
			els.rdMask.hidden = false;
			els.rdScroll.scrollTop = 0;
		}

		function closeReader() {
			els.rdMask.hidden = true;
			inst.readerId = '';
		}

		/* ---------- 编辑器 ---------- */

		function showErr(msg) {
			els.edErr.textContent = msg || '';
			els.edErr.classList.toggle('show', !!msg);
		}

		function renderEditorThumbs() {
			const d = inst.draft;
			if (!d) return;
			els.edThumbs.innerHTML = d.images.map((src, i) => `
				<div class="lb-thumb-edit">
					<img src="${esc(src)}" alt="待上传图片 ${i + 1}">
					${i === 0 ? '<span class="lb-thumb-flag">封面</span>' : ''}
					<button type="button" class="lb-thumb-del" data-act="ed-del-img" data-i="${i}" title="移除">&times;</button>
				</div>`).join('');

			const atts = d.attachments || [];
			els.edAtts.innerHTML = atts.length
				? atts.map((a, i) => `
					<div class="lb-att-row">
						<span class="lb-att-name" title="${esc(a.name)}">${esc(a.name)}</span>
						<span class="lb-att-size">${esc(fmtSize(a.size))}</span>
						${a.writeState === 'ok' ? '<span class="lb-att-flag ok">已写入</span>'
							: a.writeState === 'fail' ? '<span class="lb-att-flag bad">写入失败</span>' : ''}
						<button type="button" class="lb-btn lb-btn-ghost" data-act="ed-att-del" data-i="${i}">移除</button>
					</div>`).join('')
				: '';

			// 附件目录状态：手动模式就是一个公共目录，不用记 ID
			const autoDir = d.id ? '更新日志/files/' + d.id + '/' : '';
			els.edAttDir.textContent = dirHandle || (d.attachments || []).some((a) => a.writeState === 'ok')
				? '自动写入 ' + autoDir
				: '文件放到 更新日志/files/ 即可（文件名与下列一致）';

			if (!dirHandle) {
				els.edAttState.textContent = fsSupported()
					? '手动模式：把文件复制到 更新日志/files/，文件名保持一致；点「连接项目目录」可改为自动写入 ' + autoDir
					: '手动模式：把文件复制到 更新日志/files/，文件名保持一致即可；当前 file:// 打开不支持自动写入';
			} else {
				els.edAttState.textContent = '已连接目录：选择附件会直接写入 ' + autoDir + '；删除日志时该目录会被一并删除';
			}
		}

		/* 选择附件：挂到日志上，并在已授权目录时立刻写入磁盘 */
		async function addAttachments(files) {
			const d = inst.draft;
			if (!d) return;
			const picked = Array.from(files || []).filter(Boolean);
			if (!picked.length) return;

			if (!dirHandle) await loadDirHandle().catch(() => null);
			const canWrite = !!dirHandle;

			for (const file of picked) {
				const att = normalizeAttach({ name: file.name, size: file.size, type: file.type });
				if (!att) continue;
				if (d.attachments.some((x) => x.name === att.name)) continue;   // 同名只留一个

				d.files.set(att.name, file);
				if (canWrite) {
					att.writeState = (await writeAttachFile(d.id, file)) ? 'ok' : 'fail';
				}
				d.attachments.push(att);
			}

			renderEditorThumbs();

			if (canWrite) {
				const failed = d.attachments.filter((a) => a.writeState === 'fail').length;
				toast(failed ? '有文件写入失败，请检查目录授权后重试' : '文件已写入 更新日志/files/' + d.id + '/，推送即可下载', 4600);
			} else if (!fsSupported()) {
				toast('请把文件复制到 更新日志/files/（文件名和上面一致），推送后即可下载', 5200);
			} else {
				toast('还没连接项目目录，点「连接项目目录」后可自动写入；或直接放到 更新日志/files/', 5200);
			}
		}

		function openEditor(entry) {
			if (ONLINE_READONLY) {
				toast('线上只读，不能编辑；请在本地 index.html 修改后发布', 4200);
				return;
			}
			inst.draft = {
				id: entry ? entry.id : uid(),     // 新建也先生成 ID，自动写入时目录当场就能定下来
				createdAt: entry ? entry.createdAt : 0,
				attachDir: entry ? entry.attachDir : '',
				images: entry && Array.isArray(entry.images) ? entry.images.slice() : [],
				attachments: entry && Array.isArray(entry.attachments) ? entry.attachments.slice() : [],
				files: new Map()          // 本次选中的 File，用于连接目录后补写
			};

			els.edHead.textContent = entry ? '编辑日志' : '写日志';
			els.edDate.value = entry ? (entry.date || todayStr()) : todayStr();
			els.edTags.value = entry ? (entry.tags || []).join(' ') : '';
			els.edSummary.value = entry ? (entry.summary || '') : '';
			els.edTitle.value = entry ? (entry.title || '') : '';
			els.edText.value = entry ? (entry.content || '') : '';
			els.edFile.value = '';
			els.edAttFile.value = '';
			showErr('');

			// 恢复上次授权的目录，再渲染附件状态
			loadDirHandle().catch(() => null).then(() => {
				if (inst.draft) renderEditorThumbs();
			});

			renderEditorThumbs();
			els.edMask.hidden = false;
			els.edTitle.focus();
		}

		let toastTimer = 0;
		function toast(msg, ms) {
			if (!els.toast) return;
			els.toast.textContent = msg;
			els.toast.hidden = false;
			els.toast.classList.add('show');
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => {
				els.toast.classList.remove('show');
				els.toast.hidden = true;
			}, ms || 4200);
		}

		function closeEditor() {
			els.edMask.hidden = true;
			inst.draft = null;
			showErr('');
		}

		function addFiles(files) {
			const d = inst.draft;
			if (!d) return;
			const picked = Array.from(files || []).filter((f) => f && f.type && f.type.indexOf('image/') === 0);
			if (!picked.length) return;

			const room = MAX_IMAGES - d.images.length;
			if (room <= 0) { showErr(`已达上限，单篇最多 ${MAX_IMAGES} 张图片`); return; }

			let done = 0;
			picked.slice(0, room).forEach((file) => {
				compressImage(file).then((dataUrl) => {
					if (!inst.draft) return;
					inst.draft.images.push(dataUrl);
					renderEditorThumbs();
				}).catch(() => {
					showErr('有图片处理失败，已跳过');
				}).then(() => {
					done += 1;
					if (done === Math.min(picked.length, room) && picked.length > room) {
						showErr(`已达上限，只添加了前 ${room} 张`);
					}
				});
			});
		}

		function saveEditor() {
			const d = inst.draft;
			if (!d) return;

			const title = els.edTitle.value.trim();
			const content = els.edText.value.trim();
			const summary = els.edSummary.value.trim();
			const tags = els.edTags.value.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 6);

			if (!title) { showErr('请填写标题'); els.edTitle.focus(); return; }
			if (!content && !d.images.length) { showErr('正文和图片至少填写一项'); els.edText.focus(); return; }

			const wrote = (d.attachments || []).some((a) => a.writeState === 'ok');
			const entry = {
				id: d.id || uid(),
				date: els.edDate.value || todayStr(),
				title: title,
				summary: summary,
				tags: tags,
				content: content,
				images: d.images.slice(),
				attachments: (d.attachments || []).map((a) => normalizeAttach({ name: a.name, size: a.size, type: a.type })).filter(Boolean),
				attachDir: wrote ? String(d.id) : (d.attachDir || ''),
				createdAt: d.createdAt || Date.now(),
				updatedAt: Date.now()
			};

			const locals = inst.locals.slice();
			const idx = locals.findIndex((x) => x.id === entry.id);
			if (idx >= 0) locals[idx] = entry; else locals.push(entry);

			if (!persistLocals(locals)) return;

			closeEditor();
			render();
			if (inst.readerId === entry.id) paintReader();   // 正在阅读同一篇则同步刷新

			if (entry.attachments.length) {
				toast(entry.attachDir
					? '附件已写入 更新日志/files/' + entry.attachDir + '/，推送即可下载'
					: '请把附件复制到 更新日志/files/（文件名与日志里一致），推送即可下载', 5200);
			}
		}

		/* ---------- 删除 / 确认 ---------- */

		function confirmBox(text, okLabel, onOk) {
			els.cfText.textContent = text;
			layers.querySelector('[data-act="cf-ok"]').textContent = okLabel || '确定';
			inst.confirmCb = onOk;
			els.cfMask.hidden = false;
		}

		function closeConfirm() {
			els.cfMask.hidden = true;
			inst.confirmCb = null;
		}

		function askDelete(id) {
			const entry = findEntry(id);
			if (!entry) return;
			if (ONLINE_READONLY) {
				toast('线上只读，不能删除；请在本地 index.html 里删除后发布', 4200);
				return;
			}
			const atts = entry.attachments || [];
			const tip = atts.length
				? `；该篇的 ${atts.length} 个附件在 ${displayDir(entry)}，导出后双击「发布日志.bat」会自动清掉`
				: '';

			confirmBox(`确定删除「${entry.title || '这篇日志'}」吗？删除后无法恢复${tip}。`, '删除', async () => {
				const locals = inst.locals.filter((x) => x.id !== id);

				// 删的是「已发布」里的条目，记墓碑，避免刷新后被 data/*.json 重新带出来
				if (inst.seed.some((x) => x.id === id)) {
					const dead = readTombstones(inst.id);
					if (!dead.includes(id)) writeTombstones(inst.id, dead.concat([id]));
				}

				if (!persistLocals(locals)) return;
				if (inst.readerId === id) closeReader();
				render();

				if (!atts.length) return;

				// 只有自动写入建立的专属目录能直接删；手动模式的文件在公共 files/ 里，交给发布脚本清理
				if (!entry.attachDir) {
					toast('已删除；导出后双击「发布日志.bat」，附件会一起清掉', 6000);
					return;
				}

				if (!dirHandle) await loadDirHandle().catch(() => null);
				const removed = dirHandle ? await removeAttachDir(entry.attachDir) : false;
				toast(removed
					? '已删除，附件目录 更新日志/files/' + entry.attachDir + '/ 也已清空'
					: '已删除；附件在 更新日志/files/' + entry.attachDir + '/，请手动删除（或运行 更新日志/清理附件.ps1）', 6000);
			});
		}

		/* ---------- 查看大图 ---------- */

		function openViewer(entryId, index) {
			const entry = findEntry(entryId);
			if (!entry || !(entry.images || []).length) return;
			inst.view = { entryId: entryId, index: index || 0 };
			paintViewer();
			els.viewMask.hidden = false;
		}

		function paintViewer() {
			if (!inst.view) return;
			const entry = findEntry(inst.view.entryId);
			const imgs = entry && entry.images ? entry.images : [];
			if (!imgs.length) return closeViewer();

			const i = Math.min(Math.max(inst.view.index, 0), imgs.length - 1);
			inst.view.index = i;

			els.viewImg.src = imgs[i];
			els.viewImg.alt = entry.title ? `${entry.title} 图片 ${i + 1}` : `日志图片 ${i + 1}`;
			els.viewCap.textContent = `${i + 1} / ${imgs.length}　${entry.date || ''}　${entry.title || ''}`.trim();
			els.viewPrev.hidden = els.viewNext.hidden = imgs.length < 2;

			// 图片是 dataURL，可直接另存
			els.viewDl.href = imgs[i];
			els.viewDl.download = ((entry.title || '日志') + '-' + (i + 1) + '.jpg').replace(/[\\/:*?"<>|]/g, '_');
		}

		function stepViewer(delta) {
			if (!inst.view) return;
			const entry = findEntry(inst.view.entryId);
			const n = entry && entry.images ? entry.images.length : 0;
			if (n < 2) return;
			inst.view.index = (inst.view.index + delta + n) % n;
			paintViewer();
		}

		function closeViewer() {
			els.viewMask.hidden = true;
			inst.view = null;
			els.viewImg.removeAttribute('src');
		}

		/* ---------- 导入 / 导出 ---------- */

		/**
		 * 导出「站点数据」：文件名固定为 <id>.json，直接覆盖仓库里的
		 * 更新日志/data/<id>.json 后推送即可上线
		 */
		function exportJson() {
			if (!inst.entries.length) { alert('当前还没有日志可导出'); return; }
			const payload = {
				module: inst.id,
				title: opt.title,
				exportedAt: new Date().toISOString(),
				entries: inst.entries.slice().sort(sortEntries)
			};
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = inst.id + '.json';
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 3000);
		}

		function handleImport(file) {
			if (!file) return;
			const reader = new FileReader();
			reader.onerror = () => alert('文件读取失败');
			reader.onload = () => {
				let data;
				try {
					data = JSON.parse(String(reader.result));
				} catch (e) {
					alert('这个文件不是有效的 JSON');
					return;
				}
				const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : null);
				if (!incoming) { alert('文件里没有找到日志数据'); return; }

				const valid = incoming.map(normalizeEntry).filter(Boolean);
				if (!valid.length) { alert('没有可导入的日志'); return; }

				confirmBox(`将导入 ${valid.length} 篇日志，与本模块现有日志合并（相同 ID 会覆盖）。继续？`, '导入', () => {
					const merged = new Map(inst.locals.map((x) => [x.id, x]));
					valid.forEach((x) => merged.set(x.id, x));
					if (persistLocals(Array.from(merged.values()))) {
						render();
						if (inst.readerId) paintReader();
					}
				});
			};
			reader.readAsText(file, 'utf-8');
			els.importInput.value = '';
		}

		/* ---------- 事件 ---------- */

		root.addEventListener('click', (e) => {
			const el = e.target.closest('[data-act]');
			if (!el) return;
			const act = el.dataset.act;
			if (act === 'read') openReader(el.dataset.id);
			else if (act === 'new') openEditor(null);
			else if (act === 'export') exportJson();
			else if (act === 'import') els.importInput.click();
			else if (act === 'edit') openEditor(findEntry(el.dataset.id));
			else if (act === 'del') askDelete(el.dataset.id);
		});

		let searchTimer = null;
		els.search.addEventListener('input', () => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				inst.keyword = els.search.value;
				render();
			}, 120);
		});

		els.importInput.addEventListener('change', () => handleImport(els.importInput.files[0]));

		layers.addEventListener('click', async (e) => {
			if (e.target.classList && e.target.classList.contains('lb-mask')) {   // 点遮罩空白处关闭
				if (e.target === els.edMask) closeEditor();
				else if (e.target === els.rdMask) closeReader();
				else if (e.target === els.viewMask) closeViewer();
				else if (e.target === els.cfMask) closeConfirm();
				return;
			}

			const el = e.target.closest('[data-act]');
			if (!el) return;

			switch (el.dataset.act) {
				case 'ed-close': closeEditor(); break;
				case 'ed-save': saveEditor(); break;
				case 'ed-pick': els.edFile.click(); break;
				case 'ed-att-pick': els.edAttFile.click(); break;
				case 'ed-att-connect': {
					const res = await pickDirHandle();
					if (!res.ok) {
						toast(res.reason === 'unsupported'
							? '当前打开方式不支持自动写入，请用「启动本地预览.bat」从 localhost 打开'
							: '已取消目录授权', 4800);
						break;
					}
					const d = inst.draft;
					if (d) {
						for (const a of d.attachments) {
							if (a.writeState === 'ok') continue;
							const file = d.files && d.files.get(a.name);
							if (file) a.writeState = (await writeAttachFile(d.id, file)) ? 'ok' : 'fail';
						}
					}
					renderEditorThumbs();
					toast('已连接项目目录，之后选附件会自动写入 更新日志/files/<日志ID>/', 4800);
					break;
				}
				case 'ed-att-copy': {
					// 手动模式复制公共目录，自动模式复制本篇目录
					const d = inst.draft;
					const p = d && d.attachDir
						? '更新日志/files/' + d.attachDir + '/'
						: '更新日志/files/';
					const ok = await copyText(p);
					toast(ok ? '已复制：' + p : '请手动复制：' + p, 5200);
					break;
				}
				case 'ed-att-del':
					if (inst.draft) {
						inst.draft.attachments.splice(Number(el.dataset.i), 1);
						renderEditorThumbs();
					}
					break;
				case 'ed-template': {
					const tpl = '## 背景\n\n\n\n## 做法\n\n- \n- \n\n## 结果\n\n';
					const cur = els.edText.value;
					els.edText.value = cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' + tpl : tpl;
					els.edText.focus();
					break;
				}
				case 'ed-del-img':
					if (inst.draft) {
						inst.draft.images.splice(Number(el.dataset.i), 1);
						renderEditorThumbs();
						showErr('');
					}
					break;
				case 'rd-close': closeReader(); break;
				case 'rd-edit': {
					const entry = findEntry(inst.readerId);
					closeReader();
					openEditor(entry);
					break;
				}
				case 'rd-del': askDelete(inst.readerId); break;
				case 'rd-view': openViewer(inst.readerId, Number(el.dataset.i)); break;
				case 'rd-fig': openViewer(inst.readerId, Number(el.dataset.i)); break;
				case 'cf-ok': {
					const cb = inst.confirmCb;
					closeConfirm();
					if (cb) cb();
					break;
				}
				case 'cf-cancel': closeConfirm(); break;
				case 'view-prev': stepViewer(-1); break;
				case 'view-next': stepViewer(1); break;
			}
		});

		els.edFile.addEventListener('change', () => {
			addFiles(els.edFile.files);
			els.edFile.value = '';
		});

		els.edAttFile.addEventListener('change', () => {
			addAttachments(els.edAttFile.files);
			els.edAttFile.value = '';
		});

		/* 拖拽 + 粘贴图片 */
		els.edDrop.addEventListener('dragover', (e) => {
			e.preventDefault();
			els.edDrop.classList.add('dragover');
		});
		els.edDrop.addEventListener('dragleave', () => els.edDrop.classList.remove('dragover'));
		els.edDrop.addEventListener('drop', (e) => {
			e.preventDefault();
			els.edDrop.classList.remove('dragover');
			if (e.dataTransfer) addFiles(e.dataTransfer.files);
		});
		document.addEventListener('paste', (e) => {
			if (els.edMask.hidden || !inst.draft) return;
			const items = (e.clipboardData && e.clipboardData.items) || [];
			const files = [];
			for (let i = 0; i < items.length; i++) {
				if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
					const f = items[i].getAsFile();
					if (f) files.push(f);
				}
			}
			if (files.length) {
				e.preventDefault();
				addFiles(files);
			}
		});

		/* 键盘：Esc 关闭，左右切图 */
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				if (!els.edMask.hidden) closeEditor();
				else if (!els.cfMask.hidden) closeConfirm();
				else if (!els.viewMask.hidden) closeViewer();
				else if (!els.rdMask.hidden) closeReader();
			} else if (!els.viewMask.hidden) {
				if (e.key === 'ArrowLeft') stepViewer(-1);
				if (e.key === 'ArrowRight') stepViewer(1);
			}
		});

		/* 先用本地数据处理，再补拉仓库里的已发布数据 */
		rebuild();
		render();

		fetchSeed(inst.id).then((seed) => {
			inst.seed = seed || [];
			inst.seedLoaded = true;
			inst.seedLoading = false;
			rebuild();
			render();
			if (inst.readerId) paintReader();
		});

		return {
			id: inst.id,
			refresh: () => {
				inst.locals = readEntries(inst.id);
				rebuild();
				render();
				if (inst.readerId) paintReader();
			},
			count: () => inst.entries.length,
			destroy: () => { layers.remove(); root.remove(); }
		};
	}

	global.LogBoard = {
		mount: mount,
		read: readEntries,
		STORAGE_PREFIX: STORE_PREFIX
	};

})(window);
