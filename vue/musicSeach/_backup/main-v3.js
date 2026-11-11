/* 在线音乐播放器 · 单页版
 * 数据源：酷我音乐免费接口（搜索 + 播放地址，JSONP）
 *        网易云音乐公开镜像（歌词，CORS axios）
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

/* 酷我搜索 */
function searchKuwo(keyword, rn) {
	var url = 'http://search.kuwo.cn/r.s'
		+ '?all=' + encodeURIComponent(keyword)
		+ '&ft=music&itemset=web_2013&client=kt&pn=0&rn=' + (rn || 50)
		+ '&rformat=json&encoding=utf8';
	return jsonp(url).then(function (res) {
		return (res.abslist || []).filter(function (it) {
			return it.MUSICRID && it.ONLINE === '1';
		}).map(function (it) {
			return {
				rid: it.MUSICRID,
				name: (it.NAME || it.SONGNAME || '').replace(/&nbsp;/g, ' '),
				artist: (it.ARTIST || '').replace(/&nbsp;/g, ' '),
				album: (it.ALBUM || '').replace(/&nbsp;/g, ' '),
				duration: parseInt(it.DURATION || 0, 10),
				src: ''
			};
		});
	});
}

/* 酷我播放地址 */
function getKuwoUrl(rid) {
	var url = 'http://antiserver.kuwo.cn/anti.s'
		+ '?type=convert_url3&rid=' + encodeURIComponent(rid)
		+ '&format=mp3&response=url';
	return jsonp(url).then(function (res) { return res.url || ''; });
}

/* 网易云歌词（按歌名+歌手搜索关联） */
function httpGet(url, params) {
	/* 原生 XHR + Promise，替代 axios（file:// 下无需外部依赖） */
	return new Promise(function (resolve, reject) {
		var full = url + '?' + Object.keys(params).map(function (k) {
			return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
		}).join('&');
		var xhr = new XMLHttpRequest();
		xhr.open('GET', full, true);
		xhr.onload = function () {
			if (xhr.status >= 200 && xhr.status < 300) {
				try { resolve(JSON.parse(xhr.responseText)); }
				catch (e) { reject(e); }
			} else reject(new Error('HTTP ' + xhr.status));
		};
		xhr.onerror = function () { reject(new Error('network')); };
		xhr.send();
	});
}

function getLyric(name, artist) {
	var kw = (name || '').trim() + ' ' + (artist || '').trim().split(/[&、\/]/)[0];
	var api = 'https://apis.netstart.cn/music';
	return httpGet(api + '/search', { keywords: kw, limit: 3 })
		.then(function (data) {
			var songs = (data && data.result && data.result.songs) || [];
			if (!songs.length) return Promise.reject('no song');
			return httpGet(api + '/lyric', { id: songs[0].id });
		})
		.then(function (data) {
			var lrc = (data && data.lrc && data.lrc.lyric) || '';
			return parseLrc(lrc);
		});
}

/* 解析 LRC 文本为带时间的行 */
function parseLrc(text) {
	if (!text) return [];
	var lines = text.split('\n');
	var out = [];
	var re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		var m;
		var times = [];
		while ((m = re.exec(line)) !== null) {
			times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3] || '0', 10) / 1000);
		}
		var text = line.replace(/\[[^\]]*\]/g, '').trim();
		if (!text || !times.length) continue;
		for (var t = 0; t < times.length; t++) out.push({ time: times[t], text: text });
	}
	out.sort(function (a, b) { return a.time - b.time; });
	return out;
}

/* ---------------- 默认欧美热门榜（真实可播数据） ---------------- */
var CHART_SONGS = [
	{ rid: 'MUSIC_297421878', name: 'Shape Of You', artist: 'Ed Sheeran', album: '÷ (Deluxe)', duration: 323 },
	{ rid: 'MUSIC_152950040', name: 'Despacito', artist: 'Luis Fonsi', album: 'VIDA', duration: 143 },
	{ rid: 'MUSIC_369053283', name: 'Rolling In The Deep', artist: 'Adele', album: '21', duration: 230 },
	{ rid: 'MUSIC_482201398', name: 'Uptown Funk', artist: 'Mark Ronson', album: 'Uptown Special', duration: 267 },
	{ rid: 'MUSIC_64992797', name: 'Counting Stars', artist: 'OneRepublic', album: 'Native', duration: 257 },
	{ rid: 'MUSIC_37292361', name: 'Believer', artist: 'Imagine Dragons', album: 'Evolve', duration: 203 },
	{ rid: 'MUSIC_389280798', name: 'Someone Like You', artist: 'Adele', album: '21', duration: 178 },
	{ rid: 'MUSIC_488400738', name: 'Hello', artist: 'Adele', album: '25', duration: 97 },
	{ rid: 'MUSIC_423715735', name: 'See You Again', artist: 'Wiz Khalifa', album: 'Furious 7', duration: 224 },
	{ rid: 'MUSIC_171337981', name: 'Closer', artist: 'The Chainsmokers', album: 'Collage', duration: 255 }
].map(function (s) { s.src = ''; return s; });

/* ---------------- Vue 实例 ---------------- */
window.onload = function () {

	new Vue({
		el: '#app',
		data: {
			keyword: '',
			lastKeyword: '',
			artists: ['周杰伦', '林俊杰', '邓紫棋', '陈奕迅', 'Taylor Swift', 'Ed Sheeran', 'Adele', 'Beyond'],
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
			lyricFocus: false
		},

		computed: {
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

			/* 加载默认榜单 */
			loadChart: function () {
				this.songs = CHART_SONGS.slice();
				this.listMode = 'chart';
				this.lastKeyword = '欧美热门 Top 10';
				if (!this.current.name && this.songs.length) this.playIndex(0);
			},

			/* 搜索 */
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
					self.clearLyric();
					if (list.length) self.playIndex(0);
				}).catch(function () {
					self.loading = false;
					self.toast('搜索失败，请稍后重试');
				});
			},

			quickSearch: function (kw) {
				this.loading = true;
				var self = this;
				searchKuwo(kw, 50).then(function (list) {
					self.loading = false;
					self.listMode = 'artist';
					self.lastKeyword = kw;
					self.songs = list;
					self.clearLyric();
					if (list.length) self.playIndex(0);
				}).catch(function () {
					self.loading = false;
					self.toast('加载失败，请稍后重试');
				});
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

			/* 加载歌词 */
			loadLyric: function (song) {
				this.lyricLines = [];
				this.lyricIdx = -1;
				this.lyricLoading = true;
				var self = this;
				getLyric(song.name, song.artist).then(function (lines) {
					self.lyricLoading = false;
					if (self.current !== song) return;
					self.lyricLines = lines;
					self.updateLyricIndex();
				}).catch(function () {
					self.lyricLoading = false;
					if (self.current === song) self.lyricLines = [];
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
				var self = this;
				this.$nextTick(function () {
					var box = self.$refs.lyricBox;
					if (!box) return;
					var p = box.querySelectorAll('.lyric-scroll p');
					if (p && p[idx] && p[idx].scrollIntoView) {
						p[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
					}
				});
			},

			clearLyric: function () {
				this.lyricLines = [];
				this.lyricIdx = -1;
				this.lyricLoading = false;
			},

			/* 点击歌词区暂停自动滚动 */
			toggleLyricFocus: function () {
				this.lyricFocus = !this.lyricFocus;
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
			this.loadChart();
		}
	});

};
