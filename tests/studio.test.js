// Execute the actual studio event handlers in a deterministic DOM/canvas simulation.
// This checks data flow and input behavior; it is not a browser rendering test.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const createCore=require('../editor/core');
function harness(initialStore={},initialHash='#/editor.html',options={}) {
 const ids=new Map(),listeners=new Map(),frames=[],intervals=[],timeouts=new Map();let nextTimer=1,currentHash=initialHash;
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.value='';this.disabled=false;this.className='';this.events={};this.open=false;this._text='';
   this.classList={toggle:(k,v)=>{const s=new Set(this.className.split(' ').filter(Boolean));if(v===undefined)v=!s.has(k);v?s.add(k):s.delete(k);this.className=[...s].join(' ');return v},contains:k=>this.className.split(' ').includes(k)};
  }
  set id(v){this._id=v;ids.set(v,this)}get id(){return this._id}
  set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(n=>typeof n==='string'?n:n.textContent).join('')}
  get lastChild(){return this.children.at(-1)}get firstChild(){return this.children[0]}
  append(...nodes){for(const n of nodes){if(n&&typeof n==='object')n.parent=this;this.children.push(n)}}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes)}
  setAttribute(k,v){if(k==='id')this.id=v;this[k]=v}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn)}
  async dispatch(k,values={}){const e={target:this,preventDefault(){},...values};for(const fn of this.events[k]||[])await fn(e);if(this['on'+k])await this['on'+k](e)}
  async click(){if(this.disabled)return;await this.dispatch('click')}
  focus(){document.activeElement=this}closest(selector){return /input|textarea|select/.test(selector)&&['INPUT','TEXTAREA','SELECT'].includes(this.tagName)?this:null}
  getBoundingClientRect(){return {left:0,top:0,width:760,height:740}}
  getContext(){return context}showModal(){this.open=true}close(){this.open=false}
 }
 const html=fs.readFileSync(require('node:path').join(__dirname,'../editor/shell.html'),'utf8');
 for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const n=new Element(m[1]);n.id=m[2]}
 const tools=[];for(const name of ['brush','erase','select','pan']){const n=new Element('button');n.dataset.tool=name;tools.push(n)}
 const workspace=new Element();workspace.className='bb-workspace';
 const document={getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n},querySelectorAll:selector=>selector==='[data-tool]'?tools:[],querySelector:selector=>selector==='.bb-workspace'?workspace:null,title:'',activeElement:null};
 const drawCalls=[];const context=new Proxy({},{get:(o,k)=>{if(k in o)return o[k];return (...args)=>{drawCalls.push([k,...args]);if(k==='translate')context.translateAt=args;if(k==='scale')context.scaleAt=args}}});
 ids.set('game',new Element());
 const data=new Map(Object.entries(initialStore));const localStorage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 let failing=false;const write=localStorage.setItem;localStorage.setItem=(k,v)=>{if(typeof failing==='function'?failing(k):failing){const e=Error('full');e.name='QuotaExceededError';throw e}write(k,v)};
 const configSandbox={location:{search:''},URLSearchParams};const baseline=fs.readFileSync(require('node:path').join(__dirname,'../editor/game-baseline.html'),'utf8');
 vm.runInNewContext(baseline.slice(baseline.indexOf('X=1080'),baseline.indexOf('var ce=class')).replace('X=1080','var X=1080')+';this.config={pitch:HEX_PITCH,rowStep:HEX_ROW,center:se,colors:Q,labels:COLOR_LABELS,capacity:Object.fromEntries(Object.entries(oe).map(([k,v])=>[k,v.cap])),visibleRows:30};',configSandbox);
 const C=createCore(configSandbox.config);
 const en={isBooted:true,input:{keyboard:{}},scene:{getScenes:()=>[],pause(){},resume(){},stop(){},start(key){en.started=key}},events:{once(){}}};
 const location={get hash(){return currentHash},set hash(v){currentHash=v;Promise.resolve().then(()=>dispatchWindow('hashchange',{}))},pathname:'/Bubble Sort Staggered.html',search:''};
 const window={devicePixelRatio:1,localStorage,addEventListener:(k,fn)=>{(listeners.get(k)||listeners.set(k,[]).get(k)).push(fn)}};
 const sandbox={BB:C,BB_BUILD:{blankLevels:!!options.blankLevels},document,window,localStorage,location,en,mt:[{id:1,name:'18 列',grid:['.rrrr.............'],ammo:[{color:'r',size:'small'}]},{id:5,name:'24 列',grid:['..........b.............','.........grrrg..........','.........ggggrr.........','.........bbrrrb.........','.........bbbrbg.........'],ammo:[{color:'r',size:'large'},{color:'g',size:'large'},{color:'b',size:'large'}]}],
  console:{error(){}},URLSearchParams,Blob,URL:{createObjectURL:()=>'/blob',revokeObjectURL(){}},performance,
  setTimeout:(fn,delay)=>{const id=nextTimer++;timeouts.set(id,{fn,delay});return id},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.push(fn);return intervals.length},requestAnimationFrame:fn=>{frames.push(fn);return frames.length},ResizeObserver:class{observe(){}},
  history:{replaceState:(_,__,url)=>{currentHash=url.includes('#')?'#'+url.split('#')[1]:''}}};
 Object.assign(window,{document,location});
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../editor/studio.js'),'utf8'),sandbox);
 async function tick(){for(let i=0;i<8;i++)await Promise.resolve();while(frames.length){const f=frames.shift();f()}}
 async function dispatchWindow(k,values){for(const f of listeners.get(k)||[])await f({target:new Element(),preventDefault(){},...values})}
 function point(c,r){const p=C.center(c,r),[x,y]=context.translateAt||[0,0],[z]=context.scaleAt||[1];return {clientX:x+p.x*z,clientY:y+p.y*z,pointerId:1,button:0}}
 async function drag(c0,r0,c1,r1,button=0){await ids.get('bb-canvas').dispatch('pointerdown',{...point(c0,r0),button});await ids.get('bb-canvas').dispatch('pointermove',{...point(c1,r1),button});await ids.get('bb-canvas').dispatch('pointerup',{...point(c1,r1),button});await tick()}
 async function key(key,target=new Element(),extras={}){await dispatchWindow('keydown',{key,target,...extras});await tick()}
 async function newLevel(id='TEST',rows=30){const p=ids.get('bb-new').click();await tick();if(ids.get('bb-dialog').open&&ids.get('bb-dialog-title').textContent==='有未保存修改'){await ids.get('bb-dialog-actions').children.find(n=>n.textContent==='不保存').click();await tick()}
  ids.get('bb-new-id').value=id;ids.get('bb-new-name').value='测试关卡';ids.get('bb-new-cols').value='24';ids.get('bb-new-rows').value=String(rows);
  await ids.get('bb-dialog-actions').children.find(n=>n.textContent==='创建').click();await p;await tick();}
 return {C,ids,document,window,storage:localStorage,data,context,drawCalls,en,tick,point,drag,key,newLevel,dispatchWindow,setFail:v=>failing=v,tools,location,runIntervals:async()=>{for(const fn of intervals)fn();await tick()},runTimeouts:async delay=>{for(const [id,value] of [...timeouts])if(value.delay===delay){timeouts.delete(id);value.fn()}await tick()}};
}

