const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../viewer.js'),'utf8');
function between(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
function el(){let classes=new Set();return {style:{},value:'',textContent:'',disabled:false,clientWidth:800,scrollTop:0,scrollLeft:0,classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c),remove:c=>classes.delete(c)},setAttribute(){},getContext:()=>({})};}
const exit=el(),body=el();
const els=Object.fromEntries(['workspace','focusPdfBtn','pageInput','pageCount','prevPage','nextPage','pdfCanvas','overlayCanvas','canvasWrap','pdfScroller','toolRail'].map(k=>[k,el()]));
const context={console,Math,Number,String,TEACHER:false,els,state:{pdf:{numPages:2,getPage:async()=>({getViewport:()=>({width:600,height:800}),render:()=>({promise:Promise.resolve()})})},scale:1,fit:true,pageNo:1,rendering:false,pendingPage:null,boards:[{}],bookSequence:[{kind:'pdf',pdfPage:1},{kind:'note'},{kind:'image'},{kind:'pdf',pdfPage:2}],bookIndex:0},document:{body,getElementById:id=>id==='exitPdfFocusBtn'?exit:null},$:id=>id==='exitPdfFocusBtn'?exit:null,window:{devicePixelRatio:1},requestAnimationFrame:fn=>fn(),studentFollowActive:()=>false,loadStudentPageData:async()=>{},loadStudentBoards:async()=>{},persistStudentState:()=>{}};
vm.createContext(context);
vm.runInContext(between('function bookItem(){','async function showBookIndex')+between('async function renderPage(n','function setBoardOpen(')+between('function setPdfFocus(on){','function bindResizer('),context);
(async()=>{
 await context.renderPage(1);assert.equal(els.pageInput.value,'1');assert.equal(els.pageCount.textContent,'/ 4');assert.equal(els.nextPage.disabled,false);
 context.state.bookIndex=3;await context.renderPage(2);assert.equal(els.pageInput.value,'4');assert.equal(els.pageCount.textContent,'/ 4');assert.equal(els.nextPage.disabled,true);
 await context.renderPage(2);assert.equal(els.pageInput.value,'4','zoom/fit rerender keeps logical number');
 context.TEACHER=true;context.state.bookIndex=2;
 context.setPdfFocus(true);assert(body.classList.contains('pdf-focus-mode'));assert(!exit.classList.contains('hidden'));assert.equal(els.focusPdfBtn.textContent,'Exit PDF Focus');
 context.setPdfFocus(false);assert(!body.classList.contains('pdf-focus-mode'));assert(exit.classList.contains('hidden'));assert.equal(context.state.bookIndex,2,'focus preserves inserted page');
 const html=fs.readFileSync(path.join(__dirname,'../teacher.html'),'utf8');const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'toolbar IDs unique');
 console.log('Book controls: continuous numbering after PDF render/zoom, navigation bounds, focus enter/exit and unique IDs passed');
})().catch(e=>{console.error(e);process.exit(1)});
