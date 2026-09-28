const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const create=require('../home/core.js'),core=create({colors:{r:1,b:2,g:3,y:4,p:5,c:6,o:7,m:8},capacity:{small:4,medium:8,large:12}});
const blankCore=create({colors:{r:1,b:2,g:3,y:4,p:5,c:6,o:7,m:8},capacity:{small:4,medium:8,large:12},blankLevels:true});
const levels=Array.from({length:20},(_,i)=>({id:i+1,grid:['.rrrr.'],ammo:[{color:'r',size:'small'}]}));
const store=(initial={})=>{const data=new Map(Object.entries(initial));return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
test('Home AC01/03/05/06/11/12: first, recent, perfect, corrupt and empty states',()=>{
 const derive=x=>core.derive({levels,storage:store(x)});
 let s=derive();assert.equal(s.state,'S1');assert.equal(s.primaryLabel,'开始游戏');assert.equal(s.perfectVisible,false);
 s=derive({bp_progress:'15',bp_recent_level:'11',bp_perfect:'[0,1,2,3,4,4,99]'});assert.equal(s.state,'S2');assert.equal(s.primaryLabel,'继续 · 第 12 关');assert.equal(s.perfectCount,5);
 s=derive({bp_perfect:JSON.stringify(levels.map((_,i)=>i)),bp_recent_level:'4'});assert.equal(s.state,'S3');assert.equal(s.continueLevelIndex,19);
 for(const bad of ['bad','-1','2.5','"4"','{}']){s=derive({bp_progress:bad,bp_recent_level:'10',bp_perfect:'[0]'});assert.equal(s.state,'S5');assert.equal(s.continueLevelIndex,0);assert.equal(s.perfectCount,0);assert.equal(s.errors[0].recoverable,true)}
 s=derive({bp_recent_level:'999',bp_perfect:'[]'});assert.equal(s.continueLevelIndex,19);assert.equal(s.perfectVisible,false);
 s=core.derive({levels:[],storage:store()});assert.equal(s.state,'S4');assert.equal(s.enabled,false);assert.equal(s.errors[0].type,'levels');
 s=core.derive({levels:()=>{throw Error('loading')},storage:store()});assert.equal(s.errors[0].message,'loading');
 assert.equal(core.filterLevels([...levels,{grid:['r'],ammo:[]}]).length,20);
});
test('Home gate locks once, releases on success and two-second timeout',()=>{
 let callback,ms,canceled=0;const gate=core.createGate({delay:(fn,t)=>{callback=fn;ms=t;return 1},cancel:()=>canceled++});assert.ok(gate.begin());for(let i=0;i<10;i++)assert.equal(gate.begin(),false);assert.equal(ms,2000);callback();assert.equal(gate.locked,false);assert.ok(gate.begin());gate.release();assert.ok(canceled);gate.dispose();
});
test('Home accepts hidden-bubble uppercase encoding as playable level data',()=>{
 assert.equal(core.isPlayable({grid:['.Rrrr.'],ammo:[{color:'r',size:'small'}]}),true);
});
test('Home AC17/18: all target viewports retain portrait FIT geometry',()=>{
 for(const [w,h] of [[720,1280],[1080,2340],[768,1024],[1024,768]]){const f=core.fit(w,h);assert.ok(f.scale*672<=w+.001);assert.ok(f.scale*1080<=h+.001);assert.equal(f.x,w/2);assert.equal(f.y,h/2)}
});
function harness({dev=true,initial={},initialLevels=levels,blank=false}={}){
 const listeners=new Map(),nodes=new Map(),events=[];let available=initialLevels;
 class Target {constructor(){this.handlers=new Map();this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};this.style={};this.hidden=false;this.children=[];this.disabled=false}
 addEventListener(k,f){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(f)}removeEventListener(k,f){this.handlers.get(k)?.delete(f)}
 dispatch(k,event={}){for(const fn of [...(this.handlers.get(k)||[])])fn(event)}setAttribute(k,v){this[k]=v}append(b){this.children.push(b);nodes.set(b.id,b)}click(){if(!this.disabled)this.dispatch('click')}
 }
 for(const id of fs.readFileSync(path.join(__dirname,'../home/shell.html'),'utf8').matchAll(/id="([^"]+)"/g))nodes.set(id[1],new Target());nodes.set('bb-launch',new Target());
 const document=new Target();Object.assign(document,{getElementById:id=>nodes.get(id),createElement:()=>new Target(),querySelector:()=>nodes.get('canvas')});nodes.set('canvas',new Target());
 const motion=new Target();motion.matches=false;const coarse=new Target();coarse.matches=false;
 const window=new Target();Object.assign(window,{innerWidth:720,innerHeight:1280,dispatchEvent:e=>{events.push(e.detail);window.dispatch(e.type,e)}});
 const storage=store(initial),timers=new Map();let nextTimer=0,starts=[],failStart=false;
 const owner={registry:{set:(k,v)=>owner.index=v},scene:{start:key=>{if(failStart)throw Error('scene unavailable');starts.push(key)}}};
 const en={input:{keyboard:{enabled:true}},scene:{getScene:()=>owner}};window.__bp=en;let editorOpens=0;window.BPStudio={open:()=>{editorOpens++;window.BPHome.setRoute('editor');window.BPHome.pause(owner)}};
 const sandbox={document,window,BH:blank?blankCore:core,BB_BUILD:{isDevBuild:dev,blankLevels:blank,version:'test'},en,gt:()=>available,localStorage:storage,location:{hash:''},matchMedia:q=>q.includes('reduced')?motion:coarse,CustomEvent:class{constructor(type,opts={}){this.type=type;this.detail=opts.detail}},console:{debug(){}},setTimeout:(f,ms)=>{timers.set(++nextTimer,{f,ms});return nextTimer},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../home/home.js'),'utf8'),sandbox);
 return {nodes,window,document,owner,en,storage,motion,coarse,events,starts,timers,get editorOpens(){return editorOpens},home:window.BPHome,setLevels:l=>available=l,setFail:v=>failStart=v,tick:async()=>{for(let i=0;i<4;i++)await Promise.resolve()},countListeners:()=>[window,document,motion,coarse].reduce((n,t)=>n+[...t.handlers.values()].reduce((v,s)=>v+s.size,0),0)};
}
test('Home AC02/04/07/09/10: actual DOM handlers route once, preserve target and editor bridge',async()=>{
 const h=harness({initial:{bp_recent_level:'11'}});h.home.mount(h.owner);assert.equal(h.nodes.get('bh-primary').disabled,true);await h.tick();assert.equal(h.nodes.get('bh-primary').textContent,'继续 · 第 12 关');
 for(let i=0;i<10;i++)h.nodes.get('bh-primary').click();assert.deepEqual(h.starts,['game']);assert.equal(h.owner.index,11);assert.equal(h.nodes.get('bb-home').hidden,true);assert.equal(h.en.input.keyboard.enabled,true);
 h.home.mount(h.owner);await h.tick();h.nodes.get('bh-levels').click();assert.deepEqual(h.starts,['game','levelSelect']);
 h.home.mount(h.owner);await h.tick();h.nodes.get('bh-editor').click();assert.equal(h.editorOpens,1);assert.equal(h.nodes.get('bb-home').hidden,true);
 h.home.setRoute('game');h.home.resume(h.owner);await h.tick();assert.equal(h.nodes.get('bb-home').hidden,false);
 const event=h.events.find(e=>e.event==='home_view');assert.equal(event.params.level_count,20);assert.equal(event.params.build_type,'development');
});
test('Home AC08/13/16/19: release has no focusable editor; return refresh and 20 mounts clean listeners',async()=>{
 const h=harness({dev:false});assert.equal(h.nodes.has('bh-editor'),false);
 for(let i=0;i<20;i++){h.home.mount(h.owner);await h.tick();assert.equal(h.countListeners(),8);h.home.unmount(h.owner);assert.equal(h.countListeners(),0);assert.equal(h.timers.size,0)}
 h.home.mount(h.owner);await h.tick();h.storage.setItem('bp_recent_level','11');h.storage.setItem('bp_perfect','[0,1,2,3,4]');h.home.progressChanged();assert.equal(h.nodes.get('bh-primary').textContent,'继续 · 第 12 关');assert.equal(h.nodes.get('bh-perfect').textContent,'★ 5 / 20 完美');
 h.motion.matches=true;h.motion.dispatch('change');assert.ok(h.nodes.get('bb-home').classList.contains('bh-reduced'));
});
test('Home AC11/12/20: empty data retries; damaged progress starts; failed transition recovers',async()=>{
 const h=harness({initialLevels:[]});h.home.mount(h.owner);await h.tick();assert.equal(h.nodes.get('bh-primary').textContent,'暂无可用关卡');assert.equal(h.nodes.get('bh-primary').tabIndex,-1);assert.equal(h.nodes.get('bh-error').hidden,false);
 h.setLevels(levels);h.nodes.get('bh-retry').click();assert.equal(h.nodes.get('bh-primary').disabled,false);assert.equal(h.nodes.get('bh-error').hidden,true);
 h.setFail(true);h.nodes.get('bh-primary').click();await h.tick();assert.equal(h.nodes.get('bb-home').hidden,false);assert.equal(h.nodes.get('bh-primary').disabled,false);
 h.setFail(false);h.storage.setItem('bp_progress','bad');h.home.refresh();assert.equal(h.nodes.get('bh-primary').textContent,'开始游戏');h.nodes.get('bh-primary').click();assert.equal(h.owner.index,0);assert.equal(h.storage.getItem('bp_progress'),'0');assert.deepEqual(h.starts,['game']);
});
test('Blank edition opens the editor from an empty home and enables play after a level exists',async()=>{
 const h=harness({blank:true,initialLevels:[]});h.home.mount(h.owner);await h.tick();
 assert.equal(h.nodes.get('bh-primary').textContent,'创建／编辑关卡');assert.equal(h.nodes.get('bh-primary').disabled,false);
 assert.equal(h.nodes.get('bh-levels').disabled,true);assert.equal(h.nodes.get('bh-error').hidden,true);
 h.nodes.get('bh-primary').click();assert.equal(h.editorOpens,1);assert.deepEqual(h.starts,[]);
 h.setLevels(levels.slice(0,1));h.home.setRoute('game');h.home.resume(h.owner);await h.tick();
 assert.equal(h.nodes.get('bh-primary').textContent,'开始游戏');h.nodes.get('bh-primary').click();assert.deepEqual(h.starts,['game']);
});
test('Home native button semantics and scoped states retain names, focus order, and full bounds',()=>{
 const shell=fs.readFileSync(path.join(__dirname,'../home/shell.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../home/home.css'),'utf8');assert.match(shell,/<button id="bh-primary"/);assert.ok(shell.indexOf('id="bh-primary"')<shell.indexOf('id="bh-levels"'));assert.match(css,/:focus-visible/);assert.match(css,/width:220px;height:52px/);assert.match(css,/pointer-events:auto/);assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Home real title Scene removes its pause/resume handlers across 20 creates',()=>{
 const {EventEmitter}=require('node:events'),html=fs.readFileSync(path.join(__dirname,'../Bubble Sort Staggered.html'),'utf8');let mounts=0,unmounts=0;
 class Scene{constructor(){this.events=new EventEmitter();this.cameras={main:{setBackgroundColor(){}}}}}
 const box={Y:{Scene},xt(){},window:{BPHome:{mount(){mounts++},unmount(){unmounts++},pause(){},resume(){}}}};
 const start=html.indexOf('var $t=class extends Y.Scene'),end=html.indexOf(',en=new Y.Game(',start);vm.runInNewContext(html.slice(start,end)+';this.Title=$t;',box);const title=new box.Title();
 for(let i=0;i<20;i++){title.create();assert.equal(title.events.listenerCount('pause'),1);assert.equal(title.events.listenerCount('resume'),1);title.events.emit('shutdown');assert.equal(title.events.listenerCount('pause'),0);assert.equal(title.events.listenerCount('resume'),0)}assert.equal(mounts,20);assert.equal(unmounts,20);
});