test('AC03/04/19: actual pointer sessions, right erase, undo and input shortcut isolation',async()=>{
 const h=harness();await h.tick();await h.newLevel();assert.equal(h.ids.get('bb-total').textContent,'0');
 await h.drag(2,5,11,5);assert.equal(h.ids.get('bb-total').textContent,'10');await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'0');
 await h.ids.get('bb-redo').click();await h.tick();await h.drag(2,5,11,5,2);assert.equal(h.ids.get('bb-total').textContent,'0');await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'10');
 await h.key('v');assert.ok(h.tools.find(b=>b.dataset.tool==='select').classList.contains('active'));
 for(const key of ['b','e','v','h'])await h.key(key,h.ids.get('bb-note'));
 assert.ok(h.tools.find(b=>b.dataset.tool==='select').classList.contains('active'));
});
test('AC01/11/16/18: save without ammo, undo after save, quota failure preserves dirty draft',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.ids.get('bb-save').click();await h.tick();
 assert.equal(JSON.parse(h.data.get('bp_editor_levels')).TEST.grid[5].slice(2,4),'rr');assert.ok(h.ids.get('bb-state').textContent.startsWith('Clean'));assert.ok(h.ids.get('bb-trial').disabled);
 await h.ids.get('bb-undo').click();await h.tick();assert.ok(h.ids.get('bb-state').textContent.startsWith('Dirty'));await h.ids.get('bb-redo').click();await h.tick();assert.ok(h.ids.get('bb-state').textContent.startsWith('Clean'));
 await h.drag(4,5,4,5);h.setFail(true);await h.ids.get('bb-save').click();assert.ok(h.ids.get('bb-state').textContent.includes('失败'));assert.equal(h.ids.get('bb-total').textContent,'3');assert.equal(JSON.parse(h.data.get('bp_editor_levels')).TEST.grid[5][4],'.');assert.ok(!h.ids.get('bb-undo').disabled);
});
test('AC13/14/15: separate queue route, save, current unsaved trial and return with history/view',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.ids.get('bb-save').click();await h.ids.get('bb-queue-open').click();await h.tick();
 assert.ok(h.ids.get('bb-studio').classList.contains('queue-mode'));assert.equal(h.document.title,'TEST · 弹药队列编辑器');
 h.ids.get('bb-ammo-color').value='r';h.ids.get('bb-ammo-size').value='large';h.ids.get('bb-ammo-type').value='bounce';await h.ids.get('bb-ammo-add').click();await h.ids.get('bb-save').click();await h.ids.get('bb-exit').click();await h.tick();
 assert.ok(!h.ids.get('bb-studio').classList.contains('queue-mode'));assert.ok(h.ids.get('bb-ammo-summary').textContent.includes('1 发反弹弹'));assert.ok(!h.ids.get('bb-trial').disabled);
 await h.drag(4,5,4,5);await h.ids.get('bb-zoom-in').click();await h.tick();const zoom=h.ids.get('bb-zoom').textContent;
 await h.ids.get('bb-trial').click();await h.tick();assert.equal(h.en.started,'game');const trial=JSON.parse(h.data.get('bp_custom_level'));assert.equal(trial.grid[5][4],'r');assert.equal(trial.ammo[0].type,'bounce');
 const active=JSON.parse(h.data.get('bp_editor_active'));assert.equal(active.history.undo.length,2);
 await h.window.BPStudio.returnFromTrial();await h.tick();assert.equal(h.ids.get('bb-zoom').textContent,zoom);assert.equal(h.ids.get('bb-total').textContent,'3');assert.ok(h.ids.get('bb-state').textContent.startsWith('Dirty'));assert.equal(h.data.has('bp_custom_level'),false);
 await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'2');
});
test('AC17: unsaved dialog cancel, save-and-continue and discard for new level',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);
 let action=h.ids.get('bb-new').click();await h.tick();assert.equal(h.ids.get('bb-dialog-actions').children.length,3);
 await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='取消').click();await action;assert.equal(h.ids.get('bb-id').value,'TEST');
 action=h.ids.get('bb-new').click();await h.tick();await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='保存并继续').click();await h.tick();assert.equal(h.ids.get('bb-dialog-title').textContent,'新建关卡');assert.ok(JSON.parse(h.data.get('bp_editor_levels')).TEST);
 await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='取消').click();await action;
 await h.drag(4,5,4,5);action=h.ids.get('bb-new').click();await h.tick();await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='不保存').click();await h.tick();assert.equal(h.ids.get('bb-dialog-title').textContent,'新建关卡');assert.equal(JSON.parse(h.data.get('bp_editor_levels')).TEST.grid[5][4],'.');await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='取消').click();await action;
});
test('AC20: actual renderer culls a 200-row canvas; wheel and pan do not paint',async()=>{
 const h=harness();await h.tick();await h.newLevel('LONG',200);h.drawCalls.length=0;await h.key('h');await h.drag(3,5,10,6);
 assert.equal(h.ids.get('bb-total').textContent,'0');assert.ok(h.drawCalls.filter(c=>c[0]==='closePath').length<200*24);await h.ids.get('bb-canvas').dispatch('wheel',{...h.point(3,5),deltaY:-100});await h.tick();assert.equal(h.ids.get('bb-total').textContent,'0');assert.equal(h.ids.get('bb-zoom').textContent,'50%');
});

