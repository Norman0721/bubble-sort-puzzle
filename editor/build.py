from pathlib import Path
import re, argparse, base64
parser=argparse.ArgumentParser()
parser.add_argument("--release",action="store_true",help="Build the player version without editor UI")
parser.add_argument("--blank-levels",action="store_true",help="Build a fresh level library with isolated browser storage")
parser.add_argument("--output",type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
# The pre-editor baseline is retained privately in the workspace for reproducible bundling.
s=(root/'editor/game-baseline.html').read_text()
# Remove the persistent capacity/aim legend from every playable level.
s,count=re.subn(r',this\.add\.text\(8,76,`[^`]*`,\{fontSize:`14px`,lineSpacing:3,color:`#8b93b8`\}\)', '', s)
assert count==1, 'Expected exactly one level instruction legend'
# Keep the level number, and omit the level name and ammo text panel.
s,count=re.subn(r'this\.add\.text\(8,6,this\.isCustom\?`[^`]*`:`[^`]*`,', lambda _: 'this.add.text(8,6,this.isCustom?`试玩`:`第 ${t.id} 关`,', s)
assert count==1, 'Expected exactly one gameplay level heading'
s,count=re.subn(r',this\.queueText=this\.add\.text\(8,36,``,\{fontSize:`16px`,color:`#c6cbe8`\}\)', '', s)
assert count==1, 'Expected exactly one ammo text panel'
s,count=re.subn(r',this\.queueText\.setText\([\s\S]*?\)(?=\}drawAim\(\))', '', s)
assert count==1, 'Expected exactly one ammo text update'
s=s.replace(';queueText;', ';')
# Allow shallow-angle reflections to reach the ceiling in narrow maps.
assert s.count('function he(e,t,n,r,i,a,o,s=6)')==1
s=s.replace('function he(e,t,n,r,i,a,o,s=6)', 'function he(e,t,n,r,i,a,o,s=128)')
s=s.replace('!e&&this.snapshots.length>0&&this.snapshots.length>=2', '!e&&this.undoLeft>0&&this.snapshots.length>0')
if args.blank_levels:
 start_levels=s.index('var _e={id:1,')
 end_levels=s.index('function ht()',start_levels)
 s=s[:start_levels]+'var mt=[];var pt=`bp_level_library`;'+s[end_levels:]
core=(root/'editor/core.js').read_text()
init='var BB=createBubbleEditorCore({pitch:HEX_PITCH,rowStep:HEX_ROW,center:se,colors:Q,labels:COLOR_LABELS,capacity:Object.fromEntries(Object.entries(oe).map(([k,v])=>[k,v.cap])),visibleRows:VISIBLE_ROWS});'
s=s.replace('const HEX_PITCH=27,HEX_ROW=HEX_PITCH*Math.sqrt(3)/2;', 'const HEX_PITCH=27,HEX_ROW=HEX_PITCH*Math.sqrt(3)/2,VISIBLE_ROWS=30;')
old='this.grid=re.fromRows(t.grid,30),this.grid.offsetX=(672-boardWidth(this.grid))/2;let r=this.grid.lastNonEmptyRow();r>=30?this.grid.viewTop=Math.min(r-30+1,this.grid.rows-this.grid.visRows):this.grid.viewTop=0'
new='this.grid=re.fromRows(t.grid,VISIBLE_ROWS),this.grid.offsetX=(672-boardWidth(this.grid))/2;this.grid.viewTop=BB.windowFor(t.grid).viewTop'
assert s.count(old)==1
s=s.replace(old,new)
s=s.replace('false&&i(X/2+160,`关卡编辑器`,()=>{})','i(X/2+160,`关卡编辑器`,()=>window.BPStudio.open())')
s=s.replace('X/2+145,`★ ${a}', 'X/2+215,`★ ${a}')
s=s.replace('Qt(`bp_custom_level`),location.href=`/editor.html`','window.BPStudio.returnFromTrial()')
s=s.replace('s(562,`关卡`,()=>this.scene.start(`levelSelect`)),s(486,`主页`,()=>this.scene.start(`title`))','s(562,this.isCustom?`返回`:`关卡`,()=>this.isCustom?window.BPStudio.returnFromTrial():this.scene.start(`levelSelect`)),s(486,this.isCustom?`编辑器`:`主页`,()=>this.isCustom?window.BPStudio.returnFromTrial():this.scene.start(`title`))')
homecore=(root/'home/core.js').read_text()
config='var BB_BUILD={isDevBuild:'+('false' if args.release else 'true')+',blankLevels:'+('true' if args.blank_levels else 'false')+',version:"1.10-level-info"};var BH=createBubbleHomeCore({colors:Q,capacity:Object.fromEntries(Object.entries(oe).map(([k,v])=>[k,v.cap])),blankLevels:BB_BUILD.blankLevels});'
start=s.index('var $t=class extends Y.Scene');end=s.index(',en=new Y.Game(',start)
title='var $t=class extends Y.Scene{constructor(){super(`title`)}create(){xt();this.cameras.main.setBackgroundColor(1053214);window.BPHome.mount(this);const pause=()=>window.BPHome.pause(this),resume=()=>window.BPHome.resume(this);this.events.on(`pause`,pause);this.events.on(`resume`,resume);this.events.once(`shutdown`,()=>{this.events.off(`pause`,pause);this.events.off(`resume`,resume);window.BPHome.unmount(this)})}}'
repairs=(root/'game/mobile.js').read_text()+'\n'+(root/'game/repairs.js').read_text()+'\n'+(root/'game/hidden.js').read_text()+'\n'+(root/'game/color-pairs.js').read_text()
s=s[:start]+core+'\n'+init+'\n'+homecore+'\n'+config+'\n'+repairs+'\n'+title+s[end:]
s=s.replace('function gt(){return[...mt,...ht()]}',
  'function gt(){try{return BH.filterLevels(Object.values(new BB.Repository(BP_STORAGE).readAll()))}catch(error){console.warn("无法读取自建关卡",error);return[]}}' if args.blank_levels else 'function gt(){return BH.filterLevels([...mt,...ht()])}')
s=s.replace('n=Zt(`bp_custom_level`)','n=BB_BUILD.isDevBuild?Zt(`bp_custom_level`):null')
s=s.replace('ce.validate(t).forEach', 'this.isCustom||window.BPHome?.rememberLevel(this.levelIndex);ce.validate(t).forEach')
s=s.replace('this.registry.set(`levelIndex`,0),this.scene.start(`game`)','this.scene.start(`title`)')
s=s.replace('function Wt(e){try{e>Ut()&&localStorage.setItem(Vt,String(e))}catch{}}','function Wt(e){try{e>Ut()&&localStorage.setItem(Vt,String(e))}catch{}window.BPHome?.progressChanged()}')
s=s.replace('function Kt(e){try{let t=Gt();t.includes(e)||(t.push(e),localStorage.setItem(Ht,JSON.stringify(t)))}catch{}}','function Kt(e){try{let t=Gt();t.includes(e)||(t.push(e),localStorage.setItem(Ht,JSON.stringify(t)))}catch{}window.BPHome?.progressChanged()}')
if args.release:
 s=s.replace('t=(()=>{try{return localStorage.getItem(`bp_custom_level`)}catch{return null}})()', 't=null')
s=s.replace('e.setAttribute(`tabindex`,`0`)', 'e.setAttribute(`tabindex`,window.BPHome?.visible?`-1`:`0`)')
s=s.replace('height:X,expandParent:!0},scene:', 'height:X,expandParent:!1},scene:')
# Editor UI is omitted entirely from the player build.

background=base64.b64encode((root/'home/assets/ui_home_bg_01.png').read_bytes()).decode()
homecss=(root/'home/home.css').read_text()+'\n#bb-home{--bh-background:url("data:image/png;base64,'+background+'")}\n'
logo=base64.b64encode((root/'home/assets/ui_home_logo.png').read_bytes()).decode()
homecss+='#bb-home .bh-logo{top:320px;left:96px;width:480px;height:160px;line-height:160px;color:transparent;text-shadow:none;background:url("data:image/png;base64,'+logo+'") center/480px 160px no-repeat}#bb-home .bh-logo::before{display:none}\n'
for color in ['red','blue','green','yellow']:
 data=base64.b64encode((root/('home/assets/ui_bubble_decor_'+color+'.png')).read_bytes()).decode()
 homecss+='#bb-home .bh-bubble.'+color+'{background:url("data:image/png;base64,'+data+'") center/32px 32px no-repeat;border:0;box-shadow:0 4px 7px #0003}\n'
homecss+='#bb-home .bh-bubble::before,#bb-home .bh-bubble::after{display:none}\n'
styles=homecss+('' if args.release else (root/'editor/editor.css').read_text())+'\n'+(root/'game/mobile.css').read_text()
s=s.replace('</style>',styles+'\n</style>',1)
shell=(root/'home/shell.html').read_text()+('' if args.release else (root/'editor/shell.html').read_text())
s=s.replace('    <!-- 单文件版本未包含关卡编辑器，避免显示失效入口。 -->','    '+shell)
scripts=('' if args.release else '<script>\n'+(root/'editor/studio.js').read_text()+'\n</script>\n')+'<script>\n'+(root/'home/home.js').read_text()+'\n</script>\n'
s=s.replace('  </body>',scripts+'  </body>')
if args.blank_levels:
  shim='''/* BP blank storage shim */var BP_STORAGE=window.BP_STORAGE=(function(){const native=window.localStorage,prefix="bp_blank_v18_";const names=()=>{const result=[];for(let i=0;i<native.length;i++){const key=native.key(i);if(key&&key.startsWith(prefix))result.push(key.slice(prefix.length))}return result};return{getItem:key=>native.getItem(prefix+key),setItem:(key,value)=>native.setItem(prefix+key,value),removeItem:key=>native.removeItem(prefix+key),key:index=>names()[index]??null,get length(){return names().length}}})();'''
  def isolate(match):
    script=match.group(1)
    if 'var Y=r.Ay,re=' in script:
      before,after=script.split('var Y=r.Ay,re=',1)
      after=re.sub(r'\blocalStorage\b','BP_STORAGE',after)
      return '<script>'+before+shim+'var Y=r.Ay,re='+after+'</script>'
    return '<script>'+re.sub(r'\blocalStorage\b','BP_STORAGE',script)+'</script>'
  s=re.sub(r'<script>([\s\S]*?)</script>',isolate,s)
# Prevent Phaser from capturing editor tool keys while its game scene is paused.
# Its keyboard manager is disabled by the studio route, and resumed on game routes.
out=args.output or root/'Bubble Sort Staggered.html'
out.write_text(s)
for i,script in enumerate(re.findall(r'<script>([\s\S]*?)</script>',s)):
 (Path('/tmp')/f'bubble-editor-script-{i}.js').write_text(script)
print(f'Built {out} ({len(s):,} characters)')
