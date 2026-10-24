let db, pc=0, currentEdit=null, bulkPhotos=[];
const $=id=>document.getElementById(id);

const openReq=indexedDB.open("amiteru_shipping_v3",1);
openReq.onupgradeneeded=e=>e.target.result.createObjectStore("varieties",{keyPath:"name"});
openReq.onsuccess=e=>{db=e.target.result;renderLibrary();addProduct()};
openReq.onerror=()=>alert("Safariの通常タブで開いてください。");

function store(mode="readonly"){return db.transaction("varieties",mode).objectStore("varieties")}
function getAllVarieties(){return new Promise((res,rej)=>{const r=store().getAll();r.onsuccess=()=>res(r.result);r.onerror=rej})}
function fileToDataURL(file,max=1200,q=.82){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",q))};im.onerror=rej;im.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)})}

$("saveV").onclick=async()=>{const name=$("vname").value.trim(),f=$("vfile").files[0];if(!name||!f)return alert("品種名と写真を選んでください。");const url=await fileToDataURL(f,1200,.82);store("readwrite").put({name,url}).onsuccess=()=>{$("vname").value="";$("vfile").value="";renderLibrary();refreshSelects()}};
async function renderLibrary(){const vs=await getAllVarieties();$("library").innerHTML=vs.map(v=>`<div class="v"><img src="${v.url}"><b>${v.name}</b><button class="red" onclick='removeVariety(${JSON.stringify(v.name)})'>削除</button></div>`).join("")}
function removeVariety(name){store("readwrite").delete(name).onsuccess=()=>{renderLibrary();refreshSelects()}}
async function buildOptionsHTML(){const vs=await getAllVarieties();return '<option value="">選択</option>'+vs.map(v=>`<option>${v.name}</option>`).join("")}

async function addProduct(){pc++;const o=await buildOptionsHTML(),d=document.createElement("div");d.className="product";d.dataset.n=pc;d.innerHTML=`<b>商品 ${String(pc).padStart(2,"0")}</b><div class="slots">${[1,2,3,4,5].map(()=>`<select class="slot">${o}</select>`).join("")}</div><button onclick="openEditor(this.closest('.product'))">画像を作る・位置調整</button><div class="out"></div>`;$("products").appendChild(d)}
$("addP").onclick=addProduct;
async function refreshSelects(){const o=await buildOptionsHTML();document.querySelectorAll(".slot").forEach(s=>{const v=s.value;s.innerHTML=o;s.value=v})}

function layoutFor(n){
 const pad=18,g=18,CW=1250,CH=1532;
 if(n===3){const h=(CH-pad*2-g*2)/3;return [0,1,2].map(i=>({x:pad,y:pad+i*(h+g),w:CW-pad*2,h}))}
 if(n===4){const w=(CW-pad*2-g)/2,h=(CH-pad*2-g)/2;return [0,1,2,3].map(i=>({x:pad+(i%2)*(w+g),y:pad+Math.floor(i/2)*(h+g),w,h}))}
 const topW=(CW-pad*2-g*2)/3,topH=560,bottomW=(CW-pad*2-g)/2,bottomY=pad+topH+g,bottomH=CH-pad-bottomY;
 return [
  {x:pad,y:pad,w:topW,h:topH},{x:pad+topW+g,y:pad,w:topW,h:topH},{x:pad+2*(topW+g),y:pad,w:topW,h:topH},
  {x:pad,y:bottomY,w:bottomW,h:bottomH},{x:pad+bottomW+g,y:bottomY,w:bottomW,h:bottomH}
 ];
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
async function openEditor(productEl){
 const names=[...productEl.querySelectorAll(".slot")].map(s=>s.value).filter(Boolean);
 if(names.length<3||names.length>5)return alert("3〜5品種を選んでください。");
 const vs=await getAllVarieties(),map=Object.fromEntries(vs.map(v=>[v.name,v.url]));
 const urls=names.map(n=>map[n]),lays=layoutFor(names.length),host=$("editorCanvas");
 currentEdit={productEl,names,urls,transforms:urls.map(()=>({scale:1,tx:0,ty:0}))};
 host.innerHTML="";
 lays.forEach((l,i)=>{
   const t=document.createElement("div");t.className="editTile";
   t.style.left=(l.x/1250*100)+"%";t.style.top=(l.y/1532*100)+"%";t.style.width=(l.w/1250*100)+"%";t.style.height=(l.h/1532*100)+"%";
   const im=document.createElement("img");im.src=urls[i];t.appendChild(im);host.appendChild(t);
   attachGestures(t,im,i);
 });
 $("editorBackdrop").style.display="block";
}
function attachGestures(tile,img,index){
 let startTouches=[],start={scale:1,tx:0,ty:0},startDist=0,startMid=null;
 const apply=()=>{const tr=currentEdit.transforms[index];img.style.transform=`translate(${tr.tx}px,${tr.ty}px) scale(${tr.scale})`};
 tile.addEventListener("touchstart",e=>{
   e.preventDefault();
   const tr=currentEdit.transforms[index];start={...tr};startTouches=[...e.touches].map(t=>({x:t.clientX,y:t.clientY}));
   if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];startDist=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);startMid={x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2}}
 },{passive:false});
 tile.addEventListener("touchmove",e=>{
   e.preventDefault();
   const tr=currentEdit.transforms[index];
   if(e.touches.length===1 && startTouches.length>=1){
     tr.tx=start.tx+(e.touches[0].clientX-startTouches[0].x);
     tr.ty=start.ty+(e.touches[0].clientY-startTouches[0].y);
   }else if(e.touches.length===2 && startDist){
     const a=e.touches[0],b=e.touches[1],dist=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),mid={x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};
     tr.scale=clamp(start.scale*(dist/startDist),1,4);
     tr.tx=start.tx+(mid.x-startMid.x);tr.ty=start.ty+(mid.y-startMid.y);
   }
   apply();
 },{passive:false});
}

