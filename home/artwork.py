"""Produce reproducible vector masters, raster assets, and annotated UI reference sheets."""
from pathlib import Path
import xml.etree.ElementTree as ET
from html import escape
import base64
ROOT=Path(__file__).resolve().parent
ASSETS=ROOT/'assets';ASSETS.mkdir(exist_ok=True)
DESIGN=ROOT/'design';DESIGN.mkdir(exist_ok=True)
FONT='-apple-system,PingFang SC,Microsoft YaHei,sans-serif'
def svg(w,h,content):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{content}</svg>'
def write(name,w,h,c): (ASSETS/f'{name}.svg').write_text(svg(w,h,c))
def text(x,y,t,size=18,color='#c6cbe8',weight=500):return f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}">{escape(t)}</text>'
write('ui_home_logo',960,320,text(480,160,'泡泡解谜',88,'#f5fff7',750))
colors={'red':'#e74c3c','blue':'#3498db','green':'#2ecc71','yellow':'#f1c40f','purple':'#9b59b6','cyan':'#1abc9c','orange':'#e67e22','magenta':'#e84393'}
for name,color in colors.items():
 write('ui_bubble_decor_'+name,256,256,f'<defs><radialGradient id="ball" cx="32%" cy="25%" r="78%"><stop stop-color="#ffffff" stop-opacity=".93"/><stop offset=".33" stop-color="{color}"/><stop offset=".8" stop-color="{color}"/><stop offset="1" stop-color="#102746"/></radialGradient></defs><circle cx="128" cy="128" r="120" fill="url(#ball)" stroke="#ffffff" stroke-opacity=".6" stroke-width="5"/><ellipse cx="87" cy="63" rx="35" ry="18" transform="rotate(-35 87 63)" fill="#ffffff" fill-opacity=".86"/><circle cx="52" cy="111" r="8" fill="#ffffff" fill-opacity=".45"/><path d="M175 210 Q204 197 216 166" fill="none" stroke="#ffffff" stroke-opacity=".32" stroke-width="7" stroke-linecap="round"/>')
for name,fill,stroke in [('primary','#2c5a3f','#3d7a55'),('secondary','#22253a','#2a2e45')]:
 write('ui_btn_'+name+'_9s',720,192,f'<rect x="4" y="4" width="712" height="184" rx="48" fill="{fill}" stroke="{stroke}" stroke-width="8"/><path d="M60 12 H660" stroke="#ffffff" stroke-opacity=".12" stroke-width="3"/>')
write('ui_icon_perfect_star',128,128,'<path d="M64 8 L80 43 L118 47 L90 74 L97 113 L64 94 L31 113 L38 74 L10 47 L48 43 Z" fill="#ffd54a" stroke="#fff2b2" stroke-width="4" stroke-linejoin="round"/>')
write('ui_loading_spinner',128,128,'<circle cx="64" cy="64" r="46" fill="none" stroke="#79b39b" stroke-opacity=".3" stroke-width="12"/><path d="M64 18 A46 46 0 0 1 110 64" fill="none" stroke="#b8edc8" stroke-width="12" stroke-linecap="round"/>')
(ASSETS/'ui_home_bg_01.svg').write_text((ROOT/'background.svg').read_text())
raw=(ROOT/'background.svg').read_text();body=raw[raw.index('>')+1:raw.rindex('</svg>')]
def button(y,label,primary=False,disabled=False,scale=1,focus=False):
 fill,stroke,color=('#2c5a3f','#3d7a55','#dff5e5') if primary else ('#22253a','#2a2e45','#c6cbe8')
 rect=f'<rect x="226" y="{y-26}" width="220" height="52" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'+text(336,y,label,18,color,600)
 if focus:rect=f'<rect x="220" y="{y-32}" width="232" height="64" rx="20" fill="none" stroke="#fff9cb" stroke-width="2"/>'+rect
 return f'<g opacity="{.4 if disabled else 1}" transform="translate(336 {y}) scale({scale}) translate(-336 {-y})">{rect}</g>'
