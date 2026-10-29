'use client'
import { useEffect,useId,useRef,useState,type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check,ChevronDown,Search,X } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import { useDropdownPosition } from './useComboboxPortal'
import type { SelectOption } from './CompactSelect'

type Props={value:string[];onValueChange:(value:string[])=>void;options:SelectOption[];'aria-label':string;id?:string;disabled?:boolean;placeholder?:string;className?:string}
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es')
/** Empty means no filter; required selections are validated by the consumer. */
export function MultiSelect({value,onValueChange,options,'aria-label':label,id,disabled=false,placeholder='Todos',className}:Props){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[index,setIndex]=useState(0),[inline,setInline]=useState(false)
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null),listId=useId()
 const expanded=open&&!disabled,position=useDropdownPosition(expanded,trigger,true),selected=[...new Set(value)]
 const filtered=options.filter(o=>normalize(`${o.label} ${o.description||''}`).includes(normalize(query)))
 const active=Math.max(0,Math.min(index,filtered.length-1)),enabled=filtered.filter(o=>!o.disabled)
 useEffect(()=>{
  if(!expanded)return
  const timer=window.setTimeout(()=>search.current?.focus(),0)
  const outside=(e:PointerEvent)=>{const target=e.target as Node;if(!trigger.current?.contains(target)&&!popup.current?.contains(target)){setOpen(false);setQuery('')}}
  const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setQuery('');trigger.current?.focus()}}
  document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true)
  return()=>{window.clearTimeout(timer);document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true)}
 },[expanded])
 useEffect(()=>{if(expanded)list.current?.children[active]?.scrollIntoView({block:'nearest'})},[active,expanded,query])
 function close(){setOpen(false);setQuery('');trigger.current?.focus()}
 function begin(){setInline(Boolean(trigger.current?.closest('[role="dialog"]')));setQuery('');setIndex(0);setOpen(true)}
 function toggle(option:SelectOption){if(!disabled&&!option.disabled)onValueChange(selected.includes(option.value)?selected.filter(v=>v!==option.value):[...selected,option.value])}
 function move(direction:number){let next=active+direction;while(next>=0&&next<filtered.length){if(!filtered[next].disabled){setIndex(next);return}next+=direction}}
 function keys(e:KeyboardEvent){
  if(disabled)return
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(e.currentTarget===search.current)setIndex(Math.max(0,e.key==='ArrowDown'?filtered.findIndex(o=>!o.disabled):filtered.findLastIndex(o=>!o.disabled)));else move(e.key==='ArrowDown'?1:-1);list.current?.focus()}
  else if(e.currentTarget===search.current&&e.key==='Enter'){e.preventDefault();if(filtered[active])toggle(filtered[active])}
  else if(e.currentTarget===list.current){
   if(e.key===' '||e.key==='Enter'){e.preventDefault();if(filtered[active])toggle(filtered[active])}
   if(e.key==='Home'){e.preventDefault();setIndex(Math.max(0,filtered.findIndex(o=>!o.disabled)))}
   if(e.key==='End'){e.preventDefault();setIndex(Math.max(0,filtered.findLastIndex(o=>!o.disabled)))}
   if(e.key.length===1&&e.key!==' '&&!e.ctrlKey&&!e.metaKey){const next=filtered.findIndex(o=>!o.disabled&&normalize(o.label).startsWith(normalize(e.key)));if(next>=0)setIndex(next)}
  }
 }
 const panel=<div ref={popup} data-multi-select-panel="" onKeyDown={e=>{
  if(e.key==='Tab'&&((e.shiftKey&&e.target===search.current)||(!e.shiftKey&&(e.target as HTMLElement).dataset.multiClose==='true')))close()
 }} style={inline?{position:'absolute',top:position.above?undefined:'calc(100% + 6px)',bottom:position.above?'calc(100% + 6px)':undefined,left:0,width:'100%',maxHeight:Math.min(360,position.maxHeight),zIndex:9999}:{position:'absolute',top:position.top,left:position.left,width:position.width,maxWidth:'28rem',maxHeight:Math.min(360,position.maxHeight),transform:position.above?'translateY(-100%)':undefined,visibility:position.width?'visible':'hidden',zIndex:9999}}
  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
  <div className="mb-1 flex shrink-0 items-center gap-2 border-b border-slate-100 px-2 py-2 dark:border-slate-800"><Search aria-hidden="true" className="h-4 w-4 text-slate-400"/><input ref={search} type="search" autoComplete="off" aria-label={`Buscar: ${label}`} aria-controls={listId} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} onKeyDown={keys} placeholder="Buscar…" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></div>
  <ul ref={list} id={listId} role="listbox" aria-label={label} aria-multiselectable="true" aria-activedescendant={filtered[active]?`${listId}-${active}`:undefined} tabIndex={0} onKeyDown={keys} className="min-h-0 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
   {filtered.map((option,i)=><li id={`${listId}-${i}`} key={option.value} role="option" aria-selected={selected.includes(option.value)} aria-disabled={option.disabled||undefined} onPointerMove={()=>{if(!option.disabled)setIndex(i)}} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle(option)} className={cn('flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 text-sm',option.disabled?'cursor-not-allowed text-slate-400':'cursor-pointer',i===active&&!option.disabled&&'bg-rose-50 dark:bg-rose-950/40')}>
    <span aria-hidden="true" className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',selected.includes(option.value)?'border-[#B3282D] bg-[#B3282D] text-white':'border-slate-300 dark:border-slate-600')}>{selected.includes(option.value)&&<Check className="h-3 w-3"/>}</span><span className="min-w-0 break-words">{option.label}{option.description&&<span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>}</span>
   </li>)}
  </ul>
  {!filtered.length&&<p role="status" className="p-3 text-sm text-slate-500">Sin resultados.</p>}
  <div className="mt-1 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-2 text-xs dark:border-slate-800"><button type="button" disabled={!enabled.length} onClick={()=>onValueChange([...new Set([...selected,...enabled.map(o=>o.value)])])} className="rounded px-1 py-1 font-medium text-[#B3282D] disabled:opacity-40 dark:text-rose-300">Seleccionar resultados</button><button type="button" disabled={!selected.length} onClick={()=>onValueChange([])} className="rounded px-1 py-1 text-slate-500 disabled:opacity-40">Limpiar</button><button data-multi-close="true" type="button" onClick={close} className="rounded px-2 py-1 font-medium">Cerrar</button></div>
 </div>
 return <div className={cn('relative w-full min-w-0 max-w-md',className)}>
  <button ref={trigger} id={id} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded?listId:undefined} disabled={disabled} onClick={()=>expanded?close():begin()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();begin()}}} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm font-normal text-slate-900 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><span className="min-w-0 truncate">{selected.length===1?options.find(o=>o.value===selected[0])?.label||'Selección no disponible':selected.length?`${selected.length} seleccionados`:placeholder}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0"/></button>
  {!!selected.length&&<div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Seleccionados: ${label}`}>{selected.slice(0,2).map(v=><span key={v} className="inline-flex max-w-full items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-[#B3282D] dark:bg-rose-950/40 dark:text-rose-200"><span className="truncate">{options.find(o=>o.value===v)?.label||'Selección no disponible'}</span><button type="button" disabled={disabled} aria-label={`Quitar ${options.find(o=>o.value===v)?.label||'selección no disponible'}`} onClick={()=>onValueChange(selected.filter(item=>item!==v))} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"><X aria-hidden="true" className="h-3 w-3"/></button></span>)}{selected.length>2&&<span className="px-1 py-1 text-xs text-slate-500">+{selected.length-2}</span>}</div>}
  {expanded&&(inline?panel:createPortal(panel,document.body))}
 </div>
}
