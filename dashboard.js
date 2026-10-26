(()=>{
const D=id=>document.getElementById(id);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const compactYen=n=>{n=Number(n)||0;return n>=10000?`¥${(n/10000).toFixed(n>=100000?1:1).replace(/\.0$/,'')}万`:`¥${Math.round(n).toLocaleString('ja-JP')}`};
const fmtDate=s=>s&&s.length>=8?`${s.slice(0,4)}/${Number(s.slice(4,6))}/${Number(s.slice(6,8))}`:(s||'');
const today8=()=>{const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`};
const nrm=s=>(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
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
 let pts=0,desc=[];const hot=isHotMonth(d);const auctionWeight=d.getDay()===2?(hot?.72:1.0):d.getDay()===4?(hot?1.0:.78):.30;
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
 // 日曜セリは直近物日の仕入れとしては弱め、火木を中心に配分
 const dayMul=d.getDay()===2?1:d.getDay()===4?.92:.45;
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
 const allSame=e.filter(r=>{const rd=parseDateKey(r.date);return rd&&rd.getDay()===dow});const base=allSame.length?allSame.reduce((a,r)=>a+(Number(r.qty)||0),0)/allSame.length:avgQty;
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
function auctionWeekdayFactor(d){if(d.getDay()===2)return {score:isHotMonth(d)?5:10,label:isHotMonth(d)?'火曜・暑期減':'火曜強め'};if(d.getDay()===4)return {score:isHotMonth(d)?12:7,label:isHotMonth(d)?'暑期の木曜強め':'木曜'};return {score:3,label:'日曜'}}
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
 if(live&&Number.isFinite(live.score)&&fcAuto.marketStatus==='取得済')return {score:live.score,label:`大田市場 ${live.label}${live.lastDate?`（${live.lastDate.slice(5).replace('-','/')}まで）`:''}`,source:'東京都中央卸売市場日報',producerWeather:live.producerWeather};
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
function renderForecastCalendars(){
 const root=D('forecastCalendars');if(!root)return;const now=new Date();
 root.innerHTML=[0,1].map(off=>{const first=new Date(now.getFullYear(),now.getMonth()+off,1),y=first.getFullYear(),m=first.getMonth(),days=new Date(y,m+1,0).getDate(),blanks=first.getDay();let cells='';for(let i=0;i<blanks;i++)cells+='<div class="daycell empty"></div>';
  for(let n=1;n<=days;n++){const d=new Date(y,m,n),auction=isAuctionDay(d),weekend=[0,6].includes(d.getDay()),r=lunarRokuyo(d),fc=auction?forecastFor(d):null,wb=weekend?weatherBadgeForDate(d):'',hn=holidayName(d);cells+=`<div class="daycell ${auction?`auction heat${fc.level}`:''} ${weekend?'weekend':''}" data-date="${dateKey(d)}" data-auction="${auction?1:0}"><div class="daynum">${n}${hn?'<span class="holiday-dot">●</span>':''}</div><div class="rokuyo">${r||''}${hn?`・${hn}`:''}</div>${auction?`<div class="auction-label">${['日','月','火','水','木','金','土'][d.getDay()]}曜セリ</div><div class="heat-score">${fc.score}</div>`:''}${weekend&&wb?`<span class="weather-badge">${wb}</span>`:''}</div>`}
  return `<div class="forecast-cal"><div class="cal-head"><b>${y}年${m+1}月</b><span class="small">火・木・日セリ</span></div><div class="cal-week">${['日','月','火','水','木','金','土'].map(x=>`<div>${x}</div>`).join('')}</div><div class="cal-days">${cells}</div></div>`}).join('');
 root.querySelectorAll('.daycell[data-auction="1"]').forEach(el=>el.addEventListener('click',()=>{const k=el.dataset.date,d=new Date(+k.slice(0,4),+k.slice(4,6)-1,+k.slice(6,8));showForecastDetail(d)}));
 const st=D('forecastAutoStatus');if(st){const wu=fcAuto.weatherThrough?`天気〜${fcAuto.weatherThrough.slice(5).replace('-','/')}`:'天気未取得';const up=fcAuto.updatedAt?new Date(fcAuto.updatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';const mu=fcAuto.marketUpdatedAt?new Date(fcAuto.marketUpdatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';const iu=fcAuto.importUpdatedAt?new Date(fcAuto.importUpdatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未更新';st.textContent=`自動取得：関東7都県 ${wu}／主要産地天気 ${fcAuto.producerWeatherStatus}${fcAuto.producerWeatherCoverage?` ${fcAuto.producerWeatherCoverage}`:''}／祝日 ${fcAuto.holidayStatus}／大田市場 ${fcAuto.marketStatus}（${mu}）／輸入 ${fcAuto.importStatus}（${iu}）／全体更新 ${up}${fcAuto.weatherCoverage?`／${fcAuto.weatherCoverage}`:''}`;}renderForecastHealth();
}
function showForecastDetail(d){
 const fc=forecastFor(d);
 D('forecastDetail').innerHTML=`<div class="sectionhead"><div><div class="section-kicker">Auction forecast</div><h3 style="margin:0">${d.getMonth()+1}/${d.getDate()} ${['日','月','火','水','木','金','土'][d.getDay()]}曜セリ　総合 <b>${fc.score}/100</b></h3></div><span class="tag ${fc.level>=4?'hot':'good'}">${fc.level>=5?'かなり強い':fc.level===4?'強い':fc.level===3?'普通':fc.level===2?'やや弱い':'弱い'}</span></div>
 <div class="forecast-splits"><div class="forecast-split"><span>予測幅</span><b>${fc.range[0]}–${fc.range[1]}</b><small>信頼度 ${fc.confidence}%</small></div><div class="forecast-split"><span>単純予測</span><b>${fc.baseline}</b><small>複合予測との差 ${fc.score-fc.baseline>=0?'+':''}${fc.score-fc.baseline}</small></div><div class="forecast-split"><span>ブライダル</span><b>${fc.bridalIndex}</b><small>短尺寄り</small></div><div class="forecast-split"><span>小売り</span><b>${fc.retailIndex}</b><small>週末天気を自動反映</small></div><div class="forecast-split"><span>40cm</span><b>${fc.lengthScores[40]}</b><small>${fc.lengthDetails[40].evt.label}</small></div><div class="forecast-split"><span>50cm</span><b>${fc.lengthScores[50]}</b><small>${fc.lengthDetails[50].evt.label}</small></div><div class="forecast-split"><span>60cm</span><b>${fc.lengthScores[60]}</b><small>${fc.lengthDetails[60].evt.label}</small></div><div class="forecast-split"><span>70cm</span><b>${fc.lengthScores[70]}</b><small>${fc.lengthDetails[70].evt.label}</small></div></div>
 <div class="factor-list"><div class="factor"><span>過去実績（CSV学習）</span><strong>+${fc.h.score}</strong></div><div class="factor"><span>物日需要</span><strong>+${fc.ev.score}</strong></div><div class="factor"><span>婚礼需要推定</span><strong>+${fc.b.score}</strong></div><div class="factor"><span>小売り需要</span><strong>+${fc.r.score}</strong></div><div class="factor"><span>週末天気</span><strong>${fc.r.weather.score>=0?'+':''}${fc.r.weather.score}</strong></div><div class="factor"><span>${fc.w.label}</span><strong>+${fc.w.score}</strong></div><div class="factor"><span>${fc.s.label}</span><strong>+${fc.s.score}</strong></div><div class="factor"><span>外部ユーカリ市況</span><strong>${fc.o.score>=0?'+':''}${fc.o.score}</strong></div><div class="factor"><span>海外供給（輸入）</span><strong>${fc.imp.score>=0?'+':''}${fc.imp.score}</strong></div><div class="factor"><span>連休補正</span><strong>${fc.hp}</strong></div><div class="factor"><span>${fc.settle.label}</span><strong>${fc.settle.score>=0?'+':''}${fc.settle.score}</strong></div><div class="factor"><span>実績誤差の学習補正</span><strong>${fc.learnBias>=0?'+':''}${fc.learnBias}</strong></div></div>
 <div class="small" style="margin-top:9px">過去：${fc.h.label} ／ 物日：${fc.ev.label} ／ 婚礼：${fc.b.label}（${fc.b.mode}） ／ 天気：${fc.r.weather.label} ／ 他市場：${fc.o.label} ／ 輸入：${fc.imp.label} ／ 締め日：${fc.settle.label}</div>
 ${(()=>{const mc=combinedMarketComment();return mc?.comment?`<div class="market-comment ${mc.tone||'neutral'}"><b>市況コメント</b><span>${mc.comment}</span>${mc.yoyPrice!=null||mc.yoyQty!=null?`<small>前年同月比：${mc.yoyPrice!=null?`価格 ${mc.yoyPrice>=0?'+':''}${Math.round(mc.yoyPrice*100)}%`:''}${mc.yoyPrice!=null&&mc.yoyQty!=null?' ／ ':''}${mc.yoyQty!=null?`数量 ${mc.yoyQty>=0?'+':''}${Math.round(mc.yoyQty*100)}%`:''}</small>`:''}${mc.producerWeather?`<small>産地天気補正：${mc.producerWeather.label}</small>`:''}${mc.importSupply?`<small>海外供給：${mc.importSupply.label}</small>`:''}</div>`:''})()}
 <div class="forecast-note" style="margin-top:8px">入力不要。予測幅と信頼度を表示し、単純予測（過去実績＋曜日＋季節＋物日）とも常時比較します。CSV取込時には予測と実績の誤差を記録し、同じ方向のズレが続いた時だけ最大±6点まで緩やかに補正します。極端な単価は学習時の重みを下げます。小売りは関東7都県の週末天気を自動反映。母の日・卒園/卒業・入園/入学・父の日・敬老の日・クリスマス・送別会・離任式は直前の火木日セリへ物日需要として前倒し加点します。長さは40/50/60/70cmを別々に予測し、母の日はアレンジ用途で40〜50cm、卒園・卒業は予算を抑えた花束・アレンジ需要で40〜50cmを強めに評価。送別会・離任式は50〜60cm、クリスマスは50〜60cmまで広めに評価します。売立CSVを追加するたび、同時期・同じセリ曜日の長さ別実績も自動学習して補正します。ブライダルは週末の曜日・六曜・婚礼シーズンから需要指数を推定し、通常期は火曜、暑い時期は木曜へ強めに配分します。天気予報がまだ出ていない先の日付は中立扱いです。外部市況は東京都中央卸売市場の花き日報からユーカリを自動抽出し、価格・数量の直近変化を補助シグナルとして使います。露地ユーカリの供給量は天候に左右されるため、茨城・千葉はセリ1〜2日前、静岡・長野・愛媛は2〜3日前の雨・強風を自動取得し、数量減が需要増なのか採花・出荷減なのかを補正してコメントします。輸入は植物防疫所・財務省貿易統計を海外供給の補助シグナルとして監視し、取れる場合は前年差を最大±6点で反映します。ユーカリ単独の数量を安定抽出できない場合は推定値を作らず0点（中立）とし、その旨を警告します。買参人の15日締め・月末締めについては、直前セリを−4点、2回前を−2点の軽い買い控え補正から開始し、売立CSVの答え合わせが3回以上たまった段階で最大±2点だけ自動調整します。取得失敗・更新停止・形式変更を検知した場合は画面上に警告します。</div>`;
}
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
  'https://www.pps.maff.go.jp/TokeiWWW/Pages/toukeiList/toukeiInfoList.xhtml',
  'https://www.customs.go.jp/tariff/2026_04_01/data/j_06.htm'
 ];
 let ok=0,notes=[];
 for(const url of urls){try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const t=await r.text();if(/輸入検査|0604\.20|生鮮のもの/.test(t)){ok++;notes.push(url.includes('pps.maff')?'植物防疫統計':'貿易統計0604.20')}}catch(e){}}
 if(!ok)throw new Error('輸入統計ソースへ接続できません');
 // ブラウザから直接取得できる公式ページでは、ユーカリ単独の週次数量を安定して機械抽出できない場合がある。
 // 数量が取得できない時は、誤った推定値を作らず中立(0点)に保つ。
 const prev=fcAuto.importSupply||{};
 if(Number.isFinite(Number(prev.yoyQty))){const y=Number(prev.yoyQty);fcAuto.importSupply={...prev,score:importPressureFromYoY(y),label:`輸入前年差 ${y>=0?'+':''}${Math.round(y*100)}%`,comment:importSupplyComment(y),sourceReady:true};fcAuto.importStatus='取得済'}
 else {fcAuto.importSupply={score:0,label:`${notes.join('・')}確認済`,comment:'公式ソースは確認できていますが、ユーカリ単独の数量を自動抽出できないため中立扱いです。',yoyQty:null,sourceReady:true};fcAuto.importStatus='ソース確認済'}
 fcAuto.importUpdatedAt=new Date().toISOString();fcAuto.importError='';
}
async function fetchExternalMarket(){
 const y=new Date().getFullYear(),years=[y-1,y],all=[];let schema='',ok=0;
 for(const yy of years){
  const url=`https://www.opendata.metro.tokyo.lg.jp/shijyou/${yy}/result_price_flower.csv`;
  try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text();const parsed=parseTokyoEucaCsv(text);all.push(...parsed.rows);schema=(parsed.headers||[]).join('|').slice(0,500);ok++}catch(e){if(yy===y)throw e}
 }
 if(!ok||!all.length)throw new Error('ユーカリ市況を取得できません');
 const sig=marketSignalFromRows(all);fcAuto.market=sig;fcAuto.marketStatus='取得済';fcAuto.marketUpdatedAt=new Date().toISOString();fcAuto.marketLastDate=sig.lastDate;fcAuto.marketError='';fcAuto.marketSchema=schema;
}
function marketDataAgeDays(){if(!fcAuto.marketLastDate)return null;const t=Date.parse(fcAuto.marketLastDate+'T00:00:00+09:00');return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):null}
function renderForecastHealth(){
 const el=D('forecastHealth');if(!el)return;const msgs=[];const age=marketDataAgeDays();
 if(fcAuto.marketStatus==='取得失敗')msgs.push({type:'warn',title:'外部市況を取得できません',body:`東京都中央卸売市場のデータ取得に失敗しました。${fcAuto.marketError?` ${fcAuto.marketError}`:''} 前回データがあればそれを使い、なければ季節平均で予測しています。`});
 if(fcAuto.marketStatus==='形式変更')msgs.push({type:'danger',title:'外部データ形式が変わった可能性があります',body:'ユーカリ行を認識できません。AMITERU FLOWの更新が必要な可能性があります。'});
 if(age!=null&&age>21)msgs.push({type:'warn',title:'外部市況の更新が止まっている可能性があります',body:`大田市場のユーカリ最終認識日は ${fcAuto.marketLastDate} です。リンク切れ・掲載休止・ユーカリ取引なしのいずれかを確認してください。`});
 if(fcAuto.weatherStatus==='取得失敗')msgs.push({type:'warn',title:'関東天気を取得できません',body:'前回キャッシュまたは天気中立で予測しています。'});
 if(fcAuto.producerWeatherStatus==='取得失敗')msgs.push({type:'warn',title:'主要産地の天気を取得できません',body:'外部市況の数量変化は産地天気補正なしで評価しています。'});
 if(fcAuto.importStatus==='取得失敗')msgs.push({type:'warn',title:'輸入統計を取得できません',body:`海外供給は中立で予測しています。${fcAuto.importError||''}`});
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
  root.innerHTML='<div class="source-alert danger"><b>予測カレンダー初期化エラー</b><span>再読み込みしてください。販売DBとは独立して復旧できるよう修正済みです。</span></div>';
 }
}

// 販売DBの起動を待たず、需要予測カレンダーを先に描画する
initForecast();

})();
