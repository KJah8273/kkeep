// Dedicated Kkeep origin: the game can use Safari-compatible isolation without
// giving its scripts or service worker access to the main Kkeep application.
export const robloxOrigin='https://kkeep-roblox-runtime.kha971.chatgpt.site';
export const robloxLaunchUrl=robloxOrigin+'/_rbx/app/';
export const robloxCheckUrl=robloxOrigin+'/check';
// Open the catalog first so returning players skip the proxy sign-in bundles.
// Only a trusted signed-out message opens the provider sign-in page.
export const robloxFrameUrl=robloxOrigin+'/_rbx/app/';
export const robloxSigninUrl=robloxOrigin+'/_rbx/signin';

// iPadOS commonly sends a Mac user agent. Keep detection local to Roblox;
// changing a UA cannot add missing WebAssembly features to a browser.
export function isRobloxMobileDevice(navigator:Pick<Navigator,'userAgent'|'platform'|'maxTouchPoints'>):boolean{
  return /iPad|iPhone|iPod|Android|Mobi/i.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}

// This main-origin preference is written only by the player's FPS control.
// Keep explicit choices; use the lighter default only for an unconfigured iPad.
export function robloxFpsPreference(navigator:Pick<Navigator,'userAgent'|'platform'|'maxTouchPoints'>,saved:string|null):30|60{
  if(saved==='30'||saved==='60')return saved==='30'?30:60;
  return /iPad/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?30:60;
}

export function robloxGameUrl(placeId:string,fps:30|60|null=null,options:{gpu?:'webgl'|'webgpu';transport?:'relay'}={}):string|null{
  if(!/^[1-9]\d{0,19}$/.test(placeId))return null;
  // This is the provider's observed game endpoint. Its hook reads performance
  // options here BEFORE loading the engine; adding them to /_rbx/app does not.
  const url=new URL('/_/cGxheS5yb2Jsb3guY29t/games/start',robloxOrigin);
  url.searchParams.set('placeId',placeId);
  if(fps!==null){
    url.searchParams.set('perf','performance');
    url.searchParams.set('fps',String(fps));
    url.searchParams.set('res','auto');
  }
  if(options.gpu==='webgl'||options.gpu==='webgpu')url.searchParams.set('gpu',options.gpu);
  if(options.transport==='relay')url.searchParams.set('wt','relay');
  return url.href;
}

export function robloxGamePlaceId(event:Pick<MessageEvent,'origin'|'source'|'data'>,frameWindow:Window|null):string|null{
  if(robloxPlayerEvent(event,frameWindow)!=='play')return null;
  const placeId=event.data.p;
  return typeof placeId==='string'&&/^[1-9]\d{0,19}$/.test(placeId)?placeId:null;
}

export function robloxPlayerEvent(event:Pick<MessageEvent,'origin'|'source'|'data'>,frameWindow:Window|null):'play'|'exit'|'signed-out'|null{
  if(!frameWindow||event.source!==frameWindow||event.origin!==robloxOrigin)return null;
  const data=event.data;
  if(!data||typeof data!=='object')return null;
  if(data.type==='webblox:signed-out')return 'signed-out';
  if(data.type==='webblox:stat'&&(data.e==='play'||data.e==='exit'))return data.e;
  return null;
}

export function robloxRuntimeEvent(event:Pick<MessageEvent,'origin'|'source'|'data'>,frameWindow:Window|null):{stage:string;detail:string;gpu?:'webgl'|'webgpu';preserveForm?:true}|null{
  if(!frameWindow||event.source!==frameWindow||event.origin!==robloxOrigin)return null;
  const data=event.data;
  const network=['transport-unavailable','transport-constructor','transport-connecting','transport-native','transport-relay','transport-ready','transport-handshake','transport-closed','transport-lost','transport-stream','transport-stream-ready','transport-datagram'];
  if(!data||data.type!=='kkeep:roblox-runtime'||!['session-ready','session-failed','session-recovering','session-waiting','session-paused','session-help','catalog-ready','catalog-failed','features-ready','compiling','compiled','running','failed',...network].includes(data.stage))return null;
  const details=data.stage.startsWith('catalog-')?['version','connection','catalog']:data.stage.startsWith('session-')?['service-worker','session','connection','offline','user','input']:data.stage.startsWith('transport-')?['TypeError','NotSupportedError','InvalidStateError','NetworkError','WebTransportError','AbortError','SecurityError']:['isolation','jspi','memory','compile','instantiate','download','connection','engine','graphics-init','graphics-device-lost',...network];
  const preserveForm=data.preserveForm===true&&['session-recovering','session-waiting'].includes(data.stage);
  return {stage:data.stage,detail:details.includes(data.detail)?data.detail:'',...(data.gpu==='webgl'||data.gpu==='webgpu'?{gpu:data.gpu}:{}),...(preserveForm?{preserveForm:true as const}:{})};
}

