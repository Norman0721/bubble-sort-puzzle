const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const createCore=require('../editor/core');
const baseline=fs.readFileSync(require('node:path').join(__dirname,'../editor/game-baseline.html'),'utf8');
// Read actual game constants and geometry, so editor tests cannot drift to approximations.
const sandbox={location:{search:''},URLSearchParams};
vm.runInNewContext(baseline.slice(baseline.indexOf('X=1080'),baseline.indexOf('var ce=class')).replace('X=1080','var X=1080')+';this.config={pitch:HEX_PITCH,rowStep:HEX_ROW,center:se,colors:Q,labels:COLOR_LABELS,capacity:Object.fromEntries(Object.entries(oe).map(([k,v])=>[k,v.cap])),visibleRows:30};',sandbox);
const C=createCore(sandbox.config);
const level=(rows=30,cols=24)=>({schemaVersion:1,id:'L001',name:'测试',note:'',grid:Array(rows).fill('.'.repeat(cols)),ammo:[],updatedAt:new Date().toISOString()});
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data}}
function place(l,c,r,k='r'){C.setCell(l.grid,c,r,k);return l}

test('AC01, AC02: save/reopen 18/24 columns; all 8 colors and exact shared hex centers',()=>{
 for(const cols of [18,24]){
  const l=level(30,cols),s=storage(),repo=new C.Repository(s);
  C.keys.forEach((k,i)=>place(l,i,1,k));const saved=repo.saveLayout(l,null,false);
  assert.deepEqual(repo.get(l.id).grid,l.grid);assert.equal(saved.grid[0].length,cols);
  for(let r=0;r<30;r++)for(let c=0;c<cols;c++){const p=C.center(c,r);assert.deepEqual(C.hit(p.x,p.y,cols,30),{c,r})}
 }
 assert.equal(C.center(3,1).x-C.center(3,0).x,C.pitch/2);
 assert.equal(C.hit(-5,28,24,30),null);
 const p=C.center(4,3);for(const a of [0,60,120,180,240,300]){
  const angle=a*Math.PI/180;assert.deepEqual(C.hit(p.x+12*Math.cos(angle),p.y+12*Math.sin(angle),24,30),{c:4,r:3})
 }
});
test('AC03, AC04: ten-cell paint and erase sessions each undo as one command',()=>{
 const l=level(),h=new C.History(),before=C.layout(l);
 for(let i=0;i<10;i++)place(l,i,5);h.record(before,C.layout(l),'paint');assert.equal(h.undoStack.length,1);
 h.undo(l);assert.equal(C.stats(l.grid).total,0);h.redo(l);assert.equal(C.stats(l.grid).total,10);
 const eraseBefore=C.layout(l);for(let i=0;i<10;i++)C.setCell(l.grid,i,5,'.');h.record(eraseBefore,C.layout(l),'erase');h.undo(l);assert.equal(C.stats(l.grid).total,10);
});
test('AC05, AC06: move commits atomically, rejects bounds/collision and supports overlapping source',()=>{
 const l=place(place(level(),3,2,'r'),4,2,'b'),selection=new Set(['3,2','4,2']);
 const source=C.clone(l.grid);const moved=C.relocation(l.grid,selection,5,2);
 assert.ok(moved.valid);assert.equal(moved.grid[2][3],'.');assert.equal(moved.grid[4][8],'r');assert.equal(moved.grid[4][9],'b');assert.deepEqual(l.grid,source);
 place(l,8,4,'g');const collision=C.relocation(l.grid,selection,5,2);assert.equal(collision.valid,false);assert.deepEqual(l.grid,C.clone(l.grid));
 assert.equal(C.relocation(l.grid,selection,-4,0).valid,false);
 const overlap=C.relocation(l.grid,selection,1,0);assert.ok(overlap.valid);assert.equal(overlap.grid[2][4],'r');assert.equal(overlap.grid[2][5],'b');
});
test('P1: copy uses bounding box offsets and paste never overwrites existing bubbles',()=>{
 const l=place(place(level(),3,2,'r'),4,3,'b'),selection=new Set(['3,2','4,2','3,3','4,3']),copy=C.copySelection(l.grid,selection);
 assert.equal(copy.width,2);assert.equal(copy.height,2);assert.equal(copy.cells.find(c=>c.c===0&&c.r===0).value,'r');
 const pasted=C.relocation(l.grid,selection,8,5,copy);assert.ok(pasted.valid);assert.equal(pasted.grid[5][8],'r');assert.equal(pasted.grid[6][9],'b');assert.equal(pasted.grid[2][3],'r');
 assert.equal(C.relocation(l.grid,selection,3,2,copy).valid,false);
});
test('AC07: recolor saved and trial data stays identical',()=>{
 const l=place(level(),3,4),h=new C.History(),repo=new C.Repository(storage());const before=C.layout(l);place(l,3,4,'g');h.record(before,C.layout(l),'recolor');
 l.ammo=[{color:'g',size:'small'}];const saved=repo.saveLayout(l,null,false);assert.equal(saved.grid[4][3],'g');assert.ok(!C.blocksTrial(C.validate(saved)));h.undo(l);assert.equal(l.grid[4][3],'r');
});
test('AC08, AC09: exact first-screen cases and row parity never rebased',()=>{
 for(const [rows,last,top,vis] of [[20,18,0,20],[40,29,0,30],[40,35,6,30],[60,59,30,30],[200,199,170,30]]){
  const l=place(level(rows),3,last),w=C.windowFor(l.grid);assert.equal(w.viewTop,top);assert.equal(w.visRows,vis);assert.equal(w.bottom,top+vis-1);
  assert.equal(C.stats(l.grid).first,1);assert.equal(C.center(3,last).x,(3+.5+(last&1)*.5)*27);
 }
 const l=place(place(level(40),4,5),4,35);assert.equal(C.windowFor(l.grid).viewTop,6);C.setCell(l.grid,4,35,'.');assert.equal(C.windowFor(l.grid).viewTop,0);
});
test('AC10: all structure rules, malformed rows, full-width characters and exact coordinates',()=>{
 const l=place(level(),3,5);l.grid[6]=l.grid[6].slice(1);C.setCell(l.grid,8,9,'红');const issues=C.validate(l);
 assert.ok(issues.some(i=>i.ruleId==='GRID004'&&i.row===6));assert.ok(issues.some(i=>i.ruleId==='GRID005'&&i.row===9&&i.col===8));assert.ok(C.blocksSave(issues));assert.ok(C.blocksTrial(issues));
 for(const [update,rule] of [[l=>l.grid=null,'GRID001'],[l=>l.grid=[],'GRID002'],[l=>l.grid=['rrrrr'],'GRID003'],[l=>l.grid=['.'.repeat(24)],'GRID006'],[l=>l.id='bad id','META001'],[l=>l.schemaVersion=2,'SCHEMA001']]){
  const copy=level();update(copy);assert.ok(C.validate(copy).some(i=>i.ruleId===rule))
 }
 assert.ok(C.validate(place(level(),1,1),{collision:true}).some(i=>i.ruleId==='META001'));
});
test('AC11, AC12: no ammo or deficient capacity blocks trial but permits saving layout',()=>{
 const l=place(level(),3,5);let issues=C.validate(l);assert.ok(!C.blocksSave(issues));assert.ok(C.blocksTrial(issues));
 l.ammo=[{color:'r',size:'small'}];for(let c=0;c<6;c++)place(l,c,6);issues=C.validate(l);assert.ok(!C.blocksSave(issues));assert.ok(issues.some(i=>i.ruleId==='AMMO004'&&i.message.includes('4')&&i.message.includes('7')));
 l.ammo=[{color:'r',size:'large'}];assert.ok(!C.blocksTrial(C.validate(l)));l.ammo[0].type='bad';assert.ok(C.blocksTrial(C.validate(l)));assert.ok(!C.blocksSave(C.validate(l)));
});
test('AC13, AC14: field merge preserves other editor fields and future fields; concurrent owned writes conflict',()=>{
 const repo=new C.Repository(storage()),l=place(level(),3,5);l.layoutExtra={x:1};l.queueExtra={y:2};const first=repo.saveLayout(l,null,false),baseline=C.layout(first);
 const draft=C.clone(first);place(draft,4,5,'b');
 repo.saveAmmo(l.id,[{color:'b',size:'large',type:'bounce'}],[]);
 const merged=repo.saveLayout(draft,baseline,true);assert.equal(merged.ammo[0].color,'b');assert.deepEqual(merged.queueExtra,{y:2});assert.equal(merged.grid[5][4],'b');
 const layoutCopy=C.clone(merged);place(layoutCopy,5,5,'g');repo.saveLayout(layoutCopy,C.layout(merged),true);
 const queueSaved=repo.saveAmmo(l.id,[{color:'r',size:'large'}],merged.ammo);assert.equal(queueSaved.grid[5][5],'g');assert.deepEqual(queueSaved.layoutExtra,{x:1});
 assert.throws(()=>repo.saveLayout(draft,baseline,true),/布局已被另一页面/);assert.throws(()=>repo.saveAmmo(l.id,[],merged.ammo),/队列已被另一页面/);
 assert.throws(()=>repo.saveLayout(l,null,false),/冲突/);
});
test('AC15, AC16: trial snapshot includes draft/history/view; save leaves undo and dirty comparison accurate',()=>{
 const l=place(level(),3,5),h=new C.History(),before=C.layout(l);place(l,4,5);h.record(before,C.layout(l),'paint');const saved=C.layout(l);
 const active=JSON.parse(JSON.stringify({level:l,history:h.toJSON(),view:{zoom:.6,x:20,y:-160},selection:['3,5'],tool:'select'}));const restored=new C.History();restored.restore(active.history);assert.equal(restored.undoStack.length,1);assert.deepEqual(active.view,{zoom:.6,x:20,y:-160});
 restored.undo(active.level);assert.notEqual(C.fingerprint(C.layout(active.level)),C.fingerprint(saved));restored.redo(active.level);assert.equal(C.fingerprint(C.layout(active.level)),C.fingerprint(saved));
});
test('AC18: quota failure leaves input and existing saved data intact',()=>{
 const s=storage(),repo=new C.Repository(s),l=place(level(),3,5),first=repo.saveLayout(l,null,false);const before=s.getItem(repo.key),draft=C.clone(first);place(draft,4,5);
 s.setItem=()=>{const e=Error('full');e.name='QuotaExceededError';throw e};assert.throws(()=>repo.saveLayout(draft,C.layout(first),true),/full/);assert.equal(s.getItem(repo.key),before);assert.equal(draft.grid[5][4],'r');
});
test('rows and history cap: resize undo restores trimmed bubbles, max 100 commands and new edits clear redo',()=>{
 const l=place(level(40),3,35),h=new C.History(),before=C.layout(l);l.grid.length=30;h.record(before,C.layout(l),'resize');h.undo(l);assert.equal(l.grid.length,40);assert.equal(l.grid[35][3],'r');h.redo(l);assert.equal(l.grid.length,30);
 for(let i=0;i<110;i++){const b=C.layout(l);l.note=String(i);h.record(b,C.layout(l),'metadata')}assert.equal(h.undoStack.length,100);h.undo(l);const b=C.layout(l);l.name='new';h.record(b,C.layout(l),'metadata');assert.equal(h.redoStack.length,0);
});
test('AC20: 24 × 200 calculations fit 100ms feedback budget',()=>{
 const l=level(200);l.grid.fill('rbgypcomrbgypcomrbgypcom');l.ammo=C.keys.map(color=>({color,size:'large'}));
 const begin=performance.now();for(let i=0;i<100;i++){C.stats(l.grid);C.validate(l);C.ammoStats(l.grid,l.ammo)}const per=(performance.now()-begin)/100;assert.ok(per<100,`feedback took ${per}ms`);console.log(`4800-cell statistics + validation: ${per.toFixed(2)} ms/update`);
});

