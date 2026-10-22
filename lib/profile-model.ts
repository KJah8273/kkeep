import {validatePreferences,validateLegacy,type Preferences,type LegacyAppearance} from './living-space/model.ts';
export function username(value:unknown){
 if(typeof value!=='string')throw Error('Enter a username.');
 const name=value.normalize('NFKC').trim();
 if(!/^[a-zA-Z0-9\u0621-\u063a\u0641-\u064a_. -]{3,24}$/.test(name))throw Error('Use 3–24 Arabic or English letters, numbers, spaces, _ or .');
 const normalized=name.toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ ._-]/g,'');
 const folded=normalized.replace(/[013457@]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a'}[c]!)).replace(/(.)\1{2,}/g,'$1$1');
 if(/fuck|fuk|shit|sh1t|bitch|b1tch|cunt|nigg|pussy|asshole|motherf|كسخت|كسام|كسم|قحبه|قحبة|شرموط|منيوك|زبي|زبك|خرا|نيك/.test(folded)||/^(dick|cock|ass|كس|زب|طيز)$/.test(folded))throw Error('Choose a different username.');
 return {name,key:normalized};
}
export type ProfileSnapshot={version:1;preferences:Preferences;legacy:LegacyAppearance;original:LegacyAppearance};
export function snapshot(value:unknown):ProfileSnapshot{
 const v=value as Partial<ProfileSnapshot>;
 if(!v||v.version!==1||!v.preferences||!v.legacy||!v.original||JSON.stringify(v).length>64000)throw Error('Invalid profile data.');
 return {version:1,preferences:validatePreferences(v.preferences),legacy:validateLegacy(v.legacy),original:validateLegacy(v.original)};
}
