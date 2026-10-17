const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),PDFLib=require('pdf-lib');
let native;try{native=require('@napi-rs/canvas');}catch(error){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw error;native=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');}
global.DOMMatrix=native.DOMMatrix;global.Path2D=native.Path2D;
class CanvasFactory{create(width,height){const canvas=native.createCanvas(width,height);return {canvas,context:canvas.getContext('2d')};}reset(target,width,height){target.canvas.width=width;target.canvas.height=height;}destroy(target){target.canvas.width=0;target.canvas.height=0;target.canvas=null;target.context=null;}}
const pdfjsLib=require('pdfjs-dist/legacy/build/pdf.js');
const fixtures=require('./fixtures/encrypted-download.json'),encrypted=Buffer.from(fixtures.emptyPassword,'base64'),locked=Buffer.from(fixtures.needsPassword,'base64');
const source=fs.readFileSync(__dirname+'/../viewer.js','utf8'),code=source.slice(source.indexOf('function encryptedDownloadError(error)'),source.indexOf('async function downloadStudentPdf(){'));
(async()=>{
 await assert.rejects(PDFLib.PDFDocument.load(encrypted),/encrypted/);
 const plain=await PDFLib.PDFDocument.create();plain.addPage([701,601]);const plainBytes=await plain.save();
 let manifest={page_count:3,sources:[{id:'encrypted',page_start:2,page_count:1},{id:'plain',page_start:1,page_count:1},{id:'encrypted',page_start:1,page_count:1}]},sourceBytes=encrypted,rendered=0,destroyed=0;
 const document={createElement:tag=>{
  assert.equal(tag,'canvas');const canvas=native.createCanvas(1,1);
  canvas.toBlob=(callback)=>{rendered++;callback(new Blob([canvas.toBuffer('image/jpeg')],{type:'image/jpeg'}));};return canvas;
 }};
 const readerLib={getDocument:options=>{
  const task=pdfjsLib.getDocument({...options,disableFontFace:false,useSystemFonts:true,canvasFactory:new CanvasFactory()});const promise=task.promise.then(reader=>{
   const destroy=reader.destroy.bind(reader);reader.destroy=async()=>{destroyed++;return destroy();};return reader;
  });return {promise,destroy:()=>task.destroy()};
 }};
 const ctx={window:{PDFLib},pdfjsLib:readerLib,document,Blob,Uint8Array,Array,Number,Date,Error,setStatus(){},api:async()=>manifest,apiUrl:(action,p)=>action+':'+(p.source||''),authHeaders:()=>({'x-viewer-token':'test'}),fetch:async(url,options)=>{assert.equal(options.headers['x-viewer-token'],'test');const bytes=url.includes('plain')?plainBytes:sourceBytes;return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}};vm.createContext(ctx);vm.runInContext(code,ctx);
 let output=await ctx.buildStudentDownloadPdf();assert.deepEqual(output.getPages().map(p=>p.getWidth()),[402,701,401]);assert.equal(rendered,2);assert.equal(destroyed,2);const mergedBytes=await output.save();output=await PDFLib.PDFDocument.load(mergedBytes);assert.equal(output.getPageCount(),3);assert(!output.isEncrypted);
 // The rendered page is visible rather than blank/ciphertext after saving.
 const reader=await pdfjsLib.getDocument({data:mergedBytes,disableFontFace:false,useSystemFonts:true,canvasFactory:new CanvasFactory()}).promise;const page=await reader.getPage(1),canvas=native.createCanvas(402,601);await page.render({canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:1})}).promise;const pixel=canvas.getContext('2d').getImageData(80,500,1,1).data;assert(pixel[1]>pixel[0]+50,'green source content survived rendering');await reader.destroy();
 manifest={page_count:2,sources:[{id:'encrypted',page_start:1,page_count:2}]};output=await ctx.buildStudentDownloadPdf();assert.deepEqual(Buffer.from(await output.save()),encrypted,'full protected original downloaded byte-for-byte');assert.equal(output.getPageCount(),2);assert.equal(rendered,2,'standalone original is not rasterized');
 manifest={page_count:2,sources:[]};output=await ctx.buildStudentDownloadPdf();assert.deepEqual(Buffer.from(await output.save()),encrypted,'legacy/single protected PDF also preserved');
 manifest={page_count:1,sources:[{id:'encrypted',page_start:3,page_count:1}]};const beforeDestroy=destroyed;await assert.rejects(ctx.buildStudentDownloadPdf(),/range no longer matches/);assert.equal(destroyed,beforeDestroy+1);
 sourceBytes=locked;manifest={page_count:2,sources:[]};await assert.rejects(ctx.buildStudentDownloadPdf(),/opening password/);
 sourceBytes=Buffer.from('not a PDF');await assert.rejects(ctx.buildStudentDownloadPdf(),/No PDF header/);
 console.log('Encrypted student downloads: real encrypted fixture, merged page order/ranges, visible nonblank output, original byte preservation, cleanup, opening-password message and corrupt-file rejection passed');
})().catch(e=>{console.error(e);process.exit(1)});
