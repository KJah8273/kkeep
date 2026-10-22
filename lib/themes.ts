import {photoWallpapers,type PhotoWallpaper} from '@/lib/wallpapers';

export const themes = [
  {id:'midnight',name:'Midnight',background:'#060608',surface:'#101014',raised:'#202027',text:'#f4f3f8',muted:'#aaa8b7',accent:'#c8bcff',ink:'#201633'},
  {id:'aurora',name:'Aurora',background:'#101525',surface:'#1a2134',raised:'#29334b',text:'#f0f8ff',muted:'#adbcd4',accent:'#80e9d2',ink:'#07332c'},
  {id:'mint',name:'Mint',background:'#0e1110',surface:'#191e1b',raised:'#232b26',text:'#f1f7f3',muted:'#a7b7ad',accent:'#6be3a2',ink:'#092317'},
  {id:'glacier',name:'Glacier',background:'#0b121b',surface:'#142131',raised:'#203149',text:'#eef6ff',muted:'#a5bbd1',accent:'#80c5ff',ink:'#0b243b'},
  {id:'orchid',name:'Orchid',background:'#15101d',surface:'#241b30',raised:'#342641',text:'#f7f0ff',muted:'#c0adc9',accent:'#c9a0ff',ink:'#291342'},
  {id:'ember',name:'Ember',background:'#17110f',surface:'#291e19',raised:'#3a2b23',text:'#fff4ed',muted:'#c8b1a2',accent:'#ffb07b',ink:'#3b1c0a'},
  {id:'rose',name:'Rose',background:'#190f17',surface:'#2b1a27',raised:'#40283a',text:'#fff0fa',muted:'#c7a9bd',accent:'#f49bc7',ink:'#3b102a'},
  {id:'daylight',name:'Daylight',background:'#f3f6fa',surface:'#ffffff',raised:'#e7edf5',text:'#182435',muted:'#526279',accent:'#305bd4',ink:'#ffffff'},
  {id:'electric',name:'Electric Blue',background:'#163bc0',surface:'#103095',raised:'#09246e',text:'#ffffff',muted:'#d6e8ff',accent:'#7cffee',ink:'#063e45'},
  {id:'candy',name:'Candy Pink',background:'#a51370',surface:'#830d58',raised:'#62063e',text:'#ffffff',muted:'#ffe0f3',accent:'#ffed73',ink:'#4d3200'},
  {id:'violet',name:'Vivid Violet',background:'#672bc2',surface:'#502095',raised:'#39146d',text:'#ffffff',muted:'#efddff',accent:'#98ffbb',ink:'#0b4626'},
  {id:'ocean',name:'Ocean Teal',background:'#006d77',surface:'#00515b',raised:'#003e48',text:'#ffffff',muted:'#ccfaff',accent:'#ffda73',ink:'#493000'},
  {id:'sunset',name:'Sunset Orange',background:'#ad3913',surface:'#872706',raised:'#661c03',text:'#ffffff',muted:'#ffead6',accent:'#fff17b',ink:'#493400'},
  {id:'cherry',name:'Cherry Red',background:'#ad123e',surface:'#880d31',raised:'#650821',text:'#ffffff',muted:'#ffe1e8',accent:'#8feaff',ink:'#083c4a'},
] as const;

export type ThemeId = typeof themes[number]['id'];
export type Wallpaper='stars'|'constellation'|'none'|PhotoWallpaper['id'];
export const defaultTheme:ThemeId='midnight';
export function isWallpaper(value:unknown):value is Wallpaper{return value==='stars'||value==='constellation'||value==='none'||photoWallpapers.some(wallpaper=>wallpaper.id===value);}
export function isThemeId(value:unknown):value is ThemeId {
  return themes.some(theme=>theme.id===value);
}
export function resolveAppearance(id:ThemeId,wallpaper:Wallpaper='stars',matchWallpaper=true){
  const theme=themes.find(item=>item.id===id)!;
  const photo=matchWallpaper?photoWallpapers.find(item=>item.id===wallpaper):undefined;
  return {
    colors:photo?.colors??{...theme,highlight:theme.accent},
    colorScheme:photo||id!=='daylight'?'dark':'light',
    colorSource:photo?'wallpaper':'theme',
  } as const;
}

export function applyTheme(id:ThemeId,wallpaper:Wallpaper='stars',matchWallpaper=true) {
  const appearance=resolveAppearance(id,wallpaper,matchWallpaper);
  const root=document.documentElement;
  root.dataset.kkeepTheme=id;
  root.dataset.kkeepColorSource=appearance.colorSource;
  root.style.colorScheme=appearance.colorScheme;
  for(const key of ['background','surface','raised','text','muted','accent','ink','highlight'] as const) {
    root.style.setProperty('--kk-'+key,appearance.colors[key]);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',appearance.colors.background);
}
