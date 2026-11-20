import type {Metadata} from 'next';
import SportsCatalog from '@/components/sports-catalog';
import '../movies/movies.css';
import './sports.css';
export const metadata:Metadata={title:'Live Sports · Kkeep',description:'Football, UFC, basketball and more. Browse live matches and upcoming sports events in Kkeep.'};
export default function SportsPage(){return <SportsCatalog/>;}
