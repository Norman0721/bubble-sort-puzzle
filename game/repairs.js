/* Gameplay corrections applied to the retained engine baseline when bundling. */
(function(){
  'use strict';
  const proto=Xt.prototype;
  const original={create:proto.create,doFire:proto.doFire,resolveHit:proto.resolveHit,afterShot:proto.afterShot,undoShot:proto.undoShot,endLevel:proto.endLevel,setShooterX:proto.setShooterX,update:proto.update,drawAim:proto.drawAim};
  function cancelGesture(scene){scene.aimGesture=null;scene.touchAiming=false;scene.touchAimCancelled=false;scene.touchCancelGlyph?.setVisible(false)}
  function clearResult(scene){for(const object of scene.resultObjects||[])object.destroy();scene.resultObjects=[];scene.resultActionPending=false}
  function playablePointer(pointer){return Number.isFinite(pointer.x)&&Number.isFinite(pointer.y)&&pointer.x>=0&&pointer.x<=672&&pointer.y>=110&&pointer.y<=1080}
  function installInput(scene){
    for(const event of ['pointerdown','pointermove','pointerup','pointerupoutside'])scene.input.removeAllListeners(event);
    scene.input.on('pointerdown',pointer=>{
      Ct();if(scene.state!=='aim'||scene.touchDialog||scene.aimGesture||!playablePointer(pointer)||pointer.button>0)return;
      if(pointer.wasTouch&&!scene.mobileControls)window.BPGameTouch?.configure(scene);
      if(scene.mobileControls&&pointer.y<194)return;
      const mode=$.launcherMode==='slide'&&pointer.y>Z.y-70?'move':'aim';
      scene.aimGesture={id:pointer.id,mode,startX:pointer.x,startShooter:scene.shooterX,relativeMove:pointer.wasTouch};scene.touchAiming=pointer.wasTouch&&mode==='aim';
      if(mode==='move'){if(!pointer.wasTouch)scene.setShooterX(pointer.x)}else scene.updateAimFromPointer(pointer);
    });
    scene.input.on('pointermove',pointer=>{
      if(scene.state!=='aim'||scene.touchDialog)return;
      const gesture=scene.aimGesture;
      if(gesture){if(gesture.id!==pointer.id)return;if(gesture.mode==='move')scene.setShooterX(gesture.relativeMove?gesture.startShooter+pointer.x-gesture.startX:pointer.x);else{if(scene.mobileControls)window.BPGameTouch.updateCancel(scene,pointer);if(playablePointer(pointer))scene.updateAimFromPointer(pointer)}return}
      if(!pointer.wasTouch&&playablePointer(pointer)&&pointer.y<=Z.y-70)scene.updateAimFromPointer(pointer);
    });
    scene.input.on('pointerup',pointer=>{
      const gesture=scene.aimGesture;if(!gesture||gesture.id!==pointer.id)return;cancelGesture(scene);
      if(scene.state!=='aim'||scene.touchDialog||gesture.mode!=='aim'||!playablePointer(pointer)||pointer.y>Z.y-70||(scene.mobileControls&&pointer.y<194))return;
      scene.updateAimFromPointer(pointer);scene.aimAngle=scene.aimTargetAngle;scene.fire();
    });
    scene.input.on('pointerupoutside',pointer=>{if(!pointer||scene.aimGesture?.id===pointer.id)cancelGesture(scene)});
    const keyboard=scene.input.keyboard;
    if(keyboard){
      for(const event of ['keydown-SPACE','keydown-ENTER','keydown-LEFT','keydown-RIGHT'])keyboard.removeAllListeners(event);
      for(const event of ['keydown-SPACE','keydown-ENTER'])keyboard.on(event,eventObject=>{if(!eventObject?.repeat)scene.fire()});
      keyboard.on('keydown-LEFT',()=>scene.nudgeShooter(-24));keyboard.on('keydown-RIGHT',()=>scene.nudgeShooter(24));
    }
    const cancel=()=>cancelGesture(scene);
    const hidden=()=>{if(window.document?.hidden)cancel()};
    for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.addEventListener?.(event,cancel);
    window.document?.addEventListener?.('visibilitychange',hidden);
    scene.events?.once('shutdown',()=>{window.BPGameTouch?.closeDialog(scene);for(const event of ['blur','pointercancel','touchcancel','orientationchange'])window.removeEventListener?.(event,cancel);window.document?.removeEventListener?.('visibilitychange',hidden);cancelGesture(scene);scene.resultObjects=[]});
  }
  proto.create=function(){
    let custom=null;
    try{const raw=localStorage.getItem('bp_custom_level');if(raw&&BB_BUILD.isDevBuild){custom=JSON.parse(raw);if(!BH.isPlayable(custom))throw Error('Invalid trial level')}}
    catch(error){custom=null;try{localStorage.removeItem('bp_custom_level')}catch{}console.warn('[game] Invalid trial data; using regular levels',error)}
    const levels=gt(),requested=this.registry.get('levelIndex');
    if(!levels.length&&!custom){this.scene.start('title');return}
    this.registry.set('levelIndex',Number.isInteger(requested)?Math.max(0,Math.min(levels.length-1,requested)):0);
    this.mobileControls=false;this.touchDialog=null;this.touchHeaderButtons=null;
    this.shooterX=Z.x;this.aimAngle=this.aimTargetAngle=-Math.PI/2;cancelGesture(this);
    this.shotSerial=(this.shotSerial||0)+1;this.settledShotSerial=-1;this.resultObjects=[];this.resultActionPending=false;
    this.resolveAt=this.scrollAt=0;
    original.create.call(this);installInput(this);if(window.BPGameTouch?.isMobile())window.BPGameTouch.configure(this);this.setShooterX(this.shooterX);this.refreshUndoBtn();
  };
  proto.setShooterX=function(x){
    if(!Number.isFinite(x))return;original.setShooterX.call(this,x);
    this.currentAmmoRing?.setPosition(this.shooterX,Z.y);
    const ammo=this.level.current();if(ammo)this.bounceBadge?.setPosition(this.shooterX+oe[ammo.size].r+12,Z.y-oe[ammo.size].r-6);
    if(this.state==='aim')this.drawAim();
  };
  proto.doFire=function(x,y,angle){
    if(this.state!=='aim'||this.touchDialog||this.level.exhausted||![x,y,angle].every(Number.isFinite))return;
    const extra={combo:this.combo,bestCombo:this.bestCombo,shooterX:this.shooterX,aimAngle:this.aimAngle,aimTargetAngle:this.aimTargetAngle};
    cancelGesture(this);this.shotSerial++;original.doFire.call(this,x,y,angle);
    Object.assign(this.snapshots[this.snapshots.length-1],extra);this.refreshUndoBtn();
  };
  proto.resolveHit=function(){
    if(this.state!=='fly'||!this.projectile)return;
    const serial=this.shotSerial,run=this.runId,clock=this.time,delayed=clock.delayedCall;
    // A watchdog may complete a shot before its scheduled callback. Bind callbacks
    // to this shot so they cannot consume the next shot or recreate its result.
    clock.delayedCall=(delay,callback,...rest)=>delayed.call(clock,delay,(...args)=>{
      if(this.shotSerial===serial&&this.runId===run)callback(...args);
    },...rest);
    try{original.resolveHit.call(this)}finally{clock.delayedCall=delayed}
  };
  proto.afterShot=function(){
    if(this.state!=='resolve'||this.settledShotSerial===this.shotSerial)return;
    this.settledShotSerial=this.shotSerial;original.afterShot.call(this);this.refreshUndoBtn();
  };
  proto.refreshUndoBtn=function(){
    if(!this.undoBtn)return;const canUndo=(this.state==='aim'||this.state==='end')&&this.undoLeft>0&&this.snapshots.length>0;
    this.undoBtn.txt.setText(`撤销${this.undoLeft}`).setColor(canUndo?'#c6cbe8':'#565f89');
    if(canUndo)this.undoBtn.bg.setInteractive({useHandCursor:true});else this.undoBtn.bg.disableInteractive();
  };
  proto.undoShot=function(){
    if(!['aim','end'].includes(this.state)||this.undoLeft<=0||!this.snapshots.length)return;
    const snapshot=this.snapshots[this.snapshots.length-1];clearResult(this);cancelGesture(this);this.shotSerial++;
    original.undoShot.call(this);
    this.combo=snapshot.combo??0;this.bestCombo=snapshot.bestCombo??0;
    this.aimAngle=snapshot.aimAngle??-Math.PI/2;this.aimTargetAngle=snapshot.aimTargetAngle??this.aimAngle;
    this.resolveAt=this.scrollAt=0;this.setShooterX(snapshot.shooterX??Z.x);this.refreshAmmoUI();this.drawAim();
  };
  proto.endLevel=function(won){
    if(this.state==='end')return;
    const before=new Set(this.children.list);original.endLevel.call(this,won);
    this.resultObjects=this.children.list.filter(object=>!before.has(object));this.resultActionPending=false;
    if(this.mobileControls){window.BPGameTouch.showResult(this,won);this.refreshUndoBtn();return}
    for(const object of this.resultObjects){
      object.setDepth(200);
      const label=typeof object.text==='string'?object.text:(typeof object.args?.[2]==='string'?object.args[2]:'');
      const recovery=label.startsWith('回到第');if(recovery)object.setText(`撤销最后一发（剩 ${this.undoLeft} 次）`);
      const handlers=object.listeners('pointerdown');if(!Array.isArray(handlers)||!handlers.length)continue;
      object.removeAllListeners('pointerdown');object.on('pointerdown',(pointer,x,y,event)=>{
        event?.stopPropagation();if(this.resultActionPending)return;
        if(!recovery)this.resultActionPending=true;
        for(const handler of handlers)handler.call(object,pointer,x,y,event);
      });
    }
    this.refreshUndoBtn();
  };
  proto.update=function(time,dt){
    if(this.touchDialog)return;
    const projectile=this.projectile;original.update.call(this,time,dt);
    projectile?.getData('halo')?.setPosition(projectile.x,projectile.y);
  };
  proto.drawAim=function(){
    if(this.touchAimCancelled){this.aimGfx.clear();this.coachGfx?.clear();this.aimCountText?.setVisible(false);return}
    original.drawAim.call(this);
  };
})();