$("cancelEdit").onclick=()=>{$("editorBackdrop").style.display="none";currentEdit=null};
$("finishEdit").onclick=async()=>{
 if(!currentEdit)return;
 const {productEl,urls,transforms}=currentEdit,lays=layoutFor(urls.length),c=$("cv"),ctx=c.getContext("2d");c.width=1250;c.height=1532;ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);
 const imgs=await Promise.all(urls.map(u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u})));
 const editorRect=$("editorCanvas").getBoundingClientRect();
 lays.forEach((l,i)=>{
   const tr=transforms[i],img=imgs[i],tileW=editorRect.width*(l.w/1250),tileH=editorRect.height*(l.h/1532);
   const txRatio=tr.tx/tileW,tyRatio=tr.ty/tileH;
   ctx.save();ctx.beginPath();ctx.rect(l.x,l.y,l.w,l.h);ctx.clip();
   const base=Math.max(l.w/img.width,l.h/img.height),scale=base*tr.scale,nw=img.width*scale,nh=img.height*scale;
   ctx.drawImage(img,l.x+(l.w-nw)/2+txRatio*l.w,l.y+(l.h-nh)/2+tyRatio*l.h,nw,nh);
   ctx.restore();
 });
 const u=c.toDataURL("image/jpeg",.86),num=String(productEl.dataset.n).padStart(2,"0");
 productEl.querySelector(".out").innerHTML=`<div class="pill">${num}_mix.jpg</div><img class="preview" src="${u}"><div class="small">長押しで保存できます。</div><div style="margin-top:8px"><a class="btn" download="${num}_mix.jpg" href="${u}">画像を保存</a></div>`;
 $("editorBackdrop").style.display="none";currentEdit=null;
};

$("realfiles").onchange=async e=>{
 const files=[...e.target.files];if(!files.length)return;
 bulkPhotos=[];$("photoGrid").innerHTML="";$("bulkActions").style.display="none";$("bulkStatus").textContent=`${files.length}枚を変換中…`;
 for(let i=0;i<files.length;i++){
   const dataURL=await fileToDataURL(files[i],1600,.82);
   const name=String(i+1).padStart(2,"0")+"_photo.jpg";
   bulkPhotos.push({name,dataURL});
   const im=document.createElement("img");im.src=dataURL;$("photoGrid").appendChild(im);
   $("bulkStatus").textContent=`${i+1}/${files.length}枚 完了`;
 }
 $("bulkActions").style.display="block";
};

$("downloadZip").onclick=async()=>{
 if(!bulkPhotos.length)return;
 if(typeof JSZip==="undefined"){alert("ZIP機能を読み込めませんでした。通信環境を確認してください。");return}
 const zip=new JSZip();
 bulkPhotos.forEach(p=>zip.file(p.name,p.dataURL.split(",")[1],{base64:true}));
 $("bulkStatus").textContent="ZIPを作成中…";
 const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="amiteru_photos.zip";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 $("bulkStatus").textContent=`${bulkPhotos.length}枚をZIP保存しました`;
};

if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}
