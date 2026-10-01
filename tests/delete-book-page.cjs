const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{stripTypeScriptTypes}=require('module');
const raw=fs.readFileSync(path.join(__dirname,'../supabase/functions/snt-pdf-api/index.ts'),'utf8').replace(/^import .*;\n/,'');
const pageId='11111111-1111-4111-8111-111111111111',foreignId='22222222-2222-4222-8222-222222222222';
const doc={id:'doc',student_token:'student',student_link_enabled:true,revision:1,live_book_key:'insert:'+pageId,live_inserted_page_id:pageId};
let pages=[{id:pageId,document_id:'doc',kind:'note',anchor_pdf_page:4},{id:foreignId,document_id:'other',kind:'image',anchor_pdf_page:1}];const touched=[];
function query(table){let filters=[],operation='select',patch;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){operation='update';patch=v;return q},delete(){operation='delete';return q},
 async maybeSingle(){return execute()},async single(){return execute()},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};
 function execute(){touched.push(table+':'+operation);const rows=table==='snt_pdf_documents'?[doc]:pages;const row=rows.find(x=>filters.every(([k,v])=>x[k]===v));if(operation==='delete'&&row)pages=pages.filter(x=>x!==row);if(operation==='update'&&row)Object.assign(row,patch);return {data:row?structuredClone(row):null,error:null};}return q;}
let handler;const context={console,URL,Request,Response,Headers,Blob,Date,Math,Number,String,JSON,Error,crypto:require('crypto').webcrypto,Uint8Array,TextEncoder,fetch:()=>{throw Error('Unexpected network request')},Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},createClient:()=>({from:query,auth:{getUser:async token=>({data:{user:token==='teacher'?{id:'teacher'}:null},error:null})}})};
vm.createContext(context);vm.runInContext(stripTypeScriptTypes(raw),context);
async function call(page,headers,action='delete-book-page',body){const r=await handler(new Request('https://test.invalid/api?action='+action+'&doc=doc&page='+page,{method:'POST',headers,body:body?JSON.stringify(body):undefined}));return {status:r.status,data:await r.json()};}
(async()=>{
 const teacher={authorization:'Bearer teacher'};
 for(const action of ['init','sync']){const r=await handler(new Request('https://test.invalid/api?action='+action,{headers:{'x-viewer-token':'student'}}));assert.equal(r.status,200);const json=await r.json(),data=action==='init'?json.document:json;assert.equal(data.live_book_key,'insert:'+pageId);assert.equal(data.live_inserted_page_id,pageId);}
 assert.equal((await call(pageId,{'x-viewer-token':'student'},'rename-book-page',{title:'New'})).status,403);
 assert.equal((await call(foreignId,teacher,'rename-book-page',{title:'New'})).status,404);
 assert.equal((await call(pageId,teacher,'rename-book-page',{title:'   '})).status,400);
 assert.equal((await call(pageId,teacher,'rename-book-page',{title:'Renamed note'})).status,200);assert.equal(pages[0].title,'Renamed note');
 doc.revision=1;
 assert.equal((await call(pageId,{'x-viewer-token':'student'})).status,403);assert.equal(pages.length,2,'student cannot delete');
 assert.equal((await call(foreignId,teacher)).status,404);assert.equal(pages.length,2,'other document protected');
 assert.equal((await call('pdf:4',teacher)).status,400,'source PDF cannot be deleted');
 assert.equal((await call(pageId,teacher)).status,200);assert.equal(pages.length,1);assert.equal(doc.live_book_key,'pdf:4');assert.equal(doc.live_inserted_page_id,null);assert.equal(doc.revision,2);
 assert.equal((await call(pageId,teacher)).status,404,'repeat deletion reports missing page');
 pages.push({id:pageId,document_id:'doc',kind:'image',anchor_pdf_page:4});assert.equal((await call(pageId,teacher,'rename-book-page',{title:'Renamed image'})).status,200);assert.equal(pages.find(x=>x.id===pageId).title,'Renamed image');assert.equal((await call(pageId,teacher)).status,200,'image page deletion works');
 assert(touched.every(x=>x.startsWith('snt_pdf_documents:')||x.startsWith('snt_pdf_book_pages:')),'backing assets are preserved');
 console.log('Delete API: teacher-only, document scoping, PDF protection, note/image deletion, missing page and live-state reset passed');
})().catch(e=>{console.error(e);process.exit(1)});
