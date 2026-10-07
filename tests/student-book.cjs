const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../viewer.js'),'utf8');
function between(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
const classes=new Set(['hidden']);const modal={classList:{remove:x=>classes.delete(x),add:x=>classes.add(x)}};
let loads=0,bindings=0,shown=[],centered=0;
const ctx={console,$:()=>null,TEACHER:false,Math,Number,String,Date,bookEls:{modal,permTitle:{},permEditor:{}},state:{doc:{id:'doc'},pdf:{numPages:4},pageNo:1,bookSequence:[],bookIndex:0,studentHooked:true},document:{body:{classList:{add(){}}}},studentFollowActive:()=>true,installPdfInteractionTools:async()=>{},bindBookUi:()=>bindings++,loadBookPages:async()=>{loads++;ctx.state.bookSequence=[{key:'pdf:1',kind:'pdf',displayNumber:'1'},{key:'insert:note',kind:'note',id:'note',displayNumber:'1.1'},{key:'insert:image',kind:'image',id:'image',displayNumber:'1.2'}];ctx.state.liveBookKey='insert:note';ctx.state.permanentNote={title:'Homework',text_content:'Read chapter 4'};},showBookIndex:async i=>{ctx.state.bookIndex=i;shown.push(i)},bookItem:()=>ctx.state.bookSequence[ctx.state.bookIndex],bookPageIndex:label=>ctx.state.bookSequence.findIndex(x=>x.displayNumber===label),refreshBookSequence:async()=>ctx.loadBookPages(),setStatus:()=>{},renderStoredBoardContent:(el,text)=>{el.textContent=text},refreshStudentHookUi:()=>{},clamp01:x=>x,selectGalleryImage:()=>{},requestAnimationFrame:fn=>fn(),applyTeacherCenter:()=>centered++};
vm.createContext(ctx);
vm.runInContext('let bookStarting=null,bookReadyDoc=null;'+between('async function startContinuousBook(){','/* Initialize only')+between('async function followBookPage(','function setBookHtml(')+between('async function openPermanent(){','async function closePermanent(')+between('async function drainRemoteTeacherView(){','async function setupLiveChannel('),ctx);
(async()=>{
 await Promise.all([ctx.startContinuousBook(),ctx.startContinuousBook()]);
 assert.equal(loads,1);assert.equal(bindings,1);assert.equal(ctx.bookItem().key,'insert:note');
 await ctx.startContinuousBook();assert.equal(loads,1,'no duplicated initialization');
 ctx.state.remoteViewPending={live_book_key:'insert:image',live_page:1,student_hooked:true};await ctx.drainRemoteTeacherView();assert.equal(ctx.bookItem().key,'insert:image');assert.equal(centered,0,'inserted page does not pan hidden PDF');
 ctx.state.remoteViewPending={live_book_key:'pdf:1',live_page:1,student_hooked:true};await ctx.drainRemoteTeacherView();assert.equal(ctx.bookItem().key,'pdf:1');assert.equal(centered,1);
 ctx.state.remoteViewPending={live_book_key:'insert:note',live_page:1,student_hooked:false};await ctx.drainRemoteTeacherView();assert.equal(ctx.bookItem().key,'pdf:1','unhooked student keeps own page');
 await ctx.openPermanent();assert(!classes.has('hidden'));assert.equal(ctx.bookEls.permEditor.textContent,'Read chapter 4');assert.equal(ctx.bookEls.permEditor.contentEditable,'false');assert.equal(ctx.bookEls.permTitle.value,'Homework');
 // Student boot must await PDF completion before initializing the book controls.
 const boot=between('async function bootStudent(){','if(TEACHER){\n  const releaseOnLeave');assert(boot.indexOf('await startContinuousBook();')>boot.indexOf('await loadPdf();'));assert(!source.includes('i<80&&(!state.pdf'));
 console.log('Student book: initialization once after PDF readiness, note/image following, PDF return, unhooked independence and fresh permanent notes passed');
})().catch(e=>{console.error(e);process.exit(1)});
