/** Observe native TikTok login responses without retrying or changing them.
 * Persist only an allowlisted flow label, HTTP status and numeric provider error
 * code. Never log a body, URL, username, password, cookie, token or freeform text.
 */
const HOSTS=new Set(['www.tiktok.com','login-us.www.tiktok.com','login-eu.www.tiktok.com','web-va.tiktok.com']);
const FLOWS:Record<string,string>={
  '/passport/web/user/login/':'password',
  '/passport/web/web_login/':'web-login',
  '/passport/web/auth/login_only/':'provider',
};
const MAX_BYTES=16*1024;
type Report={flow:string;httpStatus:number;providerCode?:number};

export function observeTikTokLogin(target:URL,method:string,response:Response,report:(value:Report)=>void=value=>console.warn('TikTok login result',JSON.stringify(value))):ReadableStream<Uint8Array>|null {
  const flow=HOSTS.has(target.hostname)&&method==='POST'?FLOWS[target.pathname]:undefined;
  if(!flow||!response.body)return response.body;
  let parts:Uint8Array[]=[];let size=0;let oversized=false;
  return response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){
      // Forward each original chunk immediately; do not clone/tee and buffer an
      // unconsumed second stream, delay login, or make another provider request.
      controller.enqueue(chunk);
      size+=chunk.byteLength;
      if(size>MAX_BYTES){oversized=true;parts=[];}
      else if(!oversized)parts.push(chunk.slice());
    },
    flush(){
      let providerCode:number|undefined;
      if(!oversized)try {
        const bytes=new Uint8Array(size);let offset=0;
        for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
        const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        const candidate=json?.data?.error_code??json?.error_code;
        if(typeof candidate==='number'&&Number.isInteger(candidate)&&candidate>=0&&candidate<=10000000)providerCode=candidate;
      } catch { /* HTML challenges and unknown responses remain untouched. */ }
      parts=[];
      try {report({flow,httpStatus:response.status,...(providerCode===undefined?{}:{providerCode})});}
      catch { /* Diagnostics cannot turn a successful login into a failure. */ }
    },
  }));
}