test('AC05/06: actual selection and snapped movement rejects collision and bounds',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.drag(12,9,12,9);await h.key('v');await h.drag(1,4,5,6);
 assert.ok(h.ids.get('bb-selection').textContent.includes('2 个泡泡'));await h.drag(2,5,8,8);await h.ids.get('bb-save').click();await h.tick();
 let saved=JSON.parse(h.data.get('bp_editor_levels')).TEST;assert.equal(saved.grid[5][2],'.');assert.equal(saved.grid[8][8],'r');assert.equal(saved.grid[8][9],'r');
 await h.drag(8,8,12,9);await h.ids.get('bb-save').click();await h.tick();saved=JSON.parse(h.data.get('bp_editor_levels')).TEST;assert.equal(saved.grid[8][8],'r');assert.equal(saved.grid[9][12],'r');
 await h.ids.get('bb-canvas').dispatch('pointerdown',h.point(8,8));await h.ids.get('bb-canvas').dispatch('pointermove',h.point(-10,8));await h.ids.get('bb-canvas').dispatch('pointerup',h.point(-10,8));await h.tick();assert.equal(h.ids.get('bb-total').textContent,'3');
});
test('AC08: 40 rows with last bubble at 35 gives first-screen rows 6–35',async()=>{
 const h=harness();await h.tick();await h.newLevel('WINDOW',40);await h.key('h');await h.drag(3,5,3,0);await h.key('b');await h.drag(10,35,10,35);
 assert.ok(h.ids.get('bb-dimensions').textContent.includes('row 6–35'));await h.ids.get('bb-first').click();await h.tick();assert.ok(h.ids.get('bb-board-label').textContent.includes('首屏预览'));assert.equal(h.ids.get('bb-first-count').textContent,'1');
});
test('P1: actual paste preview and metadata edits are undoable; resize only appends',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.key('v');await h.drag(1,4,5,6);await h.key('c',undefined,{metaKey:true});await h.key('v',undefined,{metaKey:true});
 await h.ids.get('bb-canvas').dispatch('pointermove',h.point(8,8));await h.ids.get('bb-canvas').dispatch('pointerdown',h.point(8,8));await h.tick();assert.equal(h.ids.get('bb-total').textContent,'4');
 await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'2');
 await h.ids.get('bb-note').dispatch('focus');h.ids.get('bb-note').value='规划说明';await h.ids.get('bb-note').dispatch('input');await h.ids.get('bb-note').dispatch('blur');await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-note').value,'');
 await h.ids.get('bb-add5').click();await h.tick();assert.equal(h.ids.get('bb-rows').textContent,'35');await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-rows').textContent,'30');
});

