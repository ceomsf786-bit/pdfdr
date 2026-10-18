const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const src=fs.readFileSync(__dirname+'/../viewer.js','utf8');
const between=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
(async()=>{
 let captured=null,view={item:{key:'insert:note',kind:'note',id:'note',anchor_pdf_page:9},index:5,centerY:.72},jumped=[],followed=[],flushes=0;
 const reader={active:true,position:()=>view,goTo:key=>jumped.push(key),follow:(key,center)=>followed.push({key,center})};
 const ctx={TEACHER:true,window:{SNTContinuousView:reader},state:{doc:{id:'doc'},pdf:{numPages:10},pageNo:2,liveSeq:0,bookSequence:[{key:'pdf:1',kind:'pdf',pdfPage:1},{key:'insert:note',kind:'note',id:'note'}],bookIndex:0,liveCenterY:.4,boards:[{}]},els:{pdfScroller:{scrollWidth:800,scrollHeight:1000,clientWidth:800,clientHeight:600,scrollTop:0,scrollLeft:0}},Math,Date,Number,bookItem:()=>ctx.state.bookSequence[ctx.state.bookIndex],clamp01:v=>v,supabase:{from:()=>({update:patch=>{captured=patch;return {eq:async()=>({})}}})},setStatus(){},flushBookNote:async()=>flushes++};
 vm.createContext(ctx);vm.runInContext(between('function captureTeacherView(){','function broadcastTeacherView(){')+between('async function pushLiveState(){','async function releaseTeacherControl(')+between('async function showBookIndex(index){','async function followBookPage(')+between('async function followBookPage(key,page){','function setBookHtml('),ctx);
 const payload=ctx.captureTeacherView();assert.equal(payload.live_page,9);assert.equal(payload.live_book_key,'insert:note');assert.equal(payload.live_inserted_page_id,'note');assert.equal(payload.live_center_y,.72);assert.equal(ctx.state.pageNo,2,'reading does not repoint the single-page editor or its unsaved objects');await ctx.pushLiveState();assert.equal(captured.live_page,9,'saved teacher live page matches the continuous page');
 await ctx.showBookIndex(1);assert.equal(jumped[0],'insert:note');assert.equal(flushes,0,'scroll navigation never saves hidden editor text onto a different page');
 ctx.state.liveCenterY=.4;await ctx.followBookPage('insert:note',9);assert.equal(followed[0].key,'insert:note');assert.equal(followed[0].center,.4);
 view={item:{key:'pdf:7',kind:'pdf',pdfPage:7},index:7,centerY:.3};const p=ctx.captureTeacherView();assert.equal(p.live_page,7);assert.equal(p.live_inserted_page_id,null);
 vm.runInContext(between('function virtualPageLocation(globalPage){','async function loadPdf(){'),ctx);ctx.state.sourcePdfCache=new Map();ctx.loadSourcePdf=async id=>({getPage:async page=>({id,page})});
 const pdf=ctx.buildVirtualPdf([{id:'original',page_start:1,page_count:2},{id:'inserted',page_start:1,page_count:2},{id:'original',page_start:3,page_count:1}],5);
 assert.equal((await pdf.getPage(3)).id,'inserted');assert.equal((await pdf.getPage(3)).page,1);assert.equal((await pdf.getPage(5)).id,'original');assert.equal((await pdf.getPage(5)).page,3);
 console.log('Continuous integration: teacher broadcast/database page identity, inserted-page identity, reading/editor isolation, navigation routing and student follow passed');
})().catch(e=>{console.error(e);process.exit(1)});
