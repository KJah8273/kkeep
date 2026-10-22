'use client';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {themes,isThemeId,type ThemeId} from '@/lib/themes';
export default function ThemePicker({value,onChange}:{value:ThemeId|'';onChange:(id:ThemeId)=>void}){
  return <section className="theme-section" aria-labelledby="themes-heading"><h3 id="themes-heading">Color palette</h3>
    <RadioGroup className="theme-grid" value={value} onValueChange={id=>{if(isThemeId(id))onChange(id);}} aria-labelledby="themes-heading">
      {themes.map(theme=><label className={'theme-choice '+(value===theme.id?'selected':'')} key={theme.id}>
        <span className="theme-sample" aria-hidden="true" style={{background:'radial-gradient(ellipse at 85% 0%, '+theme.accent+'44, transparent 75%), '+theme.background}}><strong style={{color:theme.text}}>kkeep</strong><span style={{background:theme.surface,borderColor:theme.raised}}/><i style={{background:theme.accent}}/></span>
        <span className="theme-choice-label"><RadioGroupItem value={theme.id}/>{theme.name}</span>
      </label>)}
    </RadioGroup>
  </section>;
}
