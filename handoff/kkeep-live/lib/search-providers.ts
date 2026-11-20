export type SearchProvider = 'brave' | 'google' | 'duckduckgo';
export const defaultSearchProvider: SearchProvider = 'brave';
export const searchProviderKey = 'kkeep-search-provider-v1';
export const searchProviders = [
  {id:'brave',name:'Brave',icon:'/icons/search-brave.png',url:'https://search.brave.com/search'},
  {id:'google',name:'Google',icon:'/icons/search-google.ico',url:'https://www.google.com/search'},
  {id:'duckduckgo',name:'DuckDuckGo',icon:'/icons/search-duckduckgo.png',url:'https://duckduckgo.com/?kp=1'},
] as const;

export function isSearchProvider(value:unknown):value is SearchProvider {
  return searchProviders.some(provider=>provider.id===value);
}
export function readSearchProvider(value?:string|null):SearchProvider {
  if(isSearchProvider(value))return value;
  try{const saved=localStorage.getItem(searchProviderKey);if(isSearchProvider(saved))return saved;}catch{}
  return defaultSearchProvider;
}
export function saveSearchProvider(value:SearchProvider) {
  try{localStorage.setItem(searchProviderKey,value);}catch{}
}
export function searchUrl(query:string,provider:SearchProvider=defaultSearchProvider):string {
  const selected=searchProviders.find(item=>item.id===provider)??searchProviders[0];
  const url=new URL(selected.url);
  url.searchParams.set('q',query);
  return url.href;
}
