const {test}=require('node:test'),assert=require('node:assert/strict'),make=require('./helpers/game-harness'),fs=require('node:fs');
const level={id:'PHONE',name:'phone',grid:['..rrrr....bbbb..........'],ammo:[{color:'r',size:'small'},{color:'b',size:'small'}]};
function touch(h,x,y,id=1){return h.pointer(x,y,{wasTouch:true,id})}
function tap(h,bg,extra={}){const p=touch(h,bg.x,bg.y);let blocked=false;bg.events.emit('pointerdown',p,0,0,{stopPropagation(){blocked=true}});bg.events.emit('pointerup',{...p,...extra},0,0,{stopPropagation(){blocked=true}});return blocked}
function modalButton(h,text){const label=h.objects.find(o=>!o.destroyed&&o.type==='text'&&o.text===text);assert.ok(label,`missing ${text}`);const bg=h.objects.find(o=>!o.destroyed&&o.type==='rectangle'&&o.x===label.x&&o.y===label.y);assert.ok(bg);return bg}
test('phone controls remain large after FIT; header targets do not overlap each other or bubble rows',()=>{
 for(const [width,height] of [[320,548],[360,566],[375,633],[390,763],[414,815]]){
  const h=make({mobile:true,width,height,level}),g=h.game,s=h.window.BPGameTouch.scale(g);assert.equal(g.touchHeaderButtons.length,5);
  const xs=g.touchHeaderButtons.map(b=>b.x);for(const b of g.touchHeaderButtons){assert.ok(b.height*s>=48);assert.ok(b.width*s>=48);assert.ok(b.y+b.height/2<195.5)}
  for(let i=1;i<xs.length;i++)assert.ok(xs[i]-xs[i-1]>g.touchHeaderButtons[i].width);
 }
});
test('phone rail follows relative drag without jumping or firing when finger touches away from cannon',()=>{
 const h=make({mobile:true,level}),g=h.game;h.down(touch(h,500,1000));assert.equal(g.shooterX,336);h.move(touch(h,540,1000));assert.equal(g.shooterX,376);h.up(touch(h,540,1000));assert.equal(g.snapshots.length,0);assert.equal(g.state,'aim');
});
test('thumb aim cancels in rail/header and can re-enter valid field before releasing',()=>{
 const h=make({mobile:true,level}),g=h.game;h.down(touch(h,220,820));h.move(touch(h,220,1000));assert.equal(g.touchAimCancelled,true);assert.equal(g.touchCancelGlyph.visible,true);h.up(touch(h,220,1000));assert.equal(g.snapshots.length,0);assert.equal(g.touchCancelGlyph.visible,false);
 h.down(touch(h,220,820));h.move(touch(h,220,150));assert.equal(g.touchAimCancelled,true);h.move(touch(h,260,820));assert.equal(g.touchAimCancelled,false);h.up(touch(h,260,820));assert.equal(g.state,'fly');assert.equal(g.snapshots.length,1);
 const t=make({mobile:true,level});t.down(touch(t,250,180));t.up(touch(t,250,180));assert.equal(t.game.snapshots.length,0);
});
test('phone result needs explicit button tap; touching background cannot retry, skip or fire',()=>{
 const h=make({mobile:true,level:{...level,ammo:[{color:'g',size:'small'}]}}),g=h.game;g.fire();h.settle();assert.equal(g.state,'end');const scrim=h.objects.find(o=>!o.destroyed&&o.type==='rectangle'&&o.args[2]===672&&o.args[3]===1080);
 for(let i=0;i<5;i++)tap(h,scrim);assert.deepEqual(h.transitions,[]);const retry=modalButton(h,'重新挑战');assert.ok(tap(h,retry));assert.deepEqual(h.transitions,['restart']);tap(h,retry);assert.deepEqual(h.transitions,['restart']);
});
test('phone result undo restores board without modal or accidental shot',()=>{
 const h=make({mobile:true,level:{...level,ammo:[{color:'g',size:'small'}]}}),g=h.game;g.fire();h.settle();tap(h,modalButton(h,'撤销上一发（剩 3 次）'));assert.equal(g.state,'aim');assert.equal(g.level.pos,0);assert.equal(g.shotsFired,0);assert.equal(g.undoLeft,2);assert.equal(g.resultObjects.length,0);assert.deepEqual(h.transitions,[]);
});
test('restart confirms, cancellation preserves shot/timers; confirmation cannot leak a pending gesture',()=>{
 const h=make({mobile:true,level}),g=h.game;g.testFireAt(3,0);h.step(100);const travel=g.projTravel;
 tap(h,g.touchHeaderButtons[4].bg);assert.ok(g.touchDialog);assert.equal(g.time.timeScale,0);h.step(5000);assert.equal(g.projTravel,travel);assert.equal(g.level.pos,0);tap(h,modalButton(h,'取消'));assert.equal(g.touchDialog,null);assert.equal(g.time.timeScale,1);h.settle();assert.equal(g.level.pos,1);
 tap(h,g.touchHeaderButtons[4].bg);const snapshots=g.snapshots.length;g.input.keyboard.emit('keydown-SPACE',{repeat:false});assert.equal(g.snapshots.length,snapshots);tap(h,modalButton(h,'重新开始'));assert.deepEqual(h.transitions,['restart']);assert.equal(g.touchDialog,null);assert.equal(g.time.timeScale,1);
});
test('header button accepts natural jitter, rejects drag/outside release and lost focus/background',()=>{
 const h=make({mobile:true,level}),g=h.game,b=g.touchHeaderButtons[4].bg,p=touch(h,b.x,b.y);
 b.events.emit('pointerdown',p,0,0,{stopPropagation(){}});h.move({...p,x:p.x+40});b.events.emit('pointerup',{...p,x:p.x+40},0,0,{stopPropagation(){}});assert.equal(g.touchDialog,null);
 b.events.emit('pointerdown',p,0,0,{stopPropagation(){}});h.window.document.hidden=true;h.window.document.emit('visibilitychange');b.events.emit('pointerup',p,0,0,{stopPropagation(){}});assert.equal(g.touchDialog,null);h.window.document.hidden=false;
 assert.ok(tap(h,b,{x:p.x+8}));assert.ok(g.touchDialog);
});
test('orientation/app interruption cancels firing; 20 mobile restarts keep listener counts stable',()=>{
 const h=make({mobile:true,level}),g=h.game;
 for(const event of ['orientationchange','visibilitychange']){h.down(touch(h,220,820));if(event==='visibilitychange'){h.window.document.hidden=true;h.window.document.emit(event);h.window.document.hidden=false}else h.window.emit(event);h.up(touch(h,220,820));assert.equal(g.snapshots.length,0)}
 const count=()=>['blur','pointercancel','touchcancel','orientationchange'].map(k=>h.window.listenerCount(k));const initial=count();
 for(let i=0;i<20;i++){h.restart();assert.equal(g.touchHeaderButtons.length,5);assert.deepEqual(count(),initial)}g.events.emit('shutdown');assert.deepEqual(count(),[0,0,0,0]);assert.equal(h.window.document.listenerCount('visibilitychange'),0);
});
test('mobile CSS uses safe-area parent and expanded homepage targets; editor launcher cannot cover game menus',()=>{
 const css=fs.readFileSync(require('node:path').join(__dirname,'../game/mobile.css'),'utf8');assert.match(css,/safe-area-inset-top/);assert.match(css,/@media\(pointer:coarse\)/);assert.match(css,/#bb-launch\{display:none!important\}/);assert.match(css,/width:352px;height:104px/);
});
test('phone level list has two large columns; scrolling/jitter/low-card taps use screen coordinates correctly',()=>{
 const h=make({mobile:true,store:{bp_progress:'49'}}),select=new h.math.Select(),before=new Set(h.objects);select.create();
 const cards=h.objects.filter(o=>!before.has(o)&&!o.destroyed&&o.type==='rectangle'&&o.args[2]===288);assert.equal(cards.length,50);assert.equal(new Set(cards.map(b=>b.x)).size,2);assert.ok(cards.every(b=>b.args[3]*h.window.BPGameTouch.scale(select)>=48));
 const card=cards[0],p=touch(h,card.x,card.y);card.events.emit('pointerdown',p,0,0,{stopPropagation(){}});select.input.emit('pointerdown',p);
 select.input.emit('pointermove',{...p,y:p.y-60});card.events.emit('pointerup',{...p,y:p.y-60},0,0,{stopPropagation(){}});select.input.emit('pointerup',{...p,y:p.y-60});assert.deepEqual(h.transitions,[]);assert.equal(select.cameras.main.scrollY,60);
 const visible=cards[6],q=touch(h,visible.x,visible.y-60+55);visible.events.emit('pointerdown',q,0,0,{stopPropagation(){}});visible.events.emit('pointerup',{...q,x:q.x+8},0,0,{stopPropagation(){}});assert.deepEqual(h.transitions,['game']);
 select.events.emit('shutdown');assert.ok(h.window.listenerCount('blur')<=2);assert.ok(h.window.document.listenerCount('visibilitychange')<=2);
});
