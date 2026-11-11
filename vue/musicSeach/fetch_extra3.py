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

BAD = re.compile(r'伴奏|纯音乐|现场|Live|Remix|KTV|翻唱|Cover|DJ|串烧|演唱会|Mix|翻奏|钢琴|弹唱|Bootleg|Speed|karaoke|Karaoke|In the Style|Vocal Melody|Edit|Mashup|混音', re.I)

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
        if re.search(r'翻唱|Cover|伴奏|DJ', ar): continue
        return {'rid': it['MUSICRID'], 'name': nm, 'artist': ar,
                'album': clean(it.get('ALBUM') or ''), 'duration': dur}
    return None

extra = [
    ('Just The Way You Are','Bruno Mars'), ('Viva La Vida','Coldplay'),
    ('Apologize','OneRepublic'), ('What Makes You Beautiful','One Direction'),
    ('Sunflower','Post Malone'), ('Believer','Imagine Dragons'),
    ('童话','光良'), ('隐形的翅膀','张韶涵'), ('宁夏','梁静茹'),
    ('认真的雪','薛之谦'), ('海阔天空','beyond'),
]
res=[]
for name, artist in extra:
    try: r = pick(name, artist)
    except Exception as e: r = {'error': str(e)}
    res.append({'name': name, 'artist': artist, 'result': r})
print(json.dumps(res, ensure_ascii=False, indent=1))
