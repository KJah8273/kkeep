'use client';

import {unavailableMovieServers,movieServers,type MovieServerChoice} from '@/lib/movies';

export default function MovieServerSelect({value,onChange,autoLabel='Auto',label='Playback server'}:{value:MovieServerChoice;onChange:(value:MovieServerChoice)=>void;autoLabel?:string;label?:string}){
  return <label className="movie-server-select">Server
    <select aria-label={label} value={value} onChange={event=>onChange(event.target.value as MovieServerChoice)}>
      <option value="auto">{autoLabel}</option>
      <optgroup label="In Kkeep">{movieServers.map(server=><option key={server.id} value={server.id}>{server.label}</option>)}</optgroup>
      <optgroup label="Unavailable">{unavailableMovieServers.map(server=><option key={server.id} value={server.id} disabled>{server.label} · Unavailable</option>)}</optgroup>
    </select>
  </label>;
}
