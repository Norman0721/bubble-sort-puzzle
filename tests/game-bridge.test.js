const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../Bubble Sort Staggered.html'),'utf8');
function boot(level){
 const objects=[];
 function shape(type,args){const o={type,args,x:args[0]||0,y:args[1]||0,data:{},events:{}};const p=new Proxy(o,{get:(o,k)=>{
  if(k in o)return o[k];return (...args)=>{if(k==='setPosition'){o.x=args[0];o.y=args[1]}if(k==='setData')o.data[args[0]]=args[1];if(k==='getData')return o.data[args[0]];if(k==='on')o.events[args[0]]=args[1];if(k==='add')o.contents=args[0];return p}
 }});objects.push(p);return p}
 class Scene {constructor(){this.add=new Proxy({},{get:(o,type)=>(...args)=>shape(type,args)});this.registry={get:()=>0,set(){}};
  this.time={now:1000,delayedCall(){}};this.tweens={add(){},killTweensOf(){}};this.cameras={main:shape('camera',[])};
  this.input={events:{},on(k,f){this.events[k]=f},removeAllListeners(k){delete this.events[k]},keyboard:{on(){},removeAllListeners(){}}};this.scene={restart(){},start(){}};this.children={list:objects};}
 }
 const data=new Map([['bp_custom_level',JSON.stringify(level)]]);
 const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let returns=0;const window={BPStudio:{returnFromTrial(){returns++}}};
 const Y={Scene,Math:{Clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),Linear:(a,b,t)=>a+(b-a)*t,Distance:{Between:(a,b,c,d)=>Math.hypot(c-a,d-b)}}};
 const box={Y,window,localStorage,location:{search:''},URLSearchParams,console};
 const source=html.slice(html.indexOf('var Y=r.Ay,re='),html.indexOf('var $t=class extends Y.Scene')).replace('var Y=r.Ay,re=','var re=');
 vm.runInNewContext(source+';this.GameScene=Xt;this.core=BB;',box);
 const game=new box.GameScene();game.create();return {game,objects,core:box.core,returned:()=>returns};
}
test('actual game create consumes editor LevelData, shared first-screen window, color-only bubbles, continuous aim and return',()=>{
 const level={schemaVersion:1,id:'L001',name:'编辑器桥接',note:'',grid:Array(40).fill('.'.repeat(18)),ammo:[{color:'r',size:'small'}]};level.grid[35]='...rrrr...........';const h=boot(level);
 assert.ok(h.game.isCustom);assert.equal(h.game.grid.viewTop,6);assert.equal(h.game.grid.visRows,30);assert.equal(h.game.bubbles.size,4);assert.equal(h.game.grid.offsetX,(672-18.5*27)/2);
 const text=h.objects.filter(o=>o.type==='text');assert.ok(text.some(o=>o.args[2]==='试玩'));assert.ok(!text.some(o=>o.args[2].includes('编辑器桥接')));assert.ok(!text.some(o=>o.args[0]===8&&o.args[1]===36));assert.ok(!text.some(o=>o.args[2]==='红'));
 for(const obj of h.game.bubbles.values()){const child=Array.isArray(obj.contents)?obj.contents:[obj.contents];assert.equal(child.length,1);assert.equal(child[0].type,'circle')}
 h.game.updateAimFromPointer({x:h.game.shooterX+500*Math.cos(-90.1*Math.PI/180),y:1010+500*Math.sin(-90.1*Math.PI/180)});assert.ok(Math.abs(h.game.aimTargetAngle*180/Math.PI+90.1)<1e-8);
 const returnButton=h.objects.find(o=>o.type==='rectangle'&&o.args[0]===562&&o.args[1]===48);returnButton.events.pointerdown({},0,0,{stopPropagation(){}});assert.equal(h.returned(),1);
 h.game.endLevel(true);const overlay=h.objects.find(o=>o.type==='rectangle'&&o.args[2]===672&&o.args[3]===1080);overlay.events.pointerdown();assert.equal(h.returned(),2);
});
test('actual game scrolling moves vertically only, retaining absolute row parity and editor reveal order',()=>{
 const level={schemaVersion:1,id:'L002',name:'长地图',grid:Array(40).fill('.'.repeat(24)),ammo:[{color:'r',size:'large'}]};level.grid[5]='...rrrr.................';level.grid[35]='...rrrr.................';const h=boot(level),game=h.game;
 assert.equal(game.grid.viewTop,6);const before=game.viewCellCenter(3,6);for(let c=3;c<=6;c++)game.grid.set(c,35,null);assert.ok(game.scrollIfNeeded());assert.equal(game.grid.viewTop,0);const after=game.viewCellCenter(3,6);assert.equal(before.x,after.x);assert.ok(Math.abs(after.y-before.y-6*h.core.rowStep)<1e-9);
 assert.ok([...game.bubbles.keys()].some(k=>k==='3,5'));
});
