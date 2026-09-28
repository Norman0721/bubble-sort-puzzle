/* Shared logic for the game, layout editor and independent queue page. */
(function (root) {
  'use strict';
  function createCore(config) {
    const { pitch, rowStep, center, colors, labels, capacity, visibleRows } = config;
    const keys = Object.keys(colors), clone = value => value===undefined?null:JSON.parse(JSON.stringify(value));
    const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const isHidden = value => typeof value === 'string' && value.length === 1 && keys.includes(value.toLowerCase()) && value !== value.toLowerCase();
    const realColor = value => isHidden(value) ? value.toLowerCase() : value;
    const bubbleValue = (color, hidden = false) => hidden ? color.toUpperCase() : color;
    const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
    const layout = level => ({ name: level.name || '', note: level.note || '', grid: clone(level.grid), colorPairs: clone(level.colorPairs || []) });
    const fingerprint = value => JSON.stringify(value);
    function counts(grid) {
      const result = Object.fromEntries(keys.map(k => [k, 0]));
      for (const line of Array.isArray(grid) ? grid : []) if (typeof line === 'string') for (const value of line) {
        const k=realColor(value);if (own(result, k)) result[k]++;
      }
      return result;
    }
    function windowFor(grid) {
      grid=Array.isArray(grid)?grid:[];
      const rows = grid.length, visRows = Math.min(rows, visibleRows);
      let last = -1;
      for (let r = 0; r < rows; r++) if (typeof grid[r]==='string'&&/[rbgypcom]/i.test(grid[r])) last = r;
      const viewTop = last < visibleRows ? 0 : Math.min(last - visibleRows + 1, rows - visRows);
      return { viewTop, visRows, last, bottom: viewTop + visRows - 1 };
    }
    function stats(grid) {
      grid=Array.isArray(grid)?grid:[];
      const byColor = counts(grid), win = windowFor(grid);
      const hidden=grid.reduce((sum,line)=>sum+(typeof line==='string'?[...line].filter(isHidden).length:0),0);
      return { byColor, hidden, total: Object.values(byColor).reduce((a,b) => a+b,0), used: Object.values(byColor).filter(Boolean).length,
        rows: grid.length, cols: grid[0]?.length || 0, first: Object.values(counts(grid.slice(win.viewTop,win.bottom+1))).reduce((a,b)=>a+b,0), ...win };
    }
    function ammoStats(grid, ammo) {
      const board = counts(grid), caps = Object.fromEntries(keys.map(k=>[k,0]));
      const list = Array.isArray(ammo) ? ammo : [];
      for (const item of list) if (item && own(caps,item.color) && own(capacity,item.size)) caps[item.color] += capacity[item.size];
      return { total:list.length, bounce:list.filter(a=>a?.type==='bounce').length, caps, board, shortages:keys.filter(k=>caps[k]<board[k]) };
    }
    function validate(level, { collision = false } = {}) {
      level=level&&typeof level==='object'?level:{};
      const issues = [];
      function add(ruleId, severity, message, row, col, trialOnly=false, queueInvalid=false) {
        issues.push({ ruleId, level:severity, message, ...(row===undefined?{}:{row,col:col??0}), trialOnly, queueInvalid });
      }
      if (!validId(level.id) || collision) add('META001','Error',collision?'Level ID 已存在，请重新打开对应关卡。':'Level ID 必须为 1–64 位字母、数字、下划线或短横线，且以字母或数字开头。');
      if (level.schemaVersion !== 1) add('SCHEMA001','Error',`不支持 schemaVersion ${level.schemaVersion}，仅可只读查看。`);
      if (level.name!=null&&typeof level.name!=='string'||level.note!=null&&typeof level.note!=='string') add('META003','Error','名称和备注必须是文本。请重新输入后保存。');
      if (typeof level.name!=='string'||!level.name.trim()) add('META002','Warning','名称为空。');
      const grid = level.grid;
      if (!Array.isArray(grid) || !grid.every(r=>typeof r==='string')) add('GRID001','Error','Grid 必须是字符串数组。');
      else {
        const cols = grid[0]?.length || 0;
        if (grid.length<1 || grid.length>200) add('GRID002','Error','行数必须为 1–200。');
        if (cols<6 || cols>24) add('GRID003','Error','列数必须为 6–24。');
        grid.forEach((line,row)=>{
          if (line.length!==cols) add('GRID004','Error',`第 ${row} 行长度 ${line.length}，应为 ${cols}。`,row,Math.min(line.length,Math.max(0,cols-1)));
          Array.from(line).forEach((k,col)=>{if(k!=='.'&&!keys.includes(k)&&!isHidden(k))add('GRID005','Error',`非法字符「${k}」。`,row,col)});
        });
        const st = stats(grid);
        if (!st.total) add('GRID006','Error','棋盘中至少需要一个泡泡。');
        if (grid.length-1-st.last>=5) add('GRID007','Warning',`底部有 ${grid.length-1-st.last} 行空行，可裁剪。`);
      }
      const pairMembers=new Map(),positions=new Set();
      if(level.colorPairs!=null&&!Array.isArray(level.colorPairs))add('PAIR001','Error','变色球配置必须是数组。');
      for(const member of Array.isArray(level.colorPairs)?level.colorPairs:[]){
        const {id,c,r}=member&&typeof member==='object'?member:{};
        if(typeof id!=='string'||!validId(id)||!Number.isInteger(c)||!Number.isInteger(r)||r<0||r>=grid?.length||c<0||c>=(grid?.[0]?.length||0)){
          add('PAIR001','Error','变色球 Pair ID 或位置非法。');continue;
        }
        if(grid[r]?.[c]==='.'||isHidden(grid[r]?.[c])||!keys.includes(grid[r]?.[c]))add('PAIR002','Error','变色球必须位于普通有色球上。',r,c);
        const position=cellKey(c,r);if(positions.has(position))add('PAIR003','Error','同一位置只能配置一个变色球。',r,c);positions.add(position);
        if(!pairMembers.has(id))pairMembers.set(id,[]);pairMembers.get(id).push(member);
      }
      for(const [id,members] of pairMembers){
        if(members.length===1)add('PAIR004','Error',`Pair ID ${id}：变色球必须成对配置。`,members[0].r,members[0].c);
        if(members.length>2)add('PAIR005','Error',`Pair ID ${id}：同一变色球组只能包含2颗变色球。`,members[0].r,members[0].c);
        if(members.length===2&&grid?.[members[0].r]?.[members[0].c]===grid?.[members[1].r]?.[members[1].c])add('PAIR006','Error',`Pair ID ${id}：两颗变色球的初始颜色不能相同。`,members[0].r,members[0].c);
      }
      const ammo = level.ammo;
      if (!Array.isArray(ammo) || ammo.length===0) add('AMMO001','Error','尚未配置弹药，请打开独立队列编辑器。',undefined,undefined,true);
      if (Array.isArray(ammo)) {
        ammo.forEach((item,i)=>{
          if (!item || !keys.includes(item.color)) add('AMMO002','Error',`第 ${i+1} 发弹药颜色非法。`,undefined,undefined,true);
          if (!item || !own(capacity,item.size)) add('AMMO003','Error',`第 ${i+1} 发弹药规格非法。`,undefined,undefined,true);
          if (item?.type!=null && item.type!=='' && item.type!=='bounce') add('AMMO006','Warning',`第 ${i+1} 发类型「${item.type}」非法，队列不可正式保存或试玩。`,undefined,undefined,false,true);
        });
        const st=ammoStats(Array.isArray(grid)?grid:[],ammo);
        for (const k of st.shortages) add('AMMO004','Error',`${labels[k]}色容量 ${st.caps[k]}，棋盘需要 ${st.board[k]}。`,undefined,undefined,true);
        for (const k of keys) if(st.caps[k]>0&&!st.board[k])add('AMMO005','Warning',`${labels[k]}色弹药在棋盘上没有对应泡泡，可能空发。`);
      }
      const order={Error:0,Warning:1,Info:2};
      return issues.filter((v,i,all)=>all.findIndex(x=>x.ruleId===v.ruleId&&x.row===v.row&&x.col===v.col&&x.message===v.message)===i).sort((a,b)=>order[a.level]-order[b.level]);
    }
    const blocksSave = issues => issues.some(i=>i.level==='Error'&&!i.trialOnly);
    const blocksTrial = issues => issues.some(i=>i.level==='Error'||i.queueInvalid);
    // Voronoi hex hit-testing: nearest center, including neighboring rows at edges.
    function hit(x,y,cols,rows) {
      if(![x,y,cols,rows].every(Number.isFinite)||cols<1||rows<1)return null;
      const guess=Math.round((y-28)/rowStep);
      if(guess<-1||guess>rows)return null;
      let nearest=null, dist=Infinity;
      for(let r=guess-1;r<=guess+1;r++){
        const c=Math.round(x/pitch-.5-(r&1)*.5),p=center(c,r),d=(p.x-x)**2+(p.y-y)**2;
        if(d<dist){dist=d;nearest={c,r}}
      }
      return nearest && nearest.c>=0 && nearest.c<cols && nearest.r>=0 && nearest.r<rows ? nearest : null;
    }
    const cellKey=(c,r)=>`${c},${r}`, parseKey=key=>{const [c,r]=key.split(',').map(Number);return {c,r}};
    function hex(c,r) {
      const p=center(c,r),radius=pitch/Math.sqrt(3);
      return Array.from({length:6},(_,i)=>({x:p.x+radius*Math.cos((30+i*60)*Math.PI/180),y:p.y+radius*Math.sin((30+i*60)*Math.PI/180)}));
    }
    function setCell(grid,c,r,color) {
      if(r<0||r>=grid.length||c<0||c>=grid[0].length)return;
      grid[r]=grid[r].slice(0,c)+color+grid[r].slice(c+1);
    }
    function rectSelection(grid,rect) {
      const result=[];
      for(let r=0;r<grid.length;r++)for(let c=0;c<grid[0].length;c++){const p=center(c,r);if(p.x>=rect.x1&&p.x<=rect.x2&&p.y>=rect.y1&&p.y<=rect.y2)result.push(cellKey(c,r))}
      return result;
    }
    function copySelection(grid,selection) {
      const cells=[...selection].map(parseKey);if(!cells.length)return null;
      const c0=Math.min(...cells.map(p=>p.c)),r0=Math.min(...cells.map(p=>p.r));
      return { width:Math.max(...cells.map(p=>p.c))-c0+1,height:Math.max(...cells.map(p=>p.r))-r0+1,
        cells:cells.map(({c,r})=>({c:c-c0,r:r-r0,value:grid[r]?.[c]||'.'})) };
    }
    function relocation(grid,selection,dc,dr,copy=null) {
      const original=new Set(selection),source=copy?copy.cells:[...original].map(k=>{const p=parseKey(k);return {...p,value:grid[p.r]?.[p.c]||'.'}});
      const targets=source.map(p=>({...p,c:p.c+dc,r:p.r+dr}));
      const valid=targets.every(p=>p.c>=0&&p.c<grid[0].length&&p.r>=0&&p.r<grid.length &&
        (p.value==='.'||grid[p.r][p.c]==='.'||(!copy&&original.has(cellKey(p.c,p.r)))));
      if(!valid)return {valid:false,targets};
      const next=grid.slice();
      if(!copy)for(const p of source)if(p.value!=='.')setCell(next,p.c,p.r,'.');
      for(const p of targets)if(p.value!=='.')setCell(next,p.c,p.r,p.value);
      return {valid:true,targets,grid:next,selection:targets.map(p=>cellKey(p.c,p.r))};
    }
    class History {
      constructor(limit=100){this.limit=limit;this.undoStack=[];this.redoStack=[]}
      record(before,after,type){
        const diffs=[];
        for(let r=0;r<Math.max(before.grid.length,after.grid.length);r++)for(let c=0;c<(before.grid[0]?.length||after.grid[0]?.length||0);c++){
          const a=before.grid[r]?.[c]??'.',b=after.grid[r]?.[c]??'.';if(a!==b)diffs.push({r,c,before:a,after:b});
        }
        const rec={type,diffs,rowsBefore:before.grid.length,rowsAfter:after.grid.length,nameBefore:before.name,nameAfter:after.name,noteBefore:before.note,noteAfter:after.note,pairsBefore:clone(before.colorPairs||[]),pairsAfter:clone(after.colorPairs||[]),timestamp:Date.now()};
        if(!diffs.length&&rec.rowsBefore===rec.rowsAfter&&before.name===after.name&&before.note===after.note&&fingerprint(rec.pairsBefore)===fingerprint(rec.pairsAfter))return false;
        this.undoStack.push(rec);if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];return true;
      }
      apply(level,record,side){
        const rows=record[side==='before'?'rowsBefore':'rowsAfter'],cols=level.grid[0].length;
        while(level.grid.length<rows)level.grid.push('.'.repeat(cols));
        for(const d of record.diffs)if(d.r<rows)setCell(level.grid,d.c,d.r,d[side]);
        level.grid.length=rows;level.name=record[side==='before'?'nameBefore':'nameAfter'];level.note=record[side==='before'?'noteBefore':'noteAfter'];level.colorPairs=clone(record[side==='before'?'pairsBefore':'pairsAfter']||[]);
      }
      undo(level){const r=this.undoStack.pop();if(!r)return false;this.apply(level,r,'before');this.redoStack.push(r);return true}
      redo(level){const r=this.redoStack.pop();if(!r)return false;this.apply(level,r,'after');this.undoStack.push(r);return true}
      toJSON(){return {undo:this.undoStack,redo:this.redoStack}}
      restore(value){
        const undo=value?.undo??[],redo=value?.redo??[];
        if(!Array.isArray(undo)||!Array.isArray(redo))throw Error('恢复历史格式非法。原草稿保留。');
        const records=[...undo,...redo];
        for(const rec of records){
          if(!rec||!Array.isArray(rec.diffs)||rec.diffs.length>4800||![rec.rowsBefore,rec.rowsAfter].every(n=>Number.isInteger(n)&&n>=1&&n<=200))throw Error('恢复历史的行数或差异记录非法。原草稿保留。');
          for(const d of rec.diffs)if(!d||!Number.isInteger(d.c)||d.c<0||d.c>=24||!Number.isInteger(d.r)||d.r<0||d.r>=200||typeof d.before!=='string'||typeof d.after!=='string'||d.before.length<1||d.after.length<1||d.before.length>2||d.after.length>2)throw Error('恢复历史包含非法 Cell。原草稿保留。');
        }
        this.undoStack=clone(undo).slice(-this.limit);this.redoStack=clone(redo).slice(-this.limit);
      }
    }
    class Repository {
      constructor(storage){this.storage=storage;this.key='bp_editor_levels'}
      readAll(){
        const raw=this.storage.getItem(this.key);if(!raw)return {};
        let data;try{data=JSON.parse(raw)}catch{throw Error('关卡存储 JSON 损坏，原数据保留，请导出诊断。')}
        if(!data||typeof data!=='object'||Array.isArray(data))throw Error('关卡存储必须按 Level ID 索引。');
        for(const [id,level] of Object.entries(data))if(!level||typeof level!=='object'||Array.isArray(level)||level.id!==id)throw Error(`关卡索引 ${id} 的数据损坏或 ID 不一致。原数据已保留。`);
        return data;
      }
      get(id){const all=this.readAll();return own(all,id)?clone(all[id]):null}
      assertVersion(level){if(level&&level.schemaVersion!==1)throw Error(`不支持 schemaVersion ${level.schemaVersion}。未修改原数据。`)}
      saveLayout(current,baseline,originOwned){
        const all=this.readAll(),latest=own(all,current.id)?all[current.id]:null;this.assertVersion(current);this.assertVersion(latest);
        if(!validId(current.id))throw Error('Level ID 非法。');
        if(!originOwned&&latest)throw Error('Level ID 冲突，请重新打开此关卡。');
        if(originOwned&&!latest)throw Error('关卡已被其他页面移除，请先重新打开。');
        if(latest&&fingerprint(layout(latest))!==fingerprint(baseline))throw Error('布局已被另一页面修改。请导出当前草稿，再重新打开最新关卡。');
        const saved={...(latest||current),schemaVersion:1,id:current.id,...layout(current),ammo:clone(latest&&own(latest,'ammo')?latest.ammo:(current.ammo||[])),updatedAt:new Date().toISOString()};
        all[current.id]=saved;this.storage.setItem(this.key,JSON.stringify(all));return clone(saved);
      }
      saveAmmo(id,ammo,baseline){
        const all=this.readAll(),latest=own(all,id)?all[id]:null;if(!latest)throw Error('关卡尚未正式保存。');this.assertVersion(latest);
        if(fingerprint(latest.ammo||[])!==fingerprint(baseline))throw Error('队列已被另一页面修改，请导出草稿并重新打开最新队列。');
        const saved={...latest,ammo:clone(ammo),updatedAt:new Date().toISOString()};all[id]=saved;this.storage.setItem(this.key,JSON.stringify(all));return clone(saved);
      }
    }
    return {keys,colors,labels,capacity,pitch,rowStep,center,visibleRows,clone,own,isHidden,realColor,bubbleValue,validId,layout,fingerprint,counts,windowFor,stats,ammoStats,validate,blocksSave,blocksTrial,hit,hex,cellKey,parseKey,setCell,rectSelection,copySelection,relocation,History,Repository};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createCore;
  else root.createBubbleEditorCore=createCore;
})(typeof globalThis!=='undefined'?globalThis:this);
