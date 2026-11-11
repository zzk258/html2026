/* 在线音乐播放器 · 单页版
 * 数据源：酷我音乐免费接口（搜索 + 播放地址，JSONP）
 *        歌词：酷我 musicId 歌词接口（与音源同源，CORS 开放，失败自动重试）
 *              回退 1 酷我搜索同名歌曲 → 回退 2 网易云歌词接口
 * 布局：搜索栏 → 推荐歌手 → 播放列表 → 歌词 → 底部固定控制条
 */

/* ---------------- 全局工具 ---------------- */
/* JSONP：跨域请求酷我接口 */
function jsonp(url) {
	return new Promise(function (resolve, reject) {
		var cbName = 'cb_' + Math.random().toString(36).slice(2, 10);
		var sep = url.indexOf('?') === -1 ? '?' : '&';
		var script = document.createElement('script');
		script.src = url + sep + 'callback=' + cbName;
		window[cbName] = function (data) {
			delete window[cbName];
			script.remove();
			resolve(data);
		};
		script.onerror = function () {
			delete window[cbName];
			script.remove();
			reject(new Error('网络请求失败'));
		};
		document.body.appendChild(script);
	});
}

/* 普通 JSON 请求（只用于明确返回 CORS 头的接口，如 *）
 * 带超时，避免接口卡住时歌词区一直显示“加载中” */
function httpJson(url, timeout) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = timeout || 8000;
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300) {
				try { resolve(JSON.parse(xhr.responseText)); }
				catch (e) { reject(e); }
			} else {
				reject(new Error('HTTP ' + xhr.status));
			}
		};
		xhr.onerror = function () { reject(new Error('network')); };
		xhr.ontimeout = function () { reject(new Error('timeout')); };
		xhr.send();
	});
}

/* 清洗酷我返回的字段：&nbsp; 换空格，
 * 酷我会把 & 双重转义成 \\\\u0026，这里把“若干反斜杠 + u0026”统一还原成 & */
