/* Hidden bubbles: uppercase grid values carry a hidden bubble's real color. */
(function(){
  'use strict';
  const colors=new Set(Object.keys(Q));
  const isHidden=value=>typeof value==='string'&&value.length===1&&colors.has(value.toLowerCase())&&value!==value.toLowerCase();
  const realColor=value=>isHidden(value)?value.toLowerCase():value;
  const neighborCells=(grid,c,r)=>{
    const diagonal=(r&1)?1:-1;
    return [[1,0],[-1,0],[0,1],[diagonal,1],[0,-1],[diagonal,-1]]
      .map(([dc,dr])=>({c:c+dc,r:r+dr}))
      .filter(cell=>grid.inBounds(cell.c,cell.r));
  };

  // The retained baseline validates ammo capacity by raw character. Normalize
  // hidden values so their configured real colors remain part of level checks.
  const validate=ce.validate;
  ce.validate=level=>validate({...level,grid:level.grid.map(row=>[...row].map(realColor).join(''))});

  const proto=Xt.prototype;
  const original={create:proto.create,drawBubble:proto.drawBubble,afterShot:proto.afterShot};

  proto.drawBubble=function(c,r,value){
    if(!isHidden(value))return original.drawBubble.call(this,c,r,value);
    const point=this.viewCellCenter(c,r);
    const body=this.add.circle(0,0,12.5,0x41495f).setStrokeStyle(2,0xc8cfdf,.9);
    const mark=this.add.text(0,.5,'?',{fontSize:'19px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
    const bubble=this.add.container(point.x,point.y);bubble.add([body,mark]);bubble.setData('hidden',true);
    this.bubbles.set(this.key(c,r),bubble);return bubble;
  };

  proto.refreshHiddenBubbles=function(animate=true){
    if(!this.grid)return [];
    const revealed=[];
    this.grid.eachAll((c,r,value)=>{
      if(!isHidden(value))return;
      const neighbors=neighborCells(this.grid,c,r);
      if(neighbors.some(cell=>!this.grid.colorAll(cell.c,cell.r)))revealed.push({c,r,color:realColor(value)});
    });
    // Decide the full set first so one refresh always reveals all qualifying
    // bubbles together. Revealing never changes occupancy.
    for(const cell of revealed)this.grid.set(cell.c,cell.r,cell.color);
    for(const cell of revealed){
      const key=this.key(cell.c,cell.r),old=this.bubbles.get(key);
      if(!old)continue;
      this.tweens.killTweensOf(old);old.destroy();this.bubbles.delete(key);
      const bubble=this.drawBubble(cell.c,cell.r,cell.color);
      if(animate){bubble.setScale(.25);this.tweens.add({targets:bubble,scale:1,duration:280,ease:'Back.easeOut'});}
    }
    return revealed;
  };

  proto.create=function(){
    original.create.call(this);
    if(!this.grid)return;
    this.refreshHiddenBubbles(false);
    if(this.state==='aim')this.drawAim();
  };

  proto.afterShot=function(){
    // All removals for the shot have settled before this boundary.
    if(this.state==='resolve'&&this.settledShotSerial!==this.shotSerial)this.refreshHiddenBubbles(true);
    return original.afterShot.call(this);
  };
})();
