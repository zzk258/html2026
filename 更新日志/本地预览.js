#!/usr/bin/env node
/**
 * 本地预览服务
 * -------------
 * 作用：以 http://localhost 打开站点。只有 localhost / https 这类「安全上下文」，
 * 浏览器才允许页面通过目录授权把附件自动写进 更新日志/files/，也才能正常 fetch
 * 更新日志/data/*.json。直接双击 home.html（file://）不满足这两个条件。
 *
 * 用法：双击项目根目录的「启动本地预览.bat」，或手动执行
 *   node 更新日志/本地预览.js 8123
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8123);

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.md': 'text/plain; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
	let pathname;
	try {
		pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
	} catch (e) {
		res.writeHead(400);
		return res.end('bad request');
	}

	if (pathname === '/') pathname = '/home.html';
	const target = path.resolve(ROOT, '.' + pathname);

	// 只允许访问项目根目录内的文件
	if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
		res.writeHead(403);
		return res.end('forbidden');
	}

	fs.stat(target, (err, stat) => {
		if (err || !stat) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			return res.end('404 not found: ' + pathname);
		}

		const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
		fs.readFile(file, (err2, buf) => {
			if (err2) {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
				return res.end('404 not found: ' + pathname);
			}
			const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
			// 关掉缓存，改完刷新就能看到
			res.writeHead(200, {
				'Content-Type': type,
				'Cache-Control': 'no-store'
			});
			res.end(buf);
		});
	});
});

server.listen(PORT, () => {
	console.log('本地预览已启动：http://localhost:' + PORT + '/home.html');
	console.log('目录授权、日志读取都在这个地址下才可用；关闭窗口即停止。');
});

server.on('error', (e) => {
	if (e.code === 'EADDRINUSE') {
		console.log('端口 ' + PORT + ' 已被占用，换个端口：node 更新日志/本地预览.js 8124');
	} else {
		console.log('启动失败：' + e.message);
	}
	process.exitCode = 1;
});
