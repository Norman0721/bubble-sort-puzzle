/* Homepage state and navigation model, independent of rendering and storage transport. */
(function(root){
  'use strict';
  function createHomeCore(config){
    const keys=Object.keys(config.colors),sizes=Object.keys(config.capacity);
    const PROGRESS='bp_progress',RECENT='bp_recent_level',PERFECT='bp_perfect';
    function isPlayable(level){
      if(!level||!Array.isArray(level.grid)||!level.grid.length||level.grid.length>200)return false;
      const cols=level.grid[0]?.length;if(!Number.isInteger(cols)||cols<6||cols>24)return false;
      if(!level.grid.every(row=>typeof row==='string'&&row.length===cols&&/^[.rbgypcomRBGYPCOM]+$/.test(row))||!level.grid.some(row=>/[rbgypcom]/i.test(row)))return false;
      return Array.isArray(level.ammo)&&level.ammo.length>0&&level.ammo.every(a=>a&&keys.includes(a.color)&&sizes.includes(a.size)&&(a.type==null||a.type===''||a.type==='bounce'));
    }
    const filterLevels=levels=>Array.isArray(levels)?levels.filter(isPlayable):[];
    function readIndex(raw){
      if(raw===null||raw===undefined||raw==='')return null;
      const value=JSON.parse(raw);
      if(!Number.isInteger(value)||value<0)throw Error('关卡进度必须是非负整数。');return value;
    }
    function derive({levels,storage,isDevBuild=false,inputMode='keyboardPointer',onError=()=>{}}){
      const errors=[];function report(type,error,recoverable){const item={type,message:error.message,recoverable};errors.push(item);try{onError(item)}catch{}}
      let playable=[];
      try{const loaded=typeof levels==='function'?levels():levels;if(!Array.isArray(loaded))throw Error('关卡列表不是数组。');playable=filterLevels(loaded)}catch(error){report('levels',error,false)}
      const total=playable.length,base={state:'S4',levels:playable,levelCount:total,continueLevelIndex:0,hasProgress:false,perfectCount:0,perfectVisible:false,isDevBuild:!!isDevBuild,inputMode,errors,primaryLabel:'暂无可用关卡',enabled:false};
      if(!total){
        if(config.blankLevels&&!errors.length)return {...base,state:'S0',enabled:true,primaryLabel:'创建／编辑关卡'};
        if(!errors.length)report('levels',Error('没有有效可玩关卡。'),false);return base;
      }
      let unlocked=null,recent=null,perfect=[],damaged=false;
      try{
        unlocked=readIndex(storage.getItem(PROGRESS));recent=readIndex(storage.getItem(RECENT));
        const raw=storage.getItem(PERFECT);if(raw){const values=JSON.parse(raw);if(!Array.isArray(values)||!values.every(v=>Number.isInteger(v)&&v>=0))throw Error('完美进度必须是非负整数数组。');perfect=[...new Set(values.filter(v=>v<total))]}
      }catch(error){damaged=true;unlocked=null;recent=null;perfect=[];report('progress',error,true)}
      const allPerfect=perfect.length===total,hasProgress=!damaged&&(unlocked!==null||recent!==null||perfect.length>0);
      const index=allPerfect?total-1:Math.max(0,Math.min(total-1,recent??unlocked??0));
      const state=damaged?'S5':allPerfect?'S3':hasProgress?'S2':'S1';
      return {...base,state,enabled:true,hasProgress,continueLevelIndex:index,perfectCount:perfect.length,perfectVisible:hasProgress&&perfect.length>0,
        primaryLabel:hasProgress?`继续 · 第 ${index+1} 关`:'开始游戏'};
    }
    function rememberRecent(storage,index){if(!Number.isInteger(index)||index<0)throw Error('最近关卡索引非法。');storage.setItem(RECENT,String(index))}
    function repairProgress(storage){storage.setItem(PROGRESS,'0');storage.setItem(RECENT,'0');storage.setItem(PERFECT,'[]')}
    function createGate({delay=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),onChange=()=>{}}={}){
      let locked=false,timer=null;
      function release(){if(timer!==null)cancel(timer);timer=null;locked=false;onChange(false)}
      function begin(){if(locked)return false;locked=true;onChange(true);timer=delay(release,2000);return true}
      return {begin,release,get locked(){return locked},dispose(){if(timer!==null)cancel(timer);timer=null;locked=false}};
    }
    function fit(width,height){return {scale:Math.min(width/672,height/1080),x:width/2,y:height/2,width:672,height:1080}}
    return {derive,isPlayable,filterLevels,readIndex,rememberRecent,repairProgress,createGate,fit,keys,progressKey:PROGRESS,recentKey:RECENT,perfectKey:PERFECT};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createHomeCore;else root.createBubbleHomeCore=createHomeCore;
})(typeof globalThis!=='undefined'?globalThis:this);
