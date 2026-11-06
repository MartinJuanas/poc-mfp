import { useEffect, useState } from 'react';
const key = 'misfinanzas-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
function saved() { try { const value=localStorage.getItem(key);return ['light','dark'].includes(value) ? value : 'system'; } catch { return 'system'; } }
export function initializeTheme() {
  const preference=saved();
  document.documentElement.dataset.theme=preference==='system' ? media().matches ? 'dark' : 'light' : preference;
}
export default function useTheme() {
  const [preference,setPreference]=useState(saved);
  const [systemDark,setSystemDark]=useState(()=>media().matches);
  const theme=preference==='system' ? systemDark ? 'dark' : 'light' : preference;
  useEffect(()=>{const m=media();const change=e=>setSystemDark(e.matches);m.addEventListener('change',change);const sync=()=>setPreference(saved());window.addEventListener('storage',sync);return()=>{m.removeEventListener('change',change);window.removeEventListener('storage',sync);};},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  function toggle(){const next=theme==='dark'?'light':'dark';setPreference(next);try{localStorage.setItem(key,next);}catch{/* works for the current session */}}
  return {theme,toggle};
}
