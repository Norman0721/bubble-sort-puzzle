/* Headless gameplay sweep. This executes the real bundled Scene/physics with
   rendering/audio interfaces replaced; its greedy player is not a solvability proof. */
const fs=require('node:fs'),path=require('node:path'),make=require('../tests/helpers/game-harness');
const mobile=process.argv.includes('--mobile');
const summary={mode:mobile?'actual bundled mobile gameplay, headless renderer, greedy player':'actual bundled gameplay, headless renderer, greedy player',levels:[],errors:[],finishedAt:null};
const started=performance.now();
for(let index=0;index<50;index++){
 const h=make({index,mobile,width:390,height:763}),g=h.game,record={level:index+1,totalAmmo:g.level.queue.length,shots:0,result:null,unreachableForGreedy:0,watchdogs:0};
 try{for(let shot=0;shot<g.level.queue.length+1&&g.state!=='end';shot++){
  const result=g.testSolveAndFire();if(result==='notarget'){record.unreachableForGreedy++;g.fire()}h.settle();
  if(g.level.pos!==g.shotsFired)throw Error(`ammo/shot count mismatch: ${g.level.pos}/${g.shotsFired}`);
  if(g.state==='end'&&!g.grid.isEmpty()&&!g.level.exhausted)throw Error('failed before exhaustion');
  if(h.errors.length)throw Error(h.errors.join('\n'));
 }
 record.shots=g.shotsFired;record.result=g.grid.isEmpty()?'won':'exhausted';record.remaining=g.grid.countByColor();record.watchdogs=h.warnings.filter(x=>x.includes('[watchdog]')).length;
 }catch(error){record.result='error';summary.errors.push({level:index+1,message:error.stack})}
 summary.levels.push(record);if((index+1)%5===0)console.log(`Checked ${index+1}/50 levels (${((performance.now()-started)/1000).toFixed(1)}s)`);
}
summary.finishedAt=new Date().toISOString();summary.elapsedMs=Math.round(performance.now()-started);summary.won=summary.levels.filter(x=>x.result==='won').length;summary.exhausted=summary.levels.filter(x=>x.result==='exhausted').length;summary.errorCount=summary.errors.length;
const out=path.join(__dirname,mobile?'audit-mobile-results.json':'audit-results.json');fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({won:summary.won,exhausted:summary.exhausted,errors:summary.errorCount,elapsedMs:summary.elapsedMs,report:out}));if(summary.errorCount)process.exitCode=1;