function cleanText(s) {
	return String(s || '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\\+u0026/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
}

/* 酷我搜索（必须用 https：页面部署在 GitHub Pages 等 https 站点时，
 * http 的 JSONP 脚本属于“混合内容”，会被浏览器直接拦截） */
function searchKuwo(keyword, rn) {
	var url = 'https://search.kuwo.cn/r.s'
		+ '?all=' + encodeURIComponent(keyword)
		+ '&ft=music&itemset=web_2013&client=kt&pn=0&rn=' + (rn || 50)
		+ '&rformat=json&encoding=utf8';
	return jsonp(url).then(function (res) {
		return (res.abslist || []).filter(function (it) {
			return it.MUSICRID && it.ONLINE === '1';
		}).map(function (it) {
			return {
				rid: it.MUSICRID,
				name: cleanText(it.NAME || it.SONGNAME),
				artist: cleanText(it.ARTIST),
				album: cleanText(it.ALBUM),
				duration: parseInt(it.DURATION || 0, 10),
				src: ''
			};
		});
	});
}

/* 酷我播放地址（同样必须 https，避免 https 页面被混合内容拦截） */
function getKuwoUrl(rid) {
	var url = 'https://antiserver.kuwo.cn/anti.s'
		+ '?type=convert_url3&rid=' + encodeURIComponent(rid)
		+ '&format=mp3&response=url';
	return jsonp(url).then(function (res) {
		var media = (res && res.url) || '';
		// 音源地址有时仍是 http，https 页面下播放同样会被拦截，统一升级为 https
		if (media && location.protocol === 'https:' && media.indexOf('http://') === 0) {
			media = 'https://' + media.slice(7);
		}
		return media;
	});
}

/* ---------------- 歌词 ---------------- */

/* 文本归一化：去 &nbsp;、压缩空白、转小写 */
function normText(s) {
	return String(s || '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* 取主歌手（去掉合唱、feat 等次要信息） */
function primaryArtist(artist) {
	return normText(String(artist || '').split(/[&、\/,，;]|feat\.?/i)[0]);
}

/* 明显不是原曲版本的关键词，命中则不采用（避免拿到伴奏 / DJ / 翻唱歌词） */
var LYRIC_BAD_WORDS = [
	'dj', '伴奏', '纯音乐', '钢琴版', '女声版', '男声版', 'cover', '翻唱', 'remix',
	'live', '串烧', 'demo', '现场', '童声', '清唱', '对唱版', 'karaoke', 'instrumental', '钢琴'
];

function cleanLyricLine(s) {
	return String(s || '').replace(/\r/g, '').replace(/&nbsp;/g, ' ').trim();
}

/* 判断候选歌曲是不是我们要的那一首
 * needArtist=false 时只校验歌名（最后的兜底放宽） */
function matchSong(name, artist, candName, candArtist, needArtist) {
	var n = normText(name);
	var cn = normText(candName);
	if (!n || !cn) return false;
	if (cn.indexOf(n) === -1 && n.indexOf(cn) === -1) return false;
	if (needArtist !== false) {
		var a = primaryArtist(artist);
		var ca = normText(candArtist);
		if (a && ca.indexOf(a) === -1) return false;
	}
	for (var i = 0; i < LYRIC_BAD_WORDS.length; i++) {
		if (cn.indexOf(LYRIC_BAD_WORDS[i]) !== -1) return false;
	}
	return true;
}

/* 解析 LRC 文本为带时间的行（兼容 [mm:ss.ms] / [mm:ss:ms] 两种写法） */
function parseLrc(text) {
	if (!text) return [];
	var src = String(text).split(/\r?\n/);
	var out = [];
	var re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
	for (var i = 0; i < src.length; i++) {
		var line = src[i];
		var m;
		var times = [];
		re.lastIndex = 0;
		while ((m = re.exec(line)) !== null) {
			var frac = m[3] || '0';
			var ms = parseInt(frac, 10) / (frac.length === 3 ? 1000 : (frac.length === 2 ? 100 : 10));
			times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms);
		}
		var lineText = cleanLyricLine(line.replace(/\[[^\]]*\]/g, ''));
		if (!lineText || !times.length) continue;
		for (var t = 0; t < times.length; t++) out.push({ time: times[t], text: lineText });
	}
	out.sort(function (a, b) { return a.time - b.time; });
	return out;
}

/* 酷我 lrclist（[{"lineLyric":"...","time":"12.58"}]）转为统一行结构 */
function kuwoLrclistToLines(data) {
	var list = (data && data.data && data.data.lrclist) || [];
	var out = [];
	for (var i = 0; i < list.length; i++) {
		var t = parseFloat(list[i].time);
		var txt = cleanLyricLine(list[i].lineLyric);
		if (!isNaN(t) && txt) out.push({ time: t, text: txt });
	}
	out.sort(function (a, b) { return a.time - b.time; });
	return out;
}

/* 歌词源 A：酷我（musicId 就是当前播放音源的歌曲 id，最准确）
 * 该接口偶发返回“音乐查询失败”，失败或空结果时重试一次 */
function kuwoLyricById(musicId) {
	if (!musicId) return Promise.resolve([]);
	var url = 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + encodeURIComponent(musicId);
	return new Promise(function (resolve) {
		var attempt = 0;
		function go() {
			attempt++;
			httpJson(url).then(function (data) {
				var lines = kuwoLrclistToLines(data);
				if (lines.length || attempt >= 2) resolve(lines);
				else setTimeout(go, 400);
			}, function () {
				if (attempt >= 2) resolve([]);
				else setTimeout(go, 400);
			});
		}
		go();
	});
}

/* 歌词源 B：网易云（vkeys 中转，JSON + CORS） */
function neteaseSearch(keyword, num) {
	var url = 'https://api.vkeys.cn/v2/music/netease?word='
		+ encodeURIComponent(keyword) + '&num=' + (num || 8);
	return httpJson(url).then(function (res) {
		return (res && res.data) || [];
	}).catch(function () { return []; });
}

function neteaseLyricById(id) {
	var url = 'https://api.vkeys.cn/v2/music/netease/lyric?id=' + encodeURIComponent(id);
	return httpJson(url).then(function (res) {
		var d = (res && res.data) || {};
		return parseLrc(d.lrc || '');
	}).catch(function () { return []; });
}

/* 依次尝试候选，返回第一份非空歌词 */
function firstNonEmpty(list, fetchOne, limit) {
	var max = Math.min(list.length, limit || 5);
	var i = 0;
	return new Promise(function (resolve) {
		function next() {
			if (i >= max) return resolve([]);
			var item = list[i++];
			fetchOne(item).then(function (lines) {
				if (lines && lines.length) resolve(lines);
				else next();
			}, next);
		}
		next();
	});
}

/* 歌词缓存：同一首歌重复播放不再重复请求 */
var lyricCache = {};

/* 获取歌词：同源音乐 id → 酷我搜索同名 → 网易云，逐级回退 */
function getLyric(song) {
	var key = String(song.rid || '') + '|' + song.name + '|' + song.artist;
	if (lyricCache[key]) return Promise.resolve(lyricCache[key]);

	var musicId = String(song.rid || '').replace(/^MUSIC_/, '');
	var keyword = (String(song.name || '') + ' ' + primaryArtist(song.artist)).trim();

	/* 第 1 级：直接用当前歌曲的酷我 id 取歌词 */
	return kuwoLyricById(musicId).then(function (lines) {
		if (lines.length) return lines;

		/* 第 2 级：按歌名+歌手在酷我重新搜，用新 id 取歌词（老 rid 可能已下架） */
		return searchKuwo(keyword, 10).catch(function () { return []; }).then(function (list) {
			var strict = list.filter(function (it) {
				return matchSong(song.name, song.artist, it.name, it.artist);
			});
			var loose = list.filter(function (it) {
				return matchSong(song.name, '', it.name, it.artist, false);
			});
			var pick = strict.length ? strict : loose;
			return firstNonEmpty(pick, function (it) {
				return kuwoLyricById(String(it.rid || '').replace(/^MUSIC_/, ''));
			}, 5);
		});
	}).then(function (lines) {
		if (lines.length) return lines;

		/* 第 3 级：网易云歌词 */
		return neteaseSearch(keyword, 8).then(function (list) {
			var strict = list.filter(function (it) {
				return matchSong(song.name, song.artist, it.song, it.singer);
			});
			var loose = list.filter(function (it) {
				return matchSong(song.name, '', it.song, it.singer, false);
			});
			var pick = strict.length ? strict : loose;
			return firstNonEmpty(pick, function (it) {
				return neteaseLyricById(it.id);
			}, 5);
		});
	}).then(function (lines) {
		if (lines.length) lyricCache[key] = lines;   // 只缓存成功的，失败下次还能重试
		return lines;
	});
}

/* ---------------- 默认推荐榜（真实可播数据，酷我原唱音源） ---------------- */
/* 华语歌曲推荐 Top 20 */
var CN_SONGS = [
	{ rid: 'MUSIC_351583919', name: '稻香', artist: '周杰伦', album: '魔杰座', duration: 187 },
	{ rid: 'MUSIC_493628806', name: '七里香', artist: '周杰伦', album: '七里香', duration: 276 },
	{ rid: 'MUSIC_40614186', name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', duration: 140 },
	{ rid: 'MUSIC_23928868', name: '青花瓷', artist: '周杰伦', album: '我很忙', duration: 290 },
	{ rid: 'MUSIC_478692992', name: '简单爱', artist: '周杰伦', album: '范特西', duration: 155 },
	{ rid: 'MUSIC_475329807', name: '东风破', artist: '周杰伦', album: '叶惠美', duration: 270 },
	{ rid: 'MUSIC_477212170', name: '江南', artist: '林俊杰', album: '第二天堂', duration: 156 },
	{ rid: 'MUSIC_247111953', name: '修炼爱情', artist: '林俊杰', album: '因你而在', duration: 287 },
	{ rid: 'MUSIC_286508711', name: '曹操', artist: '林俊杰', album: '曹操', duration: 147 },
	{ rid: 'MUSIC_474539555', name: '十年', artist: '陈奕迅', album: '黑白灰', duration: 135 },
	{ rid: 'MUSIC_303316116', name: '好久不见', artist: '陈奕迅', album: '认了吧', duration: 224 },
	{ rid: 'MUSIC_493465004', name: '海阔天空', artist: 'Beyond', album: '乐与怒', duration: 343 },
	{ rid: 'MUSIC_483943085', name: '光辉岁月', artist: 'Beyond', album: '命运派对', duration: 242 },
	{ rid: 'MUSIC_492258914', name: '真的爱你', artist: 'Beyond', album: 'Beyond IV', duration: 233 },
	{ rid: 'MUSIC_474881986', name: '突然好想你', artist: '五月天', album: '后青春期的诗', duration: 208 },
	{ rid: 'MUSIC_482127621', name: '倔强', artist: '五月天', album: '神的孩子都在跳舞', duration: 199 },
	{ rid: 'MUSIC_484968683', name: '听海', artist: '张惠妹', album: 'Bad Boy', duration: 183 },
	{ rid: 'MUSIC_475472767', name: '红豆', artist: '王菲', album: '唱游', duration: 172 },
	{ rid: 'MUSIC_484493284', name: '忘情水', artist: '刘德华', album: '忘情水', duration: 186 },
	{ rid: 'MUSIC_491601502', name: '童话', artist: '光良', album: '童话', duration: 179 }
].map(function (s) { s.src = ''; return s; });

/* 欧美歌曲推荐 Top 20 */
var US_SONGS = [
	{ rid: 'MUSIC_297421878', name: 'Shape Of You', artist: 'Ed Sheeran', album: '÷ (Deluxe)', duration: 323 },
	{ rid: 'MUSIC_152950040', name: 'Despacito', artist: 'Luis Fonsi', album: 'VIDA', duration: 143 },
	{ rid: 'MUSIC_369053283', name: 'Rolling In The Deep', artist: 'Adele', album: '21', duration: 230 },
	{ rid: 'MUSIC_482201398', name: 'Uptown Funk', artist: 'Mark Ronson', album: 'Uptown Special', duration: 267 },
	{ rid: 'MUSIC_64992797', name: 'Counting Stars', artist: 'OneRepublic', album: 'Native', duration: 257 },
	{ rid: 'MUSIC_37292361', name: 'Believer', artist: 'Imagine Dragons', album: 'Evolve', duration: 203 },
	{ rid: 'MUSIC_389280798', name: 'Someone Like You', artist: 'Adele', album: '21', duration: 178 },
	{ rid: 'MUSIC_488400738', name: 'Hello', artist: 'Adele', album: '25', duration: 97 },
	{ rid: 'MUSIC_423715735', name: 'See You Again', artist: 'Wiz Khalifa', album: 'Furious 7', duration: 224 },
	{ rid: 'MUSIC_171337981', name: 'Closer', artist: 'The Chainsmokers', album: 'Collage', duration: 255 },
	{ rid: 'MUSIC_41300915', name: 'Thunder', artist: 'Imagine Dragons', album: 'Evolve', duration: 187 },
	{ rid: 'MUSIC_20783455', name: 'Love Yourself', artist: 'Justin Bieber', album: 'Purpose', duration: 269 },
	{ rid: 'MUSIC_41514957', name: 'Girls Like You', artist: 'Maroon 5', album: 'Red Pill Blues', duration: 235 },
	{ rid: 'MUSIC_493967506', name: 'Cheap Thrills', artist: 'Sia', album: 'This Is Acting', duration: 199 },
	{ rid: 'MUSIC_621775984', name: 'Stitches', artist: 'Shawn Mendes', album: 'Handwritten', duration: 206 },
	{ rid: 'MUSIC_152960340', name: 'Attention', artist: 'Charlie Puth', album: 'Voicenotes', duration: 178 },
	{ rid: 'MUSIC_521053372', name: 'Photograph', artist: 'Ed Sheeran', album: 'x (Wembley Edition)', duration: 213 },
	{ rid: 'MUSIC_409052774', name: 'Thinking Out Loud', artist: 'Ed Sheeran', album: 'x (Wembley Edition)', duration: 239 },
	{ rid: 'MUSIC_246889664', name: 'Apologize', artist: 'OneRepublic', album: 'Dreaming Out Loud', duration: 193 },
	{ rid: 'MUSIC_83610939', name: 'Payphone', artist: 'Maroon 5', album: 'Overexposed', duration: 266 }
].map(function (s) { s.src = ''; return s; });

/* ---------------- Vue 实例 ---------------- */
window.onload = function () {

	new Vue({
		el: '#app',
		data: {
			keyword: '',
			lastKeyword: '',
			artistGroup: 0,          // 当前展示的歌手组索引
			artistPools: [          // 多组推荐歌手，用于"换一批"
				['周杰伦', '林俊杰', '邓紫棋', '陈奕迅', 'Taylor Swift', 'Ed Sheeran', 'Adele', 'Beyond'],
				['王菲', '张学友', '五月天', '薛之谦', 'Justin Bieber', 'Maroon 5', 'Sia', 'Alan Walker'],
				['张惠妹', '刘德华', '光良', '周华健', 'Imagine Dragons', 'Shawn Mendes', 'Charlie Puth', 'The Chainsmokers'],
				['朴树', '李健', '汪峰', '梁静茹', 'Bruno Mars', 'The Weeknd', 'Coldplay', 'OneRepublic']
			],
			chart: 'cn',             // cn=华语推荐 | us=欧美推荐
			songs: [],
			listMode: 'chart',   // chart | search | artist
			current: {},
			index: -1,
			playing: false,
			loading: false,
			curTime: 0,
			volume: 70,
			lyricLines: [],
			lyricIdx: -1,
			lyricLoading: false,
			lyricFocus: false,
			lyricToken: 0        // 防止切歌后旧请求回写歌词
		},

		computed: {
			artists: function () {
				return this.artistPools[this.artistGroup] || [];
			},
			progressPct: function () {
				if (!this.current.duration) return 0;
				return Math.min(100, this.curTime / this.current.duration * 100);
			}
		},

		watch: {
			// 播放时间变化时更新歌词行
			curTime: function () {
				this.updateLyricIndex();
			}
		},

		methods: {
			/* 页面内提示（不阻塞，替代 alert） */
			toast: function (msg) {
				var self = this;
				this.$nextTick(function () {
					var el = document.getElementById('toast');
					if (!el) return;
					el.textContent = msg;
					el.classList.add('show');
					clearTimeout(el._t);
					el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
				});
			},

			/* 加载推荐榜单（默认华语，点击切换欧美），不自动播放、不清歌词 */
			loadList: function (which) {
				this.chart = which === 'us' ? 'us' : 'cn';
				this.songs = (this.chart === 'us' ? US_SONGS : CN_SONGS).slice();
				this.listMode = 'chart';
				this.lastKeyword = this.chart === 'us' ? '欧美歌曲推荐 Top 20' : '华语歌曲推荐 Top 20';
			},

			switchChart: function (which) {
				this.loadList(which);
			},

			/* 搜索（不自动播放、不清歌词） */
			doSearch: function () {
				var kw = (this.keyword || '').trim();
				if (!kw) return;
				this.loading = true;
				var self = this;
				searchKuwo(kw, 50).then(function (list) {
					self.loading = false;
					self.listMode = 'search';
					self.lastKeyword = kw;
					self.keyword = '';
					self.songs = list;
				}).catch(function () {
					self.loading = false;
					self.toast('搜索失败，请稍后重试');
				});
			},

			/* 点击推荐歌手（不自动播放、不清歌词） */
			quickSearch: function (kw) {
				this.loading = true;
				var self = this;
				searchKuwo(kw, 50).then(function (list) {
					self.loading = false;
					self.listMode = 'artist';
					self.lastKeyword = kw;
					self.songs = list;
				}).catch(function () {
					self.loading = false;
					self.toast('加载失败，请稍后重试');
				});
			},

			/* 换一批推荐歌手 */
			nextArtists: function () {
				this.artistGroup = (this.artistGroup + 1) % this.artistPools.length;
			},

			/* 点击品牌区：初始化播放器，回到打开网页时的状态 */
			resetPlayer: function () {
				var audio = this.$refs.audio;
				if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
				this.current = {};
				this.index = -1;
				this.playing = false;
				this.curTime = 0;
				this.keyword = '';
				this.chart = 'cn';
				this.songs = CN_SONGS.slice();
				this.listMode = 'chart';
				this.lastKeyword = '华语歌曲推荐 Top 20';
				this.clearLyric();
				this.toast('已回到初始状态');
			},

			/* 播放指定索引 */
			playIndex: function (i) {
				var song = this.songs[i];
				if (!song) return;
				this.index = i;
				this.current = song;
				this.playing = false;
				this.loading = true;
				var self = this;
				var audio = this.$refs.audio;
				// 歌词异步加载，失败不影响播放
				this.loadLyric(song);

				var p = song.src ? Promise.resolve(song.src) : getKuwoUrl(song.rid);
				p.then(function (url) {
					if (!url) {
						self.loading = false;
						self.toast('该歌曲暂不可播放，已跳到下一首');
						setTimeout(function () { self.next(); }, 600);
						return;
					}
					song.src = url;
					audio.src = url;
					audio.play().then(function () {
						self.playing = true;
						self.loading = false;
					}).catch(function () {
						self.loading = false;
						self.playing = true;
					});
				}).catch(function () {
					self.loading = false;
					self.toast('获取播放地址失败，已跳到下一首');
					setTimeout(function () { self.next(); }, 600);
				});
			},

			/* 加载歌词（三级回退在 getLyric 内部完成） */
			loadLyric: function (song) {
				this.lyricLines = [];
				this.lyricIdx = -1;
				this.lyricLoading = true;
				var self = this;
				var token = ++this.lyricToken;
				getLyric(song).then(function (lines) {
					// 切歌后旧请求返回，直接丢弃
					if (token !== self.lyricToken || self.current !== song) return;
					self.lyricLoading = false;
					self.lyricLines = lines;
					self.updateLyricIndex();
				}).catch(function () {
					if (token !== self.lyricToken || self.current !== song) return;
					self.lyricLoading = false;
					self.lyricLines = [];
				});
			},

			/* 根据当前时间更新高亮歌词行并滚动 */
			updateLyricIndex: function () {
				var lines = this.lyricLines;
				if (!lines.length) { this.lyricIdx = -1; return; }
				var t = this.curTime;
				var idx = 0;
				for (var i = 0; i < lines.length; i++) {
					if (lines[i].time <= t + 0.2) idx = i; else break;
				}
				if (idx !== this.lyricIdx) {
					this.lyricIdx = idx;
					this.scrollLyric(idx);
				}
			},

			scrollLyric: function (idx) {
				if (this.lyricFocus) return;   // 用户点击歌词区后暂停自动滚动，方便自己翻看
				var self = this;
				this.$nextTick(function () {
					var box = self.$refs.lyricBox;
					if (!box) return;
					var sc = box.querySelector('.lyric-scroll');
					var ps = sc ? sc.querySelectorAll('p') : null;
					if (!ps || !ps[idx]) return;
					// 只滚动歌词容器本身，绝不动整个页面
					var target = ps[idx];
					var half = sc.clientHeight / 2;
					var offset = target.offsetTop - sc.offsetTop + target.offsetHeight / 2 - half;
					sc.scrollTop = Math.max(0, offset);
				});
			},

			clearLyric: function () {
				this.lyricToken++;
				this.lyricLines = [];
				this.lyricIdx = -1;
				this.lyricLoading = false;
			},

			/* 点击歌词区暂停/恢复自动滚动 */
			toggleLyricFocus: function () {
				this.lyricFocus = !this.lyricFocus;
				if (!this.lyricFocus) this.scrollLyric(this.lyricIdx);
			},

			togglePlay: function () {
				var audio = this.$refs.audio;
				if (!audio.src) {
					if (this.songs.length) this.playIndex(this.index >= 0 ? this.index : 0);
					return;
				}
				if (this.playing) { audio.pause(); this.playing = false; }
				else { audio.play().catch(function () {}); this.playing = true; }
			},

			pause: function () {
				if (this.$refs.audio) this.$refs.audio.pause();
				this.playing = false;
			},

			prev: function () {
				if (!this.songs.length) return;
				this.playIndex((this.index - 1 + this.songs.length) % this.songs.length);
			},

			next: function () {
				if (!this.songs.length) return;
				this.playIndex((this.index + 1) % this.songs.length);
			},

			seek: function (e) {
				var audio = this.$refs.audio;
				if (!audio.src || !this.current.duration) return;
				var rect = e.currentTarget.getBoundingClientRect();
				audio.currentTime = (e.clientX - rect.left) / rect.width * this.current.duration;
			},

			seekVolume: function (e) {
				var rect = e.currentTarget.getBoundingClientRect();
				var pct = (e.clientX - rect.left) / rect.width;
				this.volume = Math.max(0, Math.min(100, Math.round(pct * 100)));
				this.$refs.audio.volume = this.volume / 100;
			},

			onTime: function () {
				this.curTime = this.$refs.audio.currentTime || 0;
			},

			onMeta: function () {
				var audio = this.$refs.audio;
				if (audio.duration && isFinite(audio.duration) && !this.current.duration) {
					this.current.duration = Math.round(audio.duration);
				}
				this.volume = Math.round(audio.volume * 100);
			},

			fmtDur: function (sec) {
				sec = Math.max(0, Math.floor(sec || 0));
				var m = Math.floor(sec / 60), s = sec % 60;
				return m + ':' + (s < 10 ? '0' : '') + s;
			}
		},

		created: function () {
			this.loadList('cn');
		}
	});

};
