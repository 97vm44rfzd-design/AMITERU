
const AMITERU_PROXY='https://amiteru-flow-proxy.77hs6mt8h6.workers.dev';
(()=>{
const D=id=>document.getElementById(id);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const compactYen=n=>{n=Number(n)||0;return n>=10000?`¥${(n/10000).toFixed(n>=100000?1:1).replace(/\.0$/,'')}万`:`¥${Math.round(n).toLocaleString('ja-JP')}`};
const fmtDate=s=>s&&s.length>=8?`${s.slice(0,4)}/${Number(s.slice(4,6))}/${Number(s.slice(6,8))}`:(s||'');
const today8=()=>{const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`};
const nrm=s=>(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
const hesc=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function itemGroup(item,variety=''){
 const x=nrm(item),v=nrm(variety);
 if(x.includes('ユーカリ')||x.includes('ﾕｰｶﾘ')) return 'ユーカリ';
 if(x.includes('ワタ')||x.includes('ﾜﾀ')||v.includes('コットン')) return 'コットン';
 if(x.includes('トウモロコシ')||x.includes('ﾄｳﾓﾛｺｼ')||v.includes('グラスジェム')) return 'グラスジェムコーン';
 if(x.includes('スモーク')||x.includes('ｽﾓｰｸ')) return 'スモークツリー';
 if(v.includes('カナリヤ')||v.includes('かなりや')) return 'カナリヤナス';
 return 'その他';
}
const COLORS={'ユーカリ':'#567a61','コットン':'#c8a56a','グラスジェムコーン':'#8b6d9c','スモークツリー':'#a36f76','カナリヤナス':'#7a8e55','その他':'#9aa19a'};
let sdb=null, allSales=[], customerMeta=new Map(), latestImport=null;
const openReq=indexedDB.open('amiteru_sales_v1',1);
openReq.onupgradeneeded=e=>{
 const db=e.target.result;
 if(!db.objectStoreNames.contains('sales')){const st=db.createObjectStore('sales',{keyPath:'id'});st.createIndex('date','date');st.createIndex('buyer','buyer');}
 if(!db.objectStoreNames.contains('customerMeta')) db.createObjectStore('customerMeta',{keyPath:'buyer'});
};
openReq.onerror=()=>{const el=D('salesImportStatus'); if(el)el.textContent='販売DBを開けませんでした。Safariのプライベートブラウズではなく通常画面でお試しください。'};
openReq.onsuccess=async e=>{sdb=e.target.result; await seedSales(); await refreshSalesUI(); bindSalesUI();};
function tx(store,mode='readonly'){return sdb.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function putOne(store,obj){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function seedSales(){
 if(!Array.isArray(window.AMITERU_INITIAL_SALES)&&typeof AMITERU_INITIAL_SALES==='undefined') return;
 const seed=typeof AMITERU_INITIAL_SALES!=='undefined'?AMITERU_INITIAL_SALES:window.AMITERU_INITIAL_SALES;
 const transaction=sdb.transaction('sales','readwrite'), st=transaction.objectStore('sales');
 for(const r of seed) st.put(r);
 await new Promise((res,rej)=>{transaction.oncomplete=res;transaction.onerror=()=>rej(transaction.error)});
}
function bindSalesUI(){
 D('importSalesCsv').addEventListener('click',importSelectedSales);
 D('salesYear').addEventListener('change',renderChart);
 D('customerFilter').addEventListener('change',renderCustomers);
 D('customerSearch').addEventListener('input',renderCustomers);
}
function salesParseCSV(t){
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<t.length;i++){const ch=t[i],nx=t[i+1];if(ch==='"'){if(q&&nx==='"'){cell+='"';i++}else q=!q}else if(ch===','&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&nx==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
 if(cell.length||row.length){row.push(cell);rows.push(row)} return rows.filter(r=>r.some(c=>String(c).trim()));
}
function idx(h,names){for(const n of names){const i=h.findIndex(x=>nrm(x)===nrm(n));if(i>=0)return i}return -1}
function num(v){return Number(String(v||'').replace(/[^0-9.-]/g,''))||0}
function recordsFromText(text,source){
 const mat=salesParseCSV(text); if(mat.length<2) return [];
 const h=mat[0].map(x=>String(x).trim());
 const c={date:idx(h,['売立日','販売日']),saleType:idx(h,['販売種別']),item:idx(h,['品目']),variety:idx(h,['品種']),length:idx(h,['長さ / 高さ','長さ']),qty:idx(h,['合計本数','本数']),unit:idx(h,['販売金額','単価']),amount:idx(h,['合計金額','金額']),buyer:idx(h,['買参番号'])};
 if(c.date<0||c.item<0||c.amount<0) throw new Error('売立明細CSVの列が見つかりません。');
 const occ=new Map(), out=[];
 for(const r of mat.slice(1)){
   const date=String(r[c.date]||'').replace(/\D/g,'').slice(0,8); if(date.length!==8)continue;
   const saleType=c.saleType>=0?String(r[c.saleType]||'').trim():'';
   const item=c.item>=0?String(r[c.item]||'').trim():'';
   const variety=c.variety>=0?String(r[c.variety]||'').trim():'';
   const length=c.length>=0?String(r[c.length]||'').trim():'';
   const qty=c.qty>=0?num(r[c.qty]):0, unitPrice=c.unit>=0?num(r[c.unit]):0, amount=num(r[c.amount]);
   const buyer=(c.buyer>=0?String(r[c.buyer]||'').trim():'').split('-')[0];
   const base=[date,saleType,item,variety,length,qty,unitPrice,buyer].join('|'); const count=(occ.get(base)||0)+1; occ.set(base,count);
   out.push({id:base+'|'+count,date,saleType,item,variety,length,qty,unitPrice,amount,buyer,source});
 }
 return out;
}
async function importSelectedSales(){
 const files=[...(D('salesCsvFile').files||[])]; if(!files.length){alert('売立CSVを選んでください。');return}
 const before=await getAll('sales'), oldBuyers=new Set(before.map(r=>r.buyer).filter(Boolean));
 let parsed=[], bad=[];
 for(const f of files){try{parsed.push(...recordsFromText(await f.text(),f.name))}catch(e){bad.push(`${f.name}: ${e.message}`)}}
 const known=new Set(before.map(r=>r.id)); const fresh=parsed.filter(r=>!known.has(r.id));
 if(fresh.length){
  const learn=fcLearningLoad(),byDate=new Map();for(const r of fresh.filter(isEuca)){if(!byDate.has(r.date))byDate.set(r.date,[]);byDate.get(r.date).push(r)}
  for(const [date,rows] of byDate){const d=saleToAuctionDate(date),fc=forecastFor(d),pred=fc.score,actual=observedDemandScore(rows,before);if(actual!=null)learn.push({date:dateKey(d),predicted:pred,actual,error:actual-pred,rows:rows.length,settlementRank:fc.settle?.rank||0,settlementScore:fc.settle?.score||0,recordedAt:new Date().toISOString()})}fcLearningSave(learn);
  const tr=sdb.transaction('sales','readwrite'),st=tr.objectStore('sales');fresh.forEach(r=>st.put(r));await new Promise((res,rej)=>{tr.oncomplete=res;tr.onerror=()=>rej(tr.error)})}
 const buyers=[...new Set(fresh.map(r=>r.buyer).filter(Boolean))]; const repeats=buyers.filter(b=>oldBuyers.has(b)).length;
 latestImport={rows:fresh.length,files:files.length,buyers:buyers.length,repeats,newBuyers:buyers.length-repeats,amount:fresh.reduce((a,r)=>a+r.amount,0),bad};
 D('salesCsvFile').value=''; await refreshSalesUI();
 D('salesImportStatus').textContent=`${files.length}ファイル確認：新規 ${fresh.length}明細を追加（重複 ${parsed.length-fresh.length}明細は除外）`;
}
async function refreshSalesUI(){
 allSales=await getAll('sales'); const metas=await getAll('customerMeta'); customerMeta=new Map(metas.map(x=>[x.buyer,x]));
 const years=[...new Set(allSales.map(r=>r.date.slice(0,4)))].sort((a,b)=>b-a); const sel=D('salesYear'), prev=sel.value; sel.innerHTML=years.map(y=>`<option value="${y}">${y}年</option>`).join('');
 const nowY=String(new Date().getFullYear()); sel.value=years.includes(prev)?prev:(years.includes(nowY)?nowY:(years[0]||''));
 renderKpis();renderYearTotals();renderChart();renderLatest();renderCustomers();renderHistory();
 // 売立DB読込後、実績学習を反映して予測を再描画
 try{renderForecastCalendars()}catch(e){console.error('forecast rerender',e)}
}

function renderYearTotals(){
 const years=[...new Set(allSales.map(r=>r.date.slice(0,4)))].filter(Boolean).sort();
 const el=D('yearTotals'); if(!el)return;
 el.innerHTML=years.map(y=>{
   const rows=allSales.filter(r=>r.date.startsWith(y));
   const total=rows.reduce((a,r)=>a+r.amount,0);
   const dates=new Set(rows.map(r=>r.date)).size;
   return `<div class="year-total"><span>${y}年</span><b>${yen(total)}</b><small>${dates}売立日</small></div>`;
 }).join('');
}
function monthTotal(y,m){const ym=`${y}${String(m).padStart(2,'0')}`;return allSales.filter(r=>r.date.startsWith(ym)).reduce((a,r)=>a+r.amount,0)}
function customerStats(){
 const m=new Map();
 for(const r of allSales){if(!r.buyer)continue; if(!m.has(r.buyer))m.set(r.buyer,{buyer:r.buyer,dates:new Set(),amount:0,items:new Set(),last:'',rows:0}); const c=m.get(r.buyer);c.dates.add(r.date);c.amount+=r.amount;c.items.add(itemGroup(r.item,r.variety));c.last=c.last>r.date?c.last:r.date;c.rows++;}
 return [...m.values()].map(c=>({...c,purchases:c.dates.size,itemsArr:[...c.items],repeat:c.dates.size>=2}));
}
function renderKpis(){
 const d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,cur=monthTotal(y,m); const yearTotal=allSales.filter(r=>r.date.startsWith(String(y))).reduce((a,r)=>a+r.amount,0); D('kpiYear').textContent=yen(yearTotal); D('kpiYearSub').textContent=`${y}年1〜${m}月`; let py=y,pm=m-1;if(pm===0){pm=12;py--}const prev=monthTotal(py,pm);
 D('kpiMonth').textContent=yen(cur);D('kpiMonthSub').textContent=`${y}年${m}月`;
 if(prev>0){const pct=(cur-prev)/prev*100;D('kpiMoM').textContent=`${pct>=0?'+':''}${pct.toFixed(1)}%`}else D('kpiMoM').textContent=cur?'—':'0%';D('kpiPrev').textContent=`前月 ${yen(prev)}`;
 const yoy=monthTotal(y-1,m);if(yoy>0){const pct=(cur-yoy)/yoy*100;D('kpiYoY').textContent=`${pct>=0?'+':''}${pct.toFixed(1)}%`}else D('kpiYoY').textContent='—';D('kpiYoYSub').textContent=`前年同月 ${yen(yoy)}`;
 const cs=customerStats(),reps=cs.filter(x=>x.repeat).length,rate=cs.length?reps/cs.length*100:0;D('kpiRepeat').textContent=`${rate.toFixed(1)}%`;D('kpiRepeatSub').textContent=`${reps}/${cs.length}人が2回以上`;
}
function renderChart(){
 const y=D('salesYear').value;if(!y)return; const groups=['ユーカリ','コットン','グラスジェムコーン','スモークツリー','カナリヤナス','その他']; const data=[];
 for(let m=1;m<=12;m++){const obj={month:m,total:0};groups.forEach(g=>obj[g]=0);for(const r of allSales.filter(x=>x.date.startsWith(`${y}${String(m).padStart(2,'0')}`))){const g=itemGroup(r.item,r.variety);obj[g]+=r.amount;obj.total+=r.amount}data.push(obj)}
 const max=Math.max(...data.map(x=>x.total),1);D('salesChart').innerHTML=data.map(o=>`<div class="monthcol" title="${o.month}月 ${yen(o.total)}">${o.total?`<div class="barvalue">${compactYen(o.total)}</div>`:''}<div class="barwrap">${groups.map(g=>o[g]?`<div class="seg" style="height:${o[g]/max*100}%;background:${COLORS[g]}" title="${g} ${yen(o[g])}"></div>`:'').join('')}</div><div class="mlabel">${o.month}月</div></div>`).join('');
 const active=groups.filter(g=>data.some(o=>o[g]>0));D('salesLegend').innerHTML=active.map(g=>`<span><i style="background:${COLORS[g]}"></i>${g}</span>`).join('');
}
function renderLatest(){
 const el=D('latestSaleSummary'); if(!latestImport){const latest=allSales.reduce((a,r)=>!a||r.date>a?r.date:a,'');const amt=allSales.filter(r=>r.date===latest).reduce((a,r)=>a+r.amount,0);el.innerHTML=latest?`直近データ：<b>${fmtDate(latest)}</b><br>売上 ${yen(amt)}<br><span class="mini">次の売立CSV取込時に新規・リピーターを判定します。</span>`:'データなし';return}
 el.innerHTML=`追加売上 <b>${yen(latestImport.amount)}</b> / ${latestImport.rows}明細<br>購入者 ${latestImport.buyers}人：<span class="tag good">既存顧客を更新 ${latestImport.repeats}</span> <span class="tag new">新規顧客を追加 ${latestImport.newBuyers}</span><br><span class="mini">既存顧客は購入回数・累計売上・最終購入日・品目履歴を自動更新します。</span>${latestImport.bad.length?`<br><span class="warn">読込エラー ${latestImport.bad.length}件</span>`:''}`;
}
function latestSampleDate(meta){const h=Array.isArray(meta.sampleHistory)?meta.sampleHistory:[]; if(h.length){const v=h[h.length-1]; return String(v).replace(/\D/g,'').slice(0,8)} return meta.sampleAt||''}
function sampleCount(meta){const h=Array.isArray(meta.sampleHistory)?meta.sampleHistory:[]; return h.length|| (meta.sampleAt?1:0)}
function sampleCandidate(c){const meta=customerMeta.get(c.buyer)||{}; if(c.purchases<3&&c.amount<20000)return false;const lastSample=latestSampleDate(meta);if(!lastSample)return true;return c.last>lastSample && daysBetween(lastSample,c.last)>=90}
function daysBetween(a,b){if(!a||!b)return 999;const f=s=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));return Math.round((f(b)-f(a))/86400000)}
function renderHighlights(){
 const cs=customerStats().sort((a,b)=>b.purchases-a.purchases||b.amount-a.amount); const hot=cs.filter(sampleCandidate).slice(0,3),multi=cs.filter(c=>c.itemsArr.length>=2).slice(0,2); const list=[...new Map([...hot,...multi].map(x=>[x.buyer,x])).values()].slice(0,5);
 D('customerHighlights').innerHTML=list.length?list.map(c=>`<div><b>${c.buyer}</b> ${c.purchases}回 / ${yen(c.amount)} ${sampleCandidate(c)?'<span class="tag hot">サンプル候補</span>':''}${c.itemsArr.length>=2?'<span class="tag good">複数品目</span>':''}</div>`).join(''):'該当なし';
}
function renderCustomers(){
 renderHighlights(); let cs=customerStats(); const f=D('customerFilter').value,q=D('customerSearch').value.trim(); if(q)cs=cs.filter(c=>c.buyer.includes(q)); if(f==='repeat')cs=cs.filter(c=>c.repeat);if(f==='sample')cs=cs.filter(sampleCandidate);if(f==='multi')cs=cs.filter(c=>c.itemsArr.length>=2);cs.sort((a,b)=>b.purchases-a.purchases||b.amount-a.amount);
 D('customerTable').innerHTML=cs.map(c=>{const meta=customerMeta.get(c.buyer)||{};const sc=sampleCount(meta), lastSample=latestSampleDate(meta);const hist=(Array.isArray(meta.sampleHistory)?meta.sampleHistory:[]).slice().reverse().slice(0,5).map(x=>fmtDate(String(x).replace(/\D/g,'').slice(0,8))).join('、');return `<tr><td><b>${c.buyer}</b><div>${c.repeat?'<span class="tag good">リピーター</span>':'<span class="tag new">1回購入</span>'}${sampleCandidate(c)?'<span class="tag hot">サンプル候補</span>':''}</div></td><td>${c.purchases}回</td><td>${yen(c.amount)}</td><td>${c.itemsArr.map(x=>`<span class="tag">${x}</span>`).join('')}</td><td>${fmtDate(c.last)}</td><td><div class="cust-actions"><button class="light sample-btn" data-act="sample" data-buyer="${c.buyer}">サンプル +1</button><button class="gray" data-act="memo" data-buyer="${c.buyer}">メモ</button></div><div class="mini sample-history">サンプル ${sc}回${lastSample?`・最終 ${fmtDate(lastSample)}`:''}${hist?`<br>履歴：${hist}${sc>5?' ほか':''}`:''}</div>${meta.note?`<div class="mini">${escapeHtml(meta.note)}</div>`:''}</td></tr>`}).join('');
 D('customerTable').querySelectorAll('button[data-act]').forEach(b=>b.addEventListener('click',()=>customerAction(b.dataset.buyer,b.dataset.act)));
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function customerAction(buyer,act){const old=customerMeta.get(buyer)||{buyer}; if(act==='sample'){if(!Array.isArray(old.sampleHistory))old.sampleHistory=old.sampleAt?[old.sampleAt]:[];const now=new Date();const stamp=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;old.sampleHistory.push(stamp);old.sampleAt=today8()}if(act==='memo'){const v=prompt(`${buyer} のメモ`,old.note||'');if(v===null)return;old.note=v.trim()}await putOne('customerMeta',old);customerMeta.set(buyer,old);renderCustomers()}
function renderHistory(){
 const rows=[...allSales].sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount);D('salesHistory').innerHTML=rows.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.saleType)}</td><td>${itemGroup(r.item,r.variety)}</td><td>${escapeHtml(r.variety)}</td><td>${escapeHtml(r.length)}</td><td>${r.qty}</td><td>${yen(r.unitPrice)}</td><td>${yen(r.amount)}</td><td>${escapeHtml(r.buyer)}</td></tr>`).join('');
}

// --- Eucalyptus demand forecast calendar (automatic data) ---
const FC_CACHE_KEY='amiteru_euca_auto_v2';
const FC_LEARN_KEY='amiteru_euca_learning_v1';
function fcLearningLoad(){try{return JSON.parse(localStorage.getItem(FC_LEARN_KEY)||'[]')||[]}catch(e){return []}}
function fcLearningSave(v){try{localStorage.setItem(FC_LEARN_KEY,JSON.stringify((v||[]).slice(-80)))}catch(e){}}
const FC_CACHE_MS=6*60*60*1000;
const KANTO_WEATHER_POINTS=[
 {name:'東京',lat:35.6762,lon:139.6503,w:.24},{name:'神奈川',lat:35.4437,lon:139.6380,w:.18},
 {name:'埼玉',lat:35.8617,lon:139.6455,w:.16},{name:'千葉',lat:35.6074,lon:140.1065,w:.16},
 {name:'茨城',lat:36.3418,lon:140.4468,w:.09},{name:'栃木',lat:36.5551,lon:139.8828,w:.09},{name:'群馬',lat:36.3895,lon:139.0634,w:.08}
];
const TOKYO_EUCA_5Y=[974,947,817,901,1114,1033,997,1018,1098,981,894,794];
const PROD_WEATHER_POINTS=[
 {name:'茨城',lat:36.3418,lon:140.4468,lead:[1,2]},
 {name:'千葉',lat:35.6074,lon:140.1065,lead:[1,2]},
 {name:'静岡',lat:34.9756,lon:138.3828,lead:[2,3]},
 {name:'長野',lat:36.6513,lon:138.1810,lead:[2,3]},
 {name:'愛媛',lat:33.8392,lon:132.7657,lead:[2,3]}
];
let fcAuto={weather:{},producerWeather:{},holidays:{},updatedAt:'',weatherThrough:'',weatherStatus:'未取得',producerWeatherStatus:'未取得',holidayStatus:'内蔵暦',weatherCoverage:'',producerWeatherCoverage:'',market:{},marketStatus:'未取得',marketUpdatedAt:'',marketLastDate:'',marketSource:'東京都中央卸売市場',marketError:'',marketSchema:'',importSupply:{score:0,label:'輸入統計未取得',comment:'',yoyQty:null,sourceReady:false},importStatus:'未取得',importUpdatedAt:'',importError:'',importSource:'植物防疫所／財務省貿易統計'};
function fcAutoLoad(){try{const v=JSON.parse(localStorage.getItem(FC_CACHE_KEY)||'{}');if(v&&typeof v==='object')fcAuto={...fcAuto,...v}}catch(e){}}
function fcAutoSave(){try{localStorage.setItem(FC_CACHE_KEY,JSON.stringify(fcAuto))}catch(e){}}
function dateKey(d){return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`}
function parseDateKey(v){
 if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),v.getDate());
 const x=String(v||'').replace(/\D/g,'');
 if(x.length>=8)return new Date(+x.slice(0,4),+x.slice(4,6)-1,+x.slice(6,8));
 const d=new Date(v);
 return Number.isNaN(d.getTime())?null:d;
}
function isoKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function addDays(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Math.round(v)))}
function isAuctionDay(d){return [0,2,4].includes(d.getDay())}
function isHotMonth(d){return [6,7,8].includes(d.getMonth())} // Jul-Sep
function isEuca(r){return itemGroup(r.item,r.variety)==='ユーカリ'}
function saleToAuctionDate(s){const d=new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));const prev=addDays(d,-1);return isAuctionDay(prev)?prev:(isAuctionDay(d)?d:prev)}
function percentile(arr,v){if(!arr.length)return .5;const a=[...arr].sort((x,y)=>x-y);let n=0;for(const x of a)if(x<=v)n++;return n/a.length}
function robustMedian(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2}
function historicalFactor(d){
 const e=allSales.filter(isEuca); if(!e.length)return {score:10,label:'データ少',samples:0};
 const samples=[];
 for(const r of e){const ad=saleToAuctionDate(r.date);const md=Math.abs((ad.getMonth()-d.getMonth()+12)%12);const cyc=Math.min(md,12-md);if(cyc<=1 && ad.getDay()===d.getDay())samples.push(r)}
 const pool=e.map(r=>Number(r.unitPrice)||0).filter(Boolean); if(!samples.length)return {score:10,label:'同時期少',samples:0};
 const vals=samples.map(r=>Number(r.unitPrice)||0).filter(Boolean),med=robustMedian(vals),dev=robustMedian(vals.map(v=>Math.abs(v-med)))||1;
 let sw=0,sv=0,outliers=0;
 for(const r of samples){const v=Number(r.unitPrice)||0;if(!v)continue;const z=Math.abs(v-med)/(1.4826*dev||1);const out=z>3.2;const wt=(out?.35:1)*(r.saleType==='特販'?1.08:1);if(out)outliers++;sw+=wt;sv+=v*wt}
 const weighted=sw?sv/sw:med; const p=percentile(pool,weighted);return {score:Math.round(7+p*21),label:`同時期 ${Math.round(weighted)}円傾向${outliers?`・異常値${outliers}件を弱め`:''}`,samples:samples.length,outliers};
}
function lunarRokuyo(d){
 try{const parts=new Intl.DateTimeFormat('ja-JP-u-ca-chinese',{month:'numeric',day:'numeric'}).formatToParts(d);const m=+String(parts.find(x=>x.type==='month')?.value||'').replace(/\D/g,'');const day=+String(parts.find(x=>x.type==='day')?.value||'').replace(/\D/g,'');if(!m||!day)return '';return ['大安','赤口','先勝','友引','先負','仏滅'][(m+day)%6]||''}catch(e){return ''}
}
function holidaySetFallback(year){
 const set=new Set(), add=(m,d)=>set.add(`${year}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`), nth=(m,dow,n)=>{let d=new Date(year,m-1,1),c=0;while(d.getMonth()===m-1){if(d.getDay()===dow&&++c===n){add(m,d.getDate());break}d.setDate(d.getDate()+1)}};
 add(1,1);nth(1,1,2);add(2,11);add(2,23);add(3,Math.floor(20.8431+0.242194*(year-1980)-Math.floor((year-1980)/4)));add(4,29);add(5,3);add(5,4);add(5,5);nth(7,1,3);add(8,11);nth(9,1,3);add(9,Math.floor(23.2488+0.242194*(year-1980)-Math.floor((year-1980)/4)));nth(10,1,2);add(11,3);add(11,23);
 const base=[...set];for(const k of base){const d=new Date(+k.slice(0,4),+k.slice(4,6)-1,+k.slice(6,8));if(d.getDay()===0){let x=addDays(d,1);while(set.has(dateKey(x)))x=addDays(x,1);set.add(dateKey(x))}}
 for(let m=0;m<12;m++)for(let dd=2;dd<=30;dd++){const d=new Date(year,m,dd),k=dateKey(d);if(!set.has(k)&&set.has(dateKey(addDays(d,-1)))&&set.has(dateKey(addDays(d,1))))set.add(k)}
 return set;
}
function holidaySet(year){const remote=fcAuto.holidays?.[year];return remote&&remote.length?new Set(remote.map(x=>x.replace(/-/g,''))):holidaySetFallback(year)}
function holidayName(d){return fcAuto.holidayNames?.[isoKey(d)]||''}
function isOffDay(d){const h=holidaySet(d.getFullYear());return d.getDay()===0||d.getDay()===6||h.has(dateKey(d))}
function longHolidayPenalty(d){let max=0,run=0;for(let i=-4;i<=6;i++){if(isOffDay(addDays(d,i))){run++;max=Math.max(max,run)}else run=0}return max>=4?-14:max>=3?-9:0}

function buyerClosingTarget(d){
 const y=d.getFullYear(),m=d.getMonth(),day=d.getDate();
 return day<=15?new Date(y,m,15):new Date(y,m+1,0);
}
function buyerClosingBaseFactor(d){
 const target=buyerClosingTarget(d);
 // 締め日までに残っているセリ日を列挙し、締め日に近い順で順位を付ける。
 // 旧実装は「現在日から列挙した配列の先頭」を直前扱いしていたため、
 // ほぼ全セリ日が -4 点になる不具合があった。
 let auctions=[];
 const start=addDays(target,-14);
 for(let x=start;x<=target;x=addDays(x,1))if(isAuctionDay(x))auctions.push(new Date(x));
 auctions=auctions.sort((a,b)=>b-a); // 締め日に近い順
 const idx=auctions.findIndex(x=>dateKey(x)===dateKey(d));
 const rank=idx>=0?idx+1:0;
 const days=Math.round((target-d)/86400000);
 if(rank===1)return {score:-4,rank:1,days,label:`買参人締め直前（${target.getDate()}日締め）`};
 if(rank===2)return {score:-2,rank:2,days,label:`買参人締め2回前（${target.getDate()}日締め）`};
 return {score:0,rank:0,days,label:'締め日前補正なし'};
}
function buyerClosingLearnAdjustment(rank){
 if(!rank)return 0;const a=fcLearningLoad().filter(x=>x.settlementRank===rank&&Number.isFinite(x.error));if(a.length<3)return 0;
 const recent=a.slice(-12);let sw=0,se=0;for(const x of recent){const ae=Math.abs(x.error),w=ae>32?.25:ae>22?.55:1;sw+=w;se+=x.error*w}
 return clamp(Math.round((se/(sw||1))*.12),-2,2);
}
function buyerClosingFactor(d){const b=buyerClosingBaseFactor(d);const learn=buyerClosingLearnAdjustment(b.rank);return {...b,learn,score:clamp(b.score+learn,-6,1),label:b.rank?`${b.label}${learn?`・学習${learn>0?'+':''}${learn}`:''}`:b.label}}
function weatherLabel(v){return v==='sunny'?'晴':v==='cloudy'?'曇':v==='rain'?'雨':v==='storm'?'荒天':'未確定'}
function weatherFromCode(code,pop){code=Number(code);pop=Number(pop||0);if(code>=95||pop>=80)return 'storm';if(code>=51||pop>=55)return 'rain';if(code>=2||pop>=30)return 'cloudy';return 'sunny'}
function producerWeatherContext(marketDate){
 if(!marketDate)return {severity:0,label:'産地天気データなし',affected:[]};
 const md=new Date(+marketDate.slice(0,4),+marketDate.slice(5,7)-1,+marketDate.slice(8,10));let sev=0,affected=[];
 for(const p of PROD_WEATHER_POINTS){let local=0,desc=[];for(const lag of p.lead){const d=addDays(md,-lag),rec=fcAuto.producerWeather?.[p.name]?.[isoKey(d)];if(!rec)continue;const rain=Number(rec.rain||0),gust=Number(rec.gust||0),code=Number(rec.code||0);let x=0;if(rain>=30||gust>=55||code>=95)x=2;else if(rain>=10||gust>=40||code>=61)x=1;local=Math.max(local,x);if(x)desc.push(`${d.getMonth()+1}/${d.getDate()} ${rain?`雨${Math.round(rain)}mm`:''}${gust?` 風${Math.round(gust)}km/h`:''}`.trim())}
  if(local){sev+=local;affected.push(`${p.name}${local>=2?'かなり影響':'影響'}${desc.length?`（${desc.join('・')}）`:''}`)}
 }
 return {severity:sev,label:affected.join('／')||'主要産地は採花しやすい天気',affected};
}
function marketCommentWithProducerWeather(m){
 if(!m)return null;const pw=producerWeatherContext(m.lastDate);let comment=m.comment||'',tone=m.tone||'neutral',note='';
 const qtyDown=(m.yoyQty??0)<=-.15,priceUp=(m.yoyPrice??0)>=.08;
 if(pw.severity>=2&&qtyDown){note=`主要産地の採花前に悪天候があり、数量減は需要増だけでなく出荷減の影響も考えられます。${pw.label}`;if(tone==='tight')tone='neutral'}
 else if(pw.severity===0&&qtyDown&&priceUp){note='主要産地の採花前天気は概ね良好です。数量減＋価格上昇は、天候要因より実需による品薄の可能性をやや強く見ます。'}
 else if(pw.severity>=3){note=`主要産地の露地採花に天候影響が出た可能性があります。${pw.label}`}
 return {...m,comment:note?`${comment} ${note}`:comment,tone,producerWeather:pw};
}
function importSupplyFactor(){
 const x=fcAuto.importSupply||{};
 if(fcAuto.importStatus==='取得済'&&Number.isFinite(Number(x.score)))return {score:Number(x.score),label:x.label||'輸入動向',comment:x.comment||'',yoyQty:x.yoyQty};
 if(fcAuto.importStatus==='ソース確認済')return {score:0,label:'輸入統計ソース確認済（数量は中立）',comment:'ユーカリ単独の自動抽出値が取れないため、予測点にはまだ反映していません。'};
 return {score:0,label:'輸入統計未取得（中立）',comment:''};
}
function importPressureFromYoY(y){
 if(!Number.isFinite(y))return 0;
 if(y>=.35)return -6;if(y>=.20)return -4;if(y>=.10)return -2;
 if(y<=-.35)return 6;if(y<=-.20)return 4;if(y<=-.10)return 2;return 0;
}
function importSupplyComment(y){
 if(!Number.isFinite(y))return '';
 if(y>=.35)return '輸入切葉・切枝が前年より大幅増。国内供給も多い場合は相場下落に注意。';
 if(y>=.20)return '輸入切葉・切枝が前年より増加。海外供給圧力がやや強めです。';
 if(y<=-.35)return '輸入切葉・切枝が前年より大幅減。国内産地も少なければ品薄を強める要因です。';
 if(y<=-.20)return '輸入切葉・切枝が前年より減少。海外供給はやや細っています。';
 return '輸入切葉・切枝は前年同時期と大きな差はありません。';
}
function combinedMarketComment(){
 const mc=marketCommentWithProducerWeather(fcAuto.market);const imp=importSupplyFactor();
 if(!mc&&!imp.comment)return null;
 const base=mc?{...mc}:{comment:'',tone:'neutral'};
 if(imp.comment)base.comment=`${base.comment||''}${base.comment?' ':''}${imp.comment}`;
 base.importSupply=imp;return base;
}
function weatherRetailPenaltyForAuction(d){
 let score=0,used=[],known=0;
 for(let i=1;i<=6;i++){
  const wd=addDays(d,i); if(![0,6].includes(wd.getDay()))continue;
  const rec=fcAuto.weather?.[isoKey(wd)];if(!rec)continue;known++;
  const v=rec.kind, pop=Number(rec.pop||0);const raw=v==='sunny'?2:v==='cloudy'?0:v==='rain'?-8:-13;
  const proximity=Math.max(.35,1-i*.12);score+=raw*proximity;used.push(`${wd.getMonth()+1}/${wd.getDate()} ${weatherLabel(v)}${pop?` ${pop}%`:''}`);
 }
 return {score:Math.round(score),label:used.join('・')||(fcAuto.weatherStatus==='取得済'?'予報期間外':'天気取得待ち'),known};
}
function weddingSeasonMultiplier(d){const m=d.getMonth()+1;if([4,5,10,11].includes(m))return 1.18;if([3,6,9].includes(m))return 1.06;if([7,8].includes(m))return .78;if([1,2].includes(m))return .72;if(m===12)return .88;return 1}
function weddingDayIndex(d){
 const dow=d.getDay();let v=dow===6?1:dow===0?.72:dow===5?.22:0;if(!v)return 0;
 const r=lunarRokuyo(d);if(r==='大安')v*=1.32;else if(r==='友引')v*=1.16;else if(r==='仏滅')v*=.68;else if(r==='赤口')v*=.88;
 v*=weddingSeasonMultiplier(d); if(holidayName(d))v*=.92;return Math.max(0,v);
}
function bridalPotentialForAuction(d){
 let pts=0,desc=[];const hot=isHotMonth(d);const auctionWeight=
  d.getDay()===0 ? .78 :
  d.getDay()===4 ? (hot?1.0:.96) :
  d.getDay()===2 ? (hot?.82:.90) : .75;
 for(let i=1;i<=7;i++){
  const wd=addDays(d,i);if(![5,6,0].includes(wd.getDay()))continue;const idx=weddingDayIndex(wd);if(!idx)continue;
  const proximity=Math.max(.28,1-i*.095);pts+=idx*auctionWeight*proximity*8.5; if(idx>.55)desc.push(`${wd.getMonth()+1}/${wd.getDate()} ${lunarRokuyo(wd)||''}`);
 }
 return {score:Math.min(30,Math.round(pts)),label:desc.slice(0,3).join('・')||'通常',mode:'自動推定'};
}

function nthWeekdayOfMonth(year,month,dow,n){let d=new Date(year,month-1,1),c=0;while(d.getMonth()===month-1){if(d.getDay()===dow&&++c===n)return new Date(d);d.setDate(d.getDate()+1)}return null}
function seasonalEventFactorForAuction(d){
 const y=d.getFullYear(),events=[];
 const add=(name,target,weight,leadStart,leadEnd)=>{const diff=Math.round((target-d)/(86400000));if(diff>=leadEnd&&diff<=leadStart){const center=(leadStart+leadEnd)/2,span=Math.max(1,(leadStart-leadEnd)/2),shape=Math.max(.25,1-Math.abs(diff-center)/(span+1));events.push({name,score:weight*shape,diff})}};
 add('母の日',nthWeekdayOfMonth(y,5,0,2),24,12,2);
 add('父の日',nthWeekdayOfMonth(y,6,0,3),7,9,2);
 add('敬老の日',nthWeekdayOfMonth(y,9,1,3),10,9,2);
 add('クリスマス',new Date(y,11,25),12,15,3);
 // 卒園・卒業・送別・離任は地域差が大きいため、3月後半を需要帯として扱う
 for(const [name,target,weight,start,end] of [
  ['卒園・卒業',new Date(y,2,20),11,14,1],['送別会',new Date(y,2,27),14,14,1],['離任式',new Date(y,2,31),16,12,1],['入園・入学',new Date(y,3,7),11,12,1]
 ])add(name,target,weight,start,end);
 const raw=events.reduce((a,e)=>a+e.score,0);
 // AMITERU実運用：参加人数は 日曜 > 木曜 > 火曜。
 // 物日のタイミング差は残すが、日曜を一律で大きく下げない。
 const dayMul=d.getDay()===0?.88:d.getDay()===4?.96:.90;
 const weighted=events.map(e=>({...e,score:e.score*dayMul}));
 return {score:Math.round(Math.min(30,raw*dayMul)),label:events.length?events.sort((a,b)=>b.score-a.score).slice(0,3).map(e=>`${e.name} ${e.diff}日前`).join('・'):'物日なし',events:weighted};
}

const EVENT_LENGTH_PREF={
 '母の日':{40:1.00,50:.96,60:.48,70:.22},
 '卒園・卒業':{40:.96,50:1.00,60:.55,70:.25},
 '送別会':{40:.58,50:.88,60:1.00,70:.58},
 '離任式':{40:.60,50:.92,60:1.00,70:.55},
 '入園・入学':{40:.78,50:.96,60:.72,70:.38},
 '父の日':{40:.58,50:.82,60:.74,70:.42},
 '敬老の日':{40:.90,50:1.00,60:.58,70:.28},
 'クリスマス':{40:.66,50:.90,60:1.00,70:.72}
};
function lengthBucket(v){const n=Number(String(v||'').replace(/[^0-9.]/g,''));if(!n)return null;if(n<=45)return 40;if(n<=55)return 50;if(n<=65)return 60;return 70}
function historicalLengthFactor(d,cm){
 const e=allSales.filter(isEuca).filter(r=>lengthBucket(r.length)===cm);if(!e.length)return {score:0,label:'長さ実績なし'};
 const m=d.getMonth()+1,dow=d.getDay(),samples=e.filter(r=>{const raw=parseDateKey(r.date);if(!raw)return false;const rd=saleToAuctionDate(r.date);const md=Math.abs((rd.getMonth()+1)-m);return (md===0||md===1||md===11)&&rd.getDay()===dow});
 if(samples.length<2)return {score:0,label:'長さ実績少'};
 const qty=samples.reduce((a,r)=>a+(Number(r.qty)||0),0),avgQty=qty/samples.length;
 const allSame=e.filter(r=>{const raw=parseDateKey(r.date);if(!raw)return false;const rd=saleToAuctionDate(r.date);return rd&&rd.getDay()===dow});const base=allSame.length?allSame.reduce((a,r)=>a+(Number(r.qty)||0),0)/allSame.length:avgQty;
 const ratio=base>0?avgQty/base:1;const score=clamp(Math.round((ratio-1)*18),-8,10);
 return {score,label:`CSV長さ実績 ${samples.length}明細`};
}
function eventLengthAdjustment(ev,cm){
 const xs=(ev.events||[]).filter(e=>EVENT_LENGTH_PREF[e.name]);if(!xs.length)return {score:0,label:'物日補正なし'};
 let w=0,p=0;for(const e of xs){const ww=Math.max(.1,e.score);w+=ww;p+=ww*(EVENT_LENGTH_PREF[e.name][cm]??.5)}
 const pref=w?p/w:.5;const strength=Math.min(1,w/18);const score=Math.round((pref-.58)*26*strength);
 const top=xs.sort((a,b)=>b.score-a.score)[0];return {score:clamp(score,-10,14),label:`${top.name} ${cm}cm補正`};
}

function seasonFactor(d){const m=d.getMonth()+1;if([4,5].includes(m))return {score:8,label:'春需要'};if([9,10,11].includes(m))return {score:11,label:'秋需要'};if(m===12)return {score:6,label:'冬装飾'};return {score:1,label:'通常期'}}
function weekdayObservedStats(){
 const e=allSales.filter(isEuca), by={0:[],2:[],4:[]};
 for(const r of e){
  const ad=saleToAuctionDate(r.date); if(!ad||!by[ad.getDay()])continue;
  by[ad.getDay()].push(r);
 }
 const result={};
 for(const dow of [0,2,4]){
  const rows=by[dow], dates=[...new Set(rows.map(r=>dateKey(saleToAuctionDate(r.date))))];
  const prices=rows.map(r=>Number(r.unitPrice)||0).filter(Boolean);
  const buyers=new Set(rows.map(r=>r.buyer).filter(Boolean)).size;
  const specials=rows.length?rows.filter(r=>r.saleType==='特販').length/rows.length:0;
  result[dow]={
   rows:rows.length,dates:dates.length,buyers,
   avgPrice:prices.length?prices.reduce((a,b)=>a+b,0)/prices.length:0,
   specialRate:specials
  };
 }
 return result;
}
function weekdayLearnedAdjustment(d){
 const stats=weekdayObservedStats(), cur=stats[d.getDay()];
 if(!cur||cur.dates<3)return {score:0,label:'曜日実績学習待ち',stats:cur||null};
 const eligible=[0,2,4].map(k=>stats[k]).filter(x=>x&&x.dates>=3);
 if(eligible.length<2)return {score:0,label:'曜日実績学習待ち',stats:cur};
 const avgPrice=eligible.reduce((a,x)=>a+x.avgPrice,0)/eligible.length;
 const avgBuyers=eligible.reduce((a,x)=>a+x.buyers,0)/eligible.length;
 const avgSpecial=eligible.reduce((a,x)=>a+x.specialRate,0)/eligible.length;
 const pricePart=avgPrice>0?(cur.avgPrice/avgPrice-1)*10:0;
 const buyerPart=avgBuyers>0?(cur.buyers/avgBuyers-1)*4:0;
 const specialPart=(cur.specialRate-avgSpecial)*4;
 const score=clamp(Math.round(pricePart+buyerPart+specialPart),-5,5);
 return {score,label:`曜日実績 ${cur.dates}セリ日・買参${cur.buyers}件`,stats:cur};
}
function auctionWeekdayFactor(d){
 // 実際の参加人数の初期順位：日曜 > 木曜 > 火曜
 const dow=d.getDay();
 const base=dow===0?9:dow===4?6:4;
 const learned=weekdayLearnedAdjustment(d);
 const score=base+learned.score;
 const name=dow===0?'日曜・参加最多':dow===4?'木曜・参加中位':'火曜・参加少なめ';
 return {score,label:`${name}${learned.score?`／実績補正 ${learned.score>0?'+':''}${learned.score}`:''}`,base,learned};
}
function csvRows(text){
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}}
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}return rows;
}
function normalizeMarketDate(v){const s=String(v||'').trim();let m=s.match(/(20\d{2})[\/-]?(\d{1,2})[\/-]?(\d{1,2})/);if(!m)return '';return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`}
function marketParseNumber(v){const n=Number(String(v??'').replace(/[,5￥円本束kgＫｇ\s]/g,''));return Number.isFinite(n)?n:null}
function findHeader(headers,words){const hs=headers.map(x=>String(x||'').replace(/\s/g,''));for(const w of words){const i=hs.findIndex(h=>h.includes(w));if(i>=0)return i}return -1}
function parseTokyoEucaCsv(text){
 const rows=csvRows(text);if(rows.length<2)throw new Error('CSVが空です');const h=rows[0];
 const itemI=findHeader(h,['品目名','品目','品名']); const marketI=findHeader(h,['市場名','市場']); const dateI=findHeader(h,['年月日','取引日','日付','販売日']);
 const highI=findHeader(h,['高値']); const midI=findHeader(h,['中値','中間値']); const lowI=findHeader(h,['安値']); const avgI=findHeader(h,['平均価格','平均単価','平均']);
 const qtyI=findHeader(h,['数量','販売量','取扱数量']);
 const e=[];
 for(const r of rows.slice(1)){
  const line=r.join(' ');if(!/ユーカリ/.test(itemI>=0?String(r[itemI]||''):line))continue;
  if(marketI>=0 && r[marketI] && !/大田/.test(String(r[marketI])))continue;
  let date=dateI>=0?normalizeMarketDate(r[dateI]):'';if(!date){for(const c of r){date=normalizeMarketDate(c);if(date)break}}
  if(!date)continue;
  let price=avgI>=0?marketParseNumber(r[avgI]):null;
  if(!(price>0)){const vals=[midI,highI,lowI].filter(i=>i>=0).map(i=>marketParseNumber(r[i])).filter(n=>n>0);if(vals.length)price=vals.reduce((a,b)=>a+b,0)/vals.length}
  let qty=qtyI>=0?marketParseNumber(r[qtyI]):null;
  e.push({date,price:price>0?price:null,qty:qty>0?qty:null});
 }
 if(!e.length)throw new Error('ユーカリ行を認識できません');
 return {rows:e,headers:h};
}

function xlsxRowsFromBuffer(buf){
 if(typeof XLSX==='undefined')throw new Error('Excel解析ライブラリを読み込めません');
 const wb=XLSX.read(buf,{type:'array',cellDates:true});
 const out=[];
 for(const name of wb.SheetNames){
  const ws=wb.Sheets[name];
  const arr=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  if(arr?.length)out.push({name,rows:arr});
 }
 return out;
}
function detectHeaderRow(rows){
 const words=['品目','品名','市場','数量','金額','高値','中値','安値','平均'];
 let best={idx:-1,score:0};
 for(let i=0;i<Math.min(rows.length,40);i++){
  const r=rows[i]||[];
  const txt=r.map(x=>String(x||'').replace(/\s/g,'')).join('|');
  const score=words.reduce((a,w)=>a+(txt.includes(w)?1:0),0);
  if(score>best.score)best={idx:i,score};
 }
 return best.score>=2?best.idx:-1;
}
function normalizeMarketMonthDate(year,month,v){
 const d=normalizeMarketDate(v);
 return d||`${year}-${String(month).padStart(2,'0')}-01`;
}
function parseTokyoEucaXlsx(buf,year,month){
 const sheets=xlsxRowsFromBuffer(buf), e=[], schemas=[];
 for(const sh of sheets){
  const hi=detectHeaderRow(sh.rows); if(hi<0)continue;
  const h=(sh.rows[hi]||[]).map(x=>String(x||''));
  schemas.push(`${sh.name}:${h.join('|')}`);
  const itemI=findHeader(h,['品目名','品目','品名','品種']);
  const marketI=findHeader(h,['市場名','市場']);
  const dateI=findHeader(h,['年月日','取引日','日付','販売日']);
  const highI=findHeader(h,['高値']);
  const midI=findHeader(h,['中値','中間値']);
  const lowI=findHeader(h,['安値']);
  const avgI=findHeader(h,['平均価格','平均単価','平均','単価']);
  const qtyI=findHeader(h,['数量','販売量','取扱数量','入荷数量','本数']);
  const amountI=findHeader(h,['金額','販売金額','取扱金額']);
  for(const r of sh.rows.slice(hi+1)){
   const item=itemI>=0?String(r[itemI]||''):r.join(' ');
   if(!/ユーカリ/.test(item))continue;
   if(marketI>=0 && r[marketI] && !/大田/.test(String(r[marketI])))continue;
   const date=normalizeMarketMonthDate(year,month,dateI>=0?r[dateI]:'');
   let price=avgI>=0?marketParseNumber(r[avgI]):null;
   if(!(price>0)){
    const vals=[midI,highI,lowI].filter(i=>i>=0).map(i=>marketParseNumber(r[i])).filter(n=>n>0);
    if(vals.length)price=vals.reduce((a,b)=>a+b,0)/vals.length;
   }
   let qty=qtyI>=0?marketParseNumber(r[qtyI]):null;
   const amount=amountI>=0?marketParseNumber(r[amountI]):null;
   if(!(price>0)&&amount>0&&qty>0)price=amount/qty;
   e.push({date,price:price>0?price:null,qty:qty>0?qty:null,sourceMonth:`${year}-${String(month).padStart(2,'0')}`});
  }
 }
 if(!e.length)throw new Error(`ユーカリ行を認識できません（${year}/${month}）`);
 return {rows:e,schema:schemas.join('\n').slice(0,1500)};
}
async function fetchMarketMeta(year){
 const r=await fetch(`${AMITERU_PROXY}/market/meta?year=${year}`,{cache:'no-store'});
 if(!r.ok)throw new Error(`市場メタ HTTP ${r.status}`);
 const j=await r.json();
 if(!j?.ok)throw new Error(j?.error||'市場メタ取得失敗');
 return j;
}
async function fetchMarketMonth(year,month){
 const r=await fetch(`${AMITERU_PROXY}/market/raw?year=${year}&month=${month}`,{cache:'no-store'});
 if(!r.ok)throw new Error(`市場Excel HTTP ${r.status}`);
 const buf=await r.arrayBuffer();
 return parseTokyoEucaXlsx(buf,year,month);
}

function median(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2}
function marketSignalFromRows(rows){
 const dated=rows.filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));const last=dated.at(-1)?.date||'';
 const recent=dated.slice(-12),prev=dated.slice(-36,-12);const rp=median(recent.map(x=>x.price)),pp=median(prev.map(x=>x.price));const rq=median(recent.map(x=>x.qty)),pq=median(prev.map(x=>x.qty));
 let score=0,parts=[];let priceChange=null,qtyChange=null;
 if(rp&&pp){priceChange=(rp-pp)/pp;score+=clamp(priceChange*35,-8,8);parts.push(`価格${priceChange>=0?'↑':'↓'}${Math.abs(priceChange*100).toFixed(0)}%`)}
 if(rq&&pq){qtyChange=(rq-pq)/pq;score+=clamp(qtyChange*18,-5,5);parts.push(`数量${qtyChange>=0?'↑':'↓'}${Math.abs(qtyChange*100).toFixed(0)}%`)}
 const latestYear=last?Number(last.slice(0,4)):null,latestMonth=last?Number(last.slice(5,7)):null;
 const curMonth=dated.filter(x=>latestYear&&latestMonth&&Number(x.date.slice(0,4))===latestYear&&Number(x.date.slice(5,7))===latestMonth);
 const prevYearMonth=dated.filter(x=>latestYear&&latestMonth&&Number(x.date.slice(0,4))===latestYear-1&&Number(x.date.slice(5,7))===latestMonth);
 const cp=median(curMonth.map(x=>x.price)),lp=median(prevYearMonth.map(x=>x.price)),cq=median(curMonth.map(x=>x.qty)),lq=median(prevYearMonth.map(x=>x.qty));
 const yoyPrice=cp&&lp?(cp-lp)/lp:null,yoyQty=cq&&lq?(cq-lq)/lq:null;
 let comment='例年比較データを蓄積中です。',tone='neutral';
 if(yoyPrice!=null||yoyQty!=null){
  const ps=yoyPrice??0,qs=yoyQty??0;
  if(qs<=-.20&&ps>=.12){comment=`ユーカリは品薄傾向です。前年同月比で入荷量が${Math.abs(qs*100).toFixed(0)}%少なく、価格は${(ps*100).toFixed(0)}%高い水準です。`;tone='tight'}
  else if(qs>=.25&&ps<=-.15){comment=`供給過多に注意。前年同月より入荷量が${(qs*100).toFixed(0)}%増え、価格は${Math.abs(ps*100).toFixed(0)}%下落しています。暴落気味の可能性があります。`;tone='glut'}
  else if(qs>=.20&&ps>=.08){comment='前年同月より数量・価格とも強めです。需要増を伴う活発な市況の可能性があります。';tone='strong'}
  else if(qs<=-.15&&ps<=-.10){comment='前年同月より数量・価格とも弱めです。供給減だけでなく需要自体が鈍い可能性があります。';tone='weak'}
  else if(ps>=.15){comment=`前年同月より価格が${(ps*100).toFixed(0)}%高く、引き合いは強めです。数量の動きも合わせて確認してください。`;tone='strong'}
  else if(ps<=-.15){comment=`前年同月より価格が${Math.abs(ps*100).toFixed(0)}%低く、相場は弱めです。`;tone='weak'}
  else if(qs>=.25){comment=`前年同月より入荷量が${(qs*100).toFixed(0)}%多く、供給増に注意が必要です。`;tone='glut'}
  else if(qs<=-.20){comment=`前年同月より入荷量が${Math.abs(qs*100).toFixed(0)}%少なく、品薄方向です。`;tone='tight'}
  else comment='前年同月との差は大きくなく、概ね例年並みの市況です。';
 }
 return {score:clamp(score,-12,12),label:parts.join('・')||'直近比較データ不足',lastDate:last,price:rp,qty:rq,count:dated.length,priceChange,qtyChange,yoyPrice,yoyQty,comment,tone};
}
function otherMarketFactor(d){
 const live=marketCommentWithProducerWeather(fcAuto.market);
 if(live&&Number.isFinite(live.score)&&fcAuto.marketStatus==='取得済')return {score:live.score,label:`大田市場 ${live.label}${live.lastDate?`（${live.lastDate.slice(5).replace('-','/')}まで）`:''}`,source:'東京都中央卸売市場・花き月報明細',producerWeather:live.producerWeather};
 const v=TOKYO_EUCA_5Y[d.getMonth()],avg=TOKYO_EUCA_5Y.reduce((a,b)=>a+b,0)/12;const delta=(v-avg)/avg;
 const score=clamp(delta*45,-9,9);return {score,label:`大田市場季節値 ${v}円/本（外部日報未取得）`,source:'公表月次の5年平均'};
}
function retailPotentialForAuction(d){
 const weather=weatherRetailPenaltyForAuction(d), season=seasonFactor(d), w=auctionWeekdayFactor(d);
 const base=d.getDay()===4?19:d.getDay()===2?16:12;
 return {score:clamp(base+season.score+Math.round(w.score*.35)+weather.score,4,40),weather,label:weather.label};
}
function baselineForecast(d){
 const h=historicalFactor(d),s=seasonFactor(d),w=auctionWeekdayFactor(d),ev=seasonalEventFactorForAuction(d),hp=longHolidayPenalty(d);
 return clamp(18+h.score+Math.round(s.score*.8)+Math.round(w.score*.7)+Math.round(ev.score*.55)+hp,5,98);
}
function learningBias(){const a=fcLearningLoad().filter(x=>Number.isFinite(x.error));if(a.length<3)return 0;const recent=a.slice(-18);let sw=0,se=0;for(const x of recent){const ae=Math.abs(x.error);const w=ae>32?.25:ae>22?.55:1;sw+=w;se+=x.error*w}return clamp((se/(sw||1))*.18,-6,6)}
function observedDemandScore(rows,beforeSales){
 const e=rows.filter(isEuca);if(!e.length)return null;const prices=e.map(r=>Number(r.unitPrice)||0).filter(Boolean);if(!prices.length)return null;
 const pool=(beforeSales||allSales).filter(isEuca).map(r=>Number(r.unitPrice)||0).filter(Boolean);const avg=prices.reduce((a,b)=>a+b,0)/prices.length;const p=pool.length?percentile(pool,avg):.5;const buyers=new Set(e.map(r=>r.buyer).filter(Boolean)).size;const special=e.filter(r=>r.saleType==='特販').length/e.length;
 return clamp(22+p*55+Math.min(10,buyers*1.4)+special*8,5,98);
}
function forecastConfidence(d,fc){
 let c=42;c+=Math.min(24,(fc.h.samples||0)*2.2);if(fc.r.weather.known)c+=8;if(fcAuto.marketStatus==='取得済')c+=9;if(fcAuto.importStatus==='取得済')c+=4;if(fc.ev.score>0)c+=3;const learn=fcLearningLoad();c+=Math.min(8,learn.length*.7);const days=Math.round((d-new Date())/86400000);if(days>14)c-=10;else if(days>7)c-=5;return clamp(c,28,92);
}
function forecastRange(score,confidence){const half=Math.round(6+(100-confidence)*.16);return [clamp(score-half,5,98),clamp(score+half,5,98)]}
function forecastFor(d){
 const h=historicalFactor(d),b=bridalPotentialForAuction(d),r=retailPotentialForAuction(d),s=seasonFactor(d),w=auctionWeekdayFactor(d),o=otherMarketFactor(d),imp=importSupplyFactor(),hp=longHolidayPenalty(d),ev=seasonalEventFactorForAuction(d),settle=buyerClosingFactor(d);
 const learnBias=learningBias();
 // v6.9: 海外供給シグナルも最終需要スコアへ反映。
 let score=10+h.score+b.score+Math.round(r.score*.55)+Math.round(w.score*.45)+o.score+imp.score+hp+ev.score+settle.score+learnBias;
 score=clamp(score,5,98);
 const bridalIndex=clamp(30+b.score*2+w.score+s.score+hp*.4+ev.score*.25,5,98);
 const retailIndex=clamp(28+r.score*1.5+h.score*.35+o.score*.4+hp*.7,5,98);
 const shortIndex=clamp(score*.35+bridalIndex*.55+retailIndex*.10,5,98);
 const longIndex=clamp(score*.30+retailIndex*.58+bridalIndex*.12,5,98);
 const lengthScores={};const lengthDetails={};
 for(const cm of [40,50,60,70]){
  const hist=historicalLengthFactor(d,cm),evt=eventLengthAdjustment(ev,cm);
  let base=cm<=50?shortIndex:longIndex+(cm===70?-4:0);
  if(cm===40)base+=b.score>0?2:0;if(cm===50)base+=b.score>0?3:0;
  lengthScores[cm]=clamp(Math.round(base+hist.score+evt.score),5,98);lengthDetails[cm]={hist,evt};
 }
 const baseline=baselineForecast(d),confidence=forecastConfidence(d,{h,r,ev}),range=forecastRange(score,confidence);return {score,h,b,r,s,w,o,imp,hp,ev,settle,bridalIndex,retailIndex,shortIndex,longIndex,lengthScores,lengthDetails,baseline,confidence,range,learnBias,level:score>=78?5:score>=64?4:score>=49?3:score>=34?2:1};
}
function weatherBadgeForDate(d){const r=fcAuto.weather?.[isoKey(d)];return r?`${weatherLabel(r.kind)}${r.pop?` ${r.pop}%`:''}`:''}

