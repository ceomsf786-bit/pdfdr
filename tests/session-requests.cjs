const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../viewer.js'),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
let calls=[],fresh='fresh-token',reject=false,refreshes=0;
const item={id:'inserted',kind:'image',title:'Old name'},stored={...item};
const ctx={flushBookNote:async()=>{},TEACHER:true,state:{session:{access_token:'expired-token'},doc:{id:'doc'},bookPages:[stored]},bookEls:{title:{value:'Renamed page'}},bookItem:()=>item,setStatus:()=>{},apiUrl:(action,p)=>'https://test.invalid/'+action+'?page='+p.id,supabase:{auth:{getSession:async()=>({data:{session:fresh?{access_token:fresh}:null}}),refreshSession:async()=>{refreshes++;return{data:{session:{access_token:'refreshed-token'}}}}}},CONFIG:{SUPABASE_PUBLISHABLE_KEY:'public'},fetch:async(url,opts)=>{calls.push(opts);if(reject&&calls.length===1)return new Response(JSON.stringify({detail:'AUTH_REQUIRED',error:'Teacher sign-in is required.'}),{status:400});return new Response(JSON.stringify({ok:true}),{status:200})},Response};
vm.createContext(ctx);vm.runInContext(between('function authHeaders(extra={}){','async function api(action, extra={}){')+between('async function saveBookPageTitle(){','async function deleteBookPage(){'),ctx);
(async()=>{
 await ctx.saveBookPageTitle();assert.equal(calls[0].headers.Authorization,'Bearer fresh-token');assert.equal(calls[0].headers['Content-Type'],'application/json');assert.equal(item.title,'Renamed page');assert.equal(stored.title,'Renamed page');
 calls=[];reject=true;await ctx.saveBookPageTitle();assert.equal(refreshes,1);assert.equal(calls.length,2);assert.equal(calls[1].headers.Authorization,'Bearer refreshed-token');assert.equal(calls[0].body,calls[1].body,'retry keeps exact rename payload');
 calls=[];reject=false;fresh=null;await assert.rejects(ctx.saveBookPageTitle(),/session has ended/);assert.equal(calls.length,0,'missing session never sends an anonymous teacher write');
 ctx.TEACHER=false;await ctx.saveBookPageTitle();assert.equal(calls.length,0,'student cannot rename');
 console.log('Session requests: fresh token, rename updates, AUTH_REQUIRED refresh/retry, payload preservation, ended session and student guard passed');
})().catch(e=>{console.error(e);process.exit(1)});
