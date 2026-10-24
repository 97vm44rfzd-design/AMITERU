let db, pc=0;
const $=id=>document.getElementById(id);
const open=indexedDB.open("amiteru_shipping_v1",1);
open.onupgradeneeded=e=>e.target.result.createObjectStore("varieties",{keyPath:"name"});
open.onsuccess=e=>{db=e.target.result; renderLibrary(); addProduct();};
open.onerror=()=>alert("Safariのプライベートブラウズではなく通常タブで開いてください。");
function store(mode="readonly"){return db.transaction("varieties",mode).objectStore("varieties")}
function getAll(){return new Promise((res,rej)=>{const r=store().getAll();r.onsuccess=()=>res(r.result);r.onerror=rej})}
function convert(file,max=1200,q=.82){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const s=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",q))};im.onerror=rej;im.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)})}
$("saveV").onclick=async()=>{const name=$("vname").value.trim(),f=$("vfile").files[0];if(!name||!f)return alert("品種名と写真を選んでください。");const url=await convert(f,1000,.8);store("readwrite").put({name,url}).onsuccess=()=>{$("vname").value="";$("vfile").value="";renderLibrary();refreshSelects()}};
async function renderLibrary(){const vs=await getAll();$("library").innerHTML=vs.map(v=>`<div class="v"><img src="${v.url}"><b>${v.name}</b><button class="red" onclick='removeV(${JSON.stringify(v.name)})'>削除</button></div>`).join("")}
function removeV(name){store("readwrite").delete(name).onsuccess=()=>{renderLibrary();refreshSelects()}}
async function optionHTML(){const vs=await getAll();return '<option value="">選択</option>'+vs.map(v=>`<option>${v.name}</option>`).join("")}
async function addProduct(){pc++;const o=await optionHTML(),d=document.createElement("div");d.className="product";d.dataset.n=pc;d.innerHTML=`<b>商品 ${String(pc).padStart(2,"0")}</b><div class="slots">${[1,2,3,4].map(()=>`<select class="slot">${o}</select>`).join("")}</div><button onclick="makeMix(this.closest('.product'))">ミックス画像を作る</button><div class="out"></div>`;$("products").appendChild(d)}
$("addP").onclick=addProduct;
async function refreshSelects(){const o=await optionHTML();document.querySelectorAll(".slot").forEach(s=>{const v=s.value;s.innerHTML=o;s.value=v})}
function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url})}
function cover(ctx,im,x,y,w,h){const r=Math.max(w/im.width,h/im.height),nw=im.width*r,nh=im.height*r;ctx.drawImage(im,x+(w-nw)/2,y+(h-nh)/2,nw,nh)}
async function makeMix(p){const names=[...p.querySelectorAll(".slot")].map(s=>s.value).filter(Boolean);if(names.length<3||names.length>4)return alert("3品種または4品種を選んでください。");const vs=await getAll(),map=Object.fromEntries(vs.map(v=>[v.name,v.url])),ims=await Promise.all(names.map(n=>loadImage(map[n])));const c=$("cv"),ctx=c.getContext("2d");c.width=c.height=1200;ctx.fillStyle="#fff";ctx.fillRect(0,0,1200,1200);const pd=14,g=14;if(ims.length===3){const h=(1200-pd*2-g*2)/3;ims.forEach((im,k)=>cover(ctx,im,pd,pd+k*(h+g),1200-pd*2,h))}else{const s=(1200-pd*2-g)/2;ims.forEach((im,k)=>cover(ctx,im,pd+(k%2)*(s+g),pd+Math.floor(k/2)*(s+g),s,s))}const u=c.toDataURL("image/jpeg",.82),n=String(p.dataset.n).padStart(2,"0");p.querySelector(".out").innerHTML=`<div class="pill">${n}_mix.jpg</div><img class="preview" src="${u}"><div class="small">↑ 画像を長押し →「写真に保存」</div>`}
$("realfile").onchange=async e=>{const f=e.target.files[0];if(!f)return;const u=await convert(f,1600,.82);$("realout").innerHTML=`<div class="pill">現物写真・縮小済み</div><img class="preview" src="${u}"><div class="small">↑ 画像を長押し →「写真に保存」</div>`};
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});