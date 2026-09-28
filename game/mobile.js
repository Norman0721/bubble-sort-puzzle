/* Touch-first presentation. Game coordinates/physics stay shared with desktop. */
(function(){
  const mobile=()=>!!window.matchMedia?.('(pointer: coarse)').matches;
  function scale(scene){
    const rect=window.__bp?.canvas?.getBoundingClientRect?.();
    const width=rect?.width||window.innerWidth||672,height=rect?.height||window.innerHeight||1080;
    return Math.max(.2,Math.min(width/672,height/1080));
  }
  const slop=scene=>10/scale(scene);
  const stop=event=>event?.stopPropagation();
  function button(scene,label,x,y,width,action,{primary=false,depth=40,scroll=false,height:fixedHeight,labelDy=0}={}){
    const height=fixedHeight??Math.max(104,Math.ceil(48/scale(scene)));
    const bg=scene.add.rectangle(x,y,width,height,primary?0x2c5a3f:0x252c42,.98).setStrokeStyle(2,primary?0x3d7a55:0x566089).setDepth(depth).setInteractive({useHandCursor:true});
    const txt=scene.add.text(x,y+labelDy,label,{fontSize:width<160?'28px':'30px',color:primary?'#dff5e5':'#c6cbe8'}).setOrigin(.5).setDepth(depth+1);
    let pending=null;
    const reset=()=>{pending=null;bg.setScale(1)};
    bg.on('pointerdown',(pointer,a,b,event)=>{if(!scroll)stop(event);if(pending)return;pending={id:pointer.id,x:pointer.x,y:pointer.y};bg.setScale(.98)});
    const move=pointer=>{if(pending&&pending.id===pointer.id&&Math.hypot(pointer.x-pending.x,pointer.y-pending.y)>slop(scene))reset()};
    const release=(pointer,a,b,event)=>{
      stop(event);const tap=pending;if(!tap||tap.id!==pointer.id)return;reset();
      const screenY=y-(scroll?scene.cameras.main.scrollY:0);
      if(Math.hypot(pointer.x-tap.x,pointer.y-tap.y)>slop(scene)||Math.abs(pointer.x-x)>width/2||Math.abs(pointer.y-screenY)>height/2)return;
      action();
    };
    bg.on('pointerup',release);scene.input.on('pointermove',move);scene.input.on('pointerup',reset);scene.input.on('pointerupoutside',reset);
    if(!scene.touchTapResets){
      scene.touchTapResets=new Set();const cancel=()=>{for(const fn of scene.touchTapResets)fn()};
      const hidden=()=>{if(window.document?.hidden)cancel()};
      for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.addEventListener?.(event,cancel);
      window.document?.addEventListener?.('visibilitychange',hidden);
      scene.events?.once('shutdown',()=>{
        for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.removeEventListener?.(event,cancel);
        window.document?.removeEventListener?.('visibilitychange',hidden);scene.touchTapResets=null;
      });
    }
    scene.touchTapResets.add(reset);
    const dispose=()=>{
      scene.input.off('pointermove',move);scene.input.off('pointerup',reset);scene.input.off('pointerupoutside',reset);
      scene.touchTapResets?.delete(reset);
      scene.events?.off('shutdown',dispose);
    };
    bg.once('destroy',dispose);scene.events?.once('shutdown',dispose);
    return {bg,txt,height,width,x,y};
  }
  function scrim(scene,depth){
    const bg=scene.add.rectangle(336,540,672,1080,0,.82).setDepth(depth).setInteractive();
    for(const event of ['pointerdown','pointerup'])bg.on(event,(p,x,y,e)=>stop(e));return bg;
  }
  function closeDialog(scene){
    const dialog=scene.touchDialog;if(!dialog)return;
    scene.touchDialog=null;scene.time.timeScale=dialog.clockScale;scene.tweens.timeScale=dialog.tweenScale;
    const elapsed=scene.time.now-dialog.startedAt;
    for(const key of ['resolveAt','scrollAt','lastFireAt'])if(scene[key]>0)scene[key]+=elapsed;
    for(const object of dialog.objects)object.destroy();
  }
  function confirm(scene,title,label,action){
    if(scene.touchDialog)return;
    scene.aimGesture=null;scene.touchAiming=false;scene.touchAimCancelled=false;scene.touchCancelGlyph?.setVisible(false);
    const objects=[scrim(scene,300),scene.add.text(336,460,title,{fontSize:'32px',color:'#fff',align:'center'}).setOrigin(.5).setDepth(301)];
    scene.touchDialog={objects,clockScale:scene.time.timeScale??1,tweenScale:scene.tweens.timeScale??1,startedAt:scene.time.now};
    scene.time.timeScale=0;scene.tweens.timeScale=0;
    for(const [text,y,fn,primary] of [[label,620,()=>{closeDialog(scene);action()},true],['取消',758,()=>closeDialog(scene),false]]){
      const b=button(scene,text,336,y,400,fn,{primary,depth:301});objects.push(b.bg,b.txt);
    }
  }
  function leave(scene,title,label,action){if(scene.shotsFired>0||['fly','resolve','scrolling'].includes(scene.state))confirm(scene,title,label,action);else action()}
  function configure(scene){
    if(scene.mobileControls)return;scene.mobileControls=true;scene.touchAimCancelled=false;
    const xs=[334,410,486,562,638];
    for(const object of [...scene.children.list])if(object.y===48&&xs.includes(object.x))object.destroy();
    const actions=[
      ['撤销3',()=>scene.undoShot()],
      [Tt()?'静音':'声音',()=>{wt(!Tt());scene.touchSoundButton.txt.setText(Tt()?'静音':'声音')}],
      [scene.isCustom?'返回':'主页',()=>leave(scene,'离开当前关卡？',scene.isCustom?'返回编辑器':'返回首页',()=>scene.isCustom?window.BPStudio.returnFromTrial():scene.scene.start('title'))],
      [scene.isCustom?'编辑器':'关卡',()=>leave(scene,'离开当前关卡？',scene.isCustom?'返回编辑器':'选择关卡',()=>scene.isCustom?window.BPStudio.returnFromTrial():scene.scene.start('levelSelect'))],
      ['重开',()=>confirm(scene,'重新开始这一关？','重新开始',()=>scene.scene.restart())]
    ];
    const width=Math.max(104,Math.ceil(48/scale(scene))),first=width/2+12,last=672-first;
    scene.touchHeaderButtons=actions.map(([label,fn],i)=>button(scene,label,first+(last-first)*i/4,136,width,fn));
    scene.undoBtn=scene.touchHeaderButtons[0];scene.touchSoundButton=scene.touchHeaderButtons[1];
    const heading=scene.children.list.find(o=>o.y===6&&o.x===8&&typeof o.text==='string'&&(o.text==='试玩'||o.text.startsWith('第 ')));
    heading?.setPosition(336,40).setOrigin(.5).setFontSize(30);
    scene.touchCancelGlyph=scene.add.text(scene.shooterX,Z.y-60,'×',{fontSize:'44px',color:'#e79797'}).setOrigin(.5).setDepth(30).setVisible(false);
    scene.refreshUndoBtn();
  }
  function createSelect(scene){
    const levels=gt(),unlocked=Ut(),perfect=Gt();let drag=null,navigating=false;
    scene.contentH=Math.max(1080,160+Math.ceil(levels.length/2)*176+72);
    scene.cameras.main.setBackgroundColor(0x1a1c2c).setBounds(0,0,672,scene.contentH);
    scene.add.text(336,42,'选择关卡',{fontSize:'38px',color:'#fff'}).setOrigin(.5).setScrollFactor(0).setDepth(50);
    const back=button(scene,'返回',70,54,104,()=>{if(!navigating){navigating=true;scene.scene.start('title')}},{depth:50});
    back.bg.setScrollFactor(0);back.txt.setScrollFactor(0);
    scene.input.on('pointerdown',p=>{if(p.wasTouch&&!drag)drag={id:p.id,y:p.y+scene.cameras.main.scrollY}});
    scene.input.on('pointermove',p=>{if(drag&&p.id===drag.id&&p.isDown)scene.cameras.main.scrollY=Y.Math.Clamp(drag.y-p.y,0,scene.contentH-1080)});
    scene.input.on('pointerup',()=>{drag=null});scene.input.on('pointerupoutside',()=>{drag=null});
    scene.input.on('wheel',(p,o,x,y)=>{scene.cameras.main.scrollY=Y.Math.Clamp(scene.cameras.main.scrollY+y*.5,0,scene.contentH-1080)});
    for(let i=0;i<levels.length;i++){
      const x=i%2?496:176,y=188+Math.floor(i/2)*176,locked=i>unlocked;
      const b=button(scene,`${i+1}${locked?'  🔒':perfect.includes(i)?'  ★':''}`,x,y,288,()=>{
        if(locked||navigating)return;navigating=true;scene.pick(i);
      },{depth:5,scroll:true,height:144,labelDy:-34});
      // Number occupies the top of the card; the card hit area spans all content.
      b.txt.setFontSize(32);
      if(locked){b.bg.disableInteractive().setAlpha(.5);b.txt.setAlpha(.5)}
      scene.add.text(x,y+6,levels[i].name,{fontSize:'28px',color:locked?'#626a8c':'#c6cbe8',wordWrap:{width:260}}).setOrigin(.5).setDepth(6);
      const rows=levels[i].grid.slice(0,16),cols=levels[i].grid[0].length;
      const pitch=Math.min(9,224/(cols+.5),44/(rows.length*Math.sqrt(3)/2+.4));
      const left=x-(cols+.5)*pitch/2,top=y+48-(rows.length-1)*pitch*Math.sqrt(3)/4;
      for(let r=0;r<rows.length;r++)for(let c=0;c<cols;c++)if(Q[rows[r][c]]!==undefined){
        scene.add.circle(left+(c+.5+(r&1)*.5)*pitch,top+r*pitch*Math.sqrt(3)/2,pitch*.46,Q[rows[r][c]]).setDepth(6);
      }
    }
    const cancel=()=>{drag=null};for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.addEventListener?.(event,cancel);
    const hidden=()=>{if(window.document?.hidden)cancel()};window.document?.addEventListener?.('visibilitychange',hidden);
    scene.events?.once('shutdown',()=>{for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.removeEventListener?.(event,cancel);window.document?.removeEventListener?.('visibilitychange',hidden)});
  }
  function showResult(scene,won){
    for(const object of scene.resultObjects||[])object.destroy();const objects=[];
    const last=scene.levelIndex>=gt().length-1,perfect=won&&scene.wasteTotal===0&&scene.shotsHit===scene.shotsFired;
    objects.push(scrim(scene,200));
    objects.push(scene.add.text(336,400,won?(last&&!scene.isCustom?'全部关卡完成':'关卡完成'):'弹药耗尽',{fontSize:'42px',color:'#fff'}).setOrigin(.5).setDepth(201));
    if(perfect)objects.push(scene.add.text(336,465,'★ 完美 ★',{fontSize:'30px',color:'#ffd54a'}).setOrigin(.5).setDepth(201));
    else objects.push(scene.add.text(336,465,`用弹 ${scene.shotsFired}/${scene.level.queue.length} · 命中 ${scene.shotsFired?Math.round(scene.shotsHit/scene.shotsFired*100):0}%`,{fontSize:'26px',color:'#9ba6c6'}).setOrigin(.5).setDepth(201));
    const label=scene.isCustom&&won?'返回编辑器':won?(last?'从第1关开始':'下一关'):'重新挑战';
    const primary=()=>{
      if(scene.resultActionPending)return;scene.resultActionPending=true;
      if(scene.isCustom&&won){window.BPStudio.returnFromTrial();return}
      if(won)scene.registry.set('levelIndex',last?0:scene.levelIndex+1);scene.scene.restart();
    };
    const add=(label,y,fn,isPrimary)=>{const b=button(scene,label,336,y,400,fn,{primary:isPrimary,depth:201});objects.push(b.bg,b.txt)};
    add(label,620,primary,true);
    if(!won&&scene.undoLeft>0&&scene.snapshots.length)add(`撤销上一发（剩 ${scene.undoLeft} 次）`,758,()=>scene.undoShot(),false);
    add(scene.isCustom?'返回编辑器':'返回首页',896,()=>{if(scene.resultActionPending)return;scene.resultActionPending=true;scene.isCustom?window.BPStudio.returnFromTrial():scene.scene.start('title')},false);
    scene.resultObjects=objects;
  }
  window.BPGameTouch={isMobile:mobile,scale,slop,button,configure,createSelect,showResult,confirm,closeDialog,
    isAimArea:(scene,p)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=672&&p.y>=(scene.mobileControls?194:110)&&p.y<=Z.y-70,
    updateCancel(scene,p){scene.touchAimCancelled=!this.isAimArea(scene,p);scene.touchCancelGlyph?.setPosition(scene.shooterX,Z.y-60).setVisible(scene.touchAimCancelled)},
  };
})();

/* Keep transient gameplay feedback readable after phone FIT scaling. */
(function(){
  for(const [method,size] of [['showTutorial',26],['showRuleToast',30],['floatText',28]]){
    const original=Xt.prototype[method];if(typeof original!=='function')continue;
    Xt.prototype[method]=function(...args){
      const before=this.mobileControls?new Set(this.children.list):null;const result=original.apply(this,args);
      if(before)for(const object of this.children.list)if(!before.has(object)&&typeof object.text==='string'){
        object.setStyle({fontSize:`${size}px`,wordWrap:{width:520,useAdvancedWrap:true}});
        if(Number.isFinite(object.width))object.x=Y.Math.Clamp(object.x,object.width/2+12,660-object.width/2);
      }
      return result;
    };
  }
})();