type RobloxViewDimensions={cssWidth:number;cssHeight:number;width:number;height:number};
export type RobloxViewSnapshot={
  revision:'join18'|'join19';
  canvas:RobloxViewDimensions|null;
  startup:(RobloxViewDimensions&{effectiveDpr:number;rawDpr:number})|null;
  lifecycle:'join-reported'|'scripts-starting'|'game-closed'|null;
};

function robloxViewDimensions(value:unknown):RobloxViewDimensions|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {cssWidth,cssHeight,width,height}=value as Record<string,unknown>;
  const dimension=(size:unknown):size is number=>typeof size==='number'&&Number.isSafeInteger(size)&&size>=0&&size<=32768;
  if(!dimension(cssWidth)||!dimension(cssHeight)||!dimension(width)||!dimension(height))return null;
  return {cssWidth,cssHeight,width,height};
}

// Keep optional troubleshooting data separate from engine and connection status.
// Copy only the bounded fields this UI displays; never retain raw runtime data.
export function robloxViewEvent(event:Pick<MessageEvent,'origin'|'source'|'data'>,frameWindow:Window|null):RobloxViewSnapshot|null{
  if(!frameWindow||event.source!==frameWindow||event.origin!==robloxOrigin)return null;
  const data=event.data;
  if(!data||typeof data!=='object'||Array.isArray(data)||data.type!=='kkeep:roblox-view'||!['join18','join19'].includes(data.revision))return null;
  const canvas=data.canvas===null?null:robloxViewDimensions(data.canvas);
  const startupSize=data.startup===null?null:robloxViewDimensions(data.startup);
  if((data.canvas!==null&&!canvas)||(data.startup!==null&&!startupSize))return null;
  const ratio=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=16;
  if(startupSize&&(!ratio(data.startup.effectiveDpr)||!ratio(data.startup.rawDpr)))return null;
  const lifecycle=data.lifecycle??null;
  if(lifecycle!==null&&lifecycle!=='join-reported'&&lifecycle!=='scripts-starting'&&lifecycle!=='game-closed')return null;
  return {revision:data.revision,canvas,startup:startupSize?{...startupSize,effectiveDpr:data.startup.effectiveDpr,rawDpr:data.startup.rawDpr}:null,lifecycle};
}

export type RobloxRecoveryBudget={attempts:number;tried:string[];paused:boolean};
export type RobloxRecoveryPlan={key:string;message:string;gpu?:'webgl';relay?:true;delay:number};
export function newRobloxRecoveryBudget():RobloxRecoveryBudget{return {attempts:0,tried:[],paused:false};}

export function robloxRecoveryAction(detail:string,gpu:'webgl'|'webgpu'|undefined,relay:boolean):Omit<RobloxRecoveryPlan,'delay'>|null{
  let plan:Omit<RobloxRecoveryPlan,'delay'>|null=null;
  if((detail==='graphics-init'||detail==='graphics-device-lost')&&gpu==='webgpu'){
    plan={key:'graphics',gpu:'webgl',message:'Switching to compatibility graphics and rejoining this game automatically…'};
  }else if(detail==='download'){
    plan={key:'download',message:'Retrying the game download automatically…'};
  }else if(['connection','transport-lost','transport-constructor','transport-handshake','transport-unavailable'].includes(detail)){
    plan=relay?{key:'rejoin',message:'Requesting a fresh game connection automatically…'}:
      {key:'relay',relay:true,message:'Rejoining this game using the relay connection automatically…'};
  }
  // Unknown engine errors, missing browser features and memory failures need
  // their own explanation. Do not guess a graphics change or silently loop.
  return plan;
}

// Reserve at most two attempts until an explicit user action or a different
// experience starts. A loading overlay disappearing is not proof of a healthy
// game, so a brief "running" event must not replenish this budget.
export function robloxRecoveryPlan(detail:string,gpu:'webgl'|'webgpu'|undefined,relay:boolean,budget:RobloxRecoveryBudget):RobloxRecoveryPlan|null{
  if(budget.paused||budget.attempts>=2)return null;
  const plan=robloxRecoveryAction(detail,gpu,relay);
  if(!plan||budget.tried.includes(plan.key))return null;
  budget.tried.push(plan.key);budget.attempts++;
  return {...plan,delay:budget.attempts===1?3000:6000};
}

export function isRobloxPlayerUrl(url:URL):boolean{
  return (url.origin===robloxOrigin&&(url.pathname.startsWith('/_rbx/')||url.pathname==='/check'))||
    (url.origin==='https://api.spf50krem.com'&&(url.pathname.startsWith('/_rbx/')||url.pathname==='/pages/webblox.html'));
}
