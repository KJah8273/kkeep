export const GAME_LIBRARY_KEY='kkeep-menu-library-v1';
export type GameLibrary={favorites:string[];recent:string[]};
const cleanIds=(value:unknown,allowed:readonly string[],limit:number)=>Array.isArray(value)
  ? [...new Set(value.filter((id):id is string=>typeof id==='string'&&allowed.includes(id)))].slice(0,limit)
  : [];

export function parseGameLibrary(raw:string|null,allowed:readonly string[]):GameLibrary{
  try{
    const value=JSON.parse(raw||'{}');
    return {favorites:cleanIds(value?.favorites,allowed,100),recent:cleanIds(value?.recent,allowed,12)};
  }catch{return {favorites:[],recent:[]};}
}

export function rememberGame(library:GameLibrary,id:string):GameLibrary{
  return {...library,recent:[id,...library.recent.filter(item=>item!==id)].slice(0,12)};
}

export function favoriteGame(library:GameLibrary,id:string):GameLibrary{
  return {...library,favorites:library.favorites.includes(id)
    ? library.favorites.filter(item=>item!==id)
    : [id,...library.favorites].slice(0,100)};
}
