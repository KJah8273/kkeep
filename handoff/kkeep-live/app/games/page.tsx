import KkeepMenu from '@/components/kkeep-menu';
import {searchMetadata} from '@/lib/search-metadata';
import '../menu.css';
import "../menu-black.css";

export const metadata = searchMetadata('/games', 'Games · Kkeep fun', 'Browse and play games on Kkeep fun, including racing, action, puzzle, and multiplayer games.');
export default function GamesPage(){return <KkeepMenu initialRoute="games"/>;}