test('all 50 actual built-in levels load as 18/24-column layouts and preserve ammo',()=>{
 const box={};vm.runInNewContext(baseline.slice(baseline.indexOf('var _e='),baseline.indexOf('function ht()'))+';this.levels=mt;',box);
 assert.equal(box.levels.length,50);const widths=new Set();
 for(const built of box.levels){const l={...C.clone(built),schemaVersion:1,id:`B${String(built.id).padStart(3,'0')}`,note:''};widths.add(l.grid[0].length);assert.ok(!C.blocksSave(C.validate(l)),`builtin ${l.id} structure invalid`);
  const repo=new C.Repository(storage()),saved=repo.saveLayout(l,null,false);assert.deepEqual(saved.ammo,l.ammo);assert.deepEqual(C.windowFor(saved.grid),C.windowFor(l.grid))
 }
 assert.deepEqual([...widths].sort(),[18,24]);
});

test('malformed metadata, falsy illegal ammo types and corrupt storage entries produce errors without crashing',()=>{
 const l=place(level(),3,5);l.name=123;l.note={unexpected:true};assert.ok(C.validate(l).some(i=>i.ruleId==='META003'));assert.ok(C.blocksSave(C.validate(l)));
 for(const type of [0,false,'unknown']){l.name='测试';l.note='';l.ammo=[{color:'r',size:'small',type}];assert.ok(C.validate(l).some(i=>i.ruleId==='AMMO006'));assert.ok(C.blocksTrial(C.validate(l)))}
 assert.doesNotThrow(()=>C.validate(null));assert.doesNotThrow(()=>C.stats([null,'rrrr']));
 const s=storage(),repo=new C.Repository(s);s.setItem(repo.key,JSON.stringify({L001:null}));assert.throws(()=>repo.readAll(),/损坏/);
 s.setItem(repo.key,JSON.stringify({L001:{...l,id:'L002'}}));assert.throws(()=>repo.readAll(),/ID 不一致/);
 const future={...l,schemaVersion:2};s.data.clear();assert.throws(()=>repo.saveLayout(future,null,false),/schemaVersion/);assert.equal(s.getItem(repo.key),null);
});

