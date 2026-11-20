export async function videoApi<T>(path:string,input?:unknown,signal?:AbortSignal,keepalive=false):Promise<T>{
 const response=await fetch('/api/kkeep-youtube/'+path,{method:input?'POST':'GET',headers:{'X-Kkeep-Video':'1',...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,credentials:'same-origin',cache:'no-store',signal:signal||AbortSignal.timeout(22000),keepalive});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Could not load Kkeep YouTube.'),{status:response.status});return data;
}
