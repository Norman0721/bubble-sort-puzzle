const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const make=require('./helpers/game-harness');
const file=path.join(__dirname,'../Bubble Sort Mobile V1.8.html');
const fileV19=path.join(__dirname,'../Bubble Sort Mobile V1.9.html');
const fileV110=path.join(__dirname,'../Bubble Sort Mobile V1.10.html');
const first={schemaVersion:1,id:'FIRST',name:'My first level',grid:['.rrrr.'],ammo:[{color:'r',size:'small'}],colorPairs:[]};

test('blank build physically excludes built-in levels and does not read prior version storage',()=>{
  const html=fs.readFileSync(file,'utf8');assert.match(html,/var mt=\[\]/);assert.doesNotMatch(html,/mt=\[_e,ve,ye/);
  const older={'bp_editor_levels':JSON.stringify({OLD:first}),bp_progress:'42',bp_recent_level:'3',bp_custom_level:JSON.stringify(first)};
  const h=make({sourceFile:file,store:older});assert.equal(h.math.config.blankLevels,true);assert.equal(h.math.levels.length,0);
  assert.equal(h.math.listed().length,0);assert.deepEqual(h.transitions,['title']);assert.equal(h.errors.length,0);
  assert.equal(h.data.get('bp_editor_levels'),older.bp_editor_levels);
});

test('a level newly saved in the blank edition becomes playable',()=>{
  const h=make({sourceFile:file,store:{'bp_blank_v18_bp_editor_levels':JSON.stringify({FIRST:first})}});
  assert.equal(h.math.listed().length,1);assert.equal(h.game.level.data.id,'FIRST');assert.equal(h.game.grid.colorAll(1,0),'r');
  assert.equal(h.transitions.length,0);assert.equal(h.errors.length,0);
});
test('V1.9 keeps the blank edition library created in V1.8',()=>{
  const h=make({sourceFile:fileV19,store:{'bp_blank_v18_bp_editor_levels':JSON.stringify({FIRST:first})}});
  assert.equal(h.math.config.blankLevels,true);assert.equal(h.math.listed().length,1);
  assert.equal(h.game.level.data.id,'FIRST');assert.equal(h.errors.length,0);
});
test('V1.10 retains user-created blank-edition levels',()=>{
  const h=make({sourceFile:fileV110,store:{'bp_blank_v18_bp_editor_levels':JSON.stringify({FIRST:first})}});
  assert.equal(h.math.config.blankLevels,true);assert.equal(h.math.listed().length,1);
  assert.equal(h.game.level.data.id,'FIRST');assert.equal(h.errors.length,0);
});