test('AC15: refresh on editor route restores persisted trial state, history and viewport',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.ids.get('bb-save').click();
 const saved=JSON.parse(h.data.get('bp_editor_levels')).TEST;const draft=h.C.clone(saved);h.C.setCell(draft.grid,4,5,'r');const history=new h.C.History();history.record(h.C.layout(saved),h.C.layout(draft),'paint');
 const active={level:draft,savedSnapshot:h.C.layout(saved),baseline:h.C.layout(saved),originOwned:true,history:history.toJSON(),view:{zoom:.6,x:51,y:-80},selection:['4,5'],tool:'select',color:'g',first:false,updatedAt:new Date().toISOString()};
 const refresh=harness({'bp_editor_levels':h.data.get('bp_editor_levels'),'bp_editor_active':JSON.stringify(active),'bp_custom_level':JSON.stringify(draft)});await refresh.tick();
 assert.equal(refresh.ids.get('bb-id').value,'TEST');assert.equal(refresh.ids.get('bb-zoom').textContent,'60%');assert.equal(refresh.ids.get('bb-total').textContent,'3');assert.ok(refresh.ids.get('bb-state').textContent.startsWith('Dirty'));assert.equal(refresh.data.has('bp_editor_active'),false);
 await refresh.ids.get('bb-undo').click();await refresh.tick();assert.equal(refresh.ids.get('bb-total').textContent,'2');assert.ok(refresh.ids.get('bb-state').textContent.startsWith('Clean'));
});
test('P1: discover and restore a never-saved draft by ID after refresh',async()=>{
 const draft={level:{schemaVersion:1,id:'UNSAVED',name:'草稿',note:'',grid:['...r....................'],ammo:[],updatedAt:'2026-09-17T00:00:00.000Z'},savedSnapshot:null,baseline:null,originOwned:false,history:{undo:[],redo:[]},view:{zoom:1,x:50,y:55},selection:[],tool:'brush',color:'r',first:false,updatedAt:'2026-09-17T01:00:00.000Z'};
 const h=harness({'bp_editor_draft_UNSAVED':JSON.stringify(draft)});await h.tick();assert.equal(h.ids.get('bb-dialog-title').textContent,'发现恢复草稿');await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='恢复').click();await h.tick();assert.equal(h.ids.get('bb-id').value,'UNSAVED');assert.equal(h.ids.get('bb-total').textContent,'1');assert.ok(h.ids.get('bb-state').textContent.startsWith('Dirty'));
});