test('geometry and recovery reject nonfinite coordinates and malformed Undo without hanging or replacing history',()=>{
 for(const [x,y] of [[0,Infinity],[0,1e308],[NaN,28],[Infinity,28],[12,-1e308]])assert.equal(C.hit(x,y,24,30),null);
 const l=place(level(),3,5),h=new C.History(),before=C.layout(l);place(l,4,5);h.record(before,C.layout(l),'paint');const saved=h.toJSON();
 for(const value of [{undo:{}},{undo:[{rowsBefore:1e9,rowsAfter:30,diffs:[]}]},{undo:[{rowsBefore:30,rowsAfter:30,diffs:[{c:0,r:-1,before:'.',after:'r'}]}]}])assert.throws(()=>h.restore(value),/恢复历史/);
 assert.deepEqual(h.toJSON(),saved);
});

test('hidden bubble encoding preserves real-color statistics, validation, history and copy data',()=>{
 const l=level();C.setCell(l.grid,5,5,C.bubbleValue('r',true));l.ammo=[{color:'r',size:'small'}];
 assert.equal(l.grid[5][5],'R');assert.equal(C.isHidden(l.grid[5][5]),true);assert.equal(C.realColor(l.grid[5][5]),'r');
 const stats=C.stats(l.grid);assert.equal(stats.total,1);assert.equal(stats.hidden,1);assert.equal(stats.byColor.r,1);assert.ok(!C.blocksTrial(C.validate(l)));
 const selection=new Set([C.cellKey(5,5)]),copy=C.copySelection(l.grid,selection);assert.equal(copy.cells[0].value,'R');
 const before=C.layout(l),history=new C.History();C.setCell(l.grid,5,5,'r');history.record(before,C.layout(l),'reveal-config');history.undo(l);assert.equal(l.grid[5][5],'R');
});
