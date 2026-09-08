import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const pdfjsLib = window.pdfjsLib;
if (!pdfjsLib) throw new Error('PDF.js failed to load.');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const MODE = document.body.dataset.mode || 'student';
const TEACHER = MODE === 'teacher';
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

const els = {
  loading:$('loading'), error:$('error'), workspace:$('workspace'), docTitle:$('docTitle'), contextText:$('contextText'),
  pdfScroller:$('pdfScroller'), canvasWrap:$('canvasWrap'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'),
  prevPage:$('prevPage'), nextPage:$('nextPage'), pageInput:$('pageInput'), pageCount:$('pageCount'), zoomOut:$('zoomOut'), zoomIn:$('zoomIn'), fitPage:$('fitPage'),
  boardPanel:$('boardPanel'), toggleBoard:$('toggleBoard'), boardText:$('boardText'), boardLabel:$('boardLabel'), boardScopeLabel:$('boardScopeLabel'), boardTitleInput:$('boardTitleInput'), boardTitleDisplay:$('boardTitleDisplay'),
  permanentNotesSection:$('permanentNotesSection'), permanentTitle:$('permanentTitle'), permanentText:$('permanentText'), pageNotesSection:$('pageNotesSection'), pageNotesBadge:$('pageNotesBadge'), pageNotesList:$('pageNotesList'), studentImageTitle:$('studentImageTitle'),
  boardPrev:$('boardPrev'), boardNext:$('boardNext'), boardAdd:$('boardAdd'), boardDelete:$('boardDelete'),
  imageSection:$('imageSection'), imageStage:$('imageStage'), galleryZoomWrap:$('galleryZoomWrap'), galleryBoard:$('galleryBoard'), galleryImagesLayer:$('galleryImagesLayer'), galleryOverlayCanvas:$('galleryOverlayCanvas'), imageCounter:$('imageCounter'), imagePrev:$('imagePrev'), imageNext:$('imageNext'), imageZoomOut:$('imageZoomOut'), imageZoomReset:$('imageZoomReset'), imageZoomIn:$('imageZoomIn'), galleryArrangeBtn:$('galleryArrangeBtn'), galleryTileBtn:$('galleryTileBtn'), pasteImageBtn:$('pasteImageBtn'), deleteImageBtn:$('deleteImageBtn'), imageFileInput:$('imageFileInput'),
  statusText:$('statusText'), liveText:$('liveText'),
  toolRail:$('toolRail'), toolButtons:[...document.querySelectorAll('[data-tool]')], widthInput:$('widthInput'), colorInput:$('colorInput'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelected:$('deleteSelected'),
  toolSplit:$('toolSplit'), noteSplit:$('noteSplit'), noteInnerSplit:$('noteInnerSplit'), studentSplit:$('studentSplit'), studentPermanentSplit:$('studentPermanentSplit'), studentPageSplit:$('studentPageSplit'),
  loginPanel:$('loginPanel'), loginForm:$('loginForm'), emailInput:$('emailInput'), passwordInput:$('passwordInput'), signOutBtn:$('signOutBtn'),
  libraryBtn:$('libraryBtn'), libraryDialog:$('libraryDialog'), libraryList:$('libraryList'), createDocBtn:$('createDocBtn'), newTitle:$('newTitle'), newDriveUrl:$('newDriveUrl'), copyStudentLink:$('copyStudentLink'), hookStudentsBtn:$('hookStudentsBtn'), exportPdf:$('exportPdf'),
  fullscreenBtn:$('fullscreenBtn'), focusPdfBtn:$('focusPdfBtn'), resetLayoutBtn:$('resetLayoutBtn'),
  boardUnderline:$('boardUnderline'), boardFontSize:$('boardFontSize'), boardTextColor:$('boardTextColor'), boardHighlightColor:$('boardHighlightColor'), boardClearFormat:$('boardClearFormat')
};

const state = {
  token:null, session:null, doc:null, pdf:null, pageNo:1, scale:1.15, fit:true, rendering:false, pendingPage:null,
  pageObjects:[], pageCache:new Map(), boards:[], boardNo:1, images:[], imageIndex:0, imageBlobUrls:new Map(), galleryState:null, selectedGalleryImageId:null, galleryArrange:false, revision:0,
  tool:'pen', activeSurface:'pdf', pointer:null, selectedId:null, clipboard:null, undo:[], redo:[], galleryUndo:[], galleryRedo:[], galleryPointer:null, rafPending:false,
  saveTimer:null, boardSaveTimer:null, boardTextTimer:null, boardTitleTimer:null, pollTimer:null, heartbeatTimer:null,
  boardOpen:true, teacherOnline:false, studentHooked:true, followTeacher:true, liveBoardNo:1, liveImageId:null, liveScrollRatio:0, liveCenterX:.5, liveCenterY:.5, liveZoom:1, imageZoom:.5, pinch:null, scrollSyncTimer:null,
  liveChannel:null, liveReady:false, liveSeq:0, broadcastTimer:null,
  remoteViewPending:null, remoteViewBusy:false, remoteViewTs:0, remoteViewSeq:0, lastRealtimeAt:0,
  pageBroadcastTimer:null, boardBroadcastTimer:null, boardSelectionRange:null, touchPan:null, gallerySaveTimer:null, galleryBroadcastTimer:null, galleryMigrating:false
};

function showError(message){
  els.loading?.classList.add('hidden');
  els.workspace?.classList.add('hidden');
  if(els.error){ els.error.textContent=message; els.error.classList.remove('hidden'); }
}
function showLoading(message='Loading…'){
  els.error?.classList.add('hidden');
  if(els.loading){ els.loading.textContent=message; els.loading.classList.remove('hidden'); }
}
function setStatus(message){ if(els.statusText) els.statusText.textContent=message; }
// Explicit hook is authoritative. Teacher-online is only informational.
function studentFollowActive(){ return !TEACHER && state.studentHooked; }
function updateHookButton(){
  if(!TEACHER || !els.hookStudentsBtn) return;
  els.hookStudentsBtn.textContent=state.studentHooked?'🔗 Students hooked':'⛓ Students unhooked';
  els.hookStudentsBtn.classList.toggle('hooked',state.studentHooked);
  els.hookStudentsBtn.classList.toggle('unhooked',!state.studentHooked);
  els.hookStudentsBtn.setAttribute('aria-pressed',String(state.studentHooked));
  els.hookStudentsBtn.title=state.studentHooked?'Students follow your PDF page and position. Their zoom and notes panel stay under their own control.':'Students can browse pages freely. Your annotations still update.';
}

function refreshStudentHookUi(){
  if(TEACHER) return;
  const following=studentFollowActive();
  document.body.classList.toggle('student-following',following);
  if(els.liveText){
    if(following) els.liveText.textContent=state.liveReady?'⚡ Hooked live':'↻ Hooked backup';
    else els.liveText.textContent=state.teacherOnline?'Teacher online • free view':'Teacher offline • free view';
    els.liveText.classList.toggle('following',following);
  }
  if(els.prevPage) els.prevPage.disabled=following||state.pageNo<=1;
  if(els.nextPage) els.nextPage.disabled=following||state.pageNo>=(state.pdf?.numPages||1);
  if(els.pageInput) els.pageInput.disabled=following;
}
function clamp01(v, fallback=.5){
  const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
}
function liveTopic(){
  if(!state.doc?.id) return null;
  const secret=TEACHER?state.doc.student_token:state.token;
  if(!secret) return null;
  return `snt-pdf-live:${state.doc.id}:${String(secret).slice(0,24)}`;
}
function captureTeacherView(){
  if(!TEACHER||!state.doc||!state.pdf) return null;
  const fullW=Math.max(1,els.pdfScroller.scrollWidth),fullH=Math.max(1,els.pdfScroller.scrollHeight);
  const maxX=Math.max(0,fullW-els.pdfScroller.clientWidth),maxY=Math.max(0,fullH-els.pdfScroller.clientHeight);
  const centerX=maxX>0?clamp01((els.pdfScroller.scrollLeft+els.pdfScroller.clientWidth/2)/fullW):.5;
  const centerY=maxY>0?clamp01((els.pdfScroller.scrollTop+els.pdfScroller.clientHeight/2)/fullH):.5;
  const scrollRatio=maxY>0?clamp01(els.pdfScroller.scrollTop/maxY,0):0;
  state.liveScrollRatio=scrollRatio;state.liveCenterX=centerX;state.liveCenterY=centerY;state.liveZoom=state.scale;
  return {
    doc_id:state.doc.id,
    live_page:state.pageNo,
    live_center_x:centerX,
    live_center_y:centerY,
    live_scroll_ratio:scrollRatio,
    student_hooked:state.studentHooked,
    live_image_id: state.liveImageId || null,
    sent_at:Date.now(),
    seq:++state.liveSeq
  };
}
function broadcastTeacherView(){
  if(!TEACHER||!state.liveReady||!state.liveChannel) return;
  const payload=captureTeacherView();if(!payload)return;
  state.liveChannel.send({type:'broadcast',event:'teacher-view',payload}).catch(()=>{});
}
function scheduleTeacherBroadcast(delay=45){
  if(!TEACHER)return;
  clearTimeout(state.broadcastTimer);
  state.broadcastTimer=setTimeout(()=>broadcastTeacherView(),delay);
}
function queueRemoteTeacherView(payload){
  if(TEACHER||!payload||payload.doc_id!==state.doc?.id)return;
  const ts=Number(payload.sent_at||0),seq=Number(payload.seq||0);
  if(ts<state.remoteViewTs||(ts===state.remoteViewTs&&seq<=state.remoteViewSeq))return;
  state.remoteViewTs=ts;state.remoteViewSeq=seq;state.lastRealtimeAt=Date.now();
  state.remoteViewPending=payload;
  drainRemoteTeacherView().catch(()=>{});
}
async function drainRemoteTeacherView(){
  if(TEACHER||state.remoteViewBusy)return;
  state.remoteViewBusy=true;
  try{
    while(state.remoteViewPending){
      const p=state.remoteViewPending;state.remoteViewPending=null;
      state.studentHooked=p.student_hooked!==false;
      state.liveCenterX=clamp01(p.live_center_x,.5);
      state.liveCenterY=clamp01(p.live_center_y,.5);
      const incomingImage = p.live_image_id || null;
      if(incomingImage !== state.liveImageId){
        state.liveImageId = incomingImage;
        if(incomingImage) selectGalleryImage(incomingImage,false);
      }
      refreshStudentHookUi();
      if(!state.studentHooked||!state.pdf)continue;
      const target=Math.max(1,Math.min(state.pdf.numPages,Number(p.live_page||1)));
      if(target!==state.pageNo)await renderPage(target,true);
      requestAnimationFrame(()=>requestAnimationFrame(()=>applyTeacherCenter()));
    }
  }finally{state.remoteViewBusy=false;}
}
async function setupLiveChannel(){
  const topic=liveTopic();if(!topic)return;
  if(state.liveChannel){try{await supabase.removeChannel(state.liveChannel);}catch{};state.liveChannel=null;state.liveReady=false;}
  const ch=supabase.channel(topic,{config:{broadcast:{self:false,ack:false}}});
  state.liveChannel=ch;
  ch.on('broadcast',{event:'teacher-view'},({payload})=>queueRemoteTeacherView(payload));
  ch.on('broadcast',{event:'page-content'},({payload})=>applyRemotePageContent(payload));
  ch.on('broadcast',{event:'board-content'},({payload})=>applyRemoteBoardContent(payload));
  ch.on('broadcast',{event:'gallery-content'},({payload})=>applyRemoteGalleryContent(payload));
  ch.on('broadcast',{event:'content-refresh'},({payload})=>{
    if(TEACHER||payload?.doc_id!==state.doc?.id)return;
    state.lastRealtimeAt=Date.now();
    if(payload.kind==='images')loadImages(true).catch(()=>{});
    else loadStudentBoards().catch(()=>{});
  });
  ch.on('broadcast',{event:'student-ready'},()=>{
    if(!TEACHER)return;
    broadcastTeacherView();
    broadcastPageContent();
    broadcastBoardContent();
    broadcastGalleryContent();
  });
  ch.subscribe((status)=>{
    state.liveReady=status==='SUBSCRIBED';
    if(!TEACHER)refreshStudentHookUi();
    if(status==='SUBSCRIBED'){
      if(TEACHER){broadcastTeacherView();broadcastPageContent();broadcastBoardContent();broadcastGalleryContent();}
      else ch.send({type:'broadcast',event:'student-ready',payload:{doc_id:state.doc.id,sent_at:Date.now()}}).catch(()=>{});
    }
  });
}

const RICH_MARKER='<!--snt-rich-->';

function sanitizeRichHtml(input=''){
  const template=document.createElement('template');
  template.innerHTML=String(input||'');
  const allowed=new Set(['DIV','P','BR','SPAN','U','B','STRONG','I','EM','FONT']);
  const safeColor=v=>/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(String(v||'').trim());
  const safeSize=v=>/^(?:[1-7]|\d{1,2}(?:\.\d+)?px|xx-small|x-small|small|medium|large|x-large|xx-large)$/i.test(String(v||'').trim());

  const cleanNode=node=>{
    for(const child of [...node.childNodes]){
      if(child.nodeType!==1)continue;
      if(!allowed.has(child.tagName)){
        const frag=document.createDocumentFragment();
        while(child.firstChild)frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        cleanNode(node);
        continue;
      }
      const oldStyle=child.getAttribute('style')||'';
      const oldColor=child.getAttribute('color')||'';
      const oldSize=child.getAttribute('size')||'';
      for(const a of [...child.attributes])child.removeAttribute(a.name);

      if(child.tagName==='FONT'){
        if(safeColor(oldColor))child.setAttribute('color',oldColor.trim());
        if(/^[1-7]$/.test(oldSize.trim()))child.setAttribute('size',oldSize.trim());
      }

      const kept=[];
      for(const decl of oldStyle.split(';')){
        const i=decl.indexOf(':');if(i<0)continue;
        const prop=decl.slice(0,i).trim().toLowerCase(),val=decl.slice(i+1).trim();
        if((prop==='color'||prop==='background-color')&&safeColor(val))kept.push(`${prop}:${val}`);
        else if(prop==='font-size'&&safeSize(val))kept.push(`${prop}:${val}`);
        else if(prop==='text-decoration'&&/^underline$/i.test(val))kept.push('text-decoration:underline');
        else if(prop==='font-weight'&&/^(bold|[5-9]00)$/i.test(val))kept.push(`font-weight:${val}`);
        else if(prop==='font-style'&&/^italic$/i.test(val))kept.push('font-style:italic');
      }
      if(kept.length)child.setAttribute('style',kept.join(';'));
      cleanNode(child);
    }
  };
  cleanNode(template.content);
  return template.innerHTML;
}
function storedBoardHtml(raw=''){
  const v=String(raw||'');
  if(v.startsWith(RICH_MARKER))return sanitizeRichHtml(v.slice(RICH_MARKER.length));
  return null;
}
function setBoardEditorContent(raw=''){
  if(!els.boardText)return;
  const rich=storedBoardHtml(raw);
  if(rich!==null)els.boardText.innerHTML=rich;
  else els.boardText.textContent=String(raw||'');
}
function getBoardEditorStorage(){
  if(!els.boardText)return '';
  const html=sanitizeRichHtml(els.boardText.innerHTML);
  const probe=document.createElement('div');probe.innerHTML=html;
  const plain=(probe.innerText||probe.textContent||'').replace(/\u00a0/g,' ').trim();
  return plain ? RICH_MARKER+html : '';
}
function renderStoredBoardContent(el,raw,emptyText=''){
  if(!el)return;
  const v=String(raw||'');
  if(!v.trim()){el.textContent=emptyText;return;}
  const rich=storedBoardHtml(v);
  if(rich!==null)el.innerHTML=rich;
  else el.textContent=v;
}
function rememberBoardSelection(){
  if(!TEACHER||!els.boardText)return;
  const sel=window.getSelection();if(!sel||!sel.rangeCount)return;
  const r=sel.getRangeAt(0);
  const node=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentNode;
  if(node===els.boardText||els.boardText.contains(node))state.boardSelectionRange=r.cloneRange();
}
function restoreBoardSelection(){
  if(!state.boardSelectionRange||!els.boardText)return;
  const sel=window.getSelection();if(!sel)return;
  sel.removeAllRanges();sel.addRange(state.boardSelectionRange);
}
function applyBoardFormat(command,value=null){
  if(!TEACHER||!els.boardText)return;
  els.boardText.focus();restoreBoardSelection();
  try{
    document.execCommand('styleWithCSS',false,true);
    document.execCommand(command,false,value);
  }catch{}
  rememberBoardSelection();
  saveBoardSoon();
}
function currentBoardRealtimePayload(){
  if(!TEACHER||!state.doc)return null;
  const b=boardByNo();if(!b)return null;
  return {
    doc_id:state.doc.id,
    board:{
      board_no:Number(state.boardNo),
      title:(els.boardTitleInput?.value||b.title||`Board ${state.boardNo}`).trim().slice(0,80)||`Board ${state.boardNo}`,
      text_content:getBoardEditorStorage(),
      board_scope:b.is_permanent?'global':'page',
      page_no:b.is_permanent?1:Number(b.page_no||state.pageNo),
      is_permanent:!!b.is_permanent
    },
    sent_at:Date.now()
  };
}
function broadcastPageContent(){
  if(!TEACHER||!state.liveReady||!state.liveChannel||!state.doc)return;
  state.liveChannel.send({
    type:'broadcast',event:'page-content',
    payload:{doc_id:state.doc.id,page_no:Number(state.pageNo),objects:clone(state.pageObjects),sent_at:Date.now()}
  }).catch(()=>{});
}
function schedulePageContentBroadcast(delay=25){
  if(!TEACHER)return;
  clearTimeout(state.pageBroadcastTimer);
  state.pageBroadcastTimer=setTimeout(()=>broadcastPageContent(),delay);
}
function broadcastBoardContent(){
  if(!TEACHER||!state.liveReady||!state.liveChannel)return;
  const payload=currentBoardRealtimePayload();if(!payload)return;
  state.liveChannel.send({type:'broadcast',event:'board-content',payload}).catch(()=>{});
}
function scheduleBoardContentBroadcast(delay=70){
  if(!TEACHER)return;
  clearTimeout(state.boardBroadcastTimer);
  state.boardBroadcastTimer=setTimeout(()=>broadcastBoardContent(),delay);
}
function broadcastContentRefresh(kind='boards'){
  if(!TEACHER||!state.liveReady||!state.liveChannel||!state.doc)return;
  state.liveChannel.send({type:'broadcast',event:'content-refresh',payload:{doc_id:state.doc.id,kind,sent_at:Date.now()}}).catch(()=>{});
}
function applyRemotePageContent(payload){
  if(TEACHER||!payload||payload.doc_id!==state.doc?.id)return;
  if(Number(payload.page_no)!==Number(state.pageNo))return;
  state.pageObjects=Array.isArray(payload.objects)?clone(payload.objects):[];
  drawOverlay();
  state.lastRealtimeAt=Date.now();
}
function applyRemoteBoardContent(payload){
  if(TEACHER||!payload||payload.doc_id!==state.doc?.id||!payload.board)return;
  const b=payload.board;
  if(!(b.is_permanent===true||(b.board_scope==='page'&&Number(b.page_no)===Number(state.pageNo))))return;
  const i=state.boards.findIndex(x=>Number(x.board_no)===Number(b.board_no));
  if(i>=0)state.boards[i]={...state.boards[i],...b};
  else state.boards.push({...b});
  renderStudentNotes();
  const active=state.boards.find(x=>Number(x.board_no)===Number(state.boardNo));
  if(els.studentImageTitle)els.studentImageTitle.textContent='Teacher gallery';
  state.lastRealtimeAt=Date.now();
}


const GALLERY_WIDTH=2400;
const GALLERY_HEIGHT=1800;
const GALLERY_COLS=4;
const GALLERY_CELL_W=570;
const GALLERY_CELL_H=335;

function defaultGalleryState(){return {version:3,width:GALLERY_WIDTH,height:GALLERY_HEIGHT,placements:{},objects:[],legacy_migrated:false,updated_at:null};}
function normaliseGalleryState(raw){
  const g=raw&&typeof raw==='object'?clone(raw):defaultGalleryState();
  g.version=3;g.width=GALLERY_WIDTH;g.height=GALLERY_HEIGHT;
  if(!g.placements||typeof g.placements!=='object'||Array.isArray(g.placements))g.placements={};
  if(!Array.isArray(g.objects))g.objects=[];
  g.legacy_migrated=!!g.legacy_migrated;
  for(const [id,p] of Object.entries(g.placements)){
    if(!p||typeof p!=='object'){delete g.placements[id];continue;}
    p.x=Math.max(0,Math.min(GALLERY_WIDTH-80,Number.isFinite(Number(p.x))?Number(p.x):0));
    p.y=Math.max(0,Math.min(GALLERY_HEIGHT-60,Number.isFinite(Number(p.y))?Number(p.y):0));
    p.w=Math.max(90,Math.min(GALLERY_WIDTH-p.x,Number.isFinite(Number(p.w))?Number(p.w):420));
    p.h=Math.max(70,Math.min(GALLERY_HEIGHT-p.y,Number.isFinite(Number(p.h))?Number(p.h):280));
    p.z=Math.max(1,Number(p.z||1));
    if(Number.isFinite(Number(p.aspect_ratio))&&Number(p.aspect_ratio)>.05)p.aspect_ratio=Number(p.aspect_ratio);
  }
  return g;
}
function currentGalleryPlacement(id){return state.galleryState?.placements?.[id]||null;}
function defaultPlacementForIndex(i){
  const col=i%GALLERY_COLS,row=Math.floor(i/GALLERY_COLS);
  return {x:40+col*GALLERY_CELL_W,y:45+row*GALLERY_CELL_H,w:500,h:280,z:i+1,aspect_ratio:null};
}
function ensureGalleryPlacements(){
  if(!state.galleryState)state.galleryState=defaultGalleryState();
  let changed=false;
  const valid=new Set(state.images.map(x=>x.id));
  for(const id of Object.keys(state.galleryState.placements)){if(!valid.has(id)){delete state.galleryState.placements[id];changed=true;}}
  state.images.forEach((img,i)=>{if(!state.galleryState.placements[img.id]){state.galleryState.placements[img.id]=defaultPlacementForIndex(i);changed=true;}});
  return changed;
}
function galleryObjectFromImageObject(o,p){
  const gx=x=>(p.x+Number(x||0)*p.w)/GALLERY_WIDTH,gy=y=>(p.y+Number(y||0)*p.h)/GALLERY_HEIGHT;
  const n=clone(o);n.id=uuid();
  if(Array.isArray(n.points))n.points=n.points.map(pt=>({x:gx(pt.x),y:gy(pt.y)}));
  if(typeof n.x==='number'){n.x=gx(n.x);n.y=gy(n.y);}
  for(const pair of [['x1','y1'],['x2','y2']]){if(typeof n[pair[0]]==='number'){n[pair[0]]=gx(n[pair[0]]);n[pair[1]]=gy(n[pair[1]]);}}
  return n;
}
async function migrateLegacyImageAnnotations(){
  if(!TEACHER||!state.galleryState||state.galleryState.legacy_migrated||state.galleryMigrating)return;
  state.galleryMigrating=true;
  try{
    let migrated=0;
    for(const image of state.images){
      const p=currentGalleryPlacement(image.id);if(!p)continue;
      try{
        const d=await api('image-annotations',{image:image.id});
        const objs=Array.isArray(d.objects)?d.objects:[];
        for(const o of objs){state.galleryState.objects.push(galleryObjectFromImageObject(o,p));migrated++;}
      }catch{}
    }
    state.galleryState.legacy_migrated=true;
    if(migrated)setStatus(`Moved ${migrated} old image annotation${migrated===1?'':'s'} onto gallery canvas`);
    await saveGalleryStateNow();
  }finally{state.galleryMigrating=false;}
}
async function loadGalleryState(force=false){
  if(!state.doc)return;
  try{
    const data=await api('gallery-state');
    state.galleryState=normaliseGalleryState(data.gallery||data);
    const changed=ensureGalleryPlacements();
    if(TEACHER&&changed)saveGalleryStateSoon(80);
    if(TEACHER&&!state.galleryState.legacy_migrated)await migrateLegacyImageAnnotations();
  }catch(e){
    if(!state.galleryState)state.galleryState=defaultGalleryState();
    ensureGalleryPlacements();setStatus('Gallery state load failed: '+e.message);
  }
}
function saveGalleryStateSoon(delay=120){
  if(!TEACHER||!state.galleryState)return;
  scheduleGalleryBroadcast(35);
  clearTimeout(state.gallerySaveTimer);
  state.gallerySaveTimer=setTimeout(()=>saveGalleryStateNow().catch(e=>setStatus(e.message)),delay);
}
async function saveGalleryStateNow(){
  if(!TEACHER||!state.doc||!state.galleryState)return;
  state.galleryState.updated_at=new Date().toISOString();
  const r=await fetch(apiUrl('save-gallery-state'),{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({gallery:state.galleryState})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Gallery save failed.');
}
function broadcastGalleryContent(){
  if(!TEACHER||!state.liveReady||!state.liveChannel||!state.galleryState)return;
  state.liveChannel.send({type:'broadcast',event:'gallery-content',payload:{doc_id:state.doc.id,gallery:clone(state.galleryState),sent_at:Date.now()}}).catch(()=>{});
}
function scheduleGalleryBroadcast(delay=60){if(!TEACHER)return;clearTimeout(state.galleryBroadcastTimer);state.galleryBroadcastTimer=setTimeout(()=>broadcastGalleryContent(),delay);}
function applyRemoteGalleryContent(payload){
  if(TEACHER||!payload||payload.doc_id!==state.doc?.id||!payload.gallery)return;
  state.galleryState=normaliseGalleryState(payload.gallery);ensureGalleryPlacements();renderGallery();state.lastRealtimeAt=Date.now();
}
function syncGalleryCanvas(){
  if(!els.galleryOverlayCanvas||!state.galleryState)return;
  const c=els.galleryOverlayCanvas,dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const w=state.galleryState.width,h=state.galleryState.height;
  if(c.width!==Math.floor(w*dpr)||c.height!==Math.floor(h*dpr)){c.width=Math.floor(w*dpr);c.height=Math.floor(h*dpr);c.style.width=w+'px';c.style.height=h+'px';}
}
function drawGalleryOverlay(){
  const c=els.galleryOverlayCanvas;if(!c||!state.galleryState)return;syncGalleryCanvas();const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  for(const o of state.galleryState.objects||[])drawObject(ctx,o,c,TEACHER&&state.activeSurface==='gallery'&&o.id===state.selectedId);
}
function galleryImageIndex(id){return state.images.findIndex(x=>x.id===id);}
function updateGalleryToolbar(){
  const n=state.images.length,idx=galleryImageIndex(state.selectedGalleryImageId);
  if(els.imageCounter)els.imageCounter.textContent=n?`${n} image${n===1?'':'s'}${idx>=0?` • ${idx+1}/${n}`:''}`:'0 images';
  if(els.imagePrev)els.imagePrev.disabled=!n||idx<=0;
  if(els.imageNext)els.imageNext.disabled=!n||idx<0||idx>=n-1;
  if(els.deleteImageBtn)els.deleteImageBtn.disabled=!TEACHER||idx<0;
  if(els.galleryArrangeBtn){els.galleryArrangeBtn.textContent=state.galleryArrange?'Done arranging':'Move / resize images';els.galleryArrangeBtn.classList.toggle('active',state.galleryArrange);}
  if(els.imageZoomReset)els.imageZoomReset.textContent=`${Math.round(state.imageZoom*100)}%`;
}
function setGallerySelectionVisual(id){
  state.selectedGalleryImageId=id;state.liveImageId=id;
  const idx=galleryImageIndex(id);if(idx>=0)state.imageIndex=idx;
  els.galleryImagesLayer?.querySelectorAll('.gallery-tile').forEach(t=>t.classList.toggle('selected',t.dataset.imageId===id));
  updateGalleryToolbar();
}
function fitPlacementToNaturalAspect(p,img){
  if(!p||!img?.naturalWidth||!img?.naturalHeight)return false;
  const ratio=img.naturalWidth/img.naturalHeight;if(!Number.isFinite(ratio)||ratio<=.05)return false;
  if(Number.isFinite(Number(p.aspect_ratio))&&Number(p.aspect_ratio)>.05)return false;
  p.aspect_ratio=ratio;
  let w=Math.max(90,Math.min(GALLERY_WIDTH-p.x,Number(p.w||500)));
  let h=w/ratio;
  if(h<70){h=70;w=h*ratio;}
  if(h>GALLERY_HEIGHT-p.y){h=Math.max(70,GALLERY_HEIGHT-p.y);w=h*ratio;}
  if(w>GALLERY_WIDTH-p.x){w=Math.max(90,GALLERY_WIDTH-p.x);h=w/ratio;}
  p.w=w;p.h=Math.max(70,h);
  return true;
}
function autoScrollGalleryForPointer(clientX,clientY){
  const stage=els.imageStage;if(!stage)return;
  const r=stage.getBoundingClientRect(),edge=58,step=28;
  if(clientX<r.left+edge)stage.scrollLeft=Math.max(0,stage.scrollLeft-step);
  else if(clientX>r.right-edge)stage.scrollLeft=Math.min(stage.scrollWidth-stage.clientWidth,stage.scrollLeft+step);
  if(clientY<r.top+edge)stage.scrollTop=Math.max(0,stage.scrollTop-step);
  else if(clientY>r.bottom-edge)stage.scrollTop=Math.min(stage.scrollHeight-stage.clientHeight,stage.scrollTop+step);
}
async function buildGalleryTile(image){
  const p=currentGalleryPlacement(image.id);if(!p||!els.galleryImagesLayer)return;
  const tile=document.createElement('div');tile.className='gallery-tile';tile.dataset.imageId=image.id;
  if(image.id===state.selectedGalleryImageId)tile.classList.add('selected');
  tile.style.left=p.x+'px';tile.style.top=p.y+'px';tile.style.width=p.w+'px';tile.style.height=p.h+'px';tile.style.zIndex=String(p.z||1);
  const label=document.createElement('div');label.className='gallery-tile-label';label.textContent=image.image_name||'Gallery image';
  const img=document.createElement('img');img.alt=image.image_name||'Gallery image';img.draggable=false;
  const handle=document.createElement('div');handle.className='gallery-resize-handle';handle.title='Drag to resize';
  tile.append(label,img,handle);els.galleryImagesLayer.appendChild(tile);
  fetchImageBlobUrl(image).then(url=>{
    img.onload=()=>{
      if(fitPlacementToNaturalAspect(p,img)){
        tile.style.width=p.w+'px';tile.style.height=p.h+'px';saveGalleryStateSoon(120);
      }
    };
    img.src=url;
    if(img.complete&&img.naturalWidth&&fitPlacementToNaturalAspect(p,img)){
      tile.style.width=p.w+'px';tile.style.height=p.h+'px';saveGalleryStateSoon(120);
    }
  }).catch(()=>{label.textContent='Could not load image';});
  if(TEACHER)tile.addEventListener('pointerdown',e=>galleryTilePointerDown(e,image.id));
}
async function renderGallery(){
  if(!els.galleryBoard||!els.galleryImagesLayer)return;
  if(!state.galleryState)state.galleryState=defaultGalleryState();ensureGalleryPlacements();
  const z=Math.max(.2,Math.min(1.5,Number(state.imageZoom||.5)));state.imageZoom=z;
  const w=state.galleryState.width,h=state.galleryState.height;
  els.galleryZoomWrap.style.width=(w*z)+'px';els.galleryZoomWrap.style.height=(h*z)+'px';
  els.galleryBoard.style.width=w+'px';els.galleryBoard.style.height=h+'px';els.galleryBoard.style.transform=`scale(${z})`;
  els.galleryBoard.classList.toggle('arrange-mode',TEACHER&&state.galleryArrange);
  els.galleryBoard.classList.toggle('hand-mode',TEACHER&&!state.galleryArrange&&state.tool==='hand');
  els.galleryBoard.classList.toggle('draw-mode',TEACHER&&!state.galleryArrange&&state.tool!=='hand');
  els.galleryImagesLayer.replaceChildren();
  const ordered=[...state.images].sort((a,b)=>(currentGalleryPlacement(a.id)?.z||0)-(currentGalleryPlacement(b.id)?.z||0));
  for(const image of ordered)await buildGalleryTile(image);
  drawGalleryOverlay();updateGalleryToolbar();persistStudentState();
}
function setGalleryArrange(next){
  if(!TEACHER)return;state.galleryArrange=!!next;state.selectedId=null;state.activeSurface=state.galleryArrange?'gallery-arrange':'gallery';
  renderGallery();
  setStatus(state.galleryArrange?'Move/resize mode: drag images anywhere. Drag blank board to pan.':'Draw mode: pen/highlighter/shapes work over the whole board and over images. Hand tool pans.');
}
function selectGalleryImage(id,scroll=true){
  if(!id||!state.images.some(x=>x.id===id))return;
  state.selectedGalleryImageId=id;state.liveImageId=id;
  const idx=galleryImageIndex(id);if(idx>=0)state.imageIndex=idx;
  renderGallery();
  if(scroll){setTimeout(()=>els.galleryImagesLayer?.querySelector(`[data-image-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'}),30);}
  if(TEACHER){broadcastTeacherView();pushLiveState().catch(()=>{});}else persistStudentState();
}
function focusGalleryImage(delta){
  if(!state.images.length)return;let idx=galleryImageIndex(state.selectedGalleryImageId);if(idx<0)idx=Math.max(0,Math.min(state.imageIndex,state.images.length-1));idx=Math.max(0,Math.min(state.images.length-1,idx+delta));selectGalleryImage(state.images[idx].id,true);
}
function galleryTilePointerDown(e,id){
  if(!TEACHER||!state.galleryArrange||!state.galleryState)return;e.preventDefault();e.stopPropagation();
  const p=currentGalleryPlacement(id);if(!p)return;
  setGallerySelectionVisual(id);
  const tile=e.currentTarget,isResize=e.target?.classList?.contains('gallery-resize-handle');
  const maxZ=Math.max(1,...Object.values(state.galleryState.placements).map(x=>Number(x.z||1)));p.z=maxZ+1;tile.style.zIndex=String(p.z);
  const stage=els.imageStage;
  const start={x:e.clientX,y:e.clientY,p:clone(p),mode:isResize?'resize':'move',scrollLeft:stage?.scrollLeft||0,scrollTop:stage?.scrollTop||0};
  state.galleryPointer=start;
  const move=ev=>{
    if(!state.galleryPointer)return;ev.preventDefault();
    autoScrollGalleryForPointer(ev.clientX,ev.clientY);
    const dz=Math.max(.2,state.imageZoom),scrollDx=(stage?.scrollLeft||0)-start.scrollLeft,scrollDy=(stage?.scrollTop||0)-start.scrollTop;
    const dx=(ev.clientX-start.x+scrollDx)/dz,dy=(ev.clientY-start.y+scrollDy)/dz;
    if(start.mode==='move'){
      p.x=Math.max(0,Math.min(GALLERY_WIDTH-p.w,start.p.x+dx));
      p.y=Math.max(0,Math.min(GALLERY_HEIGHT-p.h,start.p.y+dy));
    }else{
      const ratio=Number(p.aspect_ratio||start.p.aspect_ratio||0);
      if(ratio>.05){
        const fromX=start.p.w+dx,fromY=(start.p.h+dy)*ratio;
        let nw=Math.abs(dx)>=Math.abs(dy*ratio)?fromX:fromY;
        nw=Math.max(90,Math.min(GALLERY_WIDTH-p.x,nw));
        let nh=nw/ratio;
        if(nh<70){nh=70;nw=nh*ratio;}
        if(nh>GALLERY_HEIGHT-p.y){nh=Math.max(70,GALLERY_HEIGHT-p.y);nw=nh*ratio;}
        p.w=Math.max(90,nw);p.h=Math.max(70,nh);
      }else{
        p.w=Math.max(90,Math.min(GALLERY_WIDTH-p.x,start.p.w+dx));
        p.h=Math.max(70,Math.min(GALLERY_HEIGHT-p.y,start.p.h+dy));
      }
    }
    tile.style.left=p.x+'px';tile.style.top=p.y+'px';tile.style.width=p.w+'px';tile.style.height=p.h+'px';
  };
  const up=()=>{
    state.galleryPointer=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
    saveGalleryStateSoon(40);broadcastGalleryContent();renderGallery();
  };
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
}
function autoTileGallery(){
  if(!TEACHER||!state.galleryState)return;
  state.images.forEach((img,i)=>{const old=currentGalleryPlacement(img.id),p=defaultPlacementForIndex(i);if(old?.aspect_ratio){p.aspect_ratio=old.aspect_ratio;p.h=Math.max(70,p.w/old.aspect_ratio);}state.galleryState.placements[img.id]=p;});
  saveGalleryStateSoon(40);renderGallery();setStatus('Gallery tiled');
}
function galleryStagePointerDown(e){
  if(!TEACHER||!state.galleryState||!els.imageStage)return;
  if(e.target?.closest?.('.gallery-tile'))return;
  const shouldPan=state.galleryArrange || (!state.galleryArrange&&state.tool==='hand');
  if(!shouldPan)return;
  e.preventDefault();
  const stage=els.imageStage,startX=e.clientX,startY=e.clientY,startLeft=stage.scrollLeft,startTop=stage.scrollTop;
  const move=ev=>{ev.preventDefault();stage.scrollLeft=startLeft-(ev.clientX-startX);stage.scrollTop=startTop-(ev.clientY-startY);};
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
}function rememberGallery(){if(!TEACHER||!state.galleryState)return;state.galleryUndo.push(clone(state.galleryState.objects));if(state.galleryUndo.length>70)state.galleryUndo.shift();state.galleryRedo=[];}
function applyGalleryHistory(from,to){const item=from.pop();if(!item||!state.galleryState)return;to.push(clone(state.galleryState.objects));state.galleryState.objects=clone(item);state.selectedId=null;drawGalleryOverlay();saveGalleryStateSoon(20);}
function galleryPointerDown(e){
  if(!TEACHER||state.galleryArrange||!state.galleryState)return;state.activeSurface='gallery';
  if(state.tool==='hand'){e.stopPropagation();galleryStagePointerDown(e);return;}
  const p=norm(e,els.galleryOverlayCanvas);
  if(state.tool==='select'){const hit=hitTest(state.galleryState.objects,p);state.selectedId=hit?.id||null;drawGalleryOverlay();if(hit){rememberGallery();state.galleryPointer={id:hit.id,last:p,kind:'move'};els.galleryOverlayCanvas.setPointerCapture?.(e.pointerId);}return;}
  if(state.tool==='eraser'){const hit=hitTest(state.galleryState.objects,p);if(hit){rememberGallery();state.galleryState.objects=state.galleryState.objects.filter(x=>x.id!==hit.id);state.selectedId=null;drawGalleryOverlay();saveGalleryStateSoon(20);}return;}
  if(state.tool==='text'){const text=prompt('Text to add:');if(!text)return;rememberGallery();state.galleryState.objects.push({id:uuid(),type:'text',x:p.x,y:p.y,text:text.slice(0,600),color:curColor(),fontSize:Math.max(14,curWidth()*5)});drawGalleryOverlay();saveGalleryStateSoon(20);return;}
  rememberGallery();let o;if(state.tool==='pen'||state.tool==='highlighter')o={id:uuid(),type:state.tool,points:[p],color:curColor(),width:curWidth()};else o={id:uuid(),type:state.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:curColor(),width:curWidth()};state.galleryState.objects.push(o);state.galleryPointer={id:o.id,last:p,kind:'draw'};els.galleryOverlayCanvas.setPointerCapture?.(e.pointerId);
}
function galleryPointerMove(e){
  if(!TEACHER||!state.galleryPointer||!state.galleryState||state.galleryArrange)return;const p=norm(e,els.galleryOverlayCanvas),o=state.galleryState.objects.find(x=>x.id===state.galleryPointer.id);if(!o)return;
  if(state.galleryPointer.kind==='move'){const dx=p.x-state.galleryPointer.last.x,dy=p.y-state.galleryPointer.last.y;translateObject(o,dx,dy);state.galleryPointer.last=p;drawGalleryOverlay();return;}
  if(o.type==='pen'||o.type==='highlighter'){const last=o.points[o.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>.0007){o.points.push(p);drawGalleryOverlay();}return;}
  o.x2=p.x;o.y2=p.y;drawGalleryOverlay();
}
function galleryPointerUp(){if(!TEACHER||!state.galleryPointer||!state.galleryState)return;state.galleryPointer=null;drawGalleryOverlay();saveGalleryStateSoon(10);}

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function randomToken(){ const a=new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function uuid(){
  if(crypto.randomUUID) return crypto.randomUUID();
  const a=new Uint8Array(16); crypto.getRandomValues(a); a[6]=(a[6]&15)|64; a[8]=(a[8]&63)|128;
  const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function extractDriveId(value=''){
  const s=String(value).trim();
  let m=s.match(/\/file\/d\/([A-Za-z0-9_-]+)/); if(m) return m[1];
  m=s.match(/[?&]id=([A-Za-z0-9_-]+)/); if(m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}
function studentUrl(doc=state.doc){ const u=new URL('./index.html',location.href); u.hash=`t=${doc.student_token}`; return u.href; }
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); }
  catch{ const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}
function apiUrl(action, extra={}){
  const u=new URL(`${CONFIG.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/${CONFIG.API_FUNCTION}`);
  u.searchParams.set('action',action);
  for(const [k,v] of Object.entries(extra)) if(v!==null && v!==undefined) u.searchParams.set(k,String(v));
  if(TEACHER && state.doc?.id) u.searchParams.set('doc',state.doc.id);
  return u.toString();
}
function authHeaders(extra={}){
  const h={apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,...extra};
  if(TEACHER && state.session?.access_token) h.Authorization=`Bearer ${state.session.access_token}`;
  if(!TEACHER && state.token) h['x-viewer-token']=state.token;
  return h;
}
async function api(action, extra={}){
  const r=await fetch(apiUrl(action,extra),{headers:authHeaders()});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
  return data;
}
function persistStudentState(){
  if(TEACHER || !state.doc) return;
  try{
    const cs=getComputedStyle(document.documentElement);
    localStorage.setItem(`sntpdf:${state.doc.id}`,JSON.stringify({
      pageNo:state.pageNo,boardNo:state.boardNo,scale:state.scale,fit:state.fit,
      boardOpen:state.boardOpen,imageIndex:state.imageIndex,imageZoom:state.imageZoom,
      studentNoteH:cs.getPropertyValue('--student-note-h').trim(),
      permanentH:cs.getPropertyValue('--student-permanent-h').trim(),
      pageNotesH:cs.getPropertyValue('--student-page-h').trim()
    }));
  }catch{}
}
function restoreStudentState(){
  if(TEACHER || !state.doc) return;
  try{
    const v=JSON.parse(localStorage.getItem(`sntpdf:${state.doc.id}`)||'null'); if(!v) return;
    state.pageNo=Math.max(1,Number(v.pageNo||1)); state.boardNo=Math.max(1,Number(v.boardNo||1)); state.scale=Math.max(.4,Math.min(3.5,Number(v.scale||1.15))); state.fit=v.fit!==false; state.boardOpen=v.boardOpen!==false; state.imageIndex=Math.max(0,Number(v.imageIndex||0)); state.imageZoom=Math.max(.2,Math.min(1.5,Number(v.imageZoom||.5)));
    if(v.studentNoteH)document.documentElement.style.setProperty('--student-note-h',v.studentNoteH);
    if(v.permanentH)document.documentElement.style.setProperty('--student-permanent-h',v.permanentH);
    if(v.pageNotesH)document.documentElement.style.setProperty('--student-page-h',v.pageNotesH);
  }catch{}
}

function curColor(){ return els.colorInput?.value||'#1f2937'; }
function curWidth(){ return Number(els.widthInput?.value||4); }
function norm(evt,canvas){ const r=canvas.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))}; }
function objectPoints(o){ if(o.type==='pen'||o.type==='highlighter') return o.points||[]; if(o.type==='text') return [{x:o.x,y:o.y}]; return [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]; }
function distPointSegment(p,a,b){ const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c1=vx*wx+vy*wy; if(c1<=0)return Math.hypot(p.x-a.x,p.y-a.y); const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p.x-b.x,p.y-b.y);const t=c1/c2;return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy)); }
function hitTest(objects,p){
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i];
    if(o.type==='text' && Math.hypot(p.x-o.x,p.y-o.y)<.045) return o;
    if(o.type==='pen'||o.type==='highlighter'){ const pts=o.points||[]; for(let j=1;j<pts.length;j++) if(distPointSegment(p,pts[j-1],pts[j])<.024) return o; }
    else if(o.type==='line'||o.type==='arrow'){ if(distPointSegment(p,{x:o.x1,y:o.y1},{x:o.x2,y:o.y2})<.024)return o; }
    else if(o.type==='rect'||o.type==='ellipse'){ const minx=Math.min(o.x1,o.x2)-.025,maxx=Math.max(o.x1,o.x2)+.025,miny=Math.min(o.y1,o.y2)-.025,maxy=Math.max(o.y1,o.y2)+.025;if(p.x>=minx&&p.x<=maxx&&p.y>=miny&&p.y<=maxy)return o; }
  }
  return null;
}
function translateObject(o,dx,dy){
  const clamp=v=>Math.max(0,Math.min(1,v));
  if(o.points)o.points=o.points.map(p=>({x:clamp(p.x+dx),y:clamp(p.y+dy)}));
  for(const k of ['x','x1','x2']) if(typeof o[k]==='number') o[k]=clamp(o[k]+dx);
  for(const k of ['y','y1','y2']) if(typeof o[k]==='number') o[k]=clamp(o[k]+dy);
}
function strokeRatio(canvas){ const r=canvas.getBoundingClientRect(); return r.width ? canvas.width/r.width : 1; }
function drawObject(ctx,o,canvas,selected=false){
  const w=canvas.width,h=canvas.height,ratio=strokeRatio(canvas),X=x=>x*w,Y=y=>y*h;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color||'#1f2937';ctx.fillStyle=o.color||'#1f2937';ctx.lineWidth=Math.max(1,(o.width||4)*ratio);ctx.globalAlpha=o.type==='highlighter'?.28:1;
  if(o.type==='pen'||o.type==='highlighter'){ const pts=o.points||[];if(pts.length){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.stroke();} }
  else if(o.type==='text'){ctx.globalAlpha=1;ctx.font=`${Math.max(14,(o.fontSize||18)*ratio)}px system-ui,sans-serif`;ctx.fillText(o.text||'',X(o.x),Y(o.y));}
  else if(o.type==='line'||o.type==='arrow'){
    ctx.beginPath();ctx.moveTo(X(o.x1),Y(o.y1));ctx.lineTo(X(o.x2),Y(o.y2));ctx.stroke();
    if(o.type==='arrow'){const ang=Math.atan2(Y(o.y2)-Y(o.y1),X(o.x2)-X(o.x1)),len=12*ratio;ctx.beginPath();ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang-Math.PI/6),Y(o.y2)-len*Math.sin(ang-Math.PI/6));ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang+Math.PI/6),Y(o.y2)-len*Math.sin(ang+Math.PI/6));ctx.stroke();}
  }
  else if(o.type==='rect'){ctx.strokeRect(X(Math.min(o.x1,o.x2)),Y(Math.min(o.y1,o.y2)),Math.abs(o.x2-o.x1)*w,Math.abs(o.y2-o.y1)*h);}
  else if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(X((o.x1+o.x2)/2),Y((o.y1+o.y2)/2),Math.abs(o.x2-o.x1)*w/2,Math.abs(o.y2-o.y1)*h/2,0,0,Math.PI*2);ctx.stroke();}
  if(selected){ctx.globalAlpha=1;ctx.setLineDash([6*ratio,5*ratio]);ctx.strokeStyle='#147a5a';ctx.lineWidth=2*ratio;const pts=objectPoints(o);if(pts.length){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);ctx.strokeRect(X(minx)-6*ratio,Y(miny)-6*ratio,Math.max(12*ratio,X(maxx-minx)+12*ratio),Math.max(12*ratio,Y(maxy-miny)+12*ratio));}}
  ctx.restore();
}
function drawOverlay(){ const c=els.overlayCanvas,ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);for(const o of state.pageObjects)drawObject(ctx,o,c,TEACHER&&o.id===state.selectedId); }
function drawLiveSegment(o,a,b){ const c=els.overlayCanvas,ctx=c.getContext('2d'),ratio=strokeRatio(c);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color;ctx.lineWidth=Math.max(1,(o.width||4)*ratio);ctx.globalAlpha=o.type==='highlighter'?.28:1;ctx.beginPath();ctx.moveTo(a.x*c.width,a.y*c.height);ctx.lineTo(b.x*c.width,b.y*c.height);ctx.stroke();ctx.restore(); }
function scheduleOverlayRedraw(){ if(state.rafPending)return;state.rafPending=true;requestAnimationFrame(()=>{state.rafPending=false;drawOverlay();}); }
function remember(){ if(!TEACHER)return;state.undo.push(clone(state.pageObjects));if(state.undo.length>70)state.undo.shift();state.redo=[]; }
function applyHistory(from,to){ const item=from.pop();if(!item)return;to.push(clone(state.pageObjects));state.pageObjects=clone(item);state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;drawOverlay();savePageSoon(20); }
function setTool(tool){
  state.tool=tool;state.selectedId=null;
  if(TEACHER&&state.galleryArrange){state.galleryArrange=false;state.activeSurface='gallery';setStatus(tool==='hand'?'Hand tool: drag gallery to pan left/right/up/down.':'Draw mode: draw anywhere on the gallery, including directly over images.');}
  els.toolButtons.forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));els.canvasWrap?.classList.toggle('hand',tool==='hand');drawOverlay();drawGalleryOverlay();renderGallery();
}
function pointerDown(evt){
  if(!TEACHER)return;
  state.activeSurface='pdf';
  const p=norm(evt,els.overlayCanvas);
  if(state.tool==='hand')return;
  if(state.tool==='select'){
    const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;drawOverlay();
    if(hit){remember();state.pointer={id:hit.id,last:p,kind:'move',surface:'pdf'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);}return;
  }
  if(state.tool==='eraser'){
    const hit=hitTest(state.pageObjects,p);if(hit){remember();state.pageObjects=state.pageObjects.filter(x=>x.id!==hit.id);state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;drawOverlay();savePageSoon(20);}return;
  }
  if(state.tool==='text'){
    const text=prompt('Text to add:');if(!text)return;remember();state.pageObjects.push({id:uuid(),type:'text',x:p.x,y:p.y,text:text.slice(0,600),color:curColor(),fontSize:Math.max(14,curWidth()*5)});state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);return;
  }
  remember();
  let o;if(state.tool==='pen'||state.tool==='highlighter')o={id:uuid(),type:state.tool,points:[p],color:curColor(),width:curWidth()};else o={id:uuid(),type:state.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:curColor(),width:curWidth()};
  state.pageObjects.push(o);state.pointer={id:o.id,last:p,kind:'draw',surface:'pdf'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);
}
function pointerMove(evt){
  if(!TEACHER||!state.pointer||state.pointer.surface!=='pdf')return;
  const p=norm(evt,els.overlayCanvas),o=state.pageObjects.find(x=>x.id===state.pointer.id);if(!o)return;
  if(state.pointer.kind==='move'){const dx=p.x-state.pointer.last.x,dy=p.y-state.pointer.last.y;translateObject(o,dx,dy);state.pointer.last=p;scheduleOverlayRedraw();return;}
  if(o.type==='pen'||o.type==='highlighter'){
    const last=o.points[o.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>.0012){o.points.push(p);drawLiveSegment(o,last,p);}return;
  }
  o.x2=p.x;o.y2=p.y;scheduleOverlayRedraw();
}
function pointerUp(){
  if(!TEACHER||!state.pointer||state.pointer.surface!=='pdf')return;state.pointer=null;state.pageCache.set(state.pageNo,clone(state.pageObjects));scheduleOverlayRedraw();savePageSoon(10);
}
async function savePageNow(){
  if(!TEACHER||!state.doc)return;const pageNo=state.pageNo,objects=clone(state.pageObjects);setStatus('Saving…');
  const {error}=await supabase.from('snt_pdf_pages').upsert({document_id:state.doc.id,page_no:pageNo,objects,updated_at:new Date().toISOString()},{onConflict:'document_id,page_no'});
  if(error){setStatus('Save failed: '+error.message);return;}state.pageCache.set(pageNo,objects);setStatus('Saved');
}
function savePageSoon(delay=100){
  schedulePageContentBroadcast(Math.min(30,Math.max(0,delay)));
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>savePageNow().catch(e=>setStatus(e.message)),delay);
}
async function loadTeacherPageData(force=false){
  if(!force&&state.pageCache.has(state.pageNo)){state.pageObjects=clone(state.pageCache.get(state.pageNo));state.selectedId=null;drawOverlay();return;}
  const {data,error}=await supabase.from('snt_pdf_pages').select('objects').eq('document_id',state.doc.id).eq('page_no',state.pageNo).maybeSingle();if(error)throw error;
  state.pageObjects=Array.isArray(data?.objects)?data.objects:[];state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;state.undo=[];state.redo=[];drawOverlay();
}
async function loadStudentPageData(){const p=await api('page',{page:state.pageNo});state.pageObjects=Array.isArray(p.objects)?p.objects:[];drawOverlay();}

function boardByNo(no=state.boardNo){return state.boards.find(b=>Number(b.board_no)===Number(no));}
function boardIsPermanent(b=boardByNo()){return !!b?.is_permanent;}
function boardAppliesToPage(b,page=state.pageNo){return !!b && (b.is_permanent===true || (b.board_scope==='page' && Number(b.page_no)===Number(page)));}
function firstPermanentBoard(){return state.boards.find(b=>b.is_permanent===true)||state.boards[0]||null;}
function ensureApplicableBoard(){
  if(boardAppliesToPage(boardByNo()))return;
  const permanent=firstPermanentBoard();state.boardNo=permanent?.board_no||state.boards[0]?.board_no||1;
}
async function ensurePermanentBoard(){
  if(!TEACHER||!state.doc)return;
  const {data,error}=await supabase.from('snt_pdf_boards').select('board_no,title,text_content,board_scope,page_no,is_permanent,updated_at').eq('document_id',state.doc.id).order('board_no');if(error)throw error;
  const existing=(data||[]).find(b=>b.is_permanent===true);
  if(existing)return;
  const next=Math.max(0,...(data||[]).map(x=>Number(x.board_no)))+1;
  const {error:e}=await supabase.from('snt_pdf_boards').insert({document_id:state.doc.id,board_no:next,title:'Permanent board',text_content:'',objects:[],board_scope:'global',page_no:1,is_permanent:true});if(e)throw e;
}
async function loadTeacherBoards(){
  await ensurePermanentBoard();
  const {data,error}=await supabase.from('snt_pdf_boards').select('board_no,title,text_content,board_scope,page_no,is_permanent,updated_at').eq('document_id',state.doc.id).order('board_no');if(error)throw error;
  state.boards=(data||[]).filter(b=>boardAppliesToPage(b,state.pageNo));
  ensureApplicableBoard();loadBoardText(); if(els.studentImageTitle)els.studentImageTitle.textContent='Teacher gallery';
}
function renderStudentNotes(){
  if(TEACHER) return;
  const permanent=firstPermanentBoard();
  const pageBoards=state.boards.filter(b=>!b.is_permanent && b.board_scope==='page' && Number(b.page_no)===Number(state.pageNo));
  if(els.permanentTitle)els.permanentTitle.textContent=permanent?.title||'Permanent board';
  renderStoredBoardContent(els.permanentText,permanent?.text_content||'','No permanent notes yet.');
  if(els.pageNotesBadge)els.pageNotesBadge.textContent=`Page ${state.pageNo}`;
  if(els.pageNotesList){
    els.pageNotesList.replaceChildren();
    if(!pageBoards.length){
      const empty=document.createElement('div');empty.className='page-note-empty';empty.textContent='No page notes for this page yet.';els.pageNotesList.appendChild(empty);
    }else{
      for(const b of pageBoards){
        const article=document.createElement('article');article.className='page-note-entry';
        const title=document.createElement('strong');title.textContent=b.title||`Page ${state.pageNo} notes`;
        const body=document.createElement('div');body.className='page-note-body';
        renderStoredBoardContent(body,b.text_content||'','No typed note on this board.');
        article.append(title,body);els.pageNotesList.appendChild(article);
      }
    }
  }
}
function chooseStudentImageBoard(preferred=state.liveBoardNo){
  if(TEACHER) return;
  if(els.studentImageTitle) els.studentImageTitle.textContent='Teacher gallery';
}

async function loadStudentBoards(){
  const r=await api('boards',{page:state.pageNo});state.boards=r.boards||[];
  if(!state.boards.length)state.boards=[{board_no:1,title:'Permanent board',text_content:'',board_scope:'global',page_no:1,is_permanent:true}];
  renderStudentNotes(); if(els.studentImageTitle)els.studentImageTitle.textContent='Teacher gallery';
}
function loadBoardText(){
  const b=boardByNo()||firstPermanentBoard()||{board_no:state.boardNo,title:`Board ${state.boardNo}`,text_content:'',board_scope:'global',is_permanent:true};
  state.boardNo=Number(b.board_no||1);
  setBoardEditorContent(b.text_content||'');
  if(els.boardTitleInput)els.boardTitleInput.value=b.title||`Board ${state.boardNo}`;
  if(els.boardTitleDisplay)els.boardTitleDisplay.textContent=b.title||'Teacher Notepad';
  if(els.boardLabel)els.boardLabel.textContent=b.is_permanent?'All pages':`PDF page ${b.page_no||state.pageNo}`;
  if(els.boardScopeLabel){els.boardScopeLabel.textContent=b.is_permanent?'Permanent':`Page ${b.page_no||state.pageNo}`;els.boardScopeLabel.classList.toggle('page-scope',!b.is_permanent);}
  if(els.boardDelete){els.boardDelete.disabled=!!b.is_permanent;els.boardDelete.title=b.is_permanent?'The permanent board cannot be deleted.':'Delete this page board';}
  const arr=state.boards.map(x=>Number(x.board_no)),i=arr.indexOf(Number(state.boardNo));if(els.boardPrev)els.boardPrev.disabled=i<=0;if(els.boardNext)els.boardNext.disabled=i<0||i>=arr.length-1;
}
async function saveBoardNow(){
  if(!TEACHER||!state.doc)return;const b=boardByNo();if(!b)return;
  const title=(els.boardTitleInput?.value||b.title||`Board ${state.boardNo}`).trim().slice(0,80)||`Board ${state.boardNo}`,text=getBoardEditorStorage();
  const row={document_id:state.doc.id,board_no:state.boardNo,title,text_content:text,objects:[],board_scope:b.is_permanent?'global':'page',page_no:b.is_permanent?1:Number(b.page_no||state.pageNo),is_permanent:!!b.is_permanent,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('snt_pdf_boards').upsert(row,{onConflict:'document_id,page_no,board_no'});if(error){setStatus('Notepad save failed: '+error.message);return;}
  b.title=title;b.text_content=text;broadcastBoardContent();setStatus('Notepad saved');
}
function saveBoardSoon(){
  scheduleBoardContentBroadcast(60);
  clearTimeout(state.boardTextTimer);
  state.boardTextTimer=setTimeout(()=>saveBoardNow().catch(e=>setStatus(e.message)),180);
}
async function addBoard(){
  if(!TEACHER||!state.doc)return;setStatus('Adding page board…');
  const {data:all,error:readError}=await supabase.from('snt_pdf_boards').select('board_no').eq('document_id',state.doc.id).order('board_no');if(readError)return setStatus(readError.message);
  const next=Math.max(0,...(all||[]).map(x=>Number(x.board_no)))+1,title=`Page ${state.pageNo} board`;
  const {data,error}=await supabase.from('snt_pdf_boards').insert({document_id:state.doc.id,board_no:next,title,text_content:'',objects:[],board_scope:'page',page_no:state.pageNo,is_permanent:false}).select('board_no').single();
  if(error)return setStatus('Could not add board: '+error.message);
  state.boardNo=Number(data.board_no);await loadTeacherBoards();state.boardNo=Number(data.board_no);loadBoardText();await pushLiveState();broadcastContentRefresh('boards');broadcastBoardContent();setStatus('Page board added');
}
async function deleteBoard(){
  if(!TEACHER||!state.doc)return;const b=boardByNo();if(!b)return;
  if(b.is_permanent)return setStatus('The permanent board cannot be deleted.');
  if(!confirm(`Delete “${b.title||'this page board'}”?`))return;
  setStatus('Deleting board…');
  const {error}=await supabase.from('snt_pdf_boards').delete().eq('document_id',state.doc.id).eq('board_no',b.board_no);if(error)return setStatus('Could not delete board: '+error.message);
  await loadTeacherBoards();const permanent=firstPermanentBoard();state.boardNo=permanent?.board_no||state.boards[0]?.board_no||1;loadBoardText();await pushLiveState();broadcastContentRefresh('boards');setStatus('Board deleted');
}
async function moveBoard(delta){
  const arr=state.boards.map(x=>Number(x.board_no)),i=arr.indexOf(Number(state.boardNo)),n=i+delta;if(n<0||n>=arr.length)return;
  state.boardNo=arr[n];loadBoardText();if(TEACHER)await pushLiveState();else persistStudentState();
}

async function loadImages(preferLive=false){
  try{
    if(TEACHER){const {data,error}=await supabase.from('snt_pdf_board_images').select('id,board_no,image_name,mime_type,file_size,sort_no,created_at').eq('document_id',state.doc.id).order('sort_no').order('created_at');if(error)throw error;state.images=data||[];}
    else{const r=await api('images',{gallery:1});state.images=r.images||[];}
    await loadGalleryState(preferLive);
    if(state.liveImageId&&state.images.some(x=>x.id===state.liveImageId))state.selectedGalleryImageId=state.liveImageId;
    else if(state.images.length&&!state.selectedGalleryImageId)state.selectedGalleryImageId=state.images[Math.max(0,Math.min(state.imageIndex,state.images.length-1))].id;
    ensureGalleryPlacements();await renderGallery();
  }catch(e){setStatus('Gallery load failed: '+e.message);}
}
async function fetchImageBlobUrl(image){
  if(!image)return null;if(state.imageBlobUrls.has(image.id))return state.imageBlobUrls.get(image.id);
  const r=await fetch(apiUrl('image',{image:image.id}),{headers:authHeaders()});if(!r.ok)throw new Error('Could not load image.');const blob=await r.blob(),url=URL.createObjectURL(blob);state.imageBlobUrls.set(image.id,url);return url;
}
function applyImageZoom(){state.imageZoom=Math.max(.2,Math.min(1.5,Number(state.imageZoom||.5)));renderGallery();}
function changeImageZoom(delta){state.imageZoom=Math.max(.2,Math.min(1.5,state.imageZoom+delta));applyImageZoom();}
function resetImageZoom(){state.imageZoom=.5;applyImageZoom();}
async function moveImage(delta){focusGalleryImage(delta);}
async function uploadImage(file){
  if(!TEACHER||!file)return;if(file.size>8*1024*1024)return setStatus('Image must be under 8 MB.');if(!/^image\//.test(file.type))return setStatus('Choose an image file.');setStatus('Uploading image…');
  const r=await fetch(apiUrl('upload-image',{gallery:1}),{method:'POST',headers:authHeaders({'Content-Type':file.type,'x-file-name':encodeURIComponent(file.name||'Pasted image')}),body:file});const data=await r.json().catch(()=>({}));if(!r.ok)return setStatus(data.error||'Image upload failed.');
  await loadImages();const id=data.image?.id;if(id){if(!state.galleryState.placements[id])state.galleryState.placements[id]=defaultPlacementForIndex(Math.max(0,state.images.findIndex(x=>x.id===id)));state.selectedGalleryImageId=id;state.liveImageId=id;saveGalleryStateSoon(20);}broadcastContentRefresh('images');broadcastGalleryContent();await renderGallery();setStatus('Image added to gallery');
}
async function uploadImages(files){for(const file of files||[])await uploadImage(file);}
async function deleteCurrentImage(){
  if(!TEACHER||!state.selectedGalleryImageId)return setStatus('Select an image first.');const image=state.images.find(x=>x.id===state.selectedGalleryImageId);if(!image)return;if(!confirm(`Delete “${image.image_name||'this image'}” from the gallery?`))return;
  const r=await fetch(apiUrl('delete-image',{image:image.id}),{method:'POST',headers:authHeaders()});const data=await r.json().catch(()=>({}));if(!r.ok)return setStatus(data.error||'Delete failed.');const old=state.imageBlobUrls.get(image.id);if(old)URL.revokeObjectURL(old);state.imageBlobUrls.delete(image.id);if(state.galleryState?.placements)delete state.galleryState.placements[image.id];
  state.images=state.images.filter(x=>x.id!==image.id);state.selectedGalleryImageId=state.images[0]?.id||null;state.liveImageId=state.selectedGalleryImageId;saveGalleryStateSoon(20);broadcastContentRefresh('images');broadcastGalleryContent();renderGallery();setStatus('Image deleted');
}
async function pushLiveState(){
  if(!TEACHER||!state.doc||!state.pdf)return;
  const view=captureTeacherView();if(!view)return;
  const {error}=await supabase.from('snt_pdf_documents').update({live_page:state.pageNo,live_board_no:state.boardNo,live_image_id:state.liveImageId||null,live_scroll_ratio:view.live_scroll_ratio,live_center_x:view.live_center_x,live_center_y:view.live_center_y,live_zoom:state.scale,student_hooked:state.studentHooked,teacher_present_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',state.doc.id);if(error)setStatus(error.message);
}
async function setStudentHooked(next){
  if(!TEACHER||!state.doc)return;
  state.studentHooked=!!next;updateHookButton();
  setStatus(state.studentHooked?'Students hooked — LIVE control on':'Students unhooked — they can browse pages freely');
  // Broadcast FIRST so the student reacts immediately; database persistence follows as backup.
  broadcastTeacherView();
  await pushLiveState();
  broadcastTeacherView();
}
function applyTeacherCenter(){
  if(TEACHER||!studentFollowActive()||!state.pdf)return;
  const fullW=els.pdfScroller.scrollWidth,fullH=els.pdfScroller.scrollHeight;
  const left=Math.max(0,Math.min(Math.max(0,fullW-els.pdfScroller.clientWidth),state.liveCenterX*fullW-els.pdfScroller.clientWidth/2));
  const top=Math.max(0,Math.min(Math.max(0,fullH-els.pdfScroller.clientHeight),state.liveCenterY*fullH-els.pdfScroller.clientHeight/2));
  els.pdfScroller.scrollLeft=left;els.pdfScroller.scrollTop=top;
}
function teacherHeartbeat(){if(!TEACHER||!state.doc)return;pushLiveState().catch(()=>{});}
async function pollStudentSync(){
  if(TEACHER||!state.doc)return;
  try{
    const wasFollowing=studentFollowActive(),s=await api('sync'),previousLiveImage=state.liveImageId,previousLiveBoard=state.liveBoardNo,newRevision=Number(s.revision||0),revisionChanged=newRevision!==state.revision;
    state.teacherOnline=!!s.teacher_online;
    const realtimeEstablished=state.liveReady&&state.lastRealtimeAt>0;
    // Once realtime has actually delivered teacher data, idle time must NOT
    // snap the student's own pan back every few seconds.
    if(!realtimeEstablished){
      state.studentHooked=s.student_hooked!==false;
      state.liveScrollRatio=Math.max(0,Math.min(1,Number(s.live_scroll_ratio||0)));
      state.liveCenterX=Math.max(0,Math.min(1,Number(s.live_center_x??.5)));
      state.liveCenterY=Math.max(0,Math.min(1,Number(s.live_center_y??.5)));
    }
    state.liveBoardNo=Math.max(1,Number(s.live_board_no||1));
    state.liveImageId=s.live_image_id||null;
    state.liveZoom=Math.max(.25,Math.min(5,Number(s.live_zoom||1)));

    const following=studentFollowActive();
    refreshStudentHookUi();

    if(following){
      if(!realtimeEstablished){
        const targetPage=Math.max(1,Number(s.live_page||1));
        if(targetPage!==state.pageNo)await renderPage(targetPage,true);
        requestAnimationFrame(()=>applyTeacherCenter());
      }
      if(revisionChanged){
        await loadStudentPageData();
        await loadStudentBoards();
      }
    }else if(revisionChanged){
      await loadStudentPageData();
      await loadStudentBoards();
    }

    if(revisionChanged&&!realtimeEstablished)await loadImages(true);
    state.revision=newRevision;
    if(previousLiveImage!==state.liveImageId&&state.liveImageId){ selectGalleryImage(state.liveImageId,false); }
    if(!wasFollowing&&following)setStatus('HOOKED: teacher controls page and can recenter you. You can still pan, zoom and resize your notes.');
    else if(wasFollowing&&!following)setStatus(state.teacherOnline?'Unhooked: you can browse pages freely.':'Teacher disconnected: you can browse pages freely.');
  }catch{}
}

async function loadPdf(){
  showLoading('Loading Google Drive PDF…');
  const task=pdfjsLib.getDocument({url:apiUrl('pdf'),httpHeaders:authHeaders(),rangeChunkSize:524288,disableAutoFetch:true,disableStream:false,disableFontFace:false});
  state.pdf=await task.promise;await renderPage(state.pageNo,TEACHER);if(TEACHER)window.requestIdleCallback?.(()=>prefetchAdjacent().catch(()=>{}));
}
async function prefetchAdjacent(){
  if(!TEACHER||!state.pdf)return;for(const n of [state.pageNo-1,state.pageNo+1]){if(n<1||n>state.pdf.numPages||state.pageCache.has(n))continue;const {data}=await supabase.from('snt_pdf_pages').select('objects').eq('document_id',state.doc.id).eq('page_no',n).maybeSingle();state.pageCache.set(n,Array.isArray(data?.objects)?data.objects:[]);}
}
async function renderPage(n,forceData=false){
  if(!state.pdf)return;if(state.rendering){state.pendingPage=n;return;}state.rendering=true;
  try{
    n=Math.max(1,Math.min(state.pdf.numPages,Number(n)||1));const pageChanged=n!==state.pageNo;const page=await state.pdf.getPage(n);let scale=state.scale;
    if(state.fit){const base=page.getViewport({scale:1}),available=Math.max(260,els.pdfScroller.clientWidth-18);scale=Math.max(.42,Math.min(2.6,available/base.width));state.scale=scale;}
    const viewport=page.getViewport({scale}),dpr=Math.min(window.devicePixelRatio||1,1.6);
    for(const c of [els.pdfCanvas,els.overlayCanvas]){c.width=Math.floor(viewport.width*dpr);c.height=Math.floor(viewport.height*dpr);c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;}
    els.canvasWrap.style.width=`${viewport.width}px`;els.canvasWrap.style.height=`${viewport.height}px`;
    const ctx=els.pdfCanvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;
    state.pageNo=n;if(pageChanged){els.pdfScroller.scrollTop=0;els.pdfScroller.scrollLeft=0;if(els.toolRail)els.toolRail.style.transform='translateY(0)';}els.pageInput.value=String(n);els.pageCount.textContent=`/ ${state.pdf.numPages}`;els.prevPage.disabled=studentFollowActive()||n<=1;els.nextPage.disabled=studentFollowActive()||n>=state.pdf.numPages;
    if(TEACHER){if(pageChanged){broadcastTeacherView();pushLiveState().catch(()=>{});}await loadTeacherPageData(forceData);if(pageChanged||!state.boards.length)await loadTeacherBoards();await pushLiveState();broadcastTeacherView();broadcastPageContent();broadcastBoardContent();window.requestIdleCallback?.(()=>prefetchAdjacent().catch(()=>{}));}
    else{await loadStudentPageData();if(pageChanged||!state.boards.length)await loadStudentBoards();persistStudentState();if(studentFollowActive())requestAnimationFrame(()=>applyTeacherCenter());}
  }finally{state.rendering=false;if(state.pendingPage!==null){const p=state.pendingPage;state.pendingPage=null;renderPage(p);}}
}

function setBoardOpen(open){
  state.boardOpen=!!open;
  if(TEACHER){
    els.workspace.classList.toggle('notes-hidden',!state.boardOpen);if(els.boardPanel)els.boardPanel.style.display=state.boardOpen?'':'none';if(els.noteSplit)els.noteSplit.style.display=state.boardOpen?'':'none';
    if(els.toggleBoard){els.toggleBoard.textContent=state.boardOpen?'Hide notepad':'Show notepad';els.toggleBoard.setAttribute('aria-expanded',String(state.boardOpen));}
    if(state.fit&&state.pdf)setTimeout(()=>renderPage(state.pageNo),50);
  }else{
    els.workspace.classList.toggle('notes-hidden',!state.boardOpen);
    if(els.toggleBoard){els.toggleBoard.textContent=state.boardOpen?'Hide notes':'Show notes';els.toggleBoard.setAttribute('aria-expanded',String(state.boardOpen));}
  }
  persistStudentState();
}

function bindResizer(handle,onMove,onEnd){
  if(!handle)return;handle.addEventListener('pointerdown',e=>{e.preventDefault();handle.classList.add('dragging');handle.setPointerCapture?.(e.pointerId);const move=ev=>onMove(ev);const up=()=>{handle.classList.remove('dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);onEnd?.();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);});
}
function saveLayout(){if(!TEACHER)return;const cs=getComputedStyle(document.documentElement);try{localStorage.setItem('sntpdf:teacher-layout',JSON.stringify({tools:cs.getPropertyValue('--tools-w').trim(),notes:cs.getPropertyValue('--notes-w').trim(),text:cs.getPropertyValue('--note-text-h').trim()}));}catch{}}
function restoreLayout(){if(!TEACHER)return;try{const v=JSON.parse(localStorage.getItem('sntpdf:teacher-layout')||'null');if(!v)return;if(v.tools)document.documentElement.style.setProperty('--tools-w',v.tools);if(v.notes)document.documentElement.style.setProperty('--notes-w',v.notes);if(v.text)document.documentElement.style.setProperty('--note-text-h',v.text);}catch{}}
function resetLayout(){document.documentElement.style.removeProperty('--tools-w');document.documentElement.style.removeProperty('--notes-w');document.documentElement.style.removeProperty('--note-text-h');document.documentElement.style.removeProperty('--student-note-h');document.documentElement.style.removeProperty('--student-permanent-h');document.documentElement.style.removeProperty('--student-page-h');try{localStorage.removeItem('sntpdf:teacher-layout');}catch{};state.fit=true;if(state.pdf)renderPage(state.pageNo);}
function bindLayout(){
  restoreLayout();
  bindResizer(els.toolSplit,e=>{const x=Math.max(58,Math.min(160,e.clientX));document.documentElement.style.setProperty('--tools-w',`${x}px`);},saveLayout);
  bindResizer(els.noteSplit,e=>{const rect=els.workspace.getBoundingClientRect(),w=Math.max(220,Math.min(rect.width*.62,rect.right-e.clientX));document.documentElement.style.setProperty('--notes-w',`${w}px`);if(state.fit&&state.pdf)renderPage(state.pageNo);},saveLayout);
  bindResizer(els.noteInnerSplit,e=>{const r=els.boardPanel.getBoundingClientRect(),pct=Math.max(18,Math.min(72,((e.clientY-r.top)/r.height)*100));document.documentElement.style.setProperty('--note-text-h',`${pct}%`);},saveLayout);

  // Student resizing is intentionally LOCAL and works both hooked and unhooked.
  bindResizer(els.studentSplit,e=>{
    const r=els.workspace.getBoundingClientRect(),h=Math.max(170,Math.min(r.height*.78,r.bottom-e.clientY));
    document.documentElement.style.setProperty('--student-note-h',`${h}px`);
    if(state.fit&&state.pdf)renderPage(state.pageNo);
  },()=>persistStudentState());

  bindResizer(els.studentPermanentSplit,e=>{
    if(TEACHER||!els.boardPanel||!els.permanentNotesSection)return;
    const panel=els.boardPanel.getBoundingClientRect();
    const top=els.permanentNotesSection.getBoundingClientRect().top;
    const max=Math.max(100,panel.height-250);
    const h=Math.max(80,Math.min(max,e.clientY-top));
    document.documentElement.style.setProperty('--student-permanent-h',`${h}px`);
  },()=>persistStudentState());

  bindResizer(els.studentPageSplit,e=>{
    if(TEACHER||!els.boardPanel||!els.pageNotesSection)return;
    const panel=els.boardPanel.getBoundingClientRect();
    const top=els.pageNotesSection.getBoundingClientRect().top;
    const max=Math.max(100,panel.bottom-top-130);
    const h=Math.max(80,Math.min(max,e.clientY-top));
    document.documentElement.style.setProperty('--student-page-h',`${h}px`);
  },()=>persistStudentState());
}
function bindStudentPinch(){
  if(TEACHER||!els.pdfScroller)return;
  const touches=new Map();
  const distance=()=>{const a=[...touches.values()];if(a.length<2)return 0;return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};

  els.pdfScroller.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    els.pdfScroller.setPointerCapture?.(e.pointerId);
    if(touches.size===1)state.touchPan={id:e.pointerId,x:e.clientX,y:e.clientY};
    else if(touches.size===2){
      state.touchPan=null;
      state.pinch={startDist:Math.max(1,distance()),baseScale:state.scale,visual:1};
    }
  });

  els.pdfScroller.addEventListener('pointermove',e=>{
    if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;
    e.preventDefault();
    const previous=touches.get(e.pointerId);
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(touches.size>=2){
      if(!state.pinch)state.pinch={startDist:Math.max(1,distance()),baseScale:state.scale,visual:1};
      const factor=Math.max(.6,Math.min(1.8,distance()/Math.max(1,state.pinch.startDist)));
      state.pinch.visual=factor;
      els.canvasWrap.style.transform=`scale(${factor})`;
      els.canvasWrap.style.transformOrigin='center center';
      return;
    }

    if(touches.size===1&&!state.pinch){
      const dx=e.clientX-previous.x,dy=e.clientY-previous.y;
      els.pdfScroller.scrollLeft-=dx;
      els.pdfScroller.scrollTop-=dy;
      state.touchPan={id:e.pointerId,x:e.clientX,y:e.clientY};
    }
  },{passive:false});

  const finish=async e=>{
    if(e.pointerType!=='touch')return;
    touches.delete(e.pointerId);
    if(state.pinch&&touches.size<2){
      const factor=state.pinch.visual||1;
      state.scale=Math.max(.4,Math.min(3.5,state.pinch.baseScale*factor));
      state.fit=false;state.pinch=null;els.canvasWrap.style.transform='';
      await renderPage(state.pageNo);
    }
    if(touches.size===1){
      const [id,p]=[...touches.entries()][0];state.touchPan={id,x:p.x,y:p.y};
    }else if(!touches.size)state.touchPan=null;
  };
  els.pdfScroller.addEventListener('pointerup',finish);
  els.pdfScroller.addEventListener('pointercancel',finish);
}
function bindCommon(){
  els.prevPage?.addEventListener('click',()=>{if(studentFollowActive())return;renderPage(state.pageNo-1);});
  els.nextPage?.addEventListener('click',()=>{if(studentFollowActive())return;renderPage(state.pageNo+1);});
  els.pageInput?.addEventListener('change',()=>{if(studentFollowActive()){els.pageInput.value=state.pageNo;return;}renderPage(els.pageInput.value);});
  els.zoomOut?.addEventListener('click',async()=>{state.fit=false;state.scale=Math.max(.4,state.scale-.15);await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.zoomIn?.addEventListener('click',async()=>{state.fit=false;state.scale=Math.min(3.5,state.scale+.15);await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.fitPage?.addEventListener('click',async()=>{state.fit=true;await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.toggleBoard?.addEventListener('click',()=>setBoardOpen(!state.boardOpen));
  els.boardPrev?.addEventListener('click',()=>moveBoard(-1));els.boardNext?.addEventListener('click',()=>moveBoard(1));
  // Student note/image browsing is always local, whether hooked or unhooked.
  els.imagePrev?.addEventListener('click',()=>moveImage(-1));els.imageNext?.addEventListener('click',()=>moveImage(1));
  els.imageZoomOut?.addEventListener('click',()=>changeImageZoom(-.1));els.imageZoomReset?.addEventListener('click',resetImageZoom);els.imageZoomIn?.addEventListener('click',()=>changeImageZoom(.1));
  window.addEventListener('resize',()=>{clearTimeout(window.__sntResize);window.__sntResize=setTimeout(()=>{state.fit&&state.pdf&&renderPage(state.pageNo); renderGallery();},180);});
  bindLayout();
  bindStudentPinch();
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.overlayCanvas.addEventListener('pointerdown',pointerDown);els.overlayCanvas.addEventListener('pointermove',pointerMove);els.overlayCanvas.addEventListener('pointerup',pointerUp);els.overlayCanvas.addEventListener('pointercancel',pointerUp);
  els.galleryOverlayCanvas?.addEventListener('pointerdown',galleryPointerDown);els.galleryOverlayCanvas?.addEventListener('pointermove',galleryPointerMove);els.galleryOverlayCanvas?.addEventListener('pointerup',galleryPointerUp);els.galleryOverlayCanvas?.addEventListener('pointercancel',galleryPointerUp);els.imageStage?.addEventListener('pointerdown',galleryStagePointerDown);
  els.undoBtn?.addEventListener('click',()=>state.activeSurface==='gallery'?applyGalleryHistory(state.galleryUndo,state.galleryRedo):applyHistory(state.undo,state.redo));els.redoBtn?.addEventListener('click',()=>state.activeSurface==='gallery'?applyGalleryHistory(state.galleryRedo,state.galleryUndo):applyHistory(state.redo,state.undo));els.deleteSelected?.addEventListener('click',deleteSelectedObject);
  els.boardText?.addEventListener('input',()=>{rememberBoardSelection();saveBoardSoon();});
  els.boardText?.addEventListener('keyup',rememberBoardSelection);
  els.boardText?.addEventListener('mouseup',rememberBoardSelection);
  els.boardText?.addEventListener('touchend',rememberBoardSelection);
  els.boardText?.addEventListener('paste',e=>{
    const hasImage=[...(e.clipboardData?.items||[])].some(i=>i.type.startsWith('image/'));
    if(hasImage)return;
    e.preventDefault();
    const text=e.clipboardData?.getData('text/plain')||'';
    document.execCommand('insertText',false,text);
  });
  document.addEventListener('selectionchange',rememberBoardSelection);
  els.boardUnderline?.addEventListener('mousedown',e=>e.preventDefault());
  els.boardUnderline?.addEventListener('click',()=>applyBoardFormat('underline'));
  els.boardFontSize?.addEventListener('change',()=>applyBoardFormat('fontSize',els.boardFontSize.value));
  els.boardTextColor?.addEventListener('input',()=>applyBoardFormat('foreColor',els.boardTextColor.value));
  els.boardHighlightColor?.addEventListener('input',()=>applyBoardFormat('hiliteColor',els.boardHighlightColor.value));
  els.boardClearFormat?.addEventListener('mousedown',e=>e.preventDefault());
  els.boardClearFormat?.addEventListener('click',()=>applyBoardFormat('removeFormat'));
  els.boardTitleInput?.addEventListener('input',saveBoardSoon);els.boardTitleInput?.addEventListener('change',()=>{const b=boardByNo();if(b)b.title=els.boardTitleInput.value.trim()||`Board ${state.boardNo}`;broadcastBoardContent();pushLiveState();});
  els.boardAdd?.addEventListener('click',addBoard);els.boardDelete?.addEventListener('click',deleteBoard);
  els.pasteImageBtn?.addEventListener('click',()=>els.imageFileInput?.click());els.imageFileInput?.addEventListener('change',()=>{const fs=[...(els.imageFileInput.files||[])];if(fs.length)uploadImages(fs);els.imageFileInput.value='';});els.deleteImageBtn?.addEventListener('click',deleteCurrentImage);els.galleryArrangeBtn?.addEventListener('click',()=>setGalleryArrange(!state.galleryArrange));els.galleryTileBtn?.addEventListener('click',autoTileGallery);
  document.addEventListener('paste',e=>{if(!TEACHER)return;const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(!item)return;const file=item.getAsFile();if(file){e.preventDefault();uploadImage(file);}});
  els.copyStudentLink?.addEventListener('click',async()=>{await copyText(studentUrl());setStatus('Student link copied');});els.hookStudentsBtn?.addEventListener('click',()=>setStudentHooked(!state.studentHooked).catch(e=>setStatus(e.message)));els.exportPdf?.addEventListener('click',exportAnnotatedPdf);els.libraryBtn?.addEventListener('click',openLibrary);els.signOutBtn?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='./teacher.html';});els.createDocBtn?.addEventListener('click',createDocumentFromForm);
  els.fullscreenBtn?.addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
  els.focusPdfBtn?.addEventListener('click',()=>{els.workspace.classList.toggle('pdf-focus');els.focusPdfBtn.textContent=els.workspace.classList.contains('pdf-focus')?'Show tools':'PDF focus';setTimeout(()=>state.fit&&state.pdf&&renderPage(state.pageNo),80);});
  els.resetLayoutBtn?.addEventListener('click',resetLayout);
  els.pdfScroller?.addEventListener('scroll',()=>{
    if(els.toolRail&&window.innerWidth>650)els.toolRail.style.transform=`translateY(${-els.pdfScroller.scrollTop}px)`;
    if(TEACHER){
      scheduleTeacherBroadcast(45);
      clearTimeout(state.scrollSyncTimer);state.scrollSyncTimer=setTimeout(()=>pushLiveState().catch(()=>{}),650);
    }
  },{passive:true});
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault(); if(state.activeSurface==='gallery') e.shiftKey?applyGalleryHistory(state.galleryRedo,state.galleryUndo):applyGalleryHistory(state.galleryUndo,state.galleryRedo); else e.shiftKey?applyHistory(state.redo,state.undo):applyHistory(state.undo,state.redo);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault(); state.activeSurface==='gallery'?applyGalleryHistory(state.galleryRedo,state.galleryUndo):applyHistory(state.redo,state.undo);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){ const list=state.activeSurface==='gallery'?(state.galleryState?.objects||[]):state.pageObjects; const o=list.find(x=>x.id===state.selectedId); if(o)state.clipboard={surface:state.activeSurface, object:clone(o)}; }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&state.clipboard){e.preventDefault(); const clipObj=clone(state.clipboard.object||state.clipboard); if(state.activeSurface==='gallery'&&state.galleryState){ rememberGallery(); const o=clipObj; o.id=uuid(); translateObject(o,.025,.025); state.galleryState.objects.push(o); state.selectedId=o.id; drawGalleryOverlay(); saveGalleryStateSoon(20); } else { remember(); const o=clipObj; o.id=uuid(); translateObject(o,.025,.025); state.pageObjects.push(o); state.selectedId=o.id; state.pageCache.set(state.pageNo,clone(state.pageObjects)); drawOverlay(); savePageSoon(20);} }
    if(e.key==='Delete'||e.key==='Backspace')deleteSelectedObject();
  });
}
function deleteSelectedObject(){if(!state.selectedId)return;if(state.activeSurface==='gallery'&&state.galleryState){rememberGallery();state.galleryState.objects=state.galleryState.objects.filter(x=>x.id!==state.selectedId);state.selectedId=null;drawGalleryOverlay();saveGalleryStateSoon(20);}else{remember();state.pageObjects=state.pageObjects.filter(x=>x.id!==state.selectedId);state.selectedId=null;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);}}

async function exportAnnotatedPdf(){
  if(!TEACHER||!window.PDFLib)return;
  try{
    setStatus('Preparing export…');const r=await fetch(apiUrl('pdf'),{headers:authHeaders()});if(!r.ok)throw new Error('Could not download source PDF.');const bytes=await r.arrayBuffer();const {PDFDocument,rgb,StandardFonts}=window.PDFLib;const pdf=await PDFDocument.load(bytes);const font=await pdf.embedFont(StandardFonts.Helvetica);
    const {data:rows,error}=await supabase.from('snt_pdf_pages').select('page_no,objects').eq('document_id',state.doc.id);if(error)throw error;
    const hex=h=>{const m=(h||'#1f2937').replace('#','');return rgb(parseInt(m.slice(0,2),16)/255,parseInt(m.slice(2,4),16)/255,parseInt(m.slice(4,6),16)/255);};
    for(const row of rows||[]){const page=pdf.getPage(row.page_no-1);if(!page)continue;const {width,height}=page.getSize(),X=x=>x*width,Y=y=>(1-y)*height;
      for(const o of row.objects||[]){const color=hex(o.color),th=Math.max(.6,(o.width||4)*.75),opacity=o.type==='highlighter'?.28:1;
        if(o.type==='pen'||o.type==='highlighter'){const pts=o.points||[];for(let i=1;i<pts.length;i++)page.drawLine({start:{x:X(pts[i-1].x),y:Y(pts[i-1].y)},end:{x:X(pts[i].x),y:Y(pts[i].y)},thickness:th,color,opacity});}
        else if(o.type==='text')page.drawText(o.text||'',{x:X(o.x),y:Y(o.y),size:Math.max(8,(o.fontSize||18)*.75),font,color});
        else if(o.type==='line'||o.type==='arrow'){page.drawLine({start:{x:X(o.x1),y:Y(o.y1)},end:{x:X(o.x2),y:Y(o.y2)},thickness:th,color});if(o.type==='arrow'){const x1=X(o.x1),y1=Y(o.y1),x2=X(o.x2),y2=Y(o.y2),ang=Math.atan2(y2-y1,x2-x1),len=10;for(const a of [ang+Math.PI*.82,ang-Math.PI*.82])page.drawLine({start:{x:x2,y:y2},end:{x:x2+len*Math.cos(a),y:y2+len*Math.sin(a)},thickness:th,color});}}
        else if(o.type==='rect')page.drawRectangle({x:X(Math.min(o.x1,o.x2)),y:Y(Math.max(o.y1,o.y2)),width:Math.abs(o.x2-o.x1)*width,height:Math.abs(o.y2-o.y1)*height,borderColor:color,borderWidth:th,opacity:0});
        else if(o.type==='ellipse')page.drawEllipse({x:X((o.x1+o.x2)/2),y:Y((o.y1+o.y2)/2),xScale:Math.abs(o.x2-o.x1)*width/2,yScale:Math.abs(o.y2-o.y1)*height/2,borderColor:color,borderWidth:th});
      }
    }
    const out=await pdf.save(),blob=new Blob([out],{type:'application/pdf'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${state.doc.title.replace(/[^A-Za-z0-9_-]+/g,'_')}_annotated.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2500);setStatus('Exported');
  }catch(e){setStatus('Export failed: '+e.message);}
}

async function refreshLibrary(){
  const {data,error}=await supabase.from('snt_pdf_documents').select('*').order('updated_at',{ascending:false});if(error)throw error;
  els.libraryList.innerHTML=(data||[]).map(d=>`<div class="lib-row"><div class="lib-main"><strong>${escapeHtml(d.title)}</strong><small>Drive file ${escapeHtml(d.drive_file_id)}</small></div><div class="lib-actions"><button class="btn compact" data-open="${d.id}">Open</button><button class="btn compact" data-copy="${d.id}">Copy link</button><button class="btn compact" data-revoke="${d.id}">${d.student_link_enabled?'Revoke':'Enable'}</button><button class="btn compact" data-rotate="${d.id}">New link</button><button class="btn compact danger-text" data-delete="${d.id}">Delete</button></div></div>`).join('')||'<p>No PDFs yet.</p>';
  els.libraryList.querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.open||b.dataset.copy||b.dataset.revoke||b.dataset.rotate||b.dataset.delete,d=(data||[]).find(x=>x.id===id);if(!d)return;
    if(b.dataset.open){els.libraryDialog.close();await openTeacherDocument(d);}
    if(b.dataset.copy){await copyText(studentUrl(d));setStatus('Student link copied');}
    if(b.dataset.revoke){await supabase.from('snt_pdf_documents').update({student_link_enabled:!d.student_link_enabled}).eq('id',d.id);await refreshLibrary();}
    if(b.dataset.rotate&&confirm('Create a new student link? The old link will stop working.')){await supabase.from('snt_pdf_documents').update({student_token:randomToken(),student_link_enabled:true}).eq('id',d.id);await refreshLibrary();}
    if(b.dataset.delete&&confirm(`Delete “${d.title}” and all its annotations/notepads/images?`)){await supabase.from('snt_pdf_documents').delete().eq('id',d.id);if(state.doc?.id===d.id)location.href='./teacher.html';else await refreshLibrary();}
  }));
}
async function openLibrary(){await refreshLibrary();els.libraryDialog.showModal();}
async function createDocumentFromForm(){
  const title=els.newTitle.value.trim(),url=els.newDriveUrl.value.trim(),fileId=extractDriveId(url);if(!title||!fileId)return setStatus('Enter a title and valid Google Drive PDF link.');const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const row={owner_id:user.id,title,drive_file_id:fileId,drive_share_url:url,student_token:randomToken(),student_link_enabled:true,student_hooked:true,live_board_no:1};const {data,error}=await supabase.from('snt_pdf_documents').insert(row).select('*').single();if(error){setStatus(error.message);return;}await supabase.from('snt_pdf_boards').insert({document_id:data.id,board_no:1,title:'Permanent board',text_content:'',objects:[],board_scope:'global',page_no:1,is_permanent:true});els.newTitle.value='';els.newDriveUrl.value='';els.libraryDialog.close();await openTeacherDocument(data);
}
async function openTeacherDocument(doc){
  state.doc=doc;state.pageNo=Math.max(1,Number(doc.live_page||1));state.boardNo=Math.max(1,Number(doc.live_board_no||1));state.liveBoardNo=state.boardNo;state.studentHooked=doc.student_hooked!==false;state.liveImageId=doc.live_image_id||null;state.liveCenterX=Math.max(0,Math.min(1,Number(doc.live_center_x??.5)));state.liveCenterY=Math.max(0,Math.min(1,Number(doc.live_center_y??.5)));state.liveZoom=Number(doc.live_zoom||1);state.revision=Number(doc.revision||0);els.docTitle.textContent=doc.title;els.contextText.textContent='Teacher • live student hook • autosave';updateHookButton();history.replaceState(null,'',`./teacher.html?id=${encodeURIComponent(doc.id)}`);await loadTeacherBoards();await loadImages(true);await loadPdf();await setupLiveChannel();els.loading.classList.add('hidden');els.workspace.classList.remove('hidden');setBoardOpen(true);teacherHeartbeat();clearInterval(state.heartbeatTimer);state.heartbeatTimer=setInterval(teacherHeartbeat,Number(CONFIG.TEACHER_HEARTBEAT_MS||5000));
}
async function handleDriveQuery(){const params=new URLSearchParams(location.search),drive=params.get('drive');if(!drive)return false;const fileId=extractDriveId(drive);if(!fileId)return false;const {data}=await supabase.from('snt_pdf_documents').select('*').eq('drive_file_id',fileId).limit(1).maybeSingle();if(data){await openTeacherDocument(data);return true;}els.newDriveUrl.value=params.get('source')||`https://drive.google.com/file/d/${fileId}/view`;els.newTitle.value=params.get('title')||'Drive PDF';await openLibrary();return true;}
async function bootTeacher(){
  bindCommon();bindTeacher();
  const {data:{session}}=await supabase.auth.getSession();state.session=session;
  if(!session){els.loading.classList.add('hidden');els.loginPanel.classList.remove('hidden');els.loginForm.addEventListener('submit',async e=>{e.preventDefault();const {data,error}=await supabase.auth.signInWithPassword({email:els.emailInput.value.trim(),password:els.passwordInput.value});if(error)return showError(error.message);state.session=data.session;els.loginPanel.classList.add('hidden');showLoading();await bootTeacherAfterLogin();});return;}
  await bootTeacherAfterLogin();
}
async function bootTeacherAfterLogin(){
  const p=new URLSearchParams(location.search),id=p.get('id');
  if(id){const {data,error}=await supabase.from('snt_pdf_documents').select('*').eq('id',id).maybeSingle();if(error||!data)return showError('Document not found.');await openTeacherDocument(data);return;}
  if(await handleDriveQuery())return;els.loading.classList.add('hidden');await openLibrary();
}
async function bootStudent(){
  bindCommon();state.token=new URLSearchParams(location.hash.replace(/^#/,'')).get('t');if(!state.token)return showError('This textbook link is missing or incomplete.');
  try{
    const init=await api('init');state.doc=init.document;state.revision=Number(init.document.revision||0);state.teacherOnline=!!init.teacher_online;state.studentHooked=init.document.student_hooked!==false;state.liveBoardNo=Math.max(1,Number(init.document.live_board_no||1));state.liveImageId=init.document.live_image_id||null;state.liveScrollRatio=Math.max(0,Math.min(1,Number(init.document.live_scroll_ratio||0)));state.liveCenterX=Math.max(0,Math.min(1,Number(init.document.live_center_x??.5)));state.liveCenterY=Math.max(0,Math.min(1,Number(init.document.live_center_y??.5)));state.liveZoom=Number(init.document.live_zoom||1);state.pageNo=Math.max(1,Number(init.document.live_page||1));state.boardNo=state.liveBoardNo;els.docTitle.textContent=init.document.title;els.contextText.textContent='Teacher annotations • view only';restoreStudentState();state.boardOpen=true;
    if(studentFollowActive()){state.pageNo=Math.max(1,Number(init.document.live_page||1));state.liveBoardNo=Math.max(1,Number(init.document.live_board_no||1));state.boardNo=state.liveBoardNo;}
    setBoardOpen(true);await loadPdf();await loadImages(true);await setupLiveChannel();els.loading.classList.add('hidden');els.workspace.classList.remove('hidden');refreshStudentHookUi();
    state.pollTimer=setInterval(pollStudentSync,Number(CONFIG.STUDENT_POLL_MS||900));await pollStudentSync();
  }catch(e){showError(e.message);}
}

if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}
if(TEACHER)bootTeacher().catch(e=>showError(e.message));else bootStudent().catch(e=>showError(e.message));
