/* Standalone HTML routing: #/editor.html and #/ammo-editor.html?levelId=... */
(function () {
  'use strict';
  const C=BB, $=id=>document.getElementById(id), repository=new C.Repository({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)});
  const blankLevels=typeof BB_BUILD!=='undefined'&&BB_BUILD.blankLevels;
  const studio=$('bb-studio'),canvas=$('bb-canvas'),ctx=canvas.getContext('2d');
  const tools={brush:'画笔',erase:'橡皮擦',select:'点选 / 框选 / 移动',pan:'移动画布'};
  const sizeNames={small:'小',medium:'中',large:'大'};
  let E=null,QE=null,route='game',busy=false,space=false,gesture=null,hover=null,floating=null,flash=null,queueDrag=null,queueMarker=null;
  let clipboard=null,raf=0,draftTimer=0,toastTimer=0,draftWarned=false,modalResolve=null,previousHash=location.hash;
  let width=0,height=0,dpr=1,metadataBefore=null,lastError=null,bridgeRestored=false,leaveChoice=null;
  function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
  function dot(color){const n=node('span','bb-dot');n.style.background=cssColor(color);return n}
  function cssColor(color){return '#'+(C.colors[C.realColor(color)]??0x777777).toString(16).padStart(6,'0')}
  function toast(message,error=false){const t=$('bb-toast');t.textContent=message;t.className=error?'error':'';t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.style.display='none'},error?6500:3200)}
  function storageError(error){console.error(error);lastError={name:error?.name,message:error?.message||String(error),at:new Date().toISOString()};$('bb-error-panel').hidden=false;$('bb-last-error').textContent=lastError.message;toast(error?.name==='QuotaExceededError'?'本地存储空间不足，保存失败；当前草稿和历史已保留。':`操作失败：${error.message||error}。当前内容已保留。`,true)}
  function setStatus(value){$('bb-state').textContent=value;busy=['Loading','Saving','Validating','TrialPreparing'].includes(value)}
  function layoutDirty(){return !!E&&(!E.savedSnapshot||C.fingerprint(C.layout(E.level))!==C.fingerprint(E.savedSnapshot))}
  function queueDirty(){return !!QE&&C.fingerprint(QE.ammo)!==C.fingerprint(QE.baseline)}
  function dirty(){return route==='queue'?queueDirty():route==='editor'&&layoutDirty()}
  function snapshot(){
    // A recovery snapshot includes an unfinished stroke without splitting the live Undo command.
    const history=new C.History();history.restore(E.history.toJSON());
    if(gesture&&['paint','erase'].includes(gesture.kind))history.record(gesture.before,C.layout(E.level),gesture.kind);
    if(metadataBefore)history.record(metadataBefore,C.layout(E.level),'metadata');
    return {level:C.clone(E.level),savedSnapshot:C.clone(E.savedSnapshot),baseline:C.clone(E.baseline),originOwned:E.originOwned,
      history:history.toJSON(),view:{...E.view},selection:[...E.selection],tool:E.tool,color:E.color,hidden:E.hidden,first:E.first,updatedAt:new Date().toISOString()};
  }
  function restore(value){
    if(value?.level?.schemaVersion!==1||!Array.isArray(value.level.grid)||!value.level.grid.length||!value.level.grid.every(r=>typeof r==='string'))throw Error('恢复草稿格式非法，保留原始存储和当前内容。');
    const view=value.view||{zoom:1,x:50,y:55};
    if(![view.zoom,view.x,view.y].every(Number.isFinite)||view.zoom<.4||view.zoom>2)throw Error('恢复草稿的缩放或平移非法。原数据保留。');
    const history=new C.History();history.restore(value.history);
    E={level:C.clone(value.level),savedSnapshot:C.clone(value.savedSnapshot),baseline:C.clone(value.baseline),originOwned:!!value.originOwned,history,
      view:{...view},selection:new Set(Array.isArray(value.selection)?value.selection.filter(k=>{if(typeof k!=='string')return false;const p=C.parseKey(k);return Number.isInteger(p.c)&&Number.isInteger(p.r)&&p.c>=0&&p.c<value.level.grid[0].length&&p.r>=0&&p.r<value.level.grid.length}):[]),tool:C.own(tools,value.tool)?value.tool:'brush',color:C.keys.includes(value.color)?value.color:'r',hidden:!!value.hidden,first:!!value.first};
    clearGesture();syncMetadata();changed(false);if(layoutDirty())scheduleDraft();
  }
  function rememberActive(){localStorage.setItem('bp_editor_active',JSON.stringify({...snapshot(),returnPath:'/editor.html'}))}
  function autoDraft(){
    if(!E||E.readOnly||!layoutDirty())return;
    try {localStorage.setItem(`bp_editor_draft_${E.level.id}`,JSON.stringify(snapshot()))}
    catch(error){if(!draftWarned){draftWarned=true;console.error(error);toast('自动草稿保存失败。当前内存仍保留，请导出备份。',true)}}
  }
  function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(autoDraft,2000)}
  function latestAmmo(){
    if(!E||E.readOnly)return false;
    try{const latest=repository.get(E.level.id);if(latest){repository.assertVersion(latest);E.level.ammo=C.clone(latest.ammo||[])}return true}
    catch(error){storageError(error);return false}
  }
  function finishMetadata(){
    if(metadataBefore&&E){E.history.record(metadataBefore,C.layout(E.level),'metadata');metadataBefore=null;changed()}
  }
  function clearGesture(){gesture=null;hover=null;floating=null;metadataBefore=null;space=false}
  function discardDraft(){if(E)try{localStorage.removeItem(`bp_editor_draft_${E.level.id}`)}catch(error){console.error(error)}}
  function createState(level,owned=false,readOnly=false,rawLevel=null){
    clearTimeout(draftTimer);clearGesture();const base=C.layout(level);
    E={level:C.clone(level),readOnly,rawLevel:C.clone(rawLevel),originOwned:owned,baseline:owned?C.clone(base):null,savedSnapshot:owned?C.clone(base):null,
      history:new C.History(),view:{zoom:1,x:50,y:55},selection:new Set(),tool:readOnly?'pan':'brush',color:'r',hidden:false,first:false};
    syncMetadata();fit();changed(false);if(!owned&&!readOnly)scheduleDraft();try{if(!readOnly)localStorage.setItem('bp_editor_last',level.id)}catch(error){console.error(error)}
  }
  function createReadOnly(level,message){
    const grid=Array.isArray(level?.grid)&&level.grid.length&&level.grid.every(r=>typeof r==='string')?level.grid:['.'.repeat(24)];
    createState({...level,grid},true,true,level);storageError(Error(message));changed(false);
  }
  function builtinLevels(){
    if(blankLevels)return [];
    return mt.map(l=>({...C.clone(l),schemaVersion:1,id:`B${String(l.id).padStart(3,'0')}`,note:'内置关卡布局，可保存为编辑器关卡。',updatedAt:'2026-09-17T00:00:00.000Z'}));
  }
  function starterLevel(){return {schemaVersion:1,id:'L001',name:'',note:'',grid:Array(30).fill('.'.repeat(24)),ammo:[],colorPairs:[]}}
  function syncMetadata(){if(!E)return;$('bb-id').value=E.level.id;$('bb-note').value=E.level.note||''}
  function issues(){return C.validate(E.level,{collision:!!E.idCollision})}
  function issueList(target,items){
    target.replaceChildren();
    if(!items.length){target.append(node('p','bb-small bb-ok','检查通过'));return}
    for(const item of items){
      const button=node('button',`bb-issue ${item.level.toLowerCase()}`);
      const scope=item.trialOnly?'试玩 Error':item.level;
      button.append(node('strong','',`${item.ruleId} · ${scope}`),node('br'),document.createTextNode(item.message));
      if(item.row!==undefined){button.append(node('br'),node('span','bb-small',`row ${item.row} · col ${item.col}`));button.addEventListener('click',()=>locate(item.col,item.row))}
      target.append(button);
    }
  }
  function changed(recordDraft=true){
    if(!E)return;
    const st=C.stats(E.level.grid),list=issues(),ammo=C.ammoStats(E.level.grid,E.level.ammo),d=layoutDirty();
    $('bb-state').textContent=E.readOnly?'只读 · 数据不支持':d?'Dirty · 未保存':'Clean · 已保存';$('bb-state').className=E.readOnly?'bb-error':d?'bb-warn':'bb-ok';$('bb-note').disabled=E.readOnly;
    document.title=`${E.level.id}${E.readOnly?' · 只读':d?' *':''} · Bubble Block 关卡编辑器`;
    $('bb-dimensions').textContent=`${st.cols} 列 × ${st.rows} 行 · 首屏 row ${st.viewTop}–${st.bottom}`;
    $('bb-total').textContent=st.total;$('bb-hidden-count').textContent=st.hidden;$('bb-used').textContent=st.used;$('bb-first-count').textContent=st.first;$('bb-rows').textContent=st.rows;
    $('bb-board-label').textContent=`${E.level.id}${d?' *':''} · ${tools[E.tool]} · ${E.hidden?'隐藏球':'普通球'} · ${E.first?'首屏预览':'完整地图'} · row ${st.viewTop}–${st.bottom} 为首屏`;
    for(const k of C.keys)$(`bb-count-${k}`).textContent=st.byColor[k];
    $('bb-ammo-summary').replaceChildren(node('strong',ammo.shortages.length?'bb-warn':'bb-ok',`${ammo.total?'已配置':'未配置'} · ${ammo.total} 发 · ${ammo.bounce} 发反弹弹`),node('br'),document.createTextNode(`容量不足：${ammo.shortages.length} 种颜色`));
    for(const k of ammo.shortages)$('bb-ammo-summary').append(node('br'),node('span','bb-warn',`${C.labels[k]}色 ${ammo.caps[k]} / ${ammo.board[k]}`));
    $('bb-save').disabled=E.readOnly||C.blocksSave(list)||busy;$('bb-save').title=list.filter(i=>i.level==='Error'&&!i.trialOnly).map(i=>i.message).join('\n')||'只保存布局与关卡信息，保留最新队列';$('bb-save').classList.toggle('primary',d);
    $('bb-trial').disabled=E.readOnly||C.blocksTrial(list)||busy;$('bb-trial').title=$('bb-trial').disabled?'请先解决结构问题或配置足够的弹药容量。':'使用当前草稿试玩，无需先保存';
    $('bb-queue-open').disabled=E.readOnly||busy||!C.validId(E.level.id)||C.blocksSave(list);$('bb-summary-queue').disabled=$('bb-queue-open').disabled;
    $('bb-undo').disabled=E.readOnly||!E.history.undoStack.length;$('bb-redo').disabled=E.readOnly||!E.history.redoStack.length;
    const selected=[...E.selection].filter(k=>{const {c,r}=C.parseKey(k);return E.level.grid[r]?.[c]&&E.level.grid[r][c]!=='.'}).length;
    $('bb-selection').textContent=E.selection.size?`已选 ${E.selection.size} 格 · ${selected} 个泡泡`:'尚未框选';$('bb-right-selection').textContent=$('bb-selection').textContent;
    $('bb-recolor').disabled=E.readOnly||!selected;$('bb-delete').disabled=E.readOnly||!selected;$('bb-copy').disabled=E.readOnly||!E.selection.size;$('bb-paste').disabled=E.readOnly||!clipboard;
    $('bb-bubble-normal').disabled=E.readOnly||busy;$('bb-bubble-hidden').disabled=E.readOnly||busy;
    $('bb-add1').disabled=E.readOnly||st.rows>=200;$('bb-add5').disabled=E.readOnly||st.rows+5>200;$('bb-trim').disabled=E.readOnly;
    $('bb-issue-count').textContent=list.length?`· ${list.length} 项`:'';issueList($('bb-issues'),list);
    for(const b of document.querySelectorAll('[data-tool]')){b.classList.toggle('active',b.dataset.tool===E.tool);b.disabled=E.readOnly&&['brush','erase'].includes(b.dataset.tool)}
    for(const b of $('bb-colors').children)b.classList.toggle('active',b.dataset.color===E.color);
    $('bb-color-name').textContent=E.hidden?`隐藏球 · 真实颜色：${C.labels[E.color]}`:`普通球 · ${C.labels[E.color]}色`;
    $('bb-bubble-normal').classList.toggle('active',!E.hidden);$('bb-bubble-hidden').classList.toggle('active',E.hidden);$('bb-full').classList.toggle('active',!E.first);$('bb-first').classList.toggle('active',E.first);
    $('bb-zoom').textContent=`${Math.round(E.view.zoom*100)}%`;canvas.style.cursor=space||E.tool==='pan'?'grab':E.tool==='select'?'default':'crosshair';
    if(recordDraft)scheduleDraft();requestDraw();
  }
  function refreshIdentity(){
    if(!E||E.readOnly)return true;try{E.idCollision=!E.originOwned&&!!repository.get(E.level.id);return true}catch(error){storageError(error);return false}
  }
  async function validateNow(){finishMetadata();if(route==='queue'){renderQueue();toast('队列验证完成');return}if(!refreshIdentity())return;setStatus('Validating');const list=issues();busy=false;changed(false);const first=list.find(i=>i.level==='Error'&&i.row!==undefined);if(first)locate(first.col,first.row);toast(C.blocksTrial(list)?'验证完成，请查看右侧问题。':'验证通过，可以试玩。',C.blocksSave(list))}
  async function saveLayout(){
    if(!E||E.readOnly)return false;
    finishMetadata();endGesture();if(!refreshIdentity()){changed(false);return false}setStatus('Saving');
    const list=issues();if(C.blocksSave(list)){busy=false;changed(false);const first=list.find(i=>i.level==='Error'&&!i.trialOnly&&i.row!==undefined);if(first)locate(first.col,first.row);toast('存在结构错误，未保存。',true);return false}
    try {
      const saved=repository.saveLayout(E.level,E.baseline,E.originOwned);
      E.level=saved;E.originOwned=true;E.baseline=C.layout(saved);E.savedSnapshot=C.layout(saved);busy=false;
      clearTimeout(draftTimer);try{localStorage.removeItem(`bp_editor_draft_${saved.id}`);localStorage.setItem('bp_editor_last',saved.id)}catch(error){console.error(error)}
      $('bb-error-panel').hidden=true;lastError=null;changed(false);toast('布局保存成功，已保留最新弹药队列。');return true;
    }catch(error){busy=false;changed(false);$('bb-state').textContent='Error · 保存失败';storageError(error);return false}
  }
  async function modal(title,build,actions){
    const dialog=$('bb-dialog');if(dialog.open)return null;
    $('bb-dialog-title').textContent=title;$('bb-dialog-body').replaceChildren();$('bb-dialog-actions').replaceChildren();
    if(typeof build==='string')$('bb-dialog-body').append(node('p','',build));else build($('bb-dialog-body'));
    const promise=new Promise(resolve=>{modalResolve=resolve});
    for(const action of actions){const b=node('button',action.primary?'primary':'',action.label);if(action.id)b.id=action.id;b.addEventListener('click',async()=>{
      if(action.run){const result=await action.run();if(result===false)return}
      dialog.close();modalResolve?.(action.value);modalResolve=null;
    });$('bb-dialog-actions').append(b)}
    dialog.showModal();return promise;
  }
  $('bb-dialog').addEventListener('cancel',()=>{modalResolve?.(null);modalResolve=null});
  async function canLeave(queueOnly=false){
    leaveChoice=null;finishMetadata();endGesture();if(!dirty())return true;
    const result=await modal('有未保存修改',queueOnly?'进入队列页前，需要先正式保存当前布局。':'离开前要如何处理当前修改？',
      [...(queueOnly?[]:[{label:'不保存',value:'discard'}]),{label:'取消',value:'cancel'},
        {label:queueOnly?'保存并打开':'保存并继续',value:'save',primary:true,run:()=>route==='queue'?saveQueue():saveLayout()}]);
    if(result==='discard'){leaveChoice='discard';if(route==='editor')discardDraft();return true}return result==='save';
  }
  async function newLevel(){
    if(!await canLeave())return;
    await modal('新建关卡',body=>{
      const id=field('Level ID','bb-new-id','L001'),name=field('名称','bb-new-name',''),cols=field('列数 · 6–24','bb-new-cols','24','number'),rows=field('行数 · 1–200','bb-new-rows','30','number');
      const grid=node('div','bb-dialog-grid');grid.append(cols,rows);body.append(id,name,grid,node('p','bb-small','ID 创建后锁定。弹药在独立队列页配置。'),node('p','bb-error'));body.lastChild.id='bb-new-error';
    },[{label:'取消',value:false},{label:'创建',value:true,primary:true,run:()=>{
      const id=$('bb-new-id').value,cols=Number($('bb-new-cols').value),rows=Number($('bb-new-rows').value);
      let error='';if(!C.validId(id))error='ID 格式非法：请使用字母、数字、下划线或短横线。';
      else if(!Number.isInteger(cols)||cols<6||cols>24||!Number.isInteger(rows)||rows<1||rows>200)error='请填写范围内的整数行列数。';
      try{if(repository.get(id)||builtinLevels().some(l=>l.id===id))error='ID 已存在，请使用其他 ID。'}catch(e){error=e.message}
      if(error){$('bb-new-error').textContent=error;return false}
      createState({schemaVersion:1,id,name:$('bb-new-name').value,note:'',grid:Array(rows).fill('.'.repeat(cols)),ammo:[],updatedAt:new Date().toISOString()},false);
    }}]);
  }
  function field(label,id,value,type='text'){const l=node('label','',label),i=node('input');i.id=id;i.type=type;i.value=value;l.append(i);return l}
  async function openLevels(){
    if(!await canLeave())return;
    let all;try {all=repository.readAll()}catch(error){storageError(error);return}
    const entries=[...Object.values(all).map(l=>({level:l,owned:true})),...builtinLevels().filter(l=>!C.own(all,l.id)).map(l=>({level:l,owned:false}))];
    await modal('打开关卡',body=>{
      const search=node('input');search.placeholder='搜索 Level ID 或名称';search.setAttribute('aria-label','搜索关卡');const list=node('div','bb-open-list');body.append(search,list);
      function filter(){list.replaceChildren();for(const entry of entries){const l=entry.level;if(!`${l.id} ${l.name}`.toLowerCase().includes(search.value.toLowerCase()))continue;
        const b=node('button','bb-open-item');const st=C.stats(Array.isArray(l.grid)?l.grid:[]);
        b.append(node('strong','',`${l.id} · ${l.name||'未命名'}${entry.owned?'':' · 内置布局'}`),node('span','',`${st.cols}×${st.rows} · ${st.total} 个泡泡 · ${l.ammo?.length||0} 发弹药 · ${l.updatedAt||'未知更新时间'}`));
        b.addEventListener('click',async()=>{
          let selected=l;try{if(entry.owned){selected=repository.get(l.id);if(!selected)throw Error('关卡已不存在，请重新打开列表。')}}catch(error){storageError(error);return}
          if(selected.schemaVersion!==1){$('bb-dialog').close();modalResolve?.(true);modalResolve=null;createReadOnly(selected,`不支持 schemaVersion ${selected.schemaVersion}，仅可查看和导出原数据。`);return}
          if(!Array.isArray(selected.grid)||!selected.grid.length||!selected.grid.every(line=>typeof line==='string')){$('bb-dialog').close();modalResolve?.(true);modalResolve=null;createReadOnly(selected,'Grid 格式无法编辑。原数据保留，可以查看诊断或导出。');return}
          $('bb-dialog').close();modalResolve?.(true);modalResolve=null;createState(selected,entry.owned);await maybeRecover(selected.id);
        });list.append(b)}if(!list.children.length)list.append(node('p','bb-small','没有匹配的关卡。'))}
      search.addEventListener('input',filter);filter();
    },[{label:'取消',value:false}]);
  }
  function showReadOnly(level){const body=$('bb-dialog-body');body.replaceChildren(node('p','bb-error',`不支持 schemaVersion ${level.schemaVersion}。仅只读展示，原数据保留。`));const pre=node('pre','',JSON.stringify(level,null,2));pre.style.cssText='white-space:pre-wrap;max-height:300px;overflow:auto';body.append(pre);const b=node('button','','导出原数据');b.onclick=()=>download(level,`${level.id}-unsupported.json`);body.append(b)}
  async function maybeRecover(id){
    let draft;try{const raw=localStorage.getItem(`bp_editor_draft_${id}`);if(raw)draft=JSON.parse(raw)}catch(error){storageError(error);return}
    if(!draft||!draft.level)return;
    let saved;try{saved=repository.get(id)}catch(error){storageError(error);return}
    if(saved&&Date.parse(draft.updatedAt)<=Date.parse(saved.updatedAt))return;
    const answer=await modal('发现恢复草稿',`${id} 有 ${draft.updatedAt} 的未保存草稿。是否恢复？`,[{label:'放弃草稿',value:false},{label:'恢复',value:true,primary:true}]);
    if(answer===true){restore(draft);toast('草稿已恢复，请检查后保存。')}if(answer!==null)try{localStorage.removeItem(`bp_editor_draft_${id}`)}catch(error){console.error(error)}
  }
  function mutate(type,fn){if(!E||E.readOnly||busy)return;finishMetadata();const before=C.layout(E.level);fn();E.history.record(before,C.layout(E.level),type);changed()}
  function undo(){if(route==='editor'&&E?.readOnly)return;finishMetadata();endGesture();if(route==='queue'){queueUndo();return}if(E.history.undo(E.level)){pruneSelection();syncMetadata();changed()}}
  function redo(){if(route==='editor'&&E?.readOnly)return;finishMetadata();endGesture();if(route==='queue'){queueRedo();return}if(E.history.redo(E.level)){pruneSelection();syncMetadata();changed()}}
  function pruneSelection(){E.selection=new Set([...E.selection].filter(k=>{const p=C.parseKey(k);return p.r>=0&&p.r<E.level.grid.length&&p.c>=0&&p.c<E.level.grid[0].length}))}
  function cleanPairs(){E.level.colorPairs=(E.level.colorPairs||[]).filter(p=>C.keys.includes(E.level.grid[p.r]?.[p.c]))}
  function movePairs(selection,dc,dr){const selected=new Set(selection);E.level.colorPairs=(E.level.colorPairs||[]).map(p=>selected.has(C.cellKey(p.c,p.r))?{...p,c:p.c+dc,r:p.r+dr}:p)}
  function nextPairId(){const used=new Set((E.level.colorPairs||[]).map(p=>p.id));let n=1;while(used.has(`Pair_${String(n).padStart(2,'0')}`))n++;return `Pair_${String(n).padStart(2,'0')}`}
  function pairSelection(){const cells=[...E.selection].map(C.parseKey).filter(p=>C.keys.includes(E.level.grid[p.r]?.[p.c]));if(!cells.length){toast('请先选择一颗或两颗普通有色球。',true);return}
    const id=$('bb-pair-id').value.trim()||nextPairId();if(!C.validId(id)){toast('Pair ID 必须是合法标识符。',true);return}
    mutate('pair',()=>{const positions=new Set(cells.map(p=>C.cellKey(p.c,p.r)));E.level.colorPairs=(E.level.colorPairs||[]).filter(p=>!positions.has(C.cellKey(p.c,p.r)));for(const p of cells)E.level.colorPairs.push({id,c:p.c,r:p.r})});$('bb-pair-id').value=(E.level.colorPairs||[]).filter(p=>p.id===id).length===2?'':id;
  }
  function unpairSelection(){mutate('unpair',()=>{const positions=new Set(E.selection);E.level.colorPairs=(E.level.colorPairs||[]).filter(p=>!positions.has(C.cellKey(p.c,p.r)))})}
  function setBubbleType(hidden){
    if(!E||E.readOnly||busy)return;
    E.hidden=hidden;
    const paired=new Set((E.level.colorPairs||[]).map(p=>C.cellKey(p.c,p.r)));
    const cells=[...E.selection].map(C.parseKey).filter(({c,r})=>{
      const value=E.level.grid[r]?.[c];return value&&value!=='.'&&!paired.has(C.cellKey(c,r))&&C.isHidden(value)!==hidden;
    });
    if(cells.length)mutate('bubble-type',()=>{for(const {c,r} of cells)C.setCell(E.level.grid,c,r,C.bubbleValue(C.realColor(E.level.grid[r][c]),hidden))});
    else changed(false);
    if(hidden&&[...E.selection].some(k=>paired.has(k)))toast('变色球需先取消配对，才能改为隐藏球。',true);
  }
  function recolor(remove=false){mutate(remove?'delete':'recolor',()=>{for(const k of E.selection){const {c,r}=C.parseKey(k);if(E.level.grid[r]?.[c]&&E.level.grid[r][c]!=='.')C.setCell(E.level.grid,c,r,remove?'.':C.bubbleValue(E.color,E.hidden))}cleanPairs()})}
  function copy(){if(E.readOnly||!E.selection.size)return;clipboard=C.copySelection(E.level.grid,E.selection);changed(false);toast('选区已复制。粘贴后点击合法位置提交，Esc 取消。')}
  function paste(){if(E.readOnly||!clipboard)return;endGesture();floating={copy:C.clone(clipboard),dc:hover?.c||0,dr:hover?.r||0};E.tool='select';changed(false)}
  function addRows(n){if(E.level.grid.length+n>200){toast('地图最多 200 行。',true);return}mutate('resize',()=>{for(let i=0;i<n;i++)E.level.grid.push('.'.repeat(E.level.grid[0].length))})}
  function trimRows(){mutate('resize',()=>{E.level.grid.length=Math.max(1,C.windowFor(E.level.grid).last+1);pruneSelection();cleanPairs()})}
  function setTool(tool){if(busy||E.readOnly&&['brush','erase'].includes(tool))return;endGesture();floating=null;E.tool=tool;changed(false)}
  function setFirst(first){if(busy)return;endGesture();E.first=first;fit();changed(false)}
  function screenPoint(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top}}
  function logical(point){return {x:(point.x-E.view.x)/E.view.zoom,y:(point.y-E.view.y)/E.view.zoom}}
  function cellAt(point){const p=logical(point),g=E.level.grid,c=C.hit(p.x,p.y,g[0].length,g.length);if(c&&E.first){const win=C.windowFor(g);if(c.r<win.viewTop||c.r>win.bottom)return null}return c}
  function zoomBy(delta,point={x:width/2,y:height/2}){if(!E||gesture)return;const p=logical(point),z=Math.min(2,Math.max(.4,Math.round((E.view.zoom+delta)*10)/10));E.view.zoom=z;E.view.x=point.x-p.x*z;E.view.y=point.y-p.y*z;changed(false)}
  function fit(){
    if(!E)return;resize(false);const grid=E.level.grid,win=C.windowFor(grid),cols=grid[0].length;
    const r0=E.first?win.viewTop:0,r1=E.first?win.bottom:grid.length-1;
    const bw=(cols+(grid.length>1?.5:0))*C.pitch,bh=(r1-r0)*C.rowStep+34;
    const zoom=Math.max(.4,Math.min(2,Math.floor(Math.min((width-64)/bw,(height-110)/bh)*10)/10));
    E.view={zoom,x:(width-bw*zoom)/2,y:55-(28+r0*C.rowStep-17)*zoom};requestDraw();
  }
  function locate(c,r){
    if(!E)return;E.first=false;const p=C.center(c,r);E.view.x=width/2-p.x*E.view.zoom;E.view.y=height/2-p.y*E.view.zoom;
    flash={c,r,until:performance.now()+1600};changed(false);
  }
  function resize(draw=true){
    const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}if(draw)requestDraw();
  }
  function requestDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}
  function pathHex(c,r){const points=C.hex(c,r);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath()}
  function draw(){
    if(!E||route!=='editor')return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(E.view.x,E.view.y);ctx.scale(E.view.zoom,E.view.zoom);
    const grid=E.level.grid,cols=grid[0].length,win=C.windowFor(grid),z=E.view.zoom;
    let r0=Math.max(0,Math.floor((-E.view.y/z-45)/C.rowStep)),r1=Math.min(grid.length-1,Math.ceil(((height-E.view.y)/z+10)/C.rowStep));
    if(E.first){r0=Math.max(r0,win.viewTop);r1=Math.min(r1,win.bottom)}
    const c0=Math.max(0,Math.floor(-E.view.x/z/C.pitch-2)),c1=Math.min(cols-1,Math.ceil((width-E.view.x)/z/C.pitch+1));
    const preview=floating?C.relocation(grid,E.selection,floating.dc,floating.dr,floating.copy):gesture?.kind==='move'?C.relocation(grid,E.selection,gesture.dc,gesture.dr):null;
    const moving=gesture?.kind==='move'&&preview;
    for(let r=r0;r<=r1;r++){
      for(let c=c0;c<=c1;c++){
        const p=C.center(c,r),k=C.cellKey(c,r),selected=E.selection.has(k);
        pathHex(c,r);ctx.fillStyle=selected?'#36598680':'#1c293940';ctx.fill();ctx.lineWidth=.8/z;ctx.strokeStyle=selected?'#80baff':'#39496180';ctx.stroke();
        const color=grid[r]?.[c];if(color&&color!=='.'){
          const hidden=C.isHidden(color);ctx.globalAlpha=(moving&&selected)?0.24:1;ctx.beginPath();ctx.arc(p.x,p.y,12.5,0,Math.PI*2);ctx.fillStyle=hidden?'#3b4358':cssColor(color);ctx.fill();ctx.lineWidth=hidden?2:1;ctx.strokeStyle=hidden?cssColor(color):'#ffffff70';ctx.stroke();
          if(hidden){ctx.font='bold 15px -apple-system,sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',p.x,p.y+.5);ctx.textBaseline='alphabetic'}
          const pair=(E.level.colorPairs||[]).find(m=>m.c===c&&m.r===r);if(pair){ctx.beginPath();ctx.arc(p.x,p.y,15.5,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#ffe28a';ctx.stroke();ctx.font='bold 8px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText('↔',p.x,p.y+3);}
          ctx.globalAlpha=1;
        }
      }
      // Absolute row labels remain stable under scrolling and previewing.
      ctx.font=`${11/z}px -apple-system,sans-serif`;ctx.fillStyle='#8295b1';ctx.textAlign='right';ctx.fillText(String(r),-10,C.center(0,r).y+3/z);
    }
    const bw=(cols+(grid.length>1?.5:0))*C.pitch;
    if(!E.first){
      ctx.fillStyle='#070b1590';for(const [a,b] of [[0,win.viewTop-1],[win.bottom+1,grid.length-1]])if(b>=a){
        const top=C.center(0,a).y-16,bottom=C.center(0,b).y+16;ctx.fillRect(-1,top,bw+2,bottom-top);
        if(bottom>=-E.view.y/z&&top<=(height-E.view.y)/z){ctx.fillStyle='#9caac0';ctx.font=`${12/z}px -apple-system,sans-serif`;ctx.textAlign='left';ctx.fillText(a===0?'初始隐藏区域 · 清除底部后逐层揭露':'首屏外空行',8,Math.max(top+20/z,-E.view.y/z+60/z));ctx.fillStyle='#070b1590'}
      }
    }
    ctx.strokeStyle='#8be0bd';ctx.lineWidth=1.5/z;ctx.setLineDash([6/z,5/z]);ctx.strokeRect(-2,C.center(0,win.viewTop).y-17,bw+4,(win.visRows-1)*C.rowStep+34);ctx.setLineDash([]);
    // Paint selection above bubbles and the off-screen shade so distant picks stay visible.
    for(const k of E.selection){
      const {c,r}=C.parseKey(k);if(c<c0||c>c1||r<r0||r>r1)continue;
      const p=C.center(c,r);pathHex(c,r);ctx.lineWidth=4/z;ctx.strokeStyle='#102436';ctx.stroke();ctx.lineWidth=2.5/z;ctx.strokeStyle='#76eaff';ctx.stroke();
      if(grid[r]?.[c]&&grid[r][c]!=='.'){
        ctx.beginPath();ctx.arc(p.x,p.y,16.2,0,Math.PI*2);ctx.lineWidth=5/z;ctx.strokeStyle='#102436';ctx.stroke();ctx.lineWidth=3/z;ctx.strokeStyle='#edffff';ctx.stroke();
      }
    }
    if(preview){
      ctx.strokeStyle=preview.valid?'#81baff':'#ff7676';ctx.fillStyle=preview.valid?'#629ee533':'#ff767644';ctx.lineWidth=2/z;
      for(const p of preview.targets){pathHex(p.c,p.r);ctx.fill();ctx.stroke();if(p.value!=='.'){const q=C.center(p.c,p.r),hidden=C.isHidden(p.value);ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(q.x,q.y,12.5,0,Math.PI*2);ctx.fillStyle=hidden?'#3b4358':cssColor(p.value);ctx.fill();if(hidden){ctx.font='bold 15px -apple-system,sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',q.x,q.y+.5);ctx.textBaseline='alphabetic'}ctx.globalAlpha=1;ctx.fillStyle=preview.valid?'#629ee533':'#ff767644'}}
    }
    if(gesture?.kind==='select'){
      const a=gesture.start,b=gesture.last;ctx.lineWidth=1/z;ctx.strokeStyle='#a7cfff';ctx.fillStyle='#629ee525';ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    }
    if(hover){pathHex(hover.c,hover.r);ctx.strokeStyle='#ffffffbb';ctx.lineWidth=1.5/z;ctx.stroke()}
    if(flash){if(performance.now()<flash.until){pathHex(flash.c,flash.r);ctx.lineWidth=3/z;ctx.strokeStyle=Math.floor(performance.now()/150)%2?'#ffd585':'#fff';ctx.stroke();requestDraw()}else flash=null}
    ctx.restore();
  }
  function paintLine(point){
    const g=gesture;if(!g||!['paint','erase'].includes(g.kind))return;
    const last=g.previous||point,steps=Math.max(1,Math.ceil(Math.hypot(point.x-last.x,point.y-last.y)/(C.pitch*E.view.zoom*.2)));
    for(let i=0;i<=steps;i++){
      const cell=cellAt({x:last.x+(point.x-last.x)*i/steps,y:last.y+(point.y-last.y)*i/steps});if(!cell)continue;
      const key=C.cellKey(cell.c,cell.r);if(g.seen.has(key))continue;g.seen.add(key);C.setCell(E.level.grid,cell.c,cell.r,g.kind==='erase'?'.':C.bubbleValue(E.color,E.hidden));
    }
    cleanPairs();g.previous=point;changed();
  }
  function pointerDown(event){
    if(route!=='editor'||busy||$('bb-dialog').open||gesture)return;
    finishMetadata();const point=screenPoint(event),cell=cellAt(point);canvas.focus({preventScroll:true});event.preventDefault();
    if(event.button===2){if(E.readOnly)return;gesture={kind:'erase',before:C.layout(E.level),seen:new Set(),pointerId:event.pointerId};paintLine(point);return}
    if(event.button!==0)return;
    if(space||E.tool==='pan'){gesture={kind:'pan',start:point,view:{...E.view},pointerId:event.pointerId};return}
    if(floating){if(cell){floating.dc=cell.c;floating.dr=cell.r;const result=C.relocation(E.level.grid,E.selection,floating.dc,floating.dr,floating.copy);
      if(result.valid){mutate('paste',()=>{if(!floating.copy)movePairs(E.selection,floating.dc,floating.dr);E.level.grid=result.grid;E.selection=new Set(result.selection)});floating=null;changed(false)}else toast('粘贴位置越界或与泡泡碰撞，未修改棋盘。',true)}return}
    if(E.tool==='select'&&!cell){gesture={kind:'select',start:logical(point),last:logical(point),screenStart:point,cell:null,dragged:false,append:event.shiftKey,subtract:event.altKey,pointerId:event.pointerId};requestDraw();return}
    if(!cell)return;
    if(E.tool==='brush'||E.tool==='erase'){gesture={kind:E.tool==='brush'?'paint':'erase',before:C.layout(E.level),seen:new Set(),pointerId:event.pointerId};paintLine(point);return}
    if(E.tool==='select'){
      const key=C.cellKey(cell.c,cell.r);
      if(!E.readOnly&&E.selection.has(key)&&E.level.grid[cell.r][cell.c]!=='.'&&!event.shiftKey&&!event.altKey)gesture={kind:'move',anchor:cell,start:point,dc:0,dr:0,dragged:false,pointerId:event.pointerId};
      else gesture={kind:'select',start:logical(point),last:logical(point),screenStart:point,cell,dragged:false,append:event.shiftKey,subtract:event.altKey,pointerId:event.pointerId};
      requestDraw();
    }
  }
  function pointerMove(event){
    if(route!=='editor'||busy||gesture&&gesture.pointerId!==event.pointerId)return;
    const point=screenPoint(event);hover=cellAt(point);$('bb-coordinate').textContent=hover?`col ${hover.c} · row ${hover.r}`:'col — · row —';
    if(floating&&hover){floating.dc=hover.c;floating.dr=hover.r}
    if(gesture&&gesture.pointerId===event.pointerId){
      if(gesture.kind==='pan'){E.view.x=gesture.view.x+point.x-gesture.start.x;E.view.y=gesture.view.y+point.y-gesture.start.y}
      else if(['paint','erase'].includes(gesture.kind))paintLine(point);
      else if(gesture.kind==='select'){gesture.last=logical(point);if(Math.hypot(point.x-gesture.screenStart.x,point.y-gesture.screenStart.y)>5)gesture.dragged=true}
      else if(gesture.kind==='move'){
        if(Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)>5)gesture.dragged=true;
        const dr=Math.round((point.y-gesture.start.y)/E.view.zoom/C.rowStep);
        // Derive the target integer column with the destination row's absolute parity.
        const dc=Math.round((point.x-gesture.start.x)/E.view.zoom/C.pitch-(((gesture.anchor.r+dr)&1)-(gesture.anchor.r&1))*.5);
        gesture.dc=dc;gesture.dr=dr;
      }
    }
    requestDraw();
  }
  function endGesture(commit=true){
    if(!gesture||!E)return;const g=gesture;gesture=null;
    if(['paint','erase'].includes(g.kind)){E.history.record(g.before,C.layout(E.level),g.kind);changed()}
    else if(g.kind==='select'&&commit){
      if(!g.dragged){
        const cell=g.cell,key=cell&&C.cellKey(cell.c,cell.r),occupied=cell&&E.level.grid[cell.r]?.[cell.c]!=='.';
        if(occupied){if(g.subtract)E.selection.delete(key);else if(g.append)E.selection.add(key);else if(E.selection.has(key))E.selection.delete(key);else E.selection.add(key)}
        else if(!g.append&&!g.subtract)E.selection.clear();
        changed(false);requestDraw();return;
      }
      const rect={x1:Math.min(g.start.x,g.last.x),x2:Math.max(g.start.x,g.last.x),y1:Math.min(g.start.y,g.last.y),y2:Math.max(g.start.y,g.last.y)};
      const selected=C.rectSelection(E.level.grid,rect).filter(k=>{if(!E.first)return true;const p=C.parseKey(k),w=C.windowFor(E.level.grid);return p.r>=w.viewTop&&p.r<=w.bottom});
      if(!g.append&&!g.subtract)E.selection.clear();for(const k of selected)g.subtract?E.selection.delete(k):E.selection.add(k);changed(false);
    }else if(g.kind==='move'&&commit&&!g.dragged){E.selection.delete(C.cellKey(g.anchor.c,g.anchor.r));changed(false)
    }else if(g.kind==='move'&&commit&&(g.dc||g.dr)){
      const result=C.relocation(E.level.grid,E.selection,g.dc,g.dr);if(result.valid)mutate('move',()=>{movePairs(E.selection,g.dc,g.dr);E.level.grid=result.grid;E.selection=new Set(result.selection)});else toast('目标越界或与已有泡泡碰撞，移动已取消。',true);
    }
    requestDraw();
  }
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',event=>{if(gesture?.pointerId===event.pointerId){pointerMove(event);endGesture()}});
  canvas.addEventListener('pointerleave',()=>{if(gesture)endGesture(gesture.kind==='paint'||gesture.kind==='erase');hover=null;requestDraw()});
  canvas.addEventListener('pointercancel',()=>endGesture(false));canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',event=>{if(route!=='editor')return;event.preventDefault();zoomBy(event.deltaY<0?.1:-.1,screenPoint(event))},{passive:false});
  window.addEventListener('pointerup',()=>endGesture());
  window.addEventListener('blur',()=>{space=false;endGesture(false);if(E&&route==='editor')canvas.style.cursor=E.tool==='pan'?'grab':E.tool==='select'?'default':'crosshair'});
  new ResizeObserver(()=>resize()).observe(canvas);
  // Separate queue page owns ammo only; layout drafts and viewport stay in E.
  function queueRecord(before,ids){if(C.fingerprint(before)===C.fingerprint(QE.ammo)&&C.fingerprint(ids)===C.fingerprint(QE.ids))return;QE.undo.push({before,after:C.clone(QE.ammo),beforeIds:ids,afterIds:[...QE.ids]});if(QE.undo.length>100)QE.undo.shift();QE.redo=[]}
  function queueChange(fn){if(busy)return;const before=C.clone(QE.ammo),ids=[...QE.ids];fn();queueRecord(before,ids);renderQueue()}
  function queueUndo(){const r=QE.undo.pop();if(r){QE.ammo=C.clone(r.before);QE.ids=[...r.beforeIds];QE.redo.push(r);renderQueue()}}
  function queueRedo(){const r=QE.redo.pop();if(r){QE.ammo=C.clone(r.after);QE.ids=[...r.afterIds];QE.undo.push(r);renderQueue()}}
  function queueSelected(){return QE.ids.map((id,index)=>QE.selected.has(id)?index:-1).filter(index=>index>=0)}
  function queueSelection(index,event){
    const id=QE.ids[index];if(event?.shiftKey&&QE.anchor!=null){const start=Math.min(QE.anchor,index),end=Math.max(QE.anchor,index);if(!event.ctrlKey&&!event.metaKey)QE.selected.clear();for(let i=start;i<=end;i++)QE.selected.add(QE.ids[i])}
    else if(event?.ctrlKey||event?.metaKey||event?.target?.type==='checkbox'){QE.selected.has(id)?QE.selected.delete(id):QE.selected.add(id);QE.anchor=index}
    else{QE.selected=new Set([id]);QE.anchor=index}renderQueue();
  }
  function queueMove(boundary){
    const picked=queueSelected();if(!picked.length||!Number.isInteger(boundary)||boundary<0||boundary>QE.ammo.length)return false;
    const moving=new Set(picked),offset=picked.filter(i=>i<boundary).length,at=boundary-offset;
    queueChange(()=>{const items=picked.map(i=>QE.ammo[i]),ids=picked.map(i=>QE.ids[i]);QE.ammo=QE.ammo.filter((_,i)=>!moving.has(i));QE.ids=QE.ids.filter((_,i)=>!moving.has(i));QE.ammo.splice(at,0,...items);QE.ids.splice(at,0,...ids);QE.anchor=at});return true;
  }
  function queueDragTarget(y){const rows=$('bb-queue-list').children;let low=0,high=QE.ammo.length;while(low<high){const mid=(low+high)>>1,rect=rows[mid].getBoundingClientRect();if(y<rect.top+rect.height/2)high=mid;else low=mid+1}return low}
  function queueDragMarker(){const list=$('bb-queue-list');if(queueMarker!=null)list.children[queueMarker]?.classList?.toggle('drop-before',false);list.classList.toggle('drop-after',false);queueMarker=queueDrag?.boundary??null;if(queueMarker===QE.ammo.length)list.classList.toggle('drop-after',true);else if(queueMarker!=null)list.children[queueMarker]?.classList?.toggle('drop-before',true)}
  function queueDragStart(event,index){if(event.button!==0||busy)return;event.preventDefault();const handle=event.currentTarget||event.target;if(!QE.selected.has(QE.ids[index])){QE.selected=new Set([QE.ids[index]]);QE.anchor=index;for(const row of $('bb-queue-list').children)row.classList?.toggle('selected',Number(row.dataset.index)===index);$('bb-queue-selected').textContent='已选 1 发';$('bb-queue-batch').hidden=false;$('bb-queue-clear').disabled=false;$('bb-queue-select-all').disabled=QE.ammo.length===1}queueDrag={boundary:index,handle,pointerId:event.pointerId,startY:event.clientY,moved:false};handle.setPointerCapture?.(event.pointerId)}
  function queueDragMove(event){if(!queueDrag||event.pointerId!==queueDrag.pointerId)return;event.preventDefault();if(Math.abs(event.clientY-queueDrag.startY)>5)queueDrag.moved=true;const area=$('bb-queue');if(event.clientY<area.getBoundingClientRect().top+45)area.scrollBy?.(0,-20);else if(event.clientY>area.getBoundingClientRect().bottom-45)area.scrollBy?.(0,20);queueDrag.boundary=queueDragTarget(event.clientY);queueDragMarker()}
  function queueDragEnd(event){if(!queueDrag||event.pointerId!==queueDrag.pointerId)return;const {boundary,moved,handle,pointerId}=queueDrag;handle.releasePointerCapture?.(pointerId);queueDrag=null;queueDragMarker();if(moved)queueMove(boundary);else renderQueue()}
  function queueDragCancel(event){if(!queueDrag||event.pointerId!==queueDrag.pointerId)return;queueDrag=null;queueDragMarker();renderQueue()}
  function queueIssues(){return C.validate({...QE.level,ammo:QE.ammo}).filter(i=>i.ruleId.startsWith('AMMO'))}
  function renderQueue(){
    if(!QE)return;
    const d=queueDirty(),list=$('bb-queue-list');list.replaceChildren();document.title=`${QE.level.id}${d?' *':''} · 弹药队列编辑器`;
    $('bb-queue-title').textContent=`${QE.level.id} · ${QE.level.name||'未命名'}${d?' *':''} · ${QE.ammo.length} 发`;
    if(!QE.ammo.length)list.append(node('p','bb-small','队列为空。选择颜色和规格，添加第一发弹药。'));
    QE.selected=new Set([...QE.selected].filter(id=>QE.ids.includes(id)));
    $('bb-queue-selected').textContent=`已选 ${QE.selected.size} 发`;$('bb-queue-batch').hidden=!QE.selected.size;$('bb-queue-select-all').disabled=QE.selected.size===QE.ammo.length;$('bb-queue-clear').disabled=!QE.selected.size;
    $('bb-batch-position').max=String(QE.ammo.length+1);$('bb-batch-position').placeholder=`1–${QE.ammo.length+1}`;
    QE.ammo.forEach((item,index)=>{
      const row=node('div','bb-ammo-row');row.dataset.index=String(index);row.classList.toggle('selected',QE.selected.has(QE.ids[index]));
      const check=node('input');check.type='checkbox';check.checked=QE.selected.has(QE.ids[index]);check.setAttribute('aria-label',`选择第 ${index+1} 发`);check.onclick=event=>{event.stopPropagation?.();queueSelection(index,event)};row.append(check,node('span','bb-small',String(index+1)));
      const handle=node('button','bb-ammo-handle','⠿');handle.type='button';handle.title='拖动所选弹药调整顺序';handle.setAttribute('aria-label',`拖动第 ${index+1} 发及所选弹药`);handle.onpointerdown=event=>queueDragStart(event,index);handle.onpointermove=queueDragMove;handle.onpointerup=queueDragEnd;handle.onpointercancel=queueDragCancel;row.append(handle);
      const select=node('select');select.setAttribute('aria-label',`第 ${index+1} 发颜色`);for(const k of C.keys){const o=node('option','',C.labels[k]);o.value=k;select.append(o)}
      select.value=item?.color||'';select.style.borderLeft=`5px solid ${cssColor(item?.color)}`;
      select.onchange=()=>queueChange(()=>{QE.ammo[index]={...item,color:select.value}});row.append(select);
      const size=node('select');size.setAttribute('aria-label',`第 ${index+1} 发规格`);for(const k of Object.keys(C.capacity)){const o=node('option','',`${sizeNames[k]} · ${C.capacity[k]}`);o.value=k;size.append(o)}
      size.value=item?.size||'';size.onchange=()=>queueChange(()=>{QE.ammo[index]={...item,size:size.value}});row.append(size);
      const type=node('select');type.setAttribute('aria-label',`第 ${index+1} 发类型`);for(const [k,n] of [['','普通'],['bounce','反弹']]){const o=node('option','',n);o.value=k;type.append(o)}
      type.value=item?.type||'';type.onchange=()=>queueChange(()=>{QE.ammo[index]={...item};if(type.value)QE.ammo[index].type=type.value;else delete QE.ammo[index].type});row.append(type);
      const controls=node('div','bb-ammo-controls');
      for(const [text,action,disabled] of [['↑',()=>{[QE.ammo[index-1],QE.ammo[index]]=[QE.ammo[index],QE.ammo[index-1]];[QE.ids[index-1],QE.ids[index]]=[QE.ids[index],QE.ids[index-1]]},index===0],['↓',()=>{[QE.ammo[index+1],QE.ammo[index]]=[QE.ammo[index],QE.ammo[index+1]];[QE.ids[index+1],QE.ids[index]]=[QE.ids[index],QE.ids[index+1]]},index===QE.ammo.length-1],['×',()=>{QE.ammo.splice(index,1);QE.ids.splice(index,1)},false]]){
        const b=node('button','',text);b.disabled=disabled;b.title=text==='×'?'删除此发':'调整发射顺序';b.onclick=()=>queueChange(action);controls.append(b)
      }row.append(controls);row.onclick=event=>{if(event.target===row||event.target.tagName==='SPAN')queueSelection(index,event)};list.append(row);
    });
    const st=C.ammoStats(QE.level.grid,QE.ammo),caps=$('bb-queue-capacity');caps.replaceChildren(node('p','bb-small',`总发数 ${st.total} · 反弹弹 ${st.bounce} · 容量不足 ${st.shortages.length} 色`));
    for(const k of C.keys){const n=node('div','bb-capacity-line');const name=node('span');name.append(dot(k),document.createTextNode(` ${C.labels[k]}`));n.append(name,node('strong',st.caps[k]<st.board[k]?'bb-error':'bb-ok',`${st.caps[k]} / ${st.board[k]}`));caps.append(n)}
    const problems=queueIssues();issueList($('bb-queue-issues'),problems);
    $('bb-save').disabled=busy||problems.some(i=>['AMMO002','AMMO003','AMMO006'].includes(i.ruleId));$('bb-save').classList.toggle('primary',d);
    $('bb-undo').disabled=!QE.undo.length;$('bb-redo').disabled=!QE.redo.length;
  }
  async function saveQueue(){
    if(!QE)return false;busy=true;
    const problems=queueIssues();if(problems.some(i=>['AMMO002','AMMO003','AMMO006'].includes(i.ruleId))){busy=false;renderQueue();toast('弹药字段非法，未保存。',true);return false}
    try{const saved=repository.saveAmmo(QE.level.id,QE.ammo,QE.baseline);QE.level=saved;QE.baseline=C.clone(saved.ammo);busy=false;renderQueue();latestAmmo();toast('队列保存成功，已保留最新棋盘布局。');return true}
    catch(error){busy=false;renderQueue();storageError(error);return false}
  }
  async function openQueue(){
    finishMetadata();endGesture();
    if(layoutDirty()){if(!await canLeave(true))return}
    else if(!E.originOwned){toast('请先正式保存布局，再配置队列。',true);return}
    try{const latest=repository.get(E.level.id);if(!latest)throw Error('关卡尚未正式保存。');repository.assertVersion(latest);rememberActive();navigate(`#/ammo-editor.html?levelId=${encodeURIComponent(E.level.id)}`)}catch(error){storageError(error)}
  }
  async function trial(){
    finishMetadata();endGesture();if(!refreshIdentity()||!latestAmmo())return;const list=issues();if(C.blocksTrial(list)){changed(false);toast('结构或弹药配置存在问题，不能试玩。',true);return}
    setStatus('TrialPreparing');let bridgePrepared=false;
    try {
      rememberActive();bridgePrepared=true;localStorage.setItem('bp_custom_level',JSON.stringify({...C.clone(E.level),ammo:C.clone(E.level.ammo)}));busy=false;navigate('#/trial');
    }catch(error){if(bridgePrepared)try{localStorage.removeItem('bp_editor_active')}catch(cleanupError){console.error(cleanupError)}busy=false;changed(false);storageError(error)}
  }
  async function enterEditor(){
    bridgeRestored=false;
    if(E){
      try{const raw=localStorage.getItem('bp_editor_active');if(raw){const active=JSON.parse(raw);bridgeRestored=active.level?.id===E.level.id&&active.level?.schemaVersion===1&&!E.readOnly}}catch(error){storageError(error)}
      latestAmmo();changed(false);return;
    }
    setStatus('Loading');
    try {
      const raw=localStorage.getItem('bp_editor_active');let active;
      if(raw){active=JSON.parse(raw);if(active.level?.schemaVersion!==1){createReadOnly(active.level||active,'恢复状态 schemaVersion 不支持，原始返回数据保留。');busy=false;return}restore(active);bridgeRestored=true;busy=false;changed(false);return}
      const all=repository.readAll(),last=localStorage.getItem('bp_editor_last');let level=all[last]||Object.values(all)[0];
      if(level){if(level.schemaVersion!==1){createReadOnly(level,`不支持 schemaVersion ${level.schemaVersion}，原数据只读展示。`);busy=false;return}if(!Array.isArray(level.grid)||!level.grid.length||!level.grid.every(r=>typeof r==='string')){createReadOnly(level,'保存的 Grid 格式无法编辑，原数据只读展示。');busy=false;return}createState(level,true)}
      else {createState(builtinLevels().find(l=>l.id==='B005')||builtinLevels()[0]||starterLevel(),false);if(blankLevels){E.savedSnapshot=C.layout(E.level);changed(false)}}
      // Also discover never-saved drafts after a reload, not only saved IDs.
      const recoveryIds=[E.level.id];
      for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('bp_editor_draft_')&&!recoveryIds.includes(key.slice(16)))recoveryIds.push(key.slice(16))}
      let newest=null;
      for(const id of recoveryIds){const raw=localStorage.getItem(`bp_editor_draft_${id}`);if(!raw)continue;const value=JSON.parse(raw),saved=repository.get(id);
        if((!saved||Date.parse(value.updatedAt)>Date.parse(saved.updatedAt))&&(!newest||value.updatedAt>newest.updatedAt))newest=value}
      busy=false;changed(false);
      if(newest){const answer=await modal('发现恢复草稿',`${newest.level.id} 有未保存的恢复草稿。是否恢复？`,[{label:'放弃草稿',value:false},{label:'恢复',value:true,primary:true}]);
        if(answer===true)restore(newest);if(answer!==null)localStorage.removeItem(`bp_editor_draft_${newest.level.id}`)}
    } catch(error){busy=false;storageError(error);if(!E){createState(builtinLevels()[0]||starterLevel(),false);$('bb-state').textContent='Error · 读取失败'}}
  }
  function download(value,filename){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function exportData(){try{const value=route==='queue'?{...C.clone(QE.level),ammo:C.clone(QE.ammo)}:E?C.clone(E.rawLevel||E.level):repository.readAll();download(value,`${value.id||'bubble-levels'}.json`)}catch(error){storageError(error)}}
  let approvedHash=null,pausedScenes=[],routing=false;
  function navigate(hash){approvedHash=hash;if(location.hash===hash)applyRoute(hash);else location.hash=hash}
  function suspendGame(){
    if(!en.isBooted){en.events.once('ready',()=>{if(route==='editor'||route==='queue')suspendGame()});return}
    if(en.input){en.input.enabled=false;if(en.input.keyboard)en.input.keyboard.enabled=false}
    for(const scene of en.scene.getScenes(true)){const key=scene.sys.settings.key;if(!pausedScenes.includes(key))pausedScenes.push(key);en.scene.pause(key)}
  }
  function resumeGame(){if(en.input){en.input.enabled=true;if(en.input.keyboard)en.input.keyboard.enabled=true}for(const key of pausedScenes)en.scene.resume(key);pausedScenes=[]}
  function startTrialGame(){
    if(!en.isBooted){en.events.once('ready',startTrialGame);return}
    resumeGame();for(const scene of en.scene.getScenes(true))en.scene.stop(scene.sys.settings.key);en.scene.start('game');
  }
  async function applyRoute(hash){
    const desired=hash.startsWith('#/ammo-editor.html')?'queue':hash.startsWith('#/editor.html')?'editor':hash==='#/trial'?'trial':'game';
    const wasStudio=['editor','queue'].includes(route);route=desired;window.BPHome?.setRoute(route);studio.style.display=['editor','queue'].includes(route)?'block':'none';studio.classList.toggle('queue-mode',route==='queue');
    $('game').style.display=['editor','queue'].includes(route)?'none':'block';$('bb-launch').style.display=['editor','queue'].includes(route)?'none':'block';
    $('bb-launch').textContent=route==='trial'?'返回编辑器':'关卡编辑器';$('bb-exit').textContent=route==='queue'?'返回关卡编辑器':'返回首页';$('bb-page-tag').textContent=route==='queue'?'弹药队列编辑器':'关卡编辑器';
    if(route==='editor'){
      suspendGame();resize();await enterEditor();busy=false;if(E){latestAmmo();changed(false)}
      // Clear the bridge only once editor state has been restored.
      if(bridgeRestored)try{localStorage.removeItem('bp_custom_level');localStorage.removeItem('bp_editor_active')}catch(error){console.error(error)}
    }else if(route==='queue'){
      suspendGame();const params=new URLSearchParams(hash.split('?')[1]||''),id=params.get('levelId');
      try{const level=repository.get(id);if(!level)throw Error('独立队列页未找到已保存关卡。');repository.assertVersion(level);
        if(!QE||QE.level.id!==id){const ammo=C.clone(Array.isArray(level.ammo)?level.ammo:[]);QE={level,ammo,baseline:C.clone(level.ammo||[]),ids:ammo.map((_,i)=>i),nextId:ammo.length,selected:new Set(),anchor:null,undo:[],redo:[]}}renderQueue()
      }catch(error){storageError(error);navigate('#/editor.html')}
    }else if(route==='trial'){document.title='Bubble Block · 试玩';startTrialGame()}
    else {document.title='Bubble Puzzle Demo';const customPaused=pausedScenes.includes('game')&&window.__bpScene?.isCustom;resumeGame();if(customPaused||wasStudio){for(const item of en.scene.getScenes(true))en.scene.stop(item.sys.settings.key);en.scene.start('title')}}
    previousHash=location.hash;
  }
  window.addEventListener('hashchange',async()=>{
    if(routing)return;const next=location.hash;
    if(next===approvedHash){approvedHash=null;await applyRoute(next);return}
    routing=true;const old=previousHash;
    if(await canLeave()){if(leaveChoice==='discard'){if(route==='queue')QE=null;else if(route==='editor')E=null}await applyRoute(location.hash)}else{history.replaceState(null,'',location.pathname+location.search+old);previousHash=old}
    routing=false;
  });
  async function exit(){if(!await canLeave())return;if(route==='queue'){QE=null;navigate('#/editor.html')}else {E=null;navigate('#/')}}
  window.BPStudio={open:()=>navigate('#/editor.html'),returnFromTrial:()=>navigate('#/editor.html')};
  $('bb-retry').onclick=()=>{try{repository.readAll();latestAmmo();lastError=null;$('bb-error-panel').hidden=true;changed(false);toast('读取已恢复，可以重新打开关卡或重试保存。')}catch(error){storageError(error)}};
  $('bb-diagnostic').onclick=()=>{let raw;try{raw=localStorage.getItem(repository.key)}catch(error){raw=error.message}download({error:lastError,rawStorage:raw,currentDraft:E?snapshot():null},'bubble-editor-diagnostic.json')};
  $('bb-launch').onclick=()=>navigate('#/editor.html');$('bb-new').onclick=newLevel;$('bb-open').onclick=openLevels;
  $('bb-save').onclick=()=>route==='queue'?saveQueue():saveLayout();$('bb-undo').onclick=undo;$('bb-redo').onclick=redo;$('bb-validate').onclick=validateNow;
  $('bb-trial').onclick=trial;$('bb-queue-open').onclick=openQueue;$('bb-summary-queue').onclick=openQueue;$('bb-exit').onclick=exit;$('bb-export').onclick=exportData;
  $('bb-recolor').onclick=()=>recolor();$('bb-delete').onclick=()=>recolor(true);$('bb-copy').onclick=copy;$('bb-paste').onclick=paste;
  $('bb-pair-add').onclick=pairSelection;$('bb-pair-remove').onclick=unpairSelection;
  $('bb-bubble-normal').onclick=()=>setBubbleType(false);$('bb-bubble-hidden').onclick=()=>setBubbleType(true);
  $('bb-full').onclick=()=>setFirst(false);$('bb-first').onclick=()=>setFirst(true);$('bb-add1').onclick=()=>addRows(1);$('bb-add5').onclick=()=>addRows(5);$('bb-trim').onclick=trimRows;
  $('bb-zoom-in').onclick=()=>zoomBy(.1);$('bb-zoom-out').onclick=()=>zoomBy(-.1);$('bb-zoom').onclick=()=>zoomBy(1-E.view.zoom);$('bb-fit').onclick=()=>{fit();changed(false)};
  $('bb-toggle-info').onclick=()=>document.querySelector('.bb-workspace').classList.toggle('show-info');
  for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
  for(const k of C.keys){
    const b=node('button','bb-swatch');b.style.background=cssColor(k);b.dataset.color=k;b.title=`${C.labels[k]}色`;b.setAttribute('aria-label',`${C.labels[k]}色`);b.onclick=()=>{E.color=k;changed(false)};$('bb-colors').append(b);
    const n=node('div','bb-count');n.append(dot(k));const number=node('span','',0);number.id=`bb-count-${k}`;n.append(number);n.title=`${C.labels[k]}色数量`;$('bb-counts').append(n);
    const o=node('option','',C.labels[k]);o.value=k;$('bb-ammo-color').append(o);
  }
  $('bb-ammo-add').onclick=()=>queueChange(()=>{const item={color:$('bb-ammo-color').value,size:$('bb-ammo-size').value};if($('bb-ammo-type').value)item.type=$('bb-ammo-type').value;QE.ammo.push(item);QE.ids.push(QE.nextId++)});
  $('bb-queue-select-all').onclick=()=>{QE.selected=new Set(QE.ids);renderQueue()};
  $('bb-queue-clear').onclick=()=>{QE.selected.clear();QE.anchor=null;renderQueue()};
  for(const k of C.keys){const o=node('option','',C.labels[k]);o.value=k;$('bb-batch-color').append(o)}
  $('bb-batch-color').value='keep';$('bb-batch-size').value='keep';$('bb-batch-type').value='keep';
  $('bb-batch-apply').onclick=()=>{const color=$('bb-batch-color').value,size=$('bb-batch-size').value,type=$('bb-batch-type').value;if([color,size,type].every(v=>v==='keep')){toast('请先选择要修改的字段。',true);return}const picked=queueSelected();queueChange(()=>{for(const i of picked){const item={...QE.ammo[i]};if(color!=='keep')item.color=color;if(size!=='keep')item.size=size;if(type==='normal')delete item.type;else if(type==='bounce')item.type='bounce';QE.ammo[i]=item}});toast(`已修改 ${picked.length} 发弹药。`)};
  $('bb-batch-move').onclick=()=>{const raw=$('bb-batch-position').value,boundary=Number(raw)-1;if(!raw||!Number.isInteger(boundary)||boundary<0||boundary>QE.ammo.length){toast(`请输入 1–${QE.ammo.length+1} 的位置。`,true);return}queueMove(boundary)};
  $('bb-batch-delete').onclick=async()=>{const count=QE.selected.size;if(!count)return;const result=await modal('删除弹药',`确定删除选中的 ${count} 发弹药吗？`,[{label:'取消',value:'cancel'},{label:'删除',value:'delete',primary:true}]);if(result!=='delete')return;queueChange(()=>{const selected=QE.selected;QE.ammo=QE.ammo.filter((_,i)=>!selected.has(QE.ids[i]));QE.ids=QE.ids.filter(id=>!selected.has(id));QE.selected.clear();QE.anchor=null})};
  for(const [id,property] of [['bb-note','note']]){
    $(id).addEventListener('focus',()=>{if(!E||E.readOnly)return;if(!metadataBefore)metadataBefore=C.layout(E.level)});
    $(id).addEventListener('input',()=>{if(!E||E.readOnly)return;E.level[property]=$(id).value;changed()});$(id).addEventListener('blur',finishMetadata);
  }
  window.addEventListener('keydown',event=>{
    if(!['editor','queue'].includes(route)||$('bb-dialog').open||busy)return;
    const input=event.target.closest?.('input,textarea,select,[contenteditable="true"]'),cmd=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(cmd&&key==='s'){event.preventDefault();route==='queue'?saveQueue():saveLayout();return}
    if(input)return;
    if(cmd&&key==='z'){event.preventDefault();event.shiftKey?redo():undo();return}
    if(route==='queue'){if(event.key==='Escape'){QE.selected.clear();renderQueue()}else if(cmd&&key==='a'){event.preventDefault();QE.selected=new Set(QE.ids);renderQueue()}else if(event.key==='Delete'||event.key==='Backspace'){if(QE.selected.size){event.preventDefault();$('bb-batch-delete').click()}}return}
    if(cmd&&key==='c'){event.preventDefault();copy();return}if(cmd&&key==='v'){event.preventDefault();paste();return}
    if(key===' '){event.preventDefault();space=true;canvas.style.cursor='grab';return}
    if(event.key==='Escape'){if(gesture&&['move','select'].includes(gesture.kind))endGesture(false);if(floating)floating=null;else E.selection.clear();changed(false);return}
    if(event.key==='Delete'||event.key==='Backspace'){if(E.selection.size){event.preventDefault();recolor(true)}return}
    if(!cmd){const shortcuts={b:'brush',e:'erase',v:'select',h:'pan'};if(shortcuts[key]){event.preventDefault();setTool(shortcuts[key])}}
  });
  window.addEventListener('keyup',event=>{if(event.key===' '){space=false;if(E&&route==='editor')canvas.style.cursor=E.tool==='pan'?'grab':'crosshair'}});
  window.addEventListener('beforeunload',event=>{if(dirty()){finishMetadata();endGesture(false);autoDraft();event.preventDefault();event.returnValue=''}});
  window.addEventListener('focus',()=>{if(E&&route==='editor'){latestAmmo();changed(false)}if(QE&&route==='queue'){try{const latest=repository.get(QE.level.id);if(latest){repository.assertVersion(latest);QE.level=latest;renderQueue()}}catch(error){storageError(error)}}});
  window.addEventListener('storage',event=>{if(event.key===repository.key&&E){latestAmmo();if(route==='editor')changed(false)}});
  setInterval(()=>{if(E)autoDraft()},10000);
  applyRoute(location.hash);
})();
