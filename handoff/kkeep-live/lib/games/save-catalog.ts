import {linkedGames,type LinkedGame} from './linked-games.ts';
export type SavedGame={loadingCover?:string;slug:string;name:string;entry:string;fallbackEntry?:string;frameEntry?:string;origins:string[];quality?:boolean;controls?:boolean;external?:boolean;gameOnly?:boolean;startup?:LinkedGame['startup'];underReview?:boolean};
const local:SavedGame[]=[
 {slug:'how-to-fish',name:'How to Fish',entry:'/games/how-to-fish/index.html',origins:[]},
 {slug:'idle-mining-empire',name:'Idle Mining Empire',entry:'/games/idle-mining-empire/index.html',origins:[]},
 {slug:'geometry-dash',name:'Geometry Dash',entry:'/games/geometry-dash/index.html',origins:[]},
 {slug:'stick-war-legacy',name:'Stick War: Legacy',entry:'/games/stick-war-legacy/index.html',origins:[]},
 {slug:'subway-surfers',name:'Subway Surfers',entry:'/games/subway-surfers/index.html',origins:[]},
 {slug:'solar-smash',name:'Solar Smash',entry:'/games/solar-smash/index.html',origins:[]},
 {slug:'kick-the-buddy',name:'Kick the Buddy',entry:'/games/kick-the-buddy/index.html',origins:[]},
 {slug:'bad-piggies',name:'Bad Piggies',entry:'/games/bad-piggies/player.html',origins:[],quality:true},
 {slug:'trees-hate-you',name:'Trees Hate You',entry:'/games/trees-hate-you/player.html',origins:[],quality:true,controls:true},
 {slug:'angry-birds',name:'Angry Birds',entry:'/games/angry-birds/player.html',origins:[]},
 {slug:'stickman-duel',name:'Stickman Duel',entry:'/games/stickman-duel/player.html',origins:[],quality:true},
];
export const savedGames:SavedGame[]=[...linkedGames.map(g=>({slug:g.slug,name:g.name,loadingCover:g.loadingCover,entry:g.entry||g.url,fallbackEntry:g.fallbackEntry,frameEntry:g.frameEntry,origins:g.directAssets?[]:[new URL(g.url).origin,...g.assetOrigins||[]],gameOnly:g.gameOnly,startup:g.startup,underReview:g.underReview,external:g.external||g.slug==='blumgi-paintball'})),...local];
const savesBySlug=new Map(savedGames.map(game=>[game.slug,game]));
export const findSavedGame=(slug:string)=>savesBySlug.get(slug);
