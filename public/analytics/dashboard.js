(() => {
 'use strict';
 const $=id=>document.getElementById(id),n=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
 const count=value=>new Intl.NumberFormat().format(n(value));
 const appNames={home:'Kkeep home',web:'Web browsing',youtube:'YouTube',tiktok:'TikTok',snapchat:'Snapchat',roblox:'Roblox',clash:'Clash Royale',ghost:'GhostCloud',gfn:'GeForce NOW',xbox:'Xbox Cloud'};
 const icons={youtube:'youtube',tiktok:'tiktok',snapchat:'snapchat',roblox:'roblox',gfn:'nvidia',xbox:'xbox'};
 let countries;try{countries=new Intl.DisplayNames(['en'],{type:'region'});}catch{}
 const countryName=value=>/^[A-Z]{2}$/.test(value)?countries?.of(value)||value:'Unknown';
 const node=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
 function rank(id,rows,total,label,apps=false){
  const target=$(id);target.replaceChildren();
  if(!rows.length){target.append(node('p','No activity in this period yet.','empty'));return;}
  for(const row of rows){
   const entry=node('div',undefined,'rank-row'),line=node('div',undefined,'rank-label');
   if(apps&&icons[row.name]){const img=document.createElement('img');img.src='/icons/'+icons[row.name]+'.svg';img.className='app-icon';img.alt='';line.append(img);}
   line.append(node('span',label(row.name),'name'),node('span',count(row.views),'amount'),node('span',total?Math.round(n(row.views)/total*100)+'%':'0%','share'));
   const bar=document.createElement('progress');bar.max=Math.max(total,1);bar.value=n(row.views);bar.setAttribute('aria-label',label(row.name)+': '+count(row.views)+' opens');entry.append(line,bar);target.append(entry);
  }
 }
 function chart(data){
  const daily=new Map(data.daily.map(row=>[row.day,row])),days=[];
  const started=data.startedAt?new Date(Date.parse(data.startedAt)+4*3600000).toISOString().slice(0,10):null;
  const first=Date.parse(data.range.startDay+'T00:00:00Z');
  for(let i=0;i<data.days;i++){const day=new Date(first+i*86400000).toISOString().slice(0,10);days.push({day,available:!started||day>=started,...(daily.get(day)||{views:0,visitors:0})});}
  $('daily-table').replaceChildren(...days.map(row=>{const tr=document.createElement('tr');tr.append(node('td',row.day),node('td',row.available?count(row.visitors):'Not recorded'),node('td',row.available?count(row.views):'Not recorded'));return tr;}));
  const target=$('daily-chart');target.replaceChildren();
  if(!n(data.totals.views)){target.append(node('p','Your first visits will appear here. There’s no historical data to fill in.','empty'));return;}
  const NS='http://www.w3.org/2000/svg';
  const el=(tag,attrs,text)=>{const x=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))x.setAttribute(key,String(value));if(text)x.textContent=text;return x;};
  const width=Math.max(280,target.clientWidth);
  const svg=el('svg',{viewBox:'0 0 '+width+' 250',role:'img','aria-label':'Estimated daily visitors; exact values are in View daily numbers. Dates before collection began are not plotted.'});
  const max=Math.max(1,...days.map(d=>n(d.visitors))),top=Math.max(4,Math.ceil(max/4)*4),left=35,right=width-12,bottom=212,high=25;
  for(let i=0;i<=4;i++){const y=bottom-i*(bottom-high)/4;svg.append(el('line',{x1:left,x2:right,y1:y,y2:y,class:'grid-line'}),el('text',{x:25,y:y+4,'text-anchor':'end'},String(top*i/4)));}
  const points=days.map((d,i)=>({x:days.length===1?(left+right)/2:left+i*(right-left)/(days.length-1),y:bottom-n(d.visitors)/top*(bottom-high),...d}));
  const recorded=points.filter(p=>p.available);
  if(recorded.length>1){const path=recorded.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');svg.append(el('path',{d:path+' L'+recorded[recorded.length-1].x+','+bottom+' L'+recorded[0].x+','+bottom+' Z',class:'trend-area'}),el('path',{d:path,class:'trend-line'}));}
  for(const p of recorded){const circle=el('circle',{cx:p.x,cy:p.y,r:3.5,class:'point',tabindex:0});circle.append(el('title',{},p.day+': '+count(p.visitors)+' visitors, '+count(p.views)+' opens'));svg.append(circle);}
  const index=[...new Set([0,Math.floor((days.length-1)/2),days.length-1])];
  for(const i of index){const p=points[i];svg.append(el('text',{x:p.x,y:240,'text-anchor':i===0?'start':i===days.length-1?'end':'middle'},new Date(p.day+'T12:00:00Z').toLocaleDateString('en',{month:'short',day:'numeric',timeZone:'UTC'})));}
  target.append(svg);
 }
 let generation=0,lastData;
 window.addEventListener('resize',()=>{if(lastData)chart(lastData);});
 async function load(){
  const version=++generation;$('refresh').disabled=true;$('load-error').hidden=true;
  try{
   const response=await fetch('/api/analytics/report?days='+$('period').value,{credentials:'same-origin',cache:'no-store'});
   if(response.status===403){location.replace('/analytics');return;}
   if(!response.ok)throw new Error('Could not load your traffic. Tap refresh to try again.');
   const data=await response.json();if(version!==generation)return;lastData=data;
   $('date-range').textContent=data.range.startDay+' — '+data.range.endDay+' · UAE time · today is still in progress';
   $('total-visitors').textContent=count(data.totals.visitors);$('total-views').textContent=count(data.totals.views);$('total-countries').textContent=count(data.totals.countries);
   const apps=data.pages.filter(row=>!['home','web'].includes(row.name));
   $('top-app').textContent=apps.length?appNames[apps[0].name]||'App':'—';$('top-app-detail').textContent=apps.length?count(apps[0].views)+' opens':'Waiting for app activity';
   $('collection-note').textContent='Collection started '+(data.startedAt?new Date(data.startedAt).toLocaleDateString('en',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}):'with this update')+'. Earlier visits cannot be recovered. Today’s numbers are partial.';
   rank('countries',data.countries,n(data.totals.views),countryName);rank('apps',apps,apps.reduce((sum,row)=>sum+n(row.views),0),name=>appNames[name]||'App',true);
   rank('devices',data.devices,n(data.totals.views),name=>name);rank('browsers',data.browsers,n(data.totals.views),name=>name);chart(data);
   $('exclude-browser').checked=!!data.excluded;
   $('last-updated').textContent='Updated '+new Date(data.updatedAt).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Dubai'})+' UAE time';
  }catch(error){if(version===generation){$('load-error').textContent=error.message;$('load-error').hidden=false;}}
  finally{if(version===generation)$('refresh').disabled=false;}
 }
 $('period').addEventListener('change',load);$('refresh').addEventListener('click',load);
 $('exclude-browser').addEventListener('change',async event=>{
  const input=event.target,value=input.checked;input.disabled=true;$('preference-status').textContent='Saving…';
  try{const response=await fetch('/api/analytics/preference',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kkeep-Analytics':'1'},body:JSON.stringify({excluded:value})});if(!response.ok)throw new Error();try{localStorage.setItem('kkeep-analytics-exclude',value?'1':'0');}catch{}$('preference-status').textContent=value?'This browser is excluded, including after you sign out.':'Owner visits remain excluded while you are signed in.';}
  catch{input.checked=!value;$('preference-status').textContent='Could not save. Please try again.';}finally{input.disabled=false;}
 });
 load();
})();
