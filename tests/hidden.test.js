const {test}=require('node:test'),assert=require('node:assert/strict'),make=require('./helpers/game-harness');

function levelWith(cells,ammo=[{color:'r',size:'large'},{color:'b',size:'large'},{color:'g',size:'large'}]){
  const rows=Array.from({length:6},()=>Array(12).fill('.'));
  for(const [c,r,value] of cells)rows[r][c]=value;
  return {schemaVersion:1,id:'HIDDEN',name:'Hidden bubble acceptance',grid:rows.map(row=>row.join('')),ammo};
}
const ring=(c,r,value='b')=>{
  const diagonal=(r&1)?1:-1;
  return [[1,0],[-1,0],[0,1],[diagonal,1],[0,-1],[diagonal,-1]].map(([dc,dr])=>[c+dc,r+dr,value]);
};

test('Hidden Case 1/2/4: a surrounded bubble shows ?, reveals after a vacancy, and never hides again',()=>{
  const h=make({level:levelWith([[5,2,'R'],...ring(5,2)])}),g=h.game;
  assert.equal(g.grid.colorAll(5,2),'R');assert.equal(g.grid.countByColor().r,undefined);assert.equal(g.grid.countByColor().R,1);
  const hidden=g.bubbles.get('5,2');assert.equal(hidden.getData('hidden'),true);assert.equal(hidden.contents[1].text,'?');
  g.grid.set(6,2,null);const revealed=g.refreshHiddenBubbles();assert.equal(revealed.map(({c,r,color})=>`${c},${r},${color}`).join('|'),'5,2,r');
  assert.equal(g.grid.colorAll(5,2),'r');assert.notEqual(g.bubbles.get('5,2').getData('hidden'),true);
  g.grid.set(6,2,'b');assert.equal(g.refreshHiddenBubbles().length,0);assert.equal(g.grid.colorAll(5,2),'r');
});

test('Hidden Case 3/6: initial vacancies reveal immediately and the shot settlement boundary refreshes removals',()=>{
  const initial=levelWith([[5,2,'R'],...ring(5,2).filter(([c,r])=>!(c===6&&r===2))]);
  const h=make({level:initial});assert.equal(h.game.grid.colorAll(5,2),'r');assert.notEqual(h.game.bubbles.get('5,2').getData('hidden'),true);

  const settled=make({level:levelWith([[5,2,'R'],...ring(5,2)])}),g=settled.game;
  g.grid.set(6,2,null);g.state='resolve';g.shotSerial=1;g.settledShotSerial=0;g.afterShot();
  assert.equal(g.grid.colorAll(5,2),'r');
});

test('Hidden Case 5: multiple adjacent hidden bubbles count as occupied and reveal simultaneously',()=>{
  const first=[3,2,'R'],second=[4,2,'B'];
  const cells=new Map();for(const item of [first,second,...ring(3,2,'g'),...ring(4,2,'g')])cells.set(`${item[0]},${item[1]}`,item);
  cells.set('3,2',first);cells.set('4,2',second);
  const h=make({level:levelWith([...cells.values()])}),g=h.game;
  assert.equal(g.grid.colorAll(3,2),'R');assert.equal(g.grid.colorAll(4,2),'B');
  g.grid.set(3,1,null);const revealed=g.refreshHiddenBubbles();
  assert.equal(revealed.map(cell=>`${cell.c},${cell.r}`).sort().join('|'),'3,2|4,2');assert.equal(g.grid.colorAll(3,2),'r');assert.equal(g.grid.colorAll(4,2),'b');
});

test('Hidden edge rule: out-of-map positions are ignored and valid neighbors control reveal',()=>{
  const h=make({level:levelWith([[0,0,'R'],[1,0,'g'],[0,1,'g']])}),g=h.game;
  assert.equal(g.grid.colorAll(0,0),'R');g.grid.set(0,1,null);g.refreshHiddenBubbles();assert.equal(g.grid.colorAll(0,0),'r');
});
