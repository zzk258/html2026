# -*- coding: utf-8 -*-
import json, re, ast, urllib.request, urllib.parse

def search(kw):
    url = ('http://search.kuwo.cn/r.s'
           '?all=' + urllib.parse.quote(kw)
           + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=30'
           + '&rformat=json&encoding=utf8')
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':'http://www.kuwo.cn/'})
    raw = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
    start = raw.index('{')
    end = raw.rfind('}')
    return ast.literal_eval(raw[start:end+1]).get('abslist') or []

def clean(s):
    if not s: return ''
    return s.replace('&nbsp;',' ').replace('&apos;',"'").replace('&amp;','&').replace('\\u0026','&').replace('\\\\u0026','&')

BAD = re.compile(r'伴奏|纯音乐|现场|Live|Remix|KTV|翻唱|Cover|DJ|串烧|演唱会|Mix|Acoustic|伴奏带|英文版|翻奏|钢琴|热歌', re.I)

def pick(kw_song, kw_artist):
    kw = kw_artist + ' ' + kw_song
    for it in search(kw):
        if not it.get('MUSICRID') or it.get('ONLINE') != '1': continue
        nm = clean(it.get('NAME') or it.get('SONGNAME') or '')
        ar = clean(it.get('ARTIST') or '')
        if BAD.search(nm): continue
        # 歌名需包含查询歌名的核心部分（忽略标点空格）
        n1 = re.sub(r'[\W_]+','',nm).lower()
        s1 = re.sub(r'[\W_]+','',kw_song).lower()
        if s1 and s1 not in n1: continue
        return {'rid': it['MUSICRID'], 'name': nm, 'artist': ar,
                'album': clean(it.get('ALBUM') or ''), 'duration': int(it.get('DURATION') or 0)}
    return None

US = [
    ('Perfect','Ed Sheeran'), ('Photograph','Ed Sheeran'), ('Thinking Out Loud','Ed Sheeran'),
    ('Something Just Like This','Chainsmokers'), ('Closer','Chainsmokers'), ('Paris','Chainsmokers'),
    ('Faded','Alan Walker'), ('Alone','Alan Walker'),
    ('Love Yourself','Justin Bieber'), ('Sorry','Justin Bieber'), ('Baby','Justin Bieber'),
    ('Sugar','Maroon 5'), ('Girls Like You','Maroon 5'), ('Maps','Maroon 5'),
    ('Cheap Thrills','Sia'), ('Chandelier','Sia'),
    ('Radioactive','Imagine Dragons'), ('Believer','Imagine Dragons'),
    ('Stitches','Shawn Mendes'), ('In My Blood','Shawn Mendes'),
]
CN = [
    ('晴天','周杰伦'), ('稻香','周杰伦'), ('七里香','周杰伦'), ('告白气球','周杰伦'), ('青花瓷','周杰伦'),
    ('江南','林俊杰'), ('修炼爱情','林俊杰'), ('可惜没如果','林俊杰'), ('曹操','林俊杰'),
    ('十年','陈奕迅'), ('浮夸','陈奕迅'), ('好久不见','陈奕迅'),
    ('光年之外','邓紫棋'), ('泡沫','邓紫棋'), ('倒数','邓紫棋'),
    ('海阔天空','Beyond'), ('光辉岁月','Beyond'), ('真的爱你','Beyond'),
    ('突然好想你','五月天'), ('倔强','五月天'),
    ('演员','薛之谦'), ('丑八怪','薛之谦'),
    ('吻别','张学友'), ('听海','张惠妹'), ('红豆','王菲'), ('忘情水','刘德华'), ('朋友','周华健'),
]

def run(lst):
    res=[]
    for name, artist in lst:
        try: r = pick(name, artist)
        except Exception as e: r = {'error': str(e)}
        res.append({'name': name, 'artist': artist, 'result': r})
    return res

out = {'US': run(US), 'CN': run(CN)}
print(json.dumps(out, ensure_ascii=False, indent=1))
