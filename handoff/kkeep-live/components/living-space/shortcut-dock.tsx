'use client';
import {Children,isValidElement,type ReactNode} from 'react';
import {orderedShortcuts} from '@/lib/living-space/shortcuts';
export function ShortcutSlot({children}:{id:string;children:ReactNode}){return children;}
export default function ShortcutDock({order,children}:{order:string[];children:ReactNode}){
 const ids=orderedShortcuts(order).map(x=>x.id);
 const items=Children.toArray(children).sort((a,b)=>{const rank=(v:ReactNode)=>isValidElement<{id:string}>(v)?ids.indexOf(v.props.id):99;return rank(a)-rank(b);});
 return <nav className="home-shortcuts" aria-label="Apps">{items}</nav>;
}