test('AC18: partial trial bridge write failure cancels navigation and removes stale return state',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(2,5,3,5);await h.ids.get('bb-save').click();
 const levels=JSON.parse(h.data.get('bp_editor_levels'));levels.TEST.ammo=[{color:'r',size:'large'}];h.data.set('bp_editor_levels',JSON.stringify(levels));await h.dispatchWindow('focus');await h.tick();
 h.setFail(key=>key==='bp_custom_level');await h.ids.get('bb-trial').click();await h.tick();assert.equal(h.data.has('bp_editor_active'),false);assert.equal(h.en.started,undefined);assert.equal(h.ids.get('bb-total').textContent,'2');assert.equal(h.ids.get('bb-studio').style.display,'block');
});
test('AC18: corrupted storage is reported without overwriting its original contents',async()=>{
 const raw='{invalid JSON';const h=harness({'bp_editor_levels':raw});await h.tick();assert.equal(h.data.get('bp_editor_levels'),raw);assert.ok(!h.ids.get('bb-error-panel').hidden);assert.ok(h.ids.get('bb-last-error').textContent.includes('JSON'));
 await h.ids.get('bb-save').click();await h.tick();assert.equal(h.data.get('bp_editor_levels'),raw);assert.equal(h.ids.get('bb-total').textContent,'4');
});

test('FR06: drag-select can start in the canvas margin outside the hex grid',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(0,2,3,2);await h.key('v');await h.drag(-2,1,5,3);assert.ok(h.ids.get('bb-selection').textContent.includes('4 个泡泡'));
 await h.ids.get('bb-delete').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'0');await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'4');
});
test('FR19: autosaved mid-stroke recovery contains one complete Undo command',async()=>{
 const h=harness();await h.tick();await h.newLevel('STROKE');const canvas=h.ids.get('bb-canvas');await canvas.dispatch('pointerdown',h.point(2,5));await canvas.dispatch('pointermove',h.point(11,5));await h.runIntervals();
 const recovery=JSON.parse(h.data.get('bp_editor_draft_STROKE'));assert.equal(recovery.history.undo.length,1);assert.equal(recovery.history.undo[0].diffs.length,10);
 const recovered=harness({'bp_editor_draft_STROKE':JSON.stringify(recovery)});await recovered.tick();await recovered.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='恢复').click();await recovered.tick();assert.equal(recovered.ids.get('bb-total').textContent,'10');await recovered.ids.get('bb-undo').click();await recovered.tick();assert.equal(recovered.ids.get('bb-total').textContent,'0');
 await canvas.dispatch('pointermove',h.point(12,5));await canvas.dispatch('pointerup',h.point(12,5));await h.tick();await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-total').textContent,'0');
});
test('FR19: metadata before blur is included in the recovery Undo history',async()=>{
 const h=harness();await h.tick();await h.newLevel('NOTE');await h.drag(3,5,3,5);const note=h.ids.get('bb-note');await note.dispatch('focus');note.value='尚未失焦的备注';await note.dispatch('input');await h.runTimeouts(2000);
 const draft=JSON.parse(h.data.get('bp_editor_draft_NOTE'));assert.equal(draft.history.undo.length,2);const history=new h.C.History();history.restore(draft.history);history.undo(draft.level);assert.equal(draft.level.note,'');
});
test('FR02: unsupported schema stays read-only, preserves original data and allows opening/new valid data',async()=>{
 const unsupported={schemaVersion:77,id:'FUTURE',name:'未来版本',note:'',grid:['...rr...................'],ammo:[{color:'r',size:'small'}],futureField:{keep:true},updatedAt:'2026-09-17T00:00:00Z'};
 const raw=JSON.stringify({FUTURE:unsupported}),h=harness({'bp_editor_levels':raw});await h.tick();assert.ok(h.ids.get('bb-state').textContent.includes('只读'));assert.equal(h.ids.get('bb-id').value,'FUTURE');assert.ok(h.ids.get('bb-note').disabled);assert.ok(h.ids.get('bb-save').disabled);assert.ok(h.ids.get('bb-queue-open').disabled);
 await h.key('b');await h.drag(4,0,5,0,2);await h.key('s',undefined,{metaKey:true});assert.equal(h.data.get('bp_editor_levels'),raw);assert.equal(h.ids.get('bb-total').textContent,'2');
 await h.newLevel('VALID');await h.drag(3,5,3,5);await h.ids.get('bb-save').click();assert.deepEqual(JSON.parse(h.data.get('bp_editor_levels')).FUTURE,unsupported);assert.ok(!h.ids.get('bb-note').disabled);
});
test('FR17: unsupported return bridge is not erased when restoration fails',async()=>{
 const active=JSON.stringify({level:{schemaVersion:78,id:'UNKNOWN',name:'不能恢复',grid:['...r....................'],ammo:[]}}),custom='original trial payload';const h=harness({'bp_editor_active':active,'bp_custom_level':custom});await h.tick();assert.equal(h.data.get('bp_editor_active'),active);assert.equal(h.data.get('bp_custom_level'),custom);assert.ok(h.ids.get('bb-save').disabled);assert.ok(h.ids.get('bb-state').textContent.includes('只读'));
});
test('FR14: a new ID claimed by another page is reported as META001 before saving',async()=>{
 const h=harness();await h.tick();await h.newLevel('RACE');await h.drag(3,5,3,5);
 const foreign={schemaVersion:1,id:'RACE',name:'另一个页面',note:'',grid:['....b...................'],ammo:[],updatedAt:'2026-09-17T00:00:00Z'};h.data.set('bp_editor_levels',JSON.stringify({RACE:foreign}));await h.ids.get('bb-validate').click();await h.tick();assert.ok(h.ids.get('bb-issues').textContent.includes('META001'));assert.ok(h.ids.get('bb-save').disabled);assert.equal(h.ids.get('bb-total').textContent,'1');assert.deepEqual(JSON.parse(h.data.get('bp_editor_levels')).RACE,foreign);
});
test('FR15: discard queue changes on browser back does not resurrect them on reopen',async()=>{
 const h=harness();await h.tick();await h.newLevel();await h.drag(3,5,3,5);await h.ids.get('bb-save').click();await h.ids.get('bb-queue-open').click();await h.tick();h.ids.get('bb-ammo-color').value='r';h.ids.get('bb-ammo-size').value='large';h.ids.get('bb-ammo-type').value='';await h.ids.get('bb-ammo-add').click();
 h.location.hash='#/editor.html';await h.tick();assert.equal(h.ids.get('bb-dialog-title').textContent,'有未保存修改');await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='不保存').click();await h.tick();assert.ok(!h.ids.get('bb-studio').classList.contains('queue-mode'));await h.ids.get('bb-queue-open').click();await h.tick();assert.ok(h.ids.get('bb-queue-title').textContent.includes('0 发'));
});