/* Touch scrolling in level selection must not open a card on finger-down. */
(function(){
  const original=Bt.prototype.create;
  Bt.prototype.create=function(){
    if(window.BPGameTouch?.isMobile()){window.BPGameTouch.createSelect(this);return}
    const before=new Set(this.children.list);original.call(this);let pending=null;
    for(const object of this.children.list.filter(item=>!before.has(item)&&item.y>=110)){
      const handlers=object.listeners('pointerdown');if(!Array.isArray(handlers)||!handlers.length)continue;
      object.removeAllListeners('pointerdown');object.on('pointerdown',(pointer,x,y,event)=>{
        if(!pointer.wasTouch){for(const handler of handlers)handler.call(object,pointer,x,y,event);return}
        if(!pending)pending={id:pointer.id,x:pointer.x,y:pointer.y,dragged:false,object,handlers,args:[pointer,x,y,event]};
      });
    }
    const slop=()=>window.BPGameTouch?.slop(this)||8;
    this.input.on('pointermove',pointer=>{if(pending&&pending.id===pointer.id&&Math.hypot(pointer.x-pending.x,pointer.y-pending.y)>slop())pending.dragged=true});
    this.input.on('pointerup',pointer=>{
      if(!pending||pending.id!==pointer.id)return;const tap=pending;pending=null;
      if(tap.dragged||Math.hypot(pointer.x-tap.x,pointer.y-tap.y)>slop()||pointer.x<0||pointer.x>672||pointer.y<0||pointer.y>1080)return;
      for(const handler of tap.handlers)handler.apply(tap.object,tap.args);
    });
    const cancel=()=>{pending=null};this.input.on('pointerupoutside',cancel);
    for(const event of ['blur','pointercancel','touchcancel'])window.addEventListener?.(event,cancel);
    this.events?.once('shutdown',()=>{for(const event of ['blur','pointercancel','touchcancel'])window.removeEventListener?.(event,cancel);pending=null});
  };
})();
