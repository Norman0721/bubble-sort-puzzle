(function(){
  'use strict';
  const $=id=>document.getElementById(id),root=$('bb-home'),frame=$('bb-home-frame');
  const dev=BB_BUILD.isDevBuild,coarse=matchMedia('(pointer: coarse)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let scene=null,active=false,route=dev&&(location.hash.startsWith('#/editor')||location.hash.startsWith('#/ammo-editor'))?'editor':'game',model=null,cleanup=[],generation=0,inputMode=coarse.matches?'touch':'keyboardPointer',navError=null;
  const buttons=[$('bh-primary'),$('bh-levels')];
  if(dev){const b=document.createElement('button');b.id='bh-editor';b.type='button';b.className='bh-button';b.textContent='关卡编辑器';$('bh-editor-slot').append(b);buttons.push(b)}
  function emit(event,params={}){try{window.dispatchEvent(new CustomEvent('bubble-analytics',{detail:{event,params}}));window.BBAnalytics?.track?.(event,params)?.catch?.(error=>{if(dev)console.debug('首页统计回调失败',error)})}catch(error){if(dev)console.debug('首页统计回调失败',error)}}
  function log(error){emit('home_load_error',{...error,error_type:error.type});if(dev)console.debug('首页可恢复错误',error)}
  const gate=BH.createGate({onChange:()=>render()});
  function listen(target,name,fn,options){target.addEventListener(name,fn,options);cleanup.push(()=>target.removeEventListener(name,fn,options))}
  function sizing(){const rect=$('game')?.getBoundingClientRect?.(),width=rect?.width||window.innerWidth,height=rect?.height||window.innerHeight,fit=BH.fit(width,height);frame.style.left=`${(rect?.left||0)+width/2}px`;frame.style.top=`${(rect?.top||0)+height/2}px`;frame.style.transform=`translate(-50%, -50%) scale(${fit.scale})`;$('bh-rotate').hidden=window.innerWidth<=window.innerHeight}
  function render(){if(!active)return;const loading=!model;root.hidden=false;root.classList.add('bh-visible');root.classList.toggle('bh-reduced',motion.matches);$('bh-loading').hidden=!loading;
    $('bh-primary').textContent=model?.primaryLabel||'正在准备…';buttons.forEach((b,i)=>{b.disabled=loading||gate.locked||(i<2&&!model.enabled)||(i===1&&model?.levelCount===0);b.tabIndex=b.disabled?-1:0});
    $('bh-perfect').hidden=!model?.perfectVisible;$('bh-perfect').textContent=model?`★ ${model.perfectCount} / ${model.levelCount} 完美`:'';$('bh-perfect').classList.toggle('bh-all-perfect',model?.state==='S3');
    $('bh-error').hidden=loading||(model.enabled&&!navError);$('bh-error-text').textContent=navError||'关卡暂时无法读取，请重试。';$('bh-retry').disabled=gate.locked;
    const launch=$('bb-launch');if(launch)launch.style.display='none';
  }
  function refresh(){if(!active)return;model=BH.derive({levels:gt,storage:localStorage,isDevBuild:dev,inputMode,onError:log});render()}
  function detach(){generation++;for(const fn of cleanup.splice(0))fn();active=false;root.hidden=true;root.classList.remove('bh-visible');gate.release();buttons.forEach(b=>b.classList.remove('bh-pressed'))}
  function show(){if(!scene||route!=='game')return;if(active){refresh();return}active=true;model=null;const id=++generation;
    if(en.input?.keyboard)en.input.keyboard.enabled=false;
    const canvas=document.querySelector('#game canvas');if(canvas)canvas.setAttribute('tabindex','-1');$('game')?.setAttribute('aria-hidden','true');
    listen(window,'resize',sizing);listen(window,'storage',refresh);listen(window,'bubble-progress-change',refresh);listen(document,'visibilitychange',()=>{if(!document.hidden)refresh()});
    listen(window,'pointerdown',event=>{inputMode=event.pointerType==='touch'?'touch':'keyboardPointer';render()});listen(window,'keydown',()=>{inputMode='keyboardPointer';render()});
    listen(motion,'change',render);listen(coarse,'change',()=>{inputMode=coarse.matches?'touch':'keyboardPointer';render()});
    sizing();render();Promise.resolve().then(()=>{if(active&&id===generation){refresh();emit('home_view',{state:model.state,level_count:model.levelCount,perfect_count:model.perfectCount,build_type:dev?'development':'release'});}});
  }
  function unmount(owner){if(owner&&owner!==scene)return;detach();scene=null;if(en.input?.keyboard)en.input.keyboard.enabled=true;const canvas=document.querySelector('#game canvas');if(canvas)canvas.setAttribute('tabindex','0');$('game')?.setAttribute('aria-hidden','false');const launch=$('bb-launch');if(launch&&route==='game')launch.style.display='block'}
  function mount(owner){if(scene!==owner){if(scene)unmount(scene);scene=owner}show()}
  function fail(error){navError='进入失败，请重试。';gate.release();if(active){$('bh-error').hidden=false;$('bh-error-text').textContent='进入失败，请重试。'}log({type:'navigation',message:error.message,recoverable:true})}
  function navigate(kind){if(!active||!model||!model.enabled&&kind!=='editor'||!gate.begin())return;
    navError=null;const events={primary:'home_primary_click',levels:'home_level_select_click',editor:'home_editor_click'};emit(events[kind],{state:model.state,action:model.hasProgress?'continue':'start',target_level:model.continueLevelIndex+1,level_count:model.levelCount,input_mode:inputMode,build_version:BB_BUILD.version});
    try{if(kind==='editor'||kind==='primary'&&model.state==='S0'){if(!dev||!window.BPStudio)throw Error('编辑器不可用');window.BPStudio.open();return}
      if(kind==='primary'){if(model.state==='S5')try{BH.repairProgress(localStorage)}catch(error){log({type:'storage',message:error.message,recoverable:true})}try{localStorage.removeItem('bp_custom_level')}catch{}scene.registry.set('levelIndex',model.continueLevelIndex)}
      const manager=scene.scene,owner=scene;unmount(owner);try{manager.start(kind==='primary'?'game':'levelSelect')}catch(error){scene=owner;show();throw error}
    }catch(error){if(!scene){scene=window.__bp?.scene?.getScene?.('title');show()}fail(error)}
  }
  function bind(button,action){button.addEventListener('click',action);const press=()=>{if(!button.disabled){button.classList.remove('bh-released');button.classList.add('bh-pressed')}},release=()=>{button.classList.remove('bh-pressed');button.classList.add('bh-released')};button.addEventListener('pointerdown',press);button.addEventListener('pointerenter',()=>button.classList.remove('bh-released'));button.addEventListener('transitionend',()=>button.classList.remove('bh-released'));for(const name of ['pointerup','pointercancel','pointerleave','blur'])button.addEventListener(name,release);button.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')press()});button.addEventListener('keyup',release)}
  bind(buttons[0],()=>navigate('primary'));bind(buttons[1],()=>navigate('levels'));if(dev)bind(buttons[2],()=>navigate('editor'));bind($('bh-retry'),()=>{navError=null;refresh()});
  window.BPHome={get visible(){return active},mount,unmount,pause:owner=>{if(owner===scene)detach()},resume:owner=>{if(owner===scene)show()},refresh,setRoute(next){route=next;if(next==='game')show();else detach()},rememberLevel(index){try{BH.rememberRecent(localStorage,index)}catch(error){log({type:'storage',message:error.message,recoverable:true})}},progressChanged(){window.dispatchEvent(new CustomEvent('bubble-progress-change'))}};
})();