test('FR19: a new untouched blank map is recoverable after the idle draft delay',async()=>{
 const h=harness();await h.tick();await h.newLevel('BLANK');await h.runTimeouts(2000);assert.ok(h.data.has('bp_editor_draft_BLANK'));const value=JSON.parse(h.data.get('bp_editor_draft_BLANK'));assert.equal(value.level.grid.length,30);assert.equal(value.history.undo.length,0);
});
test('FR17: corrupt viewport recovery keeps the original bridge and reports a recoverable error',async()=>{
 const value={level:{schemaVersion:1,id:'BADVIEW',name:'视图异常',note:'',grid:['...r....................'],ammo:[]},view:{zoom:0,x:0,y:0},history:{undo:[],redo:[]},savedSnapshot:null,baseline:null};const active=JSON.stringify(value),h=harness({'bp_editor_active':active,'bp_custom_level':'trial'});await h.tick();assert.equal(h.data.get('bp_editor_active'),active);assert.equal(h.data.get('bp_custom_level'),'trial');assert.ok(h.ids.get('bb-last-error').textContent.includes('缩放'));await h.ids.get('bb-canvas').dispatch('pointermove',h.point(3,0));await h.tick();
});

test('Hidden editor: type and real color are saved, counted, rendered and undoable',async()=>{
 const h=harness();await h.tick();await h.newLevel('HIDDEN_EDITOR');await h.ids.get('bb-bubble-hidden').click();await h.drag(5,5,5,5);
 assert.equal(h.ids.get('bb-hidden-count').textContent,'1');assert.ok(h.ids.get('bb-color-name').textContent.includes('真实颜色'));
 await h.ids.get('bb-save').click();await h.tick();assert.equal(JSON.parse(h.data.get('bp_editor_levels')).HIDDEN_EDITOR.grid[5][5],'R');
 await h.ids.get('bb-undo').click();await h.tick();assert.equal(h.ids.get('bb-hidden-count').textContent,'0');
});

