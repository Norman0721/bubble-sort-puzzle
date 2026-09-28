"""Static mobile layout references, not captured browser screenshots."""
from pathlib import Path
from html import escape
import base64,json,math
root=Path(__file__).resolve().parent.parent
level=json.loads(Path('/tmp/mobile-preview-level.json').read_text())
font='-apple-system,PingFang SC,Microsoft YaHei,sans-serif'
def text(x,y,t,size=28,color='#c6cbe8'):
 return f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="{font}" font-size="{size}" fill="{color}">{escape(t)}</text>'
def button(x,y,w,label,primary=False,h=104):
 return f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="18" fill="{"#2c5a3f" if primary else "#252c42"}" stroke="{"#3d7a55" if primary else "#566089"}" stroke-width="2"/>'+text(x,y,label,28 if w<160 else 30,'#dff5e5' if primary else '#c6cbe8')
def image(name,x,y,w,h):
 data=base64.b64encode((root/'home/assets'/name).read_bytes()).decode()
 return f'<image href="data:image/png;base64,{data}" x="{x}" y="{y}" width="{w}" height="{h}"/>'
def wrap(c):
 return f'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><rect width="390" height="844" fill="#10121e"/><g transform="translate(0 115) scale({390/672})">{c}</g></svg>'
game='<rect width="672" height="1080" fill="#1a1c2c"/>'+text(336,40,'第 5 关',30,'#fff')
for i,label in enumerate(['撤销3','声音','主页','关卡','重开']):game+=button(64+i*136,136,104,label)
colors={'r':'#e74c3c','b':'#3498db','g':'#2ecc71','y':'#f1c40f'}
offset=(672-(len(level['grid'][0])+.5)*27)/2
for r,row in enumerate(level['grid']):
 for col,k in enumerate(row):
  if k!='.':game+=f'<circle cx="{offset+(col+.5+(r%2)*.5)*27}" cy="{208+r*27*math.sqrt(3)/2}" r="12.5" fill="{colors.get(k,"#ad77ca")}" stroke="#ffffff" stroke-opacity=".55"/>'
game+='<path d="M336 985 L292 324" fill="none" stroke="#7bd88f" stroke-width="2" stroke-dasharray="9 9"/>'
game+='<path d="M45 1010 H627" stroke="#566089" stroke-width="2"/><circle cx="336" cy="1010" r="26" fill="#39405e" stroke="#566089" stroke-width="2"/><circle cx="336" cy="1010" r="8" fill="#3498db"/>'
for i,a in enumerate(level['ammo'][1:]):game+=f'<circle cx="{42+i*42}" cy="1038" r="{4 if a["size"]=="small" else 6 if a["size"]=="medium" else 7.5}" fill="{colors[a["color"]]}" stroke="#ffffff" stroke-opacity=".55"/>'
(root/'game/design/mobile-game.svg').write_text(wrap(game))
result=game+'<rect width="672" height="1080" fill="#000" fill-opacity=".82"/>'+text(336,400,'弹药耗尽',42,'#fff')+text(336,465,'用弹 11/11 · 命中 73%',26,'#9ba6c6')+button(336,620,400,'重新挑战',True)+button(336,758,400,'撤销上一发（剩 3 次）')+button(336,896,400,'返回首页')
(root/'game/design/mobile-result.svg').write_text(wrap(result))
home=image('ui_home_bg_01.png',0,0,672,1080)+image('ui_home_logo.png',96,320,480,160)
for i,k in enumerate(['red','blue','green','yellow']):home+=image('ui_bubble_decor_'+k+'.png',254+i*44,449,32,32)
for label,y,primary in [('开始游戏',560,True),('选择关卡',688,False),('关卡编辑器',816,False)]:home+=button(336,y,352,label,primary)
(root/'game/design/mobile-home.svg').write_text(wrap(home))
print('Created static 390×844 mobile layout references.')
