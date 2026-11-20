const root='https://play-prod.struckd.com/api/v1/games/game/d52c2c65-a139-4a68-866b-089a6839e0d9/build/54d624e0-bb25-4e2f-962c-fb040f9acfbd/';
let cached:{until:number;files:Record<string,string>}|undefined;
export async function drDriving(request:Request){
 const name=new URL(request.url).pathname.split('/').pop()||'';
 const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
 if(!['GET','HEAD'].includes(request.method)||!['loader.js','framework.js','game.wasm','game.data'].includes(name))return new Response(null,{status:404,headers});
 try{
  if(!cached||cached.until<Date.now()){
   const r=await fetch(root+'frame',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();
   const html=await r.text(),files:Record<string,string>={};
   for(const raw of html.match(/https:\/\/cdn\.play\.unity\.com\/[^"'\s<>]+/g)||[]){const u=new URL(raw.replaceAll('&amp;','&'));if(u.pathname.startsWith('/game-builds/54d624e0-bb25-4e2f-962c-fb040f9acfbd/'))files[u.pathname.split('/').pop()!]=u.href;}
   cached={until:Date.now()+60000,files};
  }
  if(!cached.files[name])throw Error();
  const r=await fetch(cached.files[name],{method:request.method,signal:AbortSignal.timeout(60000)});
  if(!r.ok){cached=undefined;throw Error();}
  const h=new Headers(headers);if(r.headers.get('Content-Length')&&!r.headers.get('Content-Encoding'))h.set('Content-Length',r.headers.get('Content-Length')!);
  h.set('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream');
  return new Response(r.body,{headers:h});
 }catch{return new Response('Game download unavailable. Please retry.',{status:502,headers});}
}
