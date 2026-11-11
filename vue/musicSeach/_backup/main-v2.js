/* 在线音乐播放器 — 酷我音乐免费接口版
 * 数据源：search.kuwo.cn（搜索）+ antiserver.kuwo.cn（播放地址）
 * 通信方式：JSONP（纯前端跨域，无需密钥/代理）
 */

/* ---------------- 全局 JSONP 工具 ---------------- */
function jsonp(url, callback) {
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
		if (callback) callback(script);
	});
}

/* 搜索接口（酷我 web 版）
 * all 是搜索词；ft=music 只搜歌曲；encoding=utf8 保证中文
 */
function searchSongs(keyword) {
	var url = 'http://search.kuwo.cn/r.s'
		+ '?all=' + encodeURIComponent(keyword)
		+ '&ft=music&itemset=web_2013&client=kt&pn=0&rn=50'
		+ '&rformat=json&encoding=utf8';
	return jsonp(url).then(function (res) {
		var list = (res.abslist || []).filter(function (it) {
			return it.MUSICRID && it.ONLINE === '1';
		}).map(function (it) {
			return {
				rid: it.MUSICRID,                 // 形如 MUSIC_xxx
				id: it.DC_TARGETID,
				name: (it.NAME || it.SONGNAME || '').replace(/&nbsp;/g, ' '),
				artist: (it.ARTIST || '').replace(/&nbsp;/g, ' '),
				album: (it.ALBUM || '').replace(/&nbsp;/g, ' '),
				duration: parseInt(it.DURATION || 0, 10),
				src: ''
			};
		});
		return list;
	});
}

/* 播放地址接口（酷我 antiserver）
 * 返回真实可播的 mp3 地址
 */
function getSongUrl(rid) {
	var url = 'http://antiserver.kuwo.cn/anti.s'
		+ '?type=convert_url3&rid=' + encodeURIComponent(rid)
		+ '&format=mp3&response=url';
	return jsonp(url).then(function (res) {
		return res.url || '';
	});
}

/* ---------------- Vue 实例 ---------------- */
window.onload = function () {

	new Vue({
		el: '#app',
		data: {
			keyword: '',
			songs: [],
			current: {},       // 当前播放的歌曲信息
			index: -1,         // 当前播放索引
			playing: false,    // 是否在播放
			loading: false,    // 加载中
			curTime: 0,        // 当前播放时间(秒)
			volume: 70,        // 音量百分比
			hasGlow: false
		},

		computed: {
			// 进度百分比
			progressPct: function () {
				if (!this.current.duration) return 0;
				return Math.min(100, this.curTime / this.current.duration * 100);
			},
			// 封面背景光效（用歌曲名做种子的稳定渐变色）
			glowStyle: function () {
				var c = this.hashColor(this.current.name || '');
				return {
					background: 'radial-gradient(circle at 50% 40%, ' + c[0] + ' 0%, ' + c[1] + ' 45%, rgba(0,0,0,0) 75%)'
				};
			}
		},

		methods: {
			/* 搜索并替换列表 */
			doSearch: function () {
				var kw = (this.keyword || '').trim();
				if (!kw) return;
				this.loading = true;
				var self = this;
				searchSongs(kw).then(function (list) {
					self.loading = false;
					self.songs = list;
					self.index = -1;
					self.current = {};
					self.pause();
					// 搜索到就直接播第一首
					if (list.length) self.playIndex(0);
				}).catch(function (e) {
					self.loading = false;
					alert('搜索失败，请稍后重试');
				});
			},

			quickSearch: function (kw) {
				this.keyword = kw;
				this.doSearch();
			},

			clearList: function () {
				this.songs = [];
				this.index = -1;
				this.current = {};
				this.pause();
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

				// 已有地址则直接播；否则拉取
				var p = song.src ? Promise.resolve(song.src) : getSongUrl(song.rid);
				p.then(function (url) {
					if (!url) {
						self.loading = false;
						alert('该歌曲暂不可播放，试试下一首');
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
					alert('获取播放地址失败');
				});
			},

			/* 播放 / 暂停 */
			togglePlay: function () {
				var audio = this.$refs.audio;
				if (!audio.src) { if (this.songs.length) this.playIndex(this.index >= 0 ? this.index : 0); return; }
				if (this.playing) { audio.pause(); this.playing = false; }
				else { audio.play().catch(function(){}); this.playing = true; }
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

			/* 进度条跳转 */
			seek: function (e) {
				var audio = this.$refs.audio;
				if (!audio.src || !this.current.duration) return;
				var rect = e.currentTarget.getBoundingClientRect();
				var pct = (e.clientX - rect.left) / rect.width;
				audio.currentTime = pct * this.current.duration;
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

			/* 秒 -> mm:ss */
			fmtDur: function (sec) {
				sec = Math.max(0, Math.floor(sec || 0));
				var m = Math.floor(sec / 60), s = sec % 60;
				return m + ':' + (s < 10 ? '0' : '') + s;
			},

			/* 由字符串生成稳定的双色（封面光效/配色用） */
			hashColor: function (str) {
				var h = 0;
				for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
				var hue = h % 360;
				var hue2 = (hue + 40) % 360;
				return ['hsla(' + hue + ', 70%, 55%, 0.55)', 'hsla(' + hue2 + ', 80%, 35%, 0.55)'];
			}
		}
	});

};
