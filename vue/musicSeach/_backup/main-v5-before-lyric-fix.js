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
			lyricFocus: false
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
			this.loadList('cn');
		}
	});

};
