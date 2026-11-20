import {searchMetadata} from '@/lib/search-metadata';
import MovieCatalog from '@/components/movie-catalog';
import './movies.css';
export const metadata = searchMetadata('/movies', 'Movie · Kkeep fun', 'Browse movies and TV shows, search titles, and find something to watch on Kkeep fun.');
export default function MoviesPage(){return <MovieCatalog/>;}
