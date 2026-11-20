import {apps} from '@/lib/apps';
export const shortcutItems=[...apps.filter(a=>a.cloud!=='clash').map(a=>({id:a.name,name:a.name})),{id:'Games',name:'Games'},{id:'4 players',name:'4 players'},{id:'Hgola',name:'هجولة الطارة'},{id:'Stick Fight',name:'Stick Fight'}];
export function orderedShortcuts(order:string[]){return [...shortcutItems].sort((a,b)=>{const rank=(id:string)=>order.includes(id)?order.indexOf(id):order.length+shortcutItems.findIndex(x=>x.id===id);return rank(a.id)-rank(b.id);});}
