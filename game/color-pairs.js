/* Paired color bubbles keep ordinary grid colors; only their pairing is special. */
(function(){
  'use strict';
  const proto=Xt.prototype;
  const original={create:proto.create,drawBubble:proto.drawBubble,afterShot:proto.afterShot};
  const key=(c,r)=>`${c},${r}`;
  function redraw(scene,member){
    const value=scene.grid.colorAll(member.c,member.r),position=key(member.c,member.r);
    const old=scene.bubbles.get(position);if(old){scene.tweens.killTweensOf(old);old.destroy();scene.bubbles.delete(position)}
    if(value&&scene.grid.inView(member.r)){
      const bubble=scene.drawBubble(member.c,member.r,value);
      if(scene.state==='resolve'&&scene.colorPairState.get(position)?.active){bubble.setScale(.72);scene.tweens.add({targets:bubble,scale:1,duration:220,ease:'Back.easeOut'})}
    }
  }
  function lock(scene,group){
    for(const member of group){const state=scene.colorPairState.get(key(member.c,member.r));if(state?.active){state.active=false;if(scene.grid.colorAll(member.c,member.r))redraw(scene,member)}}
  }
  proto.create=function(){
    this.colorPairState=new Map();original.create.call(this);
    if(!this.grid)return;
    const groups=new Map(),members=this.level?.data?.colorPairs||[];
    for(const m of Array.isArray(members)?members:[]){
      if(!m||typeof m.id!=='string'||!Number.isInteger(m.c)||!Number.isInteger(m.r)||!this.grid.colorAll(m.c,m.r))continue;
      if(!groups.has(m.id))groups.set(m.id,[]);groups.get(m.id).push({id:m.id,c:m.c,r:m.r});
    }
    this.colorPairGroups=[...groups.values()].filter(group=>group.length===2&&key(group[0].c,group[0].r)!==key(group[1].c,group[1].r));
    for(const group of this.colorPairGroups)for(const member of group)this.colorPairState.set(key(member.c,member.r),{active:true,id:member.id});
    for(const group of this.colorPairGroups)for(const member of group)redraw(this,member);
    const set=this.grid.set;this.grid.set=(c,r,value)=>{
      const previous=this.grid.colorAll(c,r);set.call(this.grid,c,r,value);
      if(previous&&!value){const group=this.colorPairGroups.find(items=>items.some(m=>m.c===c&&m.r===r));if(group)lock(this,group)}
    };
  };
  proto.drawBubble=function(c,r,value){
    const bubble=original.drawBubble.call(this,c,r,value),pair=this.colorPairState?.get(key(c,r));
    if(pair?.active){
      const ring=this.add.circle(0,0,15.5,0,0).setStrokeStyle(2,0xffe28a,.95);
      const mark=this.add.text(0,.5,'↔',{fontSize:'10px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
      bubble.add([ring,mark]);bubble.setData('colorPair',pair.id);
    }
    return bubble;
  };
  proto.afterShot=function(){
    if(this.state==='resolve'&&this.settledShotSerial!==this.shotSerial){
      for(const group of this.colorPairGroups||[]){
        const [a,b]=group,first=this.grid.colorAll(a.c,a.r),second=this.grid.colorAll(b.c,b.r);
        if(!first||!second||!this.colorPairState.get(key(a.c,a.r))?.active){lock(this,group);continue}
        this.grid.set(a.c,a.r,second);this.grid.set(b.c,b.r,first);
        redraw(this,a);redraw(this,b);
      }
    }
    return original.afterShot.call(this);
  };
  const undo=proto.undoShot;
  proto.undoShot=function(){
    undo.call(this);
    if(this.state!=='aim')return;
    for(const group of this.colorPairGroups||[]){const active=group.every(m=>!!this.grid.colorAll(m.c,m.r));for(const m of group){const state=this.colorPairState.get(key(m.c,m.r));if(state)state.active=active;if(this.grid.colorAll(m.c,m.r))redraw(this,m)}}
  };
})();
