import KkeepMenu from "@/components/kkeep-menu";
import {searchMetadata, SITE_NAME, SITE_DESCRIPTION, SITE_URL} from '@/lib/search-metadata';
import "./menu.css";
import "./menu-black.css";
export const metadata = searchMetadata('/', SITE_NAME, SITE_DESCRIPTION);
export default function Home(){return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:SITE_NAME,alternateName:['Kkeep','kkeep.fun'],url:SITE_URL+'/'})}}/><KkeepMenu/></>;}
