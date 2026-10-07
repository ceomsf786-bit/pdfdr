const fs=require('fs'), vm=require('vm'), assert=require('assert/strict');
const root=require('path').join(__dirname,'../');
const source=fs.readFileSync(root+'v312-imageboards.js','utf8').replace(/^import .*;\n/gm,'').replace('await installBoardInteractionTools();','');
async function run(teacher){
 const elements=new Map();
 class El {
  constructor(id){this.id=id;this.value='';this.style={};this.dataset={};this.children=[];this.width=800;this.height=500;this.classList={add(){},remove(){},toggle(){}};}
  appendChild(el){elements.set(el.id,el);this.children.push(el);return el;}
  set innerHTML(html){for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],new El(m[1]));}
  addEventListener(){} querySelectorAll(){return [];} querySelector(){return new El('img');}
  insertBefore(el){this.children.push(el);} getBoundingClientRect(){return {left:0,top:0,width:800,height:500};}
  getContext(){return new Proxy({}, {get:()=>()=>{}});} setPointerCapture(){}
 }
 for(const id of ['bookImageHost','statusText','colorInput','widthInput'])elements.set(id,new El(id));
 const boards=[{board_no:1,title:'Existing',objects:[],placements:{},canvas_width:1600,canvas_height:1000}],images=[];
 const requests=[];
 const channel={on(){return this;},subscribe(){},send:async()=>{}};
 const context={console,URL,URLSearchParams,Map,JSON,Number,Math,Date,Promise,Array,String,Error,setTimeout,clearTimeout,crypto:require('crypto').webcrypto,
  CONFIG:{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'test',API_FUNCTION:'api'},
  createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{student_token:'token'}})})})}),channel:()=>channel}),
  document:{body:{dataset:{mode:teacher?'teacher':'student'}},getElementById:id=>elements.get(id)||null,createElement:()=>new El(''),querySelector:s=>s.includes('[data-tool].active')?{dataset:{tool:'pen'}}:null,querySelectorAll:()=>[]},
  location:{href:'https://test.invalid/teacher.html?id=doc',hash:'#t=token'},window:{devicePixelRatio:1},requestAnimationFrame:fn=>fn(),
  fetch:async(url,opts={})=>{let u=new URL(url),action=u.searchParams.get('action'),no=Number(u.searchParams.get('board'));requests.push({action,no});let data={};
   if(action==='image-boards')data={document_id:'doc',boards:structuredClone(boards),live_image_board_no:1};
   if(action==='images')data={images:structuredClone(images.filter(x=>x.board_no===no))};
   if(action==='image-board-update')Object.assign(boards.find(b=>b.board_no===no),JSON.parse(opts.body));
   if(action==='upload-image'){let image={id:'image'+images.length,board_no:no,image_name:'Test'};images.push(image);data={image};}
   return {ok:true,json:async()=>data,blob:async()=>new Blob(['image'])};},Blob,
 };
 vm.createContext(context);vm.runInContext(source+'\nwindow.test={pointerDown,pointerMove,pointerUp,uploadFiles,remember,history,getState:()=>state};',context);
 await context.window.SNTImageBoards.open(1);
 assert(elements.has('imageBoardOverlay'),'lazy host initializes');
 assert.equal(elements.get('imageBoardZoomReset').textContent,'100%');assert.equal(elements.get('imageBoardZoomWrap').style.transform,'scale(1)');
 boards.push({board_no:2,title:'Newly inserted',objects:[],placements:{}});
 if(teacher){context.window.test.pointerDown({clientX:30,clientY:30,pointerId:1});context.window.test.pointerMove({clientX:90,clientY:90});context.window.test.pointerUp();}
 await context.window.SNTImageBoards.open(2);
 assert.equal(context.window.SNTImageBoards.boardNo(),2,'fresh board selected');
 assert.equal(boards[0].objects.length,teacher?1:0,'pending drawing persisted on original page');
 assert.equal(boards[1].objects.length,0,'drawing did not leak into next page');
 if(teacher){await context.window.test.uploadFiles([{name:'test.png',type:'image/png'}]);assert.equal(images[0].board_no,2,'image uploaded to correct board');
  const st=context.window.test.getState();st.objects=[{id:'object',type:'text',x:.2,y:.3,text:'Move me'}];
  const before=structuredClone(st.placements[images[0].id]);context.window.test.remember();st.objects[0].x=.4;st.placements[images[0].id].x+=100;
  context.window.test.history(st.undo,st.redo);assert.equal(st.objects[0].x,.2);assert.equal(st.placements[images[0].id].x,before.x,'undo restores image and drawing together');
  context.window.test.history(st.redo,st.undo);assert.equal(st.objects[0].x,.4);assert.equal(st.placements[images[0].id].x,before.x+100,'redo restores group move');
 }
 await context.window.SNTImageBoards.open(1);
 assert.equal(elements.get('imageBoardZoomReset').textContent,'100%','returning page opens at 100%');
 if(teacher)assert.equal(boards[0].objects.length,1,'returning preserves original drawing');
 const results=await Promise.all([context.window.SNTImageBoards.open(2),context.window.SNTImageBoards.open(1)]);
 assert.equal(context.window.SNTImageBoards.boardNo(),1,'rapid requests finish in navigation order');
 console.log((teacher?'Teacher':'Student')+': lazy initialization, new board selection, page isolation, return and rapid navigation passed');
}
(async()=>{await run(true);await run(false);})().catch(e=>{console.error(e);process.exit(1)});