function renderOtherMarketSummary(){
 const el=D('otherMarketSummary'); if(!el)return;
 const m=fcAuto.market||{}, combined=combinedMarketComment?.()||null;
 const imp=importSupplyFactor();
 const status=fcAuto.marketStatus||'未取得';
 const updated=fcAuto.marketUpdatedAt?new Date(fcAuto.marketUpdatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';
 const last=m.lastDate||fcAuto.marketLastDate||'';
 const lastLabel=last?last.slice(5).replace('-','/'):'—';
 const pct=v=>v==null?'—':`${v>=0?'+':''}${Math.round(v*100)}%`;
 const yen=v=>v?`${Math.round(v).toLocaleString('ja-JP')}円/本`:'—';
 const qty=v=>v?`${Math.round(v).toLocaleString('ja-JP')}`:'—';
 let tone=(combined&&combined.tone)||m.tone||'neutral';
 let headline='外部市況を取得中です。';
 if(status==='取得済'){
   headline=(combined&&combined.comment)||m.comment||'直近市況を取得しました。';
 }else if(status==='キャッシュ'){
   headline='前回取得した市況データを表示しています。';
 }else if(status==='形式変更'){
   headline='外部市況データの形式変更を検知しました。';
 }else if(status==='取得失敗'){
   headline='外部市況を取得できないため、予測では季節平均を併用しています。';
 }
 const producer=(combined&&combined.producerWeather)||producerWeatherContext(last||null);
 el.innerHTML=`
  <div class="market-summary-card ${tone}">
   <div class="market-summary-head">
    <div>
     <div class="section-kicker">Nearby market pulse</div>
     <h3>他市場の直近市況</h3>
    </div>
    <span class="market-status">${hesc(status)}</span>
   </div>
   <div class="market-source-row">
    <b>大田市場・ユーカリ</b>
    <span>${hesc(fcAuto.marketSourceMonth||'最新月')}明細 ／ 公開 ${hesc(fcAuto.marketPublished||'—')} ／ 更新 ${hesc(updated)}</span>
   </div>
   <div class="market-metrics">
    <div><span>直近価格</span><b>${yen(m.price)}</b><small>前期間比 ${pct(m.priceChange)}</small></div>
    <div><span>直近数量</span><b>${qty(m.qty)}</b><small>前期間比 ${pct(m.qtyChange)}</small></div>
    <div><span>前年同月・価格</span><b>${pct(m.yoyPrice)}</b><small>${m.yoyPrice==null?'比較データ蓄積中':'前年同月との差'}</small></div>
    <div><span>前年同月・数量</span><b>${pct(m.yoyQty)}</b><small>${m.yoyQty==null?'比較データ蓄積中':'前年同月との差'}</small></div>
   </div>
   <div class="market-summary-comment"><b>市況判断</b><span>${hesc(headline)}</span></div>
   <div class="market-signals">
    <span>産地天気：${hesc(producer?.label||'データなし')}</span>
    <span>海外供給：${hesc(imp?.label||'データなし')}</span>
    <span>All-Seeing Eye補正：${Number.isFinite(combined?.score)?`${combined.score>=0?'+':''}${Math.round(combined.score)}点`:(Number.isFinite(m.score)?`${m.score>=0?'+':''}${Math.round(m.score)}点`:'—')}</span>
   </div>
  </div>`;
}

function renderForecastCalendars(){
 const root=D('forecastCalendars');if(!root)return;
 const now=new Date();
 root.innerHTML=[0,1].map(off=>{
  const first=new Date(now.getFullYear(),now.getMonth()+off,1),y=first.getFullYear(),m=first.getMonth(),days=new Date(y,m+1,0).getDate(),blanks=first.getDay();
  let cells='';
  for(let i=0;i<blanks;i++)cells+='<div class="daycell empty"></div>';
  for(let n=1;n<=days;n++){
   const d=new Date(y,m,n),dow=d.getDay(),auction=isAuctionDay(d),isSat=dow===6,isSun=dow===0;
   const hset=holidaySet(y),isHoliday=hset.has(dateKey(d)),r=lunarRokuyo(d),fc=auction?forecastFor(d):null;
   const wb=(isSat||isSun)?weatherBadgeForDate(d):'',hn=holidayName(d);
   const dayClass=isHoliday?'holiday':isSun?'sun':isSat?'sat':'';
   const holidayText=hn|| (isHoliday?'祝日':'');
   cells+=`<div class="daycell ${auction?`auction heat${fc.level}`:''} ${dayClass}" data-date="${dateKey(d)}" data-auction="${auction?1:0}" ${auction?'role="button" tabindex="0" aria-label="'+(m+1)+'月'+n+'日 '+['日','月','火','水','木','金','土'][dow]+'曜セリ 需要予測 '+fc.score+'点"':''}>
    <div class="daynum">${n}${isHoliday?'<span class="holiday-dot">●</span>':''}</div>
    <div class="rokuyo">${r||''}${holidayText?`・${holidayText}`:''}</div>
    ${auction?`<div class="auction-label">${['日','月','火','水','木','金','土'][dow]}曜セリ</div><div class="heat-score">${fc.score}</div>`:''}
    ${(isSat||isSun)&&wb?`<span class="weather-badge">${wb}</span>`:''}
   </div>`;
  }
  return `<div class="forecast-cal"><div class="cal-head"><b>${y}年${m+1}月</b><span class="small">火・木・日セリ</span></div><div class="cal-week">${['日','月','火','水','木','金','土'].map((x,i)=>`<div class="${i===0?'sun-head':i===6?'sat-head':''}">${x}</div>`).join('')}</div><div class="cal-days">${cells}</div></div>`;
 }).join('');

 // セリ日のクリック/キーボード操作。再描画後も効くイベント委譲。
 if(!root.dataset.detailBound){
  root.dataset.detailBound='1';
  root.addEventListener('click',e=>{
   const el=e.target.closest('.daycell[data-auction="1"]'); if(!el)return;
   const k=el.dataset.date; if(!k||k.length<8)return;
   showForecastDetail(new Date(+k.slice(0,4),+k.slice(4,6)-1,+k.slice(6,8)));
  });
  root.addEventListener('keydown',e=>{
   if(e.key!=='Enter'&&e.key!==' ')return;
   const el=e.target.closest('.daycell[data-auction="1"]'); if(!el)return;
   e.preventDefault();
   const k=el.dataset.date; if(!k||k.length<8)return;
   showForecastDetail(new Date(+k.slice(0,4),+k.slice(4,6)-1,+k.slice(6,8)));
  });
 }

 const st=D('forecastAutoStatus');
 if(st){
  const wu=fcAuto.weatherThrough?`天気〜${fcAuto.weatherThrough.slice(5).replace('-','/')}`:'天気未取得';
  const up=fcAuto.updatedAt?new Date(fcAuto.updatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';
  const mu=fcAuto.marketUpdatedAt?new Date(fcAuto.marketUpdatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';
  const iu=fcAuto.importUpdatedAt?new Date(fcAuto.importUpdatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';
  st.textContent=`自動取得：関東7都県 ${wu}／主要産地天気 ${fcAuto.producerWeatherStatus}${fcAuto.producerWeatherCoverage?` ${fcAuto.producerWeatherCoverage}`:''}／祝日 ${fcAuto.holidayStatus}／大田市場 ${fcAuto.marketStatus}（${mu}）／輸入 ${fcAuto.importStatus}（${iu}）／全体更新 ${up}${fcAuto.weatherCoverage?`／${fcAuto.weatherCoverage}`:''}`;
 }
 renderForecastHealth();
 try{renderOtherMarketSummary()}catch(e){
  console.error('market summary render',e);
  const ms=D('otherMarketSummary');
  if(ms)ms.innerHTML='<div class="source-alert warn"><b>他市場の直近市況</b><span>外部市況欄の表示に失敗しましたが、需要予測カレンダーは通常どおり利用できます。</span></div>';
 }
}
function signed(v){
 const n=Number(v)||0; return `${n>0?'+':''}${n}`;
}
function safeText(v,fallback='—'){return v==null||v===''?fallback:String(v)}
function showForecastDetail(d){
 const target=D('forecastDetail'); if(!target)return;
 try{
  const fc=forecastFor(d);
  const dow=['日','月','火','水','木','金','土'][d.getDay()];
  const factors=[
   ['過去実績（CSV学習）', fc.h?.score, fc.h?.label],
   ['曜日参加度', fc.w?.score, fc.w?.label],
   ['物日需要', fc.ev?.score, fc.ev?.label],
   ['婚礼需要', fc.b?.score, fc.b?.label],
   ['小売り需要', fc.r?.score, fc.r?.label],
   ['週末天気', fc.r?.weather?.score, fc.r?.weather?.label],
   ['季節', fc.s?.score, fc.s?.label],
   ['外部ユーカリ市況', fc.o?.score, fc.o?.label],
   ['海外供給（輸入）', fc.imp?.score, fc.imp?.label],
   ['連休補正', fc.hp, '連休前後'],
   ['締め日前補正', fc.settle?.score, fc.settle?.label],
   ['実績誤差の学習補正', fc.learnBias, '予測と実績の継続誤差']
  ];
  const lengthHtml=[40,50,60,70].map(cm=>{
   const ld=fc.lengthDetails?.[cm]||{}, evt=ld.evt||{}, hist=ld.hist||{};
   return `<div class="forecast-split"><span>${cm}cm</span><b>${safeText(fc.lengthScores?.[cm])}</b><small>${hesc(evt.label||hist.label||'')}</small></div>`;
  }).join('');
  const factorHtml=factors.map(([name,val,label])=>`<div class="factor"><span>${hesc(name)}${label?`<small style="display:block;color:var(--muted);margin-top:2px">${hesc(label)}</small>`:''}</span><strong>${signed(val)}</strong></div>`).join('');

  target.innerHTML=`
   <div class="sectionhead">
    <div><div class="section-kicker">All-Seeing Eye detail</div><h3 style="margin:0">${d.getMonth()+1}/${d.getDate()} ${dow}曜セリ　総合 <b>${fc.score}/100</b></h3></div>
    <span class="tag ${fc.level>=4?'hot':'good'}">${fc.level>=5?'かなり強い':fc.level===4?'強い':fc.level===3?'普通':fc.level===2?'やや弱い':'弱い'}</span>
   </div>
   <div class="forecast-splits">
    <div class="forecast-split"><span>予測幅</span><b>${fc.range?.[0]??'—'}–${fc.range?.[1]??'—'}</b><small>信頼度 ${fc.confidence??'—'}%</small></div>
    <div class="forecast-split"><span>単純予測</span><b>${fc.baseline??'—'}</b><small>複合差 ${signed((fc.score||0)-(fc.baseline||0))}</small></div>
    <div class="forecast-split"><span>ブライダル</span><b>${fc.bridalIndex??'—'}</b><small>${hesc(fc.b?.mode||'')}</small></div>
    <div class="forecast-split"><span>小売り</span><b>${fc.retailIndex??'—'}</b><small>週末天気反映</small></div>
    ${lengthHtml}
   </div>
   <div class="factor-list">${factorHtml}</div>
   <div id="forecastDetailMarket" class="small" style="margin-top:10px"></div>
  `;
  target.scrollIntoView({behavior:'smooth',block:'nearest'});

  // 市況コメントは補助表示。失敗しても上の内訳は残す。
  try{
   const mc=combinedMarketComment();
   const aux=D('forecastDetailMarket');
   if(aux && mc?.comment){
    aux.innerHTML=`<div class="market-comment ${hesc(mc.tone||'neutral')}"><b>市況コメント</b><span>${hesc(mc.comment)}</span></div>`;
   }
  }catch(e){console.warn('detail market comment',e)}
 }catch(e){
  console.error('forecast detail',e);
  target.innerHTML=`<div class="source-alert danger"><b>この日の内訳表示でエラー</b><span>${hesc(e?.message||e||'不明なエラー')}</span></div>`;
 }
}
window.showForecastDetail=showForecastDetail;
async function fetchAutoWeather(){
 const settled=await Promise.allSettled(KANTO_WEATHER_POINTS.map(async p=>{
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=16`;
  const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(p.name);const j=await r.json();return {p,j};
 }));
 const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);if(!ok.length)throw new Error('weather');
 const byDate={};
 for(const {p,j} of ok){const times=j.daily?.time||[],codes=j.daily?.weather_code||[],pops=j.daily?.precipitation_probability_max||[];times.forEach((t,i)=>{(byDate[t]??=[]).push({w:p.w,code:Number(codes[i]||0),pop:Number(pops[i]||0),name:p.name})})}
 const weather={};for(const [t,rows] of Object.entries(byDate)){const totalW=rows.reduce((a,x)=>a+x.w,0)||1;const pop=Math.round(rows.reduce((a,x)=>a+x.pop*x.w,0)/totalW);const badShare=rows.reduce((a,x)=>a+((x.code>=51||x.pop>=55)?x.w:0),0)/totalW;const stormShare=rows.reduce((a,x)=>a+((x.code>=95||x.pop>=80)?x.w:0),0)/totalW;const cloudyShare=rows.reduce((a,x)=>a+((x.code>=2||x.pop>=30)?x.w:0),0)/totalW;const kind=stormShare>=.35?'storm':badShare>=.40?'rain':cloudyShare>=.45?'cloudy':'sunny';weather[t]={kind,pop,coverage:rows.length}}
 fcAuto.weather=weather;fcAuto.weatherThrough=Object.keys(weather).sort().at(-1)||'';fcAuto.weatherStatus='取得済';fcAuto.weatherCoverage=`${ok.length}/7地点`;
}
async function fetchProducerWeather(){
 const settled=await Promise.allSettled(PROD_WEATHER_POINTS.map(async p=>{const url=`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,precipitation_sum,wind_gusts_10m_max&timezone=Asia%2FTokyo&past_days=7&forecast_days=16`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(p.name);const j=await r.json();return {p,j}}));
 const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);if(!ok.length)throw new Error('producer weather');const out={};
 for(const {p,j} of ok){out[p.name]={};const times=j.daily?.time||[],codes=j.daily?.weather_code||[],rains=j.daily?.precipitation_sum||[],gusts=j.daily?.wind_gusts_10m_max||[];times.forEach((t,i)=>out[p.name][t]={code:Number(codes[i]||0),rain:Number(rains[i]||0),gust:Number(gusts[i]||0)})}
 fcAuto.producerWeather=out;fcAuto.producerWeatherStatus='取得済';fcAuto.producerWeatherCoverage=`${ok.length}/5産地`;
}
async function fetchAutoHolidays(){
 const now=new Date(),years=[now.getFullYear(),now.getFullYear()+1];const holidays={},names={};
 for(const y of years){const r=await fetch(`https://holiday.omikuji.dev/api/v1/${y}.json`,{cache:'no-store'});if(!r.ok)throw new Error('holiday');const j=await r.json();holidays[y]=Object.keys(j);Object.assign(names,j)}fcAuto.holidays=holidays;fcAuto.holidayNames=names;fcAuto.holidayStatus='取得済';
}
async function fetchImportSupply(){
 const urls=[
  {name:'植物防疫統計',url:AMITERU_PROXY+'/import/pps'},
  {name:'税関0604.20',url:AMITERU_PROXY+'/import/customs'}
 ];
 let ok=0,notes=[],errors=[];
 for(const src of urls){
  try{
   const r=await fetch(src.url,{cache:'no-store'});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const t=await r.text();
   if(t&&t.length>20){ok++;notes.push(src.name)}
  }catch(e){errors.push(`${src.name}:${e?.message||e}`)}
 }
 if(!ok)throw new Error(errors.join(' / ')||'輸入関連ソースへ接続できません');
 // 現在のWorkerは「公式ソースに接続できる」ことを確認する段階。
 // 税関の関税率表は数量実績そのものではないため、数量推定は作らず中立にする。
 const prev=fcAuto.importSupply||{};
 if(Number.isFinite(Number(prev.yoyQty))){
  const y=Number(prev.yoyQty);
  fcAuto.importSupply={...prev,score:importPressureFromYoY(y),label:`輸入前年差 ${y>=0?'+':''}${Math.round(y*100)}%`,comment:importSupplyComment(y),sourceReady:true};
  fcAuto.importStatus='取得済';
 } else {
  fcAuto.importSupply={
   score:0,
   label:`Proxy接続確認：${notes.join('・')}`,
   comment:'公式ソースへの中継は成功しています。輸入数量の実績統計はまだ自動取得していないため、海外供給補正は中立(0点)です。',
   yoyQty:null,
   sourceReady:true
  };
  fcAuto.importStatus='Proxy接続済';
 }
 fcAuto.importUpdatedAt=new Date().toISOString();
 fcAuto.importError=errors.join(' / ');
}
async function fetchExternalMarket(){
 const now=new Date(), y=now.getFullYear();
 const meta=await fetchMarketMeta(y);
 const latestMonth=Number(meta.latestMonth);
 if(!latestMonth)throw new Error('最新市場月を認識できません');

 const targets=[
  {year:y,month:latestMonth},
  {year:latestMonth>1?y:y-1,month:latestMonth>1?latestMonth-1:12},
  {year:y-1,month:latestMonth}
 ];
 const all=[]; let schema='',ok=0,errs=[];
 for(const t of targets){
  try{
   const parsed=await fetchMarketMonth(t.year,t.month);
   all.push(...parsed.rows); schema+=(schema?'\n':'')+parsed.schema; ok++;
  }catch(e){errs.push(`${t.year}/${t.month}:${e?.message||e}`)}
 }
 if(!ok||!all.length)throw new Error(errs.join(' / ')||'ユーカリ市況を取得できません');

 const sig=marketSignalFromRows(all);
 fcAuto.market=sig;
 fcAuto.marketStatus='取得済';
 fcAuto.marketUpdatedAt=new Date().toISOString();
 fcAuto.marketLastDate=sig.lastDate||`${y}-${String(latestMonth).padStart(2,'0')}-01`;
 fcAuto.marketError=errs.join(' / ');
 fcAuto.marketSchema=schema.slice(0,1500);
 fcAuto.marketSourceMonth=`${meta.latestYear}-${String(meta.latestMonth).padStart(2,'0')}`;
 fcAuto.marketPublished=meta.published||'';
}
function marketDataAgeDays(){if(!fcAuto.marketLastDate)return null;const t=Date.parse(fcAuto.marketLastDate+'T00:00:00+09:00');return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):null}
function renderForecastHealth(){
 const el=D('forecastHealth');if(!el)return;const msgs=[];const age=marketDataAgeDays();
 if(fcAuto.marketStatus==='取得失敗')msgs.push({type:'warn',title:'外部市況：Proxy中継エラー',body:`AMITERU Proxy経由で市場データを取得できませんでした。${fcAuto.marketError?` ${fcAuto.marketError}`:''} カレンダーは前回データまたは季節平均で継続します。`});
 if(fcAuto.marketStatus==='形式変更')msgs.push({type:'danger',title:'外部データ形式が変わった可能性があります',body:'ユーカリ行を認識できません。AMITERU FLOWの更新が必要な可能性があります。'});
 if(age!=null&&age>21)msgs.push({type:'warn',title:'外部市況の更新が止まっている可能性があります',body:`大田市場のユーカリ最終認識日は ${fcAuto.marketLastDate} です。リンク切れ・掲載休止・ユーカリ取引なしのいずれかを確認してください。`});
 if(fcAuto.weatherStatus==='取得失敗')msgs.push({type:'warn',title:'関東天気を取得できません',body:'前回キャッシュまたは天気中立で予測しています。'});
 if(fcAuto.producerWeatherStatus==='取得失敗')msgs.push({type:'warn',title:'主要産地の天気を取得できません',body:'外部市況の数量変化は産地天気補正なしで評価しています。'});
 if(fcAuto.importStatus==='取得失敗')msgs.push({type:'warn',title:'輸入関連ソース：Proxy中継エラー',body:`AMITERU Proxy経由で公式ソースへ接続できません。海外供給は中立(0点)で予測を継続します。${fcAuto.importError?` ${fcAuto.importError}`:''}`});
 if(fcAuto.importStatus==='ソース確認済')msgs.push({type:'warn',title:'輸入統計は補助情報として待機中',body:'公式統計ソースへの接続は確認済みですが、ユーカリ単独の数量をブラウザから安定抽出できないため、現在は0点（中立）です。誤った数量で相場判断しないための安全策です。'});
 if(!msgs.length){el.innerHTML='<div class="source-ok">自動データ正常：関東天気・主要産地天気・祝日・外部市況・輸入供給の取得状態に問題はありません。</div>';return}
 el.innerHTML=msgs.map(m=>`<div class="source-alert ${m.type}"><b>${m.title}</b><span>${m.body}</span></div>`).join('');
}
function forecastCacheFresh(){if(!fcAuto.updatedAt)return false;const t=Date.parse(fcAuto.updatedAt);return Number.isFinite(t)&&(Date.now()-t)<FC_CACHE_MS}
async function refreshForecastExternal(force=false){
 if(!force&&forecastCacheFresh()){renderForecastCalendars();return}
 const hadWeather=Object.keys(fcAuto.weather||{}).length>0,hadProducerWeather=Object.keys(fcAuto.producerWeather||{}).length>0,hadHolidays=Object.keys(fcAuto.holidays||{}).length>0;
 const hadMarket=fcAuto.market&&Object.keys(fcAuto.market).length>0,hadImport=fcAuto.importSupply&&fcAuto.importSupply.sourceReady;const tasks=[fetchAutoWeather().catch(()=>{fcAuto.weatherStatus=hadWeather?'キャッシュ':'取得失敗'}),fetchProducerWeather().catch(()=>{fcAuto.producerWeatherStatus=hadProducerWeather?'キャッシュ':'取得失敗'}),fetchAutoHolidays().catch(()=>{fcAuto.holidayStatus=hadHolidays?'キャッシュ':'内蔵暦'}),fetchExternalMarket().catch(e=>{const msg=String(e?.message||e||'');fcAuto.marketError=msg;fcAuto.marketStatus=/認識|CSV/.test(msg)?'形式変更':(hadMarket?'キャッシュ':'取得失敗')}),fetchImportSupply().catch(e=>{fcAuto.importError=String(e?.message||e||'');fcAuto.importStatus=hadImport?'キャッシュ':'取得失敗'})];
 await Promise.all(tasks);
 // どちらか取得できた時、または既存キャッシュがある時だけ更新時刻を記録
 if(fcAuto.weatherStatus==='取得済'||fcAuto.producerWeatherStatus==='取得済'||fcAuto.holidayStatus==='取得済'||fcAuto.marketStatus==='取得済'||fcAuto.importStatus==='取得済'||fcAuto.importStatus==='ソース確認済'||hadWeather||hadProducerWeather||hadHolidays||hadMarket||hadImport)fcAuto.updatedAt=new Date().toISOString();
 fcAutoSave();renderForecastCalendars();
}

function initForecast(){
 const root=D('forecastCalendars');if(!root)return;
 try{
  fcAutoLoad();
  renderForecastCalendars();
  // 外部データ取得は失敗してもカレンダー表示を消さない
  refreshForecastExternal(false).catch(e=>{
   console.error('forecast external',e);
   const st=D('forecastAutoStatus');
   if(st)st.textContent='カレンダーは表示中／外部データ更新で一部エラー';
  });
 }catch(e){
  console.error('forecast init',e);
  const st=D('forecastAutoStatus');
  if(st)st.textContent='予測カレンダーはローカルデータで表示中／一部補助データの初期化に失敗';
  if(!root.children.length){
   root.innerHTML='<div class="source-alert danger"><b>予測カレンダー初期化エラー</b><span>再読み込みしてください。</span></div>';
  }
 }
}

// 販売DBの起動を待たず、需要予測カレンダーを先に描画する
initForecast();

})();
