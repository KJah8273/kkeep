import {movingWallpaperIds} from '../moving-wallpapers.ts';
import {photoWallpapers} from '../wallpapers.ts';
/** Appearance-only preferences. No proxy, cookie, history or game state belongs here. */
export const SETTINGS_KEY='kkeep-living-space-v1';
export const ORIGINAL_KEY='kkeep-living-original-v1';
export const WELCOME='yo to the best proxy kkeep';
export const sceneIds=['deep-orbit','aurora-glass','desert-after-dark','lunar-silence','midnight-ocean','paper-depth'] as const;
export const photoIds=photoWallpapers.map(wallpaper=>wallpaper.id);
export const themeIds=['midnight','aurora','mint','glacier','orchid','ember','rose','daylight','electric','candy','violet','ocean','sunset','cherry'] as const;
export type Quality='auto'|'static'|'low'|'balanced'|'high';
export type Preferences={version:1;shell:'living'|'classic';wallpaper:string;mode:'enhanced'|'original';quality:Quality;motion:'system'|'reduced';quiet:boolean;brightness:number;dimming:number;saturation:number;blur:number;speed:number;parallax:number;particles:number;fit:'cover'|'contain';focalX:number;focalY:number;glass:number;solid:boolean;timeAtmosphere:boolean;layout:'grid'|'orbit';density:'compact'|'comfortable'|'large';alignment:'center'|'left';leftHanded:boolean;favorites:string[];rotation:number;accent:string;profile:string;shortcutOrder:string[];shortcutNames:Record<string,string>};
export type LegacyAppearance={theme:string;wallpaper:string;match:boolean;moving:boolean;dense:boolean};
export const defaults:Preferences={version:1,shell:'living',wallpaper:'original',mode:'enhanced',quality:'auto',motion:'system',quiet:false,brightness:100,dimming:8,saturation:100,blur:0,speed:35,parallax:12,particles:24,fit:'cover',focalX:50,focalY:50,glass:94,solid:false,timeAtmosphere:false,layout:'grid',density:'comfortable',alignment:'center',leftHanded:false,favorites:[],rotation:0,accent:'',profile:'Balanced',shortcutOrder:[],shortcutNames:{}};
export function validWallpaper(value:unknown):value is string{return typeof value==='string'&&(value==='original'||['stars','constellation','none',...photoIds,...movingWallpaperIds,...sceneIds].includes(value as never)||/^upload:[a-zA-Z0-9-]{8,64}$/.test(value));}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const bool=(v:unknown,d:boolean)=>typeof v==='boolean'?v:d;
const number=(v:unknown,min:number,max:number,d:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):d;
const choice=<T extends string>(v:unknown,allowed:readonly T[],d:T):T=>allowed.includes(v as T)?v as T:d;
export function validatePreferences(value:unknown):Preferences{
 const v=object(value);if(v.version!==undefined&&v.version!==1)return {...defaults,favorites:[],shortcutOrder:[],shortcutNames:{}};
 const names:Record<string,string>={};for(const [key,name] of Object.entries(object(v.shortcutNames)).slice(0,40)){if(/^[\w -]{1,60}$/.test(key)&&typeof name==='string')names[key]=name.replace(/[\u0000-\u001f]/g,'').slice(0,32);}
 return {version:1,shell:choice(v.shell,['living','classic'],'living'),wallpaper:validWallpaper(v.wallpaper)?v.wallpaper:'original',mode:choice(v.mode,['enhanced','original'],'enhanced'),quality:choice(v.quality,['auto','static','low','balanced','high'],'auto'),motion:choice(v.motion,['system','reduced'],'system'),quiet:bool(v.quiet,false),brightness:number(v.brightness,60,130,100),dimming:number(v.dimming,0,60,8),saturation:number(v.saturation,0,160,100),blur:number(v.blur,0,12,0),speed:number(v.speed,0,100,35),parallax:number(v.parallax,0,30,12),particles:number(v.particles,0,60,24),fit:choice(v.fit,['cover','contain'],'cover'),focalX:number(v.focalX,0,100,50),focalY:number(v.focalY,0,100,50),glass:number(v.glass,92,100,94),solid:bool(v.solid,false),timeAtmosphere:bool(v.timeAtmosphere,false),layout:choice(v.layout,['grid','orbit'],'grid'),density:choice(v.density,['compact','comfortable','large'],'comfortable'),alignment:choice(v.alignment,['center','left'],'center'),leftHanded:bool(v.leftHanded,false),favorites:Array.isArray(v.favorites)?[...new Set(v.favorites.filter(validWallpaper))].slice(0,30):[],rotation:typeof v.rotation==='number'&&[0,5,15,30,60].includes(v.rotation)?v.rotation:0,accent:typeof v.accent==='string'&&/^#[0-9a-f]{6}$/i.test(v.accent)?'#'+[1,3,5].map(i=>Math.max(160,parseInt((v.accent as string).slice(i,i+2),16)).toString(16).padStart(2,'0')).join(''):'',profile:typeof v.profile==='string'?v.profile.slice(0,32):'Balanced',shortcutOrder:Array.isArray(v.shortcutOrder)?[...new Set(v.shortcutOrder.filter((s):s is string=>typeof s==='string'&&/^[\w -]{1,60}$/.test(s)))].slice(0,40):[],shortcutNames:names};
}
export function validateLegacy(value:unknown):LegacyAppearance{
 const v=object(value);return {theme:choice(v.theme,themeIds,'midnight'),wallpaper:choice(v.wallpaper,['stars','constellation','none',...photoIds,...movingWallpaperIds],'stars'),match:bool(v.match,true),moving:bool(v.moving,true),dense:bool(v.dense,false)};
}
export function readPreferences(storage:Pick<Storage,'getItem'>):Preferences{try{return validatePreferences(JSON.parse(storage.getItem(SETTINGS_KEY)||'{}'));}catch{return validatePreferences({});}}
export function captureOriginal(storage:Pick<Storage,'getItem'|'setItem'>,current:LegacyAppearance):LegacyAppearance{
 try{const saved=storage.getItem(ORIGINAL_KEY);if(saved){const parsed=JSON.parse(saved);if(parsed&&themeIds.includes(parsed.theme)&&validWallpaper(parsed.wallpaper))return validateLegacy(parsed);}const valid=validateLegacy(current);storage.setItem(ORIGINAL_KEY,JSON.stringify(valid));return valid;}catch{return validateLegacy(current);}
}
export function profile(name:'Original'|'Balanced'|'Immersive'|'Quiet',previous:Preferences):Preferences{
 const base={...previous,profile:name};
 if(name==='Original')return validatePreferences({...defaults,wallpaper:'original',mode:'original',quality:'static',profile:name,favorites:previous.favorites});
 if(name==='Quiet')return validatePreferences({...base,quiet:true,motion:'reduced',quality:'static',solid:true,layout:'grid'});
 if(name==='Immersive')return validatePreferences({...base,quiet:false,motion:'system',mode:'enhanced',quality:'balanced',solid:false,particles:32,parallax:18,speed:45,glass:94});
 return validatePreferences({...base,quiet:false,motion:'system',mode:'enhanced',quality:'auto',solid:false,particles:24,parallax:12,speed:35,glass:94,layout:'grid'});
}
export type Capabilities={reducedMotion:boolean;coarse:boolean;saveData:boolean;cores:number;slow?:boolean};
export function qualityBudget(p:Preferences,c:Capabilities){
 const q=p.mode==='original'||p.quiet||p.motion==='reduced'||c.reducedMotion?'static':p.quality==='auto'?(c.slow||c.coarse||c.saveData||c.cores<=4?'low':'balanced'):p.quality;
 return {tier:q,fps:q==='high'?40:q==='balanced'?24:q==='low'?15:0,dpr:q==='high'?1.5:1,particles:q==='static'?0:Math.min(p.particles,q==='high'?60:q==='balanced'?32:12),parallax:q==='static'||c.coarse?0:p.parallax,depth3d:q==='high'};
}
/** Pure allowlisted commands, deliberately not an AI model. Never evaluates imported text. */
export function personalize(text:string,p:Preferences):{label:string;next:Preferences}|null{
 const q=text.toLowerCase().trim().slice(0,300);let patch:Partial<Preferences>|null=null,label='';
 if(/original|my wallpaper/.test(q)){patch={wallpaper:'original',mode:'original',quality:'static'};label='Restore your original wallpaper, without effects';}
 else if(/calm.*space|space.*calm|orbit/.test(q)){patch={wallpaper:'deep-orbit',quality:'low',speed:20,particles:12,mode:'enhanced'};label='Deep Orbit · low motion · 12 particles';}
 else if(/less move|less motion|reduce motion|quiet|calm|ipad|lag/.test(q)){patch={quiet:true,quality:'static',solid:true,motion:'reduced'};label='Quiet mode · still wallpaper · solid surfaces';}
 else if(/bigger|larger|big buttons/.test(q)){patch={density:'large'};label='Larger shortcut buttons';}
 else if(/dark/.test(q)){patch={dimming:Math.min(60,p.dimming+12),glass:96};label='Dim wallpaper by 12 points · stronger local surfaces';}
 else if(/light|bright/.test(q)){patch={dimming:0,brightness:110};label='Brighter wallpaper · no dimming';}
 return patch?{label,next:validatePreferences({...p,...patch,profile:'Custom'})}:null;
}
export function exportAppearance(p:Preferences,legacy:LegacyAppearance){return JSON.stringify({format:'kkeep-appearance',version:1,preferences:validatePreferences(p),palette:validateLegacy(legacy),wallpaperFilesIncluded:false},null,2);}
export function importAppearance(text:string):{preferences:Preferences;palette:LegacyAppearance}{
 if(text.length>64000)throw new Error('Choose an appearance file smaller than 64 KB.');
 let data;try{data=JSON.parse(text);}catch{throw new Error('This is not a valid appearance file.');}
 if(data?.format!=='kkeep-appearance'||data.version!==1||!data.preferences||data.preferences.version!==1)throw new Error('This appearance format is not supported.');
 const allowed=new Set(Object.keys(defaults));if(Object.keys(data.preferences).some(k=>!allowed.has(k)))throw new Error('This file contains unsupported settings.');
 if(!validWallpaper(data.preferences.wallpaper))throw new Error('This wallpaper is not supported.');
 return {preferences:validatePreferences(data.preferences),palette:validateLegacy(data.palette)};
}
export function createWelcomeGate(){let shown=false;return {claim(){if(shown)return false;shown=true;return true;}};}
export function nextFavorite(current:string,favorites:string[]){const list=favorites.filter(validWallpaper);return list.length>1?list[(list.indexOf(current)+1)%list.length]:null;}
export function contrastAccent(accent:string,light:boolean){return light?'#'+[1,3,5].map(i=>Math.round(parseInt(accent.slice(i,i+2),16)*.38).toString(16).padStart(2,'0')).join(''):accent;}
