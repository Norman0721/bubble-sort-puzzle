const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{EventEmitter}=require('node:events');
const root=path.join(__dirname,'../..');
function harness({level,index=0,debug=false,mobile=false,width=360,height=780,store={},sourceFile=path.join(root,'Bubble Sort Staggered.html')}={}){
 const objects=[],timers=[],tweens=[],warnings=[],errors=[],transitions=[];let game,returns=0,serial=0;
 function shape(type,args){const o={type,args,x:args[0]??0,y:args[1]??0,text:type==='text'?args[2]:undefined,scrollY:0,depth:0,visible:true,alpha:1,data:new Map(),events:new EventEmitter(),destroyed:false,scale:1};let proxy;
 proxy=new Proxy(o,{get:(obj,k)=>{if(k in obj)return obj[k];return (...a)=>{switch(k){
 case 'setPosition':obj.x=a[0];obj.y=a[1];break;case 'setOrigin':break;
 case 'setVisible':obj.visible=a[0];break;case 'setDepth':obj.depth=a[0];break;case 'setAlpha':obj.alpha=a[0];break;
 case 'setScale':obj.scale=a[0];break;case 'setAngle':obj.angle=a[0];break;case 'setRadius':obj.radius=a[0];break;
 case 'setText':obj.text=a[0];break;case 'setColor':obj.color=a[0];break;case 'setInteractive':obj.interactive=true;break;
 case 'disableInteractive':obj.interactive=false;break;
 case 'setData':obj.data.set(a[0],a[1]);break;case 'getData':return obj.data.get(a[0]);
 case 'listeners':return obj.events.listeners(...a);case 'removeAllListeners':obj.events.removeAllListeners(...a);break;case 'on':obj.events.on(...a);break;case 'once':obj.events.once(...a);break;case 'add':obj.contents=a[0];break;
 case 'destroy':obj.destroyed=true;obj.events.emit('destroy');obj.events.removeAllListeners();for(const tween of tweens)if(tween.config.targets===proxy)tween.canceled=true;break;
 }return proxy}}});objects.push(proxy);return proxy;
 }
 class Scene{constructor(key){this.sys={settings:{key}};this.events=new EventEmitter();this.events.setMaxListeners(0);this.add=new Proxy({},{get:(_,type)=>(...args)=>shape(type,args)});this.registry={get:()=>index,set:(_,v)=>index=v};
  this.time={timeScale:1,now:100,delayedCall:(delay,fn)=>{const timer={due:this.time.now+delay,fn,id:serial++,removed:false,remove(){this.removed=true}};timers.push(timer);return timer}};
  this.tweens={timeScale:1,add:config=>{const item={config,due:this.time.now+(config.delay||0)+(config.duration||0),canceled:false};tweens.push(item);return item},killTweensOf:target=>{for(const t of tweens)if(t.config.targets===target)t.canceled=true}};
  this.cameras={main:shape('camera',[])};this.input=new EventEmitter();this.input.setMaxListeners(0);this.input.keyboard=new EventEmitter();this.input.keyboard.addKey=()=>({isDown:false});
  this.scene={restart:()=>transitions.push('restart'),start:key=>transitions.push(key)};this.children={get list(){return objects.filter(o=>!o.destroyed)}};
 }}
 const data=new Map(Object.entries(store));if(level)data.set('bp_custom_level',JSON.stringify(level));
 const storage={get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const document=new EventEmitter();Object.assign(document,{hidden:false,addEventListener:(...a)=>document.on(...a),removeEventListener:(...a)=>document.off(...a)});
 const window=new EventEmitter();Object.assign(window,{document});Object.assign(window,{addEventListener:(...args)=>window.on(...args),removeEventListener:(...args)=>window.off(...args),dispatchEvent:e=>window.emit(e.type,e),innerWidth:width,innerHeight:height,matchMedia:()=>({matches:mobile}),BPStudio:{returnFromTrial:()=>returns++},BPHome:{rememberLevel:i=>storage.setItem('bp_recent_level',i),progressChanged(){}}});
 window.localStorage=storage;
 const Y={Scene,Math:{Clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),Linear:(a,b,t)=>a+(b-a)*t,Wrap:(v,a,b)=>((v-a)%(b-a)+(b-a))%(b-a)+a,Distance:{Between:(a,b,c,d)=>Math.hypot(c-a,d-b)}}};
 const box={Y,window,localStorage:storage,location:{search:debug?'?debug':''},URLSearchParams,console:{warn:(...a)=>warnings.push(a.join(' ')),error:(...a)=>errors.push(a.join(' '))},CustomEvent:class{constructor(type){this.type=type}}};
 const html=fs.readFileSync(sourceFile,'utf8'),source=html.slice(html.indexOf('var Y=r.Ay,re='),html.indexOf('var $t=class extends Y.Scene')).replace('var Y=r.Ay,re=','var re=');
 const shim=html.match(/\/\* BP blank storage shim \*\/[\s\S]*?(?=var Y=r\.Ay,re=)/)?.[0]||'';
 vm.runInNewContext(shim+source+';this.exports={Game:Xt,Select:Bt,Grid:re,Ammo:ce,trace:he,touch:pe,pop:ge,point:fe,settings:$,sizes:oe,levels:mt,config:BB_BUILD,listed:gt};',box);game=new box.exports.Game();game.create();
 function drain(){let steps=0,again=true;while(again){again=false;for(const timer of timers.filter(t=>!t.removed&&t.due<=game.time.now).sort((a,b)=>a.due-b.due||a.id-b.id)){timer.removed=true;timer.fn();again=true;if(++steps>10000)throw Error('timer loop')}
  for(const item of tweens.filter(t=>!t.canceled&&t.due<=game.time.now)){item.canceled=true;const c=item.config,target=c.targets;if(c.repeat===-1)continue;for(const k of ['x','y','alpha','scale'])if(typeof c[k]==='number')target[k]=c[k];c.onComplete?.();again=true}
 }}
 function step(ms=16,{runTimers=true}={}){game.time.now+=ms;if(game.time.timeScale===0)for(const t of timers)t.due+=ms;if(game.tweens.timeScale===0)for(const t of tweens)t.due+=ms;if(runTimers)drain();game.update(game.time.now,ms)}
 function settle(){for(let i=0;i<1800&&['fly','resolve','scrolling'].includes(game.state);i++)step();if(['fly','resolve','scrolling'].includes(game.state))throw Error('state did not settle');return game.state}
 function restart(nextIndex=index){index=nextIndex;game.events.emit('shutdown');game.input.removeAllListeners();game.input.keyboard.removeAllListeners();for(const t of timers)t.removed=true;for(const t of tweens)t.canceled=true;for(const obj of objects)obj.destroy();game.create()}
 function pointer(x,y,extra={}){return {x,y,id:0,wasTouch:false,isDown:true,button:0,...extra}}
 function down(p){game.input.emit('pointerdown',p)}function move(p){game.input.emit('pointermove',p)}function up(p){game.input.emit('pointerup',{...p,isDown:false})}
 function clickObject(obj,p=pointer(obj.x,obj.y)){let stopped=false;obj.events.emit('pointerdown',p,0,0,{stopPropagation(){stopped=true}});if(!stopped)down(p);return stopped}
 return {game,objects,timers,tweens,warnings,errors,transitions,storage,data,window,math:box.exports,step,settle,drain,restart,pointer,down,move,up,clickObject,get returned(){return returns},clearCustom:()=>storage.removeItem('bp_custom_level')};
}
module.exports=harness;
