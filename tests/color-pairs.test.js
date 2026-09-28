const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const make=require('./helpers/game-harness');
const createCore=require('../editor/core.js');
const sourceFile=path.join(__dirname,'../Bubble Sort Mobile V1.6.html');
const C=createCore({pitch:27,rowStep:27*Math.sqrt(3)/2,center:(c,r)=>({x:27*(c+.5+(r&1)*.5),y:28+r*27*Math.sqrt(3)/2}),colors:{r:1,g:2,b:3,y:4},labels:{r:'红',g:'绿',b:'蓝',y:'黄'},capacity:{large:10},visibleRows:30});
function level(){
  const rows=Array.from({length:6},()=>Array(12).fill('.'));for(const [c,r,color] of [[3,1,'r'],[7,1,'g'],[4,2,'b'],[8,2,'y']])rows[r][c]=color;
  return {schemaVersion:1,id:'PAIRS',name:'Paired colors',grid:rows.map(row=>row.join('')),colorPairs:[{id:'Pair_01',c:3,r:1},{id:'Pair_01',c:7,r:1},{id:'Pair_02',c:4,r:2},{id:'Pair_02',c:8,r:2}],ammo:[{color:'r',size:'large'},{color:'g',size:'large'},{color:'b',size:'large'},{color:'y',size:'large'}]};
}
function finish(g){g.state='resolve';g.shotSerial++;g.afterShot()}
test('editor validates exact pairs, distinct colors, positions, and saves pairing in history',()=>{
  const l=level();assert.equal(C.validate(l).filter(i=>i.ruleId.startsWith('PAIR')).length,0);
  l.colorPairs.pop();assert.ok(C.validate(l).some(i=>i.ruleId==='PAIR004'));
  l.colorPairs.push({id:'Pair_01',c:8,r:2});assert.ok(C.validate(l).some(i=>i.ruleId==='PAIR005'));
  l.colorPairs.pop();l.colorPairs.push({id:'Pair_02',c:8,r:2});
  C.setCell(l.grid,8,2,'b');assert.ok(C.validate(l).some(i=>i.ruleId==='PAIR006'));
  C.setCell(l.grid,8,2,'y');const before=C.layout(l);l.colorPairs[0].c=2;const after=C.layout(l),history=new C.History();
  assert.equal(history.record(before,after,'pair'),true);history.undo(l);assert.equal(l.colorPairs[0].c,3);history.redo(l);assert.equal(l.colorPairs[0].c,2);
});
test('each settled shot swaps every active group; removal locks survivor at its current color',()=>{
  const h=make({level:level(),sourceFile}),g=h.game;
  assert.equal(g.bubbles.get('3,1').getData('colorPair'),'Pair_01');
  finish(g);assert.equal(g.grid.colorAll(3,1),'g');assert.equal(g.grid.colorAll(7,1),'r');assert.equal(g.grid.colorAll(4,2),'y');assert.equal(g.grid.colorAll(8,2),'b');
  finish(g);assert.equal(g.grid.colorAll(3,1),'r');assert.equal(g.grid.colorAll(4,2),'b');
  g.grid.set(3,1,null);assert.equal(g.bubbles.get('7,1').getData('colorPair'),undefined);
  finish(g);assert.equal(g.grid.colorAll(7,1),'g');
  assert.equal(g.grid.colorAll(4,2),'y');finish(g);assert.equal(g.grid.colorAll(7,1),'g');assert.equal(g.grid.colorAll(4,2),'b');
});
test('real shots match the displayed swapped color; undo restores the pre-shot pair state',()=>{
  const l=level();l.grid=l.grid.map(row=>row.replace('b','.').replace('y','.'));l.colorPairs=l.colorPairs.slice(0,2);
  l.ammo=[{color:'r',size:'large'},{color:'g',size:'large'},{color:'r',size:'large'}];
  const h=make({level:l,sourceFile}),g=h.game;
  g.doFire(g.shooterX,1010,-Math.PI/2);h.settle();assert.equal(g.grid.colorAll(3,1),'g');assert.equal(g.grid.colorAll(7,1),'r');
  g.testFireAt(3,1);h.settle();assert.equal(g.shotsHit,1);assert.equal(g.grid.colorAll(3,1),null);assert.equal(g.grid.colorAll(7,1),'r');
  g.undoShot();assert.equal(g.grid.colorAll(3,1),'g');assert.equal(g.grid.colorAll(7,1),'r');assert.equal(g.bubbles.get('3,1').getData('colorPair'),'Pair_01');
  g.testFireAt(3,1);h.settle();assert.equal(g.grid.colorAll(7,1),'r');
});
