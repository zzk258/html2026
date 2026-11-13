# -*- coding: utf-8 -*-
import urllib.request, urllib.parse
kw='周杰伦 晴天'
url=('http://search.kuwo.cn/r.s?all='+urllib.parse.quote(kw)
     +'&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8')
req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':'http://www.kuwo.cn/'})
raw=urllib.request.urlopen(req, timeout=20).read().decode('utf-8','ignore')
print("repr head:", repr(raw[:120]))
print("index {:", raw.find('{'), "rindex }:", raw.rfind('}'))