test('Queue batch: nonadjacent selection moves in order, edits once, deletes once and undoes',async()=>{
 const ammo=['r','b','g','y','p','c'].map(color=>({color,size:'small'}));
 const level={schemaVersion:1,id:'BATCH',name:'批量测试',grid:['rrggbb..................'],ammo};
 const h=harness({'bp_editor_levels':JSON.stringify({BATCH:level})},'#/ammo-editor.html?levelId=BATCH');await h.tick();
 const rows=()=>h.ids.get('bb-queue-list').children;
 await rows()[1].children[0].click();await rows()[3].children[0].click();
 assert.equal(h.ids.get('bb-queue-selected').textContent,'已选 2 发');
 h.ids.get('bb-batch-position').value='7';await h.ids.get('bb-batch-move').click();
 assert.deepEqual([...rows()].map(r=>r.children[3].value),['r','g','p','c','b','y']);
 h.ids.get('bb-batch-color').value='g';h.ids.get('bb-batch-type').value='bounce';await h.ids.get('bb-batch-apply').click();
 assert.deepEqual([...rows()].map(r=>r.children[3].value),['r','g','p','c','g','g']);assert.equal(h.ids.get('bb-save').disabled,false,h.ids.get('bb-queue-issues').textContent);
 await h.ids.get('bb-save').click();
 let saved=JSON.parse(h.data.get('bp_editor_levels')).BATCH.ammo;
 assert.deepEqual(saved.map(a=>a.color),['r','g','p','c','g','g']);assert.equal(saved[4].type,'bounce');assert.equal(saved[5].type,'bounce');
 const deletion=h.ids.get('bb-batch-delete').click();await h.tick();await h.ids.get('bb-dialog-actions').children.find(n=>n.textContent==='删除').click();await deletion;await h.tick();
 assert.equal(rows().length,4);await h.ids.get('bb-undo').click();assert.equal(rows().length,6);
 await h.ids.get('bb-undo').click();assert.deepEqual([...rows()].map(r=>r.children[3].value),['r','g','p','c','b','y']);
 await h.ids.get('bb-undo').click();assert.deepEqual([...rows()].map(r=>r.children[3].value),['r','b','g','y','p','c']);
});

test('Queue batch: drag selected rows to end as one undoable operation',async()=>{
 const ammo=['r','b','g','y'].map(color=>({color,size:'small'}));const level={schemaVersion:1,id:'DRAGQ',name:'拖动',grid:['rrggbb..................'],ammo};
 const h=harness({'bp_editor_levels':JSON.stringify({DRAGQ:level})},'#/ammo-editor.html?levelId=DRAGQ');await h.tick();
 const rows=()=>h.ids.get('bb-queue-list').children;await rows()[0].children[0].click();await rows()[2].children[0].click();
 const handle=rows()[0].children[2];await handle.dispatch('pointerdown',{button:0,pointerId:5,clientY:0});await handle.dispatch('pointermove',{pointerId:5,clientY:1000});await handle.dispatch('pointerup',{pointerId:5,clientY:1000});
 assert.deepEqual([...rows()].map(r=>r.children[3].value),['b','y','r','g']);await h.ids.get('bb-undo').click();assert.deepEqual([...rows()].map(r=>r.children[3].value),['r','b','g','y']);
});

test('Color pairs: select by Pair ID, validate, save, move and undo metadata',async()=>{
 const h=harness();await h.tick();await h.newLevel('PAIRED');
 await h.drag(2,5,2,5);await h.ids.get('bb-colors').children.find(b=>b.dataset.color==='g').click();await h.drag(5,5,5,5);
 async function select(c,r){const p=h.point(c,r),canvas=h.ids.get('bb-canvas');await canvas.dispatch('pointerdown',{...p,clientX:p.clientX-8,clientY:p.clientY-8});await canvas.dispatch('pointermove',{...p,clientX:p.clientX+8,clientY:p.clientY+8});await canvas.dispatch('pointerup',{...p,clientX:p.clientX+8,clientY:p.clientY+8});await h.tick()}
 await h.key('v');h.ids.get('bb-pair-id').value='Pair_01';await select(2,5);await h.ids.get('bb-pair-add').click();
 assert.ok(h.ids.get('bb-issues').textContent.includes('变色球必须成对配置'));assert.equal(h.ids.get('bb-save').disabled,true);
 await select(5,5);await h.ids.get('bb-pair-add').click();assert.equal(h.ids.get('bb-save').disabled,false);
 await h.ids.get('bb-save').click();let saved=JSON.parse(h.data.get('bp_editor_levels')).PAIRED;
 assert.deepEqual([...saved.colorPairs].map(p=>[p.id,p.c,p.r]),[['Pair_01',2,5],['Pair_01',5,5]]);
 await h.ids.get('bb-undo').click();assert.ok(h.ids.get('bb-issues').textContent.includes('变色球必须成对配置'));
 await h.ids.get('bb-redo').click();assert.equal(h.ids.get('bb-save').disabled,false);
 await h.drag(5,5,6,5);await h.ids.get('bb-save').click();saved=JSON.parse(h.data.get('bp_editor_levels')).PAIRED;
 assert.deepEqual([...saved.colorPairs].map(p=>[p.c,p.r]),[[2,5],[6,5]]);
 await h.ids.get('bb-undo').click();await h.ids.get('bb-save').click();saved=JSON.parse(h.data.get('bp_editor_levels')).PAIRED;
 assert.deepEqual([...saved.colorPairs].map(p=>[p.c,p.r]),[[2,5],[5,5]]);
});

