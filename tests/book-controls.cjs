const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../viewer.js'),'utf8');
function between(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
function el(){let classes=new Set();return {style:{},value:'',textContent:'',disabled:false,clientWidth:800,scrollTop:0,scrollLeft:0,classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c),remove:c=>classes.delete(c)},setAttribute(){},removeAttribute(){},getContext:()=>({})};}
const exit=el(),body=el();
const els=Object.fromEntries(['workspace','focusPdfBtn','pageInput','pageCount','prevPage','nextPage','pdfCanvas','overlayCanvas','canvasWrap','pdfScroller','toolRail'].map(k=>[k,el()]));
const context={console,Math,Number,String,TEACHER:false,els,state:{pdf:{numPages:4,getPage:async()=>({getViewport:()=>({width:600,height:800}),render:()=>({promise:Promise.resolve()})})},scale:1,fit:true,pageNo:1,rendering:false,pendingPage:null,boards:[{}],bookPages:[{id:'n1',kind:'note',anchor_pdf_page:1,sort_no:1},{id:'i1',kind:'image',anchor_pdf_page:1,sort_no:2},{id:'n4',kind:'note',anchor_pdf_page:4,sort_no:1},{id:'i4',kind:'image',anchor_pdf_page:4,sort_no:2}],bookSequence:[],bookIndex:0},document:{body,getElementById:id=>id==='exitPdfFocusBtn'?exit:null},$:id=>id==='exitPdfFocusBtn'?exit:null,window:{devicePixelRatio:1},requestAnimationFrame:fn=>fn(),studentFollowActive:()=>false,loadStudentPageData:async()=>{},loadStudentBoards:async()=>{},persistStudentState:()=>{}};
vm.createContext(context);
vm.runInContext(between('function buildBookSequence(){','async function loadBookPages')+between('function bookPageIndex(label){','async function showBookIndex')+between('async function renderPage(n','function setBoardOpen(')+between('function setPdfFocus(on){','function bindResizer('),context);
(async()=>{
 context.buildBookSequence();
 assert.deepEqual(Array.from(context.state.bookSequence,x=>x.displayNumber),['1','1.1','1.2','2','3','4','4.1','4.2']);
 assert.equal(context.bookPageIndex('4.2'),7);assert.equal(context.bookPageIndex('2'),3);assert.equal(context.bookPageIndex('2.1'),-1);
 await context.renderPage(1);assert.equal(els.pageInput.value,'1');assert.equal(els.pageCount.textContent,'/ 4');assert.equal(els.nextPage.disabled,false);
 context.state.bookIndex=3;await context.renderPage(2);assert.equal(els.pageInput.value,'2');assert.equal(els.pageCount.textContent,'/ 4');assert.equal(els.nextPage.disabled,false);
 await context.renderPage(2);assert.equal(els.pageInput.value,'2','zoom/fit rerender keeps source PDF number');
 context.state.bookIndex=7;context.syncBookCounter();assert.equal(els.pageInput.value,'4.2');assert.equal(els.nextPage.disabled,true);
 context.state.bookPages=context.state.bookPages.filter(x=>x.id!=='n4');context.buildBookSequence();assert.equal(context.state.bookSequence.at(-1).displayNumber,'4.1','suffixes renumber after deletion');
 context.TEACHER=true;context.state.bookIndex=2;
 context.setPdfFocus(true);assert(body.classList.contains('pdf-focus-mode'));assert(!exit.classList.contains('hidden'));assert.equal(els.focusPdfBtn.textContent,'Exit PDF Focus');
 context.setPdfFocus(false);assert(!body.classList.contains('pdf-focus-mode'));assert(exit.classList.contains('hidden'));assert.equal(context.state.bookIndex,2,'focus preserves inserted page');
 const html=fs.readFileSync(path.join(__dirname,'../teacher.html'),'utf8');const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'toolbar IDs unique');
 console.log('Book controls: PDF numbers and inserted suffixes, renumbering after delete, navigation bounds, focus enter/exit and unique IDs passed');
})().catch(e=>{console.error(e);process.exit(1)});
