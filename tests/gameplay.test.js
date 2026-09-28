const {test}=require('node:test'),assert=require('node:assert/strict'),make=require('./helpers/game-harness');
const level=(grid=['..rrrr....bbbb..........'],ammo=[{color:'r',size:'small'},{color:'b',size:'small'}])=>({schemaVersion:1,id:'PLAY',name:'Gameplay audit',grid,ammo});
function liveOverlay(h){return h.objects.find(o=>!o.destroyed&&o.type==='rectangle'&&o.args[2]===672&&o.args[3]===1080)}
function shootAt(h,c,r=0){h.game.testFireAt(c,r);h.settle()}
test('mouse click/drag releases once along final pointer; menu/right-click cannot waste ammo',()=>{
 const h=make({level:level()}),g=h.game,p=h.pointer(90,200);h.down(p);assert.equal(g.state,'aim');assert.equal(g.snapshots.length,0);h.move(h.pointer(170,400));h.up(h.pointer(220,400));assert.equal(g.state,'fly');assert.ok(Math.abs(g.aimAngle-Math.atan2(400-1010,220-336))<1e-12);assert.equal(g.snapshots.length,1);h.up(p);assert.equal(g.snapshots.length,1);
 const t=make({level:level()});for(const p of [t.pointer(200,40),t.pointer(200,300,{button:2})]){t.down(p);t.up(p)}assert.equal(t.game.snapshots.length,0);
});
test('bottom dragging moves only while held, never shoots or changes gesture when crossing regions',()=>{
 const h=make({level:level()}),g=h.game;h.move(h.pointer(500,1000,{isDown:false}));assert.equal(g.shooterX,336);h.down(h.pointer(500,1000));h.move(h.pointer(540,200));h.up(h.pointer(540,200));assert.equal(g.shooterX,540);assert.equal(g.state,'aim');assert.equal(g.snapshots.length,0);
});
test('touch gesture belongs to one pointer and cancellation cannot accidentally fire',()=>{
 const h=make({level:level()}),g=h.game,p=h.pointer(200,300,{id:1,wasTouch:true});h.down(p);h.down(h.pointer(600,1000,{id:2,wasTouch:true}));h.up(h.pointer(600,1000,{id:2,wasTouch:true}));assert.equal(g.shooterX,336);assert.equal(g.state,'aim');assert.equal(g.touchAiming,true);h.up(p);assert.equal(g.state,'fly');assert.equal(g.snapshots.length,1);
 for(const event of ['blur','pointercancel','touchcancel']){const t=make({level:level()});t.down(p);t.window.emit(event,{});t.up(p);assert.equal(t.game.snapshots.length,0)}
 const t=make({level:level()});t.down(p);t.game.input.emit('pointerupoutside',p);t.up(p);assert.equal(t.game.snapshots.length,0);
});
test('narrow next level resets cannon/aim/gesture inside its rail; halo/badge follow moving cannon',()=>{
 const h=make({index:0});h.game.setShooterX(620);h.down(h.pointer(200,300,{id:1,wasTouch:true}));h.restart(3);const g=h.game;assert.equal(g.shooterX,336);assert.equal(g.aimAngle,-Math.PI/2);assert.equal(g.touchAiming,false);assert.equal(g.aimGesture,null);assert.ok(g.shooterX>=g.grid.offsetX+40&&g.shooterX<=g.grid.offsetX+18.5*27-40);
 const t=make({level:level(['..rrrr..................'],[{color:'r',size:'small',type:'bounce'}])});t.game.setShooterX(500);assert.equal(t.game.currentAmmoRing.x,500);assert.equal(t.game.bounceBadge.x,520);t.game.fire();t.step(20);assert.equal(t.game.projectile.getData('halo').x,t.game.projectile.x);assert.equal(t.game.projectile.getData('halo').y,t.game.projectile.y);
});
test('resolve watchdog plus late callbacks consume exactly one shot; old callback cannot settle a new shot',()=>{
 const h=make({level:level()}),g=h.game;g.testFireAt(3,0);h.step(900,{runTimers:false});assert.equal(g.state,'resolve');h.step(3000,{runTimers:false});assert.equal(g.level.pos,1);assert.equal(g.state,'aim');h.drain();assert.equal(g.level.pos,1);assert.equal(g.shotsFired,1);assert.equal(g.state,'aim');assert.equal(g.grid.countByColor().b,4);
 g.testFireAt(11,0);h.settle();assert.equal(g.level.pos,2);assert.equal(g.shotsFired,2);assert.equal(g.state,'end');assert.equal(g.grid.isEmpty(),true);g.afterShot();assert.equal(g.level.pos,2);
 const t=make({level:level()});t.game.testFireAt(3,0);t.step(900,{runTimers:false});t.step(3000,{runTimers:false});t.game.testFireAt(11,0);t.step(900,{runTimers:false});assert.equal(t.game.state,'resolve');t.drain();assert.equal(t.game.level.pos,1);t.settle();assert.equal(t.game.level.pos,2);
});
test('first-shot failure can undo; result panel is destroyed and its click does not fire restored ammo',()=>{
 const h=make({level:level(['..rrrr..................'],[{color:'b',size:'small'}])}),g=h.game;g.fire();h.settle();assert.equal(g.state,'end');const recover=h.objects.find(o=>!o.destroyed&&o.type==='text'&&o.text?.startsWith('撤销最后一发'));assert.ok(recover);assert.ok(h.clickObject(recover));assert.equal(g.state,'aim');assert.equal(g.level.pos,0);assert.equal(g.shotsFired,0);assert.equal(g.undoLeft,2);assert.equal(liveOverlay(h),undefined);assert.deepEqual(h.transitions,[]);assert.equal(g.snapshots.length,0);
});
test('undo restores score, combo, aim and cannon; cannot undo in flight or exceed three retries',()=>{
 const h=make({level:level(['..rrrr....rrrr..........'],Array(5).fill({color:'r',size:'small'}))}),g=h.game;g.combo=1;g.bestCombo=3;g.setShooterX(250);g.aimAngle=g.aimTargetAngle=-1.2;shootAt(h,3);assert.equal(g.shotsFired,1);g.setShooterX(500);g.undoShot();assert.equal(g.combo,1);assert.equal(g.bestCombo,3);assert.equal(g.shooterX,250);assert.equal(g.aimAngle,-1.2);assert.equal(g.shotsFired,0);assert.equal(g.level.pos,0);assert.equal(g.wasteTotal,0);
 for(let i=0;i<2;i++){shootAt(h,3);g.undoShot()}assert.equal(g.undoLeft,0);shootAt(h,3);const pos=g.level.pos;g.undoShot();assert.equal(g.level.pos,pos);
 const t=make({level:level()});t.game.fire();t.game.undoShot();assert.equal(t.game.undoLeft,3);assert.equal(t.game.state,'fly');
});
test('only actual exhaustion can fail; clearing the board with final ammo wins; no-input frames do not die',()=>{
 const h=make({level:level(['..rrrr..................'],[{color:'r',size:'small'}])});for(let i=0;i<2000;i++)h.step();assert.equal(h.game.state,'aim');assert.equal(h.game.level.pos,0);shootAt(h,3);assert.equal(h.game.state,'end');assert.equal(h.game.grid.isEmpty(),true);assert.ok(h.objects.some(o=>o.type==='text'&&o.args[2]==='关卡完成'));
 const t=make({level:level(['..rrrr..................'],[{color:'b',size:'small'}])});t.game.fire();t.settle();assert.equal(t.game.level.pos,1);assert.ok(t.objects.some(o=>o.type==='text'&&o.args[2]==='弹药耗尽'));
});
test('result primary action and Enter/Space repeat cannot create duplicate restarts/shots',()=>{
 const h=make();shootAt(h,11);const overlay=liveOverlay(h);for(let i=0;i<10;i++)h.clickObject(overlay);assert.deepEqual(h.transitions,['restart']);
 const t=make({level:level()});t.game.input.keyboard.emit('keydown-SPACE',{repeat:true});assert.equal(t.game.snapshots.length,0);t.game.input.keyboard.emit('keydown-SPACE',{repeat:false});assert.equal(t.game.snapshots.length,1);t.settle();t.game.input.keyboard.emit('keydown-SPACE',{repeat:true});assert.equal(t.game.snapshots.length,1);
});
test('20 restarts keep exactly one pointer/key handler and remove global cancellation listeners',()=>{
 const h=make({level:level(),debug:true});for(let i=0;i<20;i++){h.restart();for(const name of ['pointerdown','pointerup','pointermove'])assert.equal(h.game.input.listenerCount(name),1);for(const name of ['keydown-LEFT','keydown-RIGHT','keydown-SPACE'])assert.equal(h.game.input.keyboard.listenerCount(name),1);for(const name of ['blur','pointercancel','touchcancel'])assert.equal(h.window.listenerCount(name),1)}h.game.events.emit('shutdown');for(const name of ['blur','pointercancel','touchcancel'])assert.equal(h.window.listenerCount(name),0);
});
test('shallow bounce survives past seven wall hits and reaches the physical target',()=>{
 const h=make({level:level(['rr....'],[{color:'r',size:'small',type:'bounce'}])}),g=h.game;const angle=-173*Math.PI/180;g.setShooterX(295);g.doFire(295,1010,angle);assert.equal(g.hitBubble,true);assert.ok(g.projPath.length>8);h.settle();assert.equal(g.shotsHit,1);assert.equal(g.grid.isEmpty(),true);
});
test('invalid custom payloads and negative/fractional indexes fall back to a playable regular level',()=>{
 for(const raw of ['broken','{}','{"grid":["r"],"ammo":[]}']){const h=make({store:{bp_custom_level:raw},index:-2});assert.equal(h.game.isCustom,false);assert.equal(h.game.levelIndex,0);assert.equal(h.game.state,'aim');assert.equal(h.game.grid.cols,24)}
 for(const index of [-1,0.5,Infinity,1000]){const h=make({index});assert.ok(Number.isInteger(h.game.levelIndex));assert.ok(h.game.levelIndex>=0&&h.game.levelIndex<50);assert.equal(h.game.state,'aim')}
});
test('touch level selection scrolls without loading cards; a tap selects once on release',()=>{
 const h=make({store:{bp_progress:'49'}}),select=new h.math.Select();select.create();
 const card=h.objects.find(o=>!o.destroyed&&o.type==='rectangle'&&o.y===120&&o.interactive),p=h.pointer(card.x,card.y,{id:1,wasTouch:true});
 const down=point=>{card.events.emit('pointerdown',point,0,0,{stopPropagation(){}});select.input.emit('pointerdown',point)};
 down(p);assert.deepEqual(h.transitions,[]);select.input.emit('pointermove',{...p,y:p.y-50});assert.equal(select.cameras.main.scrollY,50);select.input.emit('pointerup',{...p,y:p.y-50});assert.deepEqual(h.transitions,[]);
 down(p);select.input.emit('pointerup',p);assert.deepEqual(h.transitions,['game']);select.input.emit('pointerup',p);assert.deepEqual(h.transitions,['game']);
 select.events.emit('shutdown');for(const event of ['blur','pointercancel','touchcancel'])assert.equal(h.window.listenerCount(event),1);
});
test('all 50 first-shot aim predictions match actual touch, elimination, and ammo accounting',()=>{
 for(let index=0;index<50;index++){
  const h=make({index}),g=h.game,ammo=g.level.current(),size=h.math.sizes[ammo.size],angle=(-170+(index*37)%158)*Math.PI/180;
  const x=g.grid.offsetX+40+(g.grid.cols*27-80)*(index%5)/4;g.setShooterX(x);
  const trace=h.math.trace(g.grid,g.shooterX,1010,Math.cos(angle),Math.sin(angle),size.r,ammo.type==='bounce');
  const seeds=(trace.hitBubble?h.math.touch(g.grid,trace.landing.x,trace.landing.y,size.r):[]).filter(p=>g.grid.color(p.c,p.r)===ammo.color);
  const capacity=size.cap+(seeds.length>=2?2:0),removed=h.math.pop(g.grid,seeds,capacity),before=g.grid.cells.filter(Boolean).length;
  g.doFire(g.shooterX,1010,angle);for(let i=0;i<20&&g.state==='fly';i++)h.step(5000);
  assert.equal(g.state,'resolve',`level ${index+1}`);assert.equal(g.shotsFired,1);assert.equal(g.level.pos,0);
  assert.equal(g.shotsHit,seeds.length?1:0);assert.equal(before-g.grid.cells.filter(Boolean).length,removed.length);
  assert.equal(g.wasteTotal,seeds.length?capacity-removed.length:0);h.settle();assert.equal(g.level.pos,1);assert.equal(h.errors.length,0);
 }
});