test('Point selection adds distant balls, toggles a selected ball, clears on empty space and builds a pair',async()=>{
 const h=harness();await h.tick();await h.newLevel('POINTS');
 await h.drag(2,5,2,5);await h.ids.get('bb-colors').children.find(b=>b.dataset.color==='g').click();await h.drag(18,10,18,10);
 await h.key('v');await h.drag(2,5,2,5);await h.drag(18,10,18,10);
 assert.equal(h.ids.get('bb-selection').textContent,'已选 2 格 · 2 个泡泡');
 await h.drag(2,5,2,5);assert.equal(h.ids.get('bb-selection').textContent,'已选 1 格 · 1 个泡泡');
 await h.drag(2,5,2,5);assert.equal(h.ids.get('bb-selection').textContent,'已选 2 格 · 2 个泡泡');
 await h.ids.get('bb-pair-add').click();await h.ids.get('bb-save').click();
 const members=JSON.parse(h.data.get('bp_editor_levels')).POINTS.colorPairs;
 assert.deepEqual([...members].map(m=>[m.c,m.r]).sort((a,b)=>a[0]-b[0]),[[2,5],[18,10]]);
 await h.drag(12,15,12,15);assert.equal(h.ids.get('bb-selection').textContent,'尚未框选');
});

test('Blank edition opens an empty unsaved starter and lets the player create the first level',async()=>{
 const h=harness({},'#/editor.html',{blankLevels:true});await h.tick();
 assert.equal(h.ids.get('bb-id').value,'L001');assert.equal(h.ids.get('bb-total').textContent,'0');
 assert.ok(h.ids.get('bb-state').textContent.startsWith('Clean'));
 await h.newLevel('FIRST');assert.equal(h.ids.get('bb-id').value,'FIRST');
 await h.drag(3,5,3,5);await h.ids.get('bb-save').click();
 const all=JSON.parse(h.data.get('bp_editor_levels'));assert.deepEqual(Object.keys(all),['FIRST']);
});

test('Selected ordinary balls convert to hidden without losing individual colors, with a clear selection ring',async()=>{
 const h=harness({},'#/editor.html',{blankLevels:true});await h.tick();await h.newLevel('TYPE_SWITCH');
 await h.drag(2,5,2,5);await h.ids.get('bb-colors').children.find(b=>b.dataset.color==='b').click();await h.drag(16,10,16,10);
 await h.key('v');await h.drag(2,5,2,5);h.drawCalls.length=0;await h.drag(16,10,16,10);
 assert.equal(h.ids.get('bb-selection').textContent,'已选 2 格 · 2 个泡泡');
 assert.ok(h.drawCalls.filter(call=>call[0]==='arc'&&call[3]===16.2).length>=2);
 await h.ids.get('bb-bubble-hidden').click();assert.equal(h.ids.get('bb-hidden-count').textContent,'2');
 await h.ids.get('bb-save').click();let grid=JSON.parse(h.data.get('bp_editor_levels')).TYPE_SWITCH.grid;
 assert.equal(grid[5][2],'R');assert.equal(grid[10][16],'B');
 await h.ids.get('bb-undo').click();assert.equal(h.ids.get('bb-hidden-count').textContent,'0');
 await h.ids.get('bb-redo').click();assert.equal(h.ids.get('bb-hidden-count').textContent,'2');
 await h.ids.get('bb-bubble-normal').click();assert.equal(h.ids.get('bb-hidden-count').textContent,'0');
 await h.ids.get('bb-save').click();grid=JSON.parse(h.data.get('bp_editor_levels')).TYPE_SWITCH.grid;
 assert.equal(grid[5][2],'r');assert.equal(grid[10][16],'b');
});

test('Level info omits the name field while new-level names remain in saved data',async()=>{
 const h=harness({},'#/editor.html',{blankLevels:true});await h.tick();
 assert.equal(h.ids.has('bb-name'),false);
 await h.newLevel('NO_NAME_FIELD');await h.drag(3,5,3,5);await h.ids.get('bb-save').click();
 assert.equal(JSON.parse(h.data.get('bp_editor_levels')).NO_NAME_FIELD.name,'测试关卡');
});
