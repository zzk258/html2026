# -*- coding: utf-8 -*-
import json, re, ast, urllib.request, urllib.parse

def search(kw):
    url = ('http://search.kuwo.cn/r.s'
           '?all=' + urllib.parse.quote(kw)
           + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=30'
           + '&rformat=json&encoding=utf8')
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':'http://www.kuwo.cn/'})
    raw = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
    start = raw.index('{'); end = raw.rfind('}')
    return ast.literal_eval(raw[start:end+1]).get('abslist') or []

def clean(s):
    if not s: return ''
    return s.replace('&nbsp;',' ').replace('&apos;',"'").replace('&amp;','&').replace('\\u0026','&').replace('\\\\u0026','&')

BAD = re.compile(r'伴奏|纯音乐|现场|Live|Remix|KTV|翻唱|Cover|DJ|串烧|演唱会|Mix|翻奏|钢琴|弹唱|Bootleg|Speed|karaoke|Karaoke|In the Style|Vocal Melody', re.I)

def pick(kw_song, kw_artist):
    kw = kw_artist + ' ' + kw_song
    for it in search(kw):
        if not it.get('MUSICRID') or it.get('ONLINE') != '1': continue
        nm = clean(it.get('NAME') or it.get('SONGNAME') or '')
        ar = clean(it.get('ARTIST') or '')
        dur = int(it.get('DURATION') or 0)
        if BAD.search(nm): continue
        if dur < 120 or dur > 500: continue
        n1 = re.sub(r'[\W_]+','',nm).lower()
        s1 = re.sub(r'[\W_]+','',kw_song).lower()
        if s1 and s1 not in n1: continue
        # 艺人不含明显非原唱的二次创作标记
        if re.search(r'翻唱|Cover|伴奏', ar): continue
        return {'rid': it['MUSICRID'], 'name': nm, 'artist': ar,
                'album': clean(it.get('ALBUM') or ''), 'duration': dur}
    return None

extra = [
    ('Perfect','Ed Sheeran'), ('Thinking Out Loud','Ed Sheeran'), ('Photograph','Ed Sheeran'),
    ('Sugar','Maroon 5'), ('Radioactive','Imagine Dragons'), ('Demons','Imagine Dragons'),
    ('Wake Me Up','Avicii'), ('All of Me','John Legend'),
    ('Summer','Calvin Harris'), ('Animals','Martin Garrix'),
    ('晴天','周杰伦'), ('演员','薛之谦'), ('丑八怪','薛之谦'), ('光年之外','邓紫棋'),
    ('泡沫','邓紫棋'), ('浮夸','陈奕迅'), ('好久不见','陈奕迅'), ('朋友','周华健'),
    ('平凡之路','朴树'), ('夜曲','周杰伦'),
]
res=[]
for name, artist in extra:
    try: r = pick(name, artist)
    except Exception as e: r = {'error': str(e)}
    res.append({'name': name, 'artist': artist, 'result': r})
print(json.dumps(res, ensure_ascii=False, indent=1))
