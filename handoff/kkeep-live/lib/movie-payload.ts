// Validate the fields rendered by Kkeep before accepting third-party JSON.
// A maintenance page or an unexpected object must not become a blank React page.
type RecordValue=Record<string,unknown>;
const record=(value:unknown):value is RecordValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
const positive=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const optionalText=(value:unknown)=>value==null||typeof value==='string';
const namedId=(value:unknown)=>record(value)&&positive(value.id)&&typeof value.name==='string';
const movie=(value:unknown)=>record(value)&&positive(value.id)
  &&['title','name','overview','poster_path','backdrop_path','release_date','first_air_date'].every(key=>optionalText(value[key]))
  &&(value.vote_average==null||typeof value.vote_average==='number'&&Number.isFinite(value.vote_average))
  &&(value.runtime==null||typeof value.runtime==='number'&&Number.isFinite(value.runtime))
  &&(value.genres==null||Array.isArray(value.genres)&&value.genres.every(namedId))
  &&(value.seasons==null||Array.isArray(value.seasons)&&value.seasons.every(s=>record(s)&&Number.isSafeInteger(s.season_number)&&optionalText(s.name)));

export function validMoviePayload(endpoint:string,value:unknown):boolean{
  if(!record(value)||value.error)return false;
  if(['trending','top-rated','discover','search'].includes(endpoint))return Array.isArray(value.results)&&value.results.every(movie);
  if(endpoint==='genres')return Array.isArray(value.genres)&&value.genres.every(namedId);
  if(endpoint==='info')return movie(value);
  if(endpoint==='season')return Array.isArray(value.episodes)&&value.episodes.every(ep=>record(ep)&&positive(ep.episode_number)&&typeof ep.name==='string'&&optionalText(ep.overview)&&optionalText(ep.still_path));
  if(['movybz-sources','shegu-sources','vixsrc-sources'].includes(endpoint))return Array.isArray(value.sources)&&value.sources.every(s=>record(s)&&typeof s.url==='string'&&optionalText(s.quality)&&optionalText(s.proxyUrl));
  return false;
}
