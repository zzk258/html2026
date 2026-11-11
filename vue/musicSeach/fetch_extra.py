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

BAD = re.compile(r'伴奏|纯音乐|现场|Live|Remix|KTV|翻唱|Cover|DJ|串烧|演唱会|Mix|翻奏|钢琴|弹唱|来电|振铃|彩铃|片尾', re.I)

def pick(kw_song, kw_artist):
    kw = kw_artist + ' ' + kw_song
    for it in search(kw):
        if not it.get('MUSICRID') or it.get('ONLINE') != '1': continue
        nm = clean(it.get('NAME') or it.get('SONGNAME') or '')
        ar = clean(it.get('ARTIST') or '')
        dur = int(it.get('DURATION') or 0)
        if BAD.search(nm): continue
        if dur < 120: continue  # 排除短片段
        n1 = re.sub(r'[\W_]+','',nm).lower()
        s1 = re.sub(r'[\W_]+','',kw_song).lower()
        if s1 and s1 not in n1: continue
        return {'rid': it['MUSICRID'], 'name': nm, 'artist': ar,
                'album': clean(it.get('ALBUM') or ''), 'duration': dur}
    return None

# 补充查询：经典、应有原唱
extra = [
    ('简单爱','周杰伦'), ('东风破','周杰伦'), ('夜曲','周杰伦'), ('双截棍','周杰伦'),
    ('后来','刘若英'), ('平凡之路','朴树'), ('存在','汪峰'), ('传奇','李健'),
    ('Demons','Imagine Dragons'), ('Thunder','Imagine Dragons'), ('Natural','Imagine Dragons'),
    ('Payphone','Maroon 5'), ('One More Night','Maroon 5'),
    ('Attention','Charlie Puth'), ('We Don\'t Talk Anymore','Charlie Puth'),
    ('New Rules','Dua Lipa'), ('Skyfall','Adele'), ('Set Fire to the Rain','Adele'),
    ('What Do You Mean','Justin Bieber'), ('Something Just Like This','The Chainsmokers'),
    ('See You Again','Wiz Khalifa'), ('Blinding Lights','The Weeknd'), ('Shape of You','Ed Sheeran'),
    ('Hello','Adele'), ('Someone Like You','Adele'), ('Counting Stars','OneRepublic'),
    ('Uptown Funk','Mark Ronson'), ('Rolling in the Deep','Adele'), ('Believer','Imagine Dragons'),
]
res=[]
for name, artist in extra:
    try: r = pick(name, artist)
    except Exception as e: r = {'error': str(e)}
    res.append({'name': name, 'artist': artist, 'result': r})
print(json.dumps(res, ensure_ascii=False, indent=1))