def screen(label='开始游戏',perfect=None,gold=False,disabled=False,dev=True):
 logo=base64.b64encode((ASSETS/'ui_home_logo.svg').read_bytes()).decode()
 c=body+f'<image x="96" y="320" width="480" height="160" href="data:image/svg+xml;base64,{logo}"/>'
 for i,(n,color) in enumerate(list(colors.items())[:4]):
  bubble=base64.b64encode((ASSETS/('ui_bubble_decor_'+n+'.svg')).read_bytes()).decode()
  c+=f'<image x="{254+i*44}" y="449" width="32" height="32" href="data:image/svg+xml;base64,{bubble}"/>'
 c+=button(560,label,True,disabled)+button(630,'选择关卡',False,disabled)
 if dev:c+=button(700,'关卡编辑器')
 if perfect:c+=text(336,755,perfect,13,'#ffd54a' if gold else '#8b93b8')
 if disabled:c+=text(336,815,'关卡暂时无法读取，请重试。',13)+button(865,'重试')
 return c
states=[('01-first','首次进入',screen()),('02-continue','已有进度',screen('继续 · 第 12 关','★ 5 / 50 完美')),('03-perfect','全部完美',screen('继续 · 第 50 关','★ 50 / 50 完美',True)),('04-empty','无可用关卡',screen('暂无可用关卡',disabled=True))]
for name,label,c in states:(DESIGN/f'{name}.svg').write_text(svg(672,1080,c))
# IDs are isolated in nested SVG viewports so repeated background definitions are local.
gallery=''
for i,(_,label,c) in enumerate(states):gallery+=f'<svg x="{(i%2)*672}" y="{(i//2)*1120}" width="672" height="1120" viewBox="0 0 672 1120">{c}<rect y="1080" width="672" height="40" fill="#10121e"/>{text(336,1100,label,18)}</svg>'
(DESIGN/'states.svg').write_text(svg(1344,2240,gallery))
c='<rect width="1400" height="520" fill="#10121e"/>'+text(700,30,'统一按钮组件 · 正常 / 悬停 / 按下 / 禁用 / 键盘焦点',20)
for row,primary in enumerate([True,False]):
 for i,(name,scale,disabled,focus) in enumerate([('正常',1,False,False),('悬停 104%',1.04,False,False),('按下 98%',.98,False,False),('禁用 40%',1,True,False),('焦点描边 2px',1,False,True)]):
  x=140+i*280;y=160+row*220;c+=f'<g transform="translate({x-336} {y-560})">{button(560,"开始游戏" if primary else "选择关卡",primary,disabled,scale,focus)}</g>'+text(x,y+60,name,16)
(DESIGN/'components.svg').write_text(svg(1400,520,c))
(DESIGN/'release.svg').write_text(svg(672,1080,screen(dev=False)))
c='<rect width="1480" height="1140" fill="#171d2b"/>'+text(740,30,'FIT 等比居中 · 虚线为逻辑安全区 · 内容不会裁切',22)
for x,w,h,label in [(30,360,640,'16:9 / 720×1280'),(440,360,780,'19.5:9 / 1080×2340'),(850,600,800,'平板 4:3 / 768×1024')]:
 scale=min(w/672,h/1080);left=x+(w-672*scale)/2;top=100+(h-1080*scale)/2
 c+=f'<rect x="{x}" y="100" width="{w}" height="{h}" rx="20" fill="#10121e"/>'+f'<svg x="{left}" y="{top}" width="{672*scale}" height="{1080*scale}" viewBox="0 0 672 1080">{screen()}<rect x="24" y="36" width="624" height="1008" fill="none" stroke="#f9dd87" stroke-dasharray="6 5" stroke-width="2"/></svg>'+text(x+w/2,940,label,18)+text(x+w/2,975,f'比例 {scale:.3f} · 按钮逻辑尺寸 220×52',15)
(DESIGN/'adaptation.svg').write_text(svg(1480,1140,c))
print('Generated vector masters and reference sheets.')
