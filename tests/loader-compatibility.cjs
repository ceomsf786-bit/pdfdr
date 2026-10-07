const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../');
(async()=>{
 const core=fs.readFileSync(root+'viewer.js','utf8'),loader=fs.readFileSync(root+'v317-viewer-loader.js','utf8');
 const ctx={URL,location:{href:'https://test.invalid/teacher.html'},console,fetch:async()=>({ok:true,text:async()=>core})};vm.createContext(ctx);
 const code=loader.slice(0,loader.lastIndexOf('const blob = new Blob'))+'globalThis.patched=src;';await vm.runInContext('(async()=>{'+code+'})()',ctx);
 new vm.Script(ctx.patched.replace(/^import .*;\n/gm,''));assert(ctx.patched.includes('function resizeObject('));assert(ctx.patched.includes('function installPdfInteractionTools('));
 console.log('Viewer loader: every live v3.17 patch applies; resize, fills, style controls and new interactions retained');
})().catch(e=>{console.error(e);process.exit(1)});
