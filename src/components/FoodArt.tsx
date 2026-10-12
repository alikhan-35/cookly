import { useId } from 'react';
import type { FoodVisual } from '../types';

// Original, fully local vector food illustrations. No image service or network needed.
export function FoodArt({ kind = 'salad', hero = false }: { kind?: FoodVisual; hero?: boolean }) {
  const id = useId().replace(/:/g, '');
  const greens = ['#648449', '#859f5c', '#3f6b46', '#afbc77'];
  const isGreen = kind === 'salad' || hero;
  const isRice = kind === 'rice';
  const isSoup = kind === 'soup' || kind === 'stew';
  return <svg className={`food-art ${hero ? 'food-art-hero' : ''}`} viewBox="0 0 480 360" role="img" aria-label={hero ? 'Иллюстрация свежего домашнего салата на керамической тарелке' : 'Иллюстрация домашнего блюда'}>
    <defs>
      <radialGradient id={`${id}-plate`}><stop offset="0" stopColor="#fffdf7"/><stop offset=".78" stopColor="#f8f5e9"/><stop offset=".84" stopColor="#e4ddcb"/><stop offset=".90" stopColor="#faf8ee"/><stop offset="1" stopColor="#e6e1d5"/></radialGradient>
      <radialGradient id={`${id}-yolk`}><stop offset="0" stopColor="#ffcf56"/><stop offset="1" stopColor="#e49a20"/></radialGradient>
      <linearGradient id={`${id}-food`} x2="1" y2="1"><stop stopColor="#eac080"/><stop offset="1" stopColor="#b96e3b"/></linearGradient>
      <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="2" dy="13" stdDeviation="12" floodColor="#69513c" floodOpacity=".19"/></filter>
      <filter id={`${id}-tiny`}><feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#493521" floodOpacity=".18"/></filter>
    </defs>
    <path d="M47 49 121 21 214 327 136 354Z" fill="#e4c5ab" opacity=".45"/>
    <path d="m66 44 85 286m-66-292 85 286m-67-292 85 286" stroke="#f4e2cf" strokeWidth="3" opacity=".7"/>
    <g transform="rotate(-17 239 180)">
      <circle cx="246" cy="179" r="150" fill={`url(#${id}-plate)`} filter={`url(#${id}-shadow)`}/>
      <circle cx="246" cy="179" r="122" fill={isSoup ? '#ce793f' : isGreen ? '#f1eccf' : '#edddbd'} stroke="#d9d1b8" strokeWidth="1"/>
      {isGreen && Array.from({ length: 29 }, (_, i) => {
        const angle = i * 2.4; const radius = 20 + ((i * 37) % 88); const x = 246 + Math.cos(angle) * radius; const y = 179 + Math.sin(angle) * radius;
        return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 49})`} filter={`url(#${id}-tiny)`}><path d="M-7 26C-37 5-20-28 0-31 30-19 26 15 4 28Z" fill={greens[i % 4]}/><path d="M0 25V-21m0 26L-15-5M0 12 14-4" stroke="#e0e6a1" strokeWidth="1.2" opacity=".55"/></g>;
      })}
      {kind === 'pasta' && Array.from({ length: 31 }, (_, i) => <path key={i} d="M-16-8Q2-23 17-4T-7 17" transform={`translate(${246 + Math.cos(i * 2.4) * (20 + i * 2.7)} ${179 + Math.sin(i * 2.4) * (20 + i * 2.7)}) rotate(${i * 39})`} fill="none" stroke={i % 2 ? '#e9ba6b' : '#f7d599'} strokeWidth="10" strokeLinecap="round"/>)}
      {isRice && Array.from({ length: 100 }, (_, i) => <ellipse key={i} cx={246 + Math.cos(i * 2.4) * (12 + ((i * 19) % 98))} cy={179 + Math.sin(i * 2.4) * (12 + ((i * 19) % 98))} rx="7" ry="2.5" transform={`rotate(${i * 13} 246 179)`} fill={['#f7e9bf', '#e6c687', '#fff2d4'][i % 3]}/>)}
      {(kind === 'potato' || kind === 'chicken' || kind === 'pancake') && Array.from({ length: kind === 'pancake' ? 6 : 12 }, (_, i) => {
        const angle = i * 2.4, r = 18 + (i * 19) % 74;
        return <g key={i} transform={`translate(${246 + Math.cos(angle) * r} ${179 + Math.sin(angle) * r}) rotate(${i * 48})`} filter={`url(#${id}-tiny)`}>
          <rect x="-29" y="-20" width={kind === 'pancake' ? 66 : 56} height={kind === 'pancake' ? 55 : 37} rx={kind === 'pancake' ? 25 : 13} fill={`url(#${id}-food)`}/><path d="m-18-6 32 4m-30 6 25 3" stroke="#a65f35" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
        </g>;
      })}
      {isSoup && Array.from({ length: 22 }, (_, i) => <rect key={i} x={237 + Math.cos(i * 2.4) * (15 + (i * 17) % 90)} y={172 + Math.sin(i * 2.4) * (15 + (i * 17) % 90)} width="16" height="13" rx="5" fill={['#eac78a', '#dd9a50', '#9ba268'][i % 3]}/>)}
      {(isGreen || kind === 'pasta' || kind === 'egg' || kind === 'chicken') && [0, 1, 2, 3, 4].map(i => <g key={i} transform={`translate(${246 + Math.cos(i * 1.3) * 85} ${179 + Math.sin(i * 1.3) * 82}) rotate(${i * 62})`} filter={`url(#${id}-tiny)`}><ellipse rx="21" ry="17" fill="#c74b32"/><ellipse rx="17" ry="13" fill="#e16c47"/><path d="M-12 0H12M0-9V9" stroke="#f1a278" strokeWidth="2"/><ellipse cx="-7" cy="-5" rx="3" ry="1.5" fill="#f5cc92"/><ellipse cx="7" cy="5" rx="3" ry="1.5" fill="#f5cc92"/></g>)}
      {(hero || kind === 'egg') && [0, 1].map(i => <g key={i} transform={`translate(${i ? 267 : 206} ${i ? 220 : 134}) rotate(${i ? 29 : -24})`} filter={`url(#${id}-tiny)`}><path d="M-35 12C-51-14-23-44 5-35 27-45 45-22 36 5 47 35 9 43-15 33-29 40-43 30-35 12" fill="#fffcdf"/><circle r="20" fill={`url(#${id}-yolk)`}/><path d="M-10-8q6-8 16-2" stroke="#ffe59a" strokeWidth="3" fill="none" strokeLinecap="round"/></g>)}
      {isGreen && [0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={190 + (i * 39) % 107} y={110 + (i * 53) % 145} width="16" height="16" rx="3" fill="#fff6d5" transform={`rotate(${i * 12} 246 179)`} filter={`url(#${id}-tiny)`}/>)}
      {Array.from({ length: 19 }, (_, i) => <ellipse key={i} cx={246 + Math.cos(i * 2.4) * ((i * 23) % 107)} cy={179 + Math.sin(i * 2.4) * ((i * 23) % 107)} rx="2" ry="1" fill="#5a593c" transform={`rotate(${i * 14} 246 179)`}/>)}
      {!isGreen && <g transform="translate(274 174)"><path d="M0 26Q-22 2-12-19 11-15 4 7 20-23 33-11 33 9 7 15" fill="#58784a"/><path d="m1 27 7-27" stroke="#bdcc89" strokeWidth="1.5"/></g>}
    </g>
    <g fill="none" stroke="#779064" strokeLinecap="round"><path d="M392 299q19-39 49-48" strokeWidth="3"/><path d="M405 278q-20-25-23-7t23 7m9-13q-10-28 4-25t-4 25m12-6q22 4 23-8t-23 8" fill="#8eaa77" strokeWidth="1"/></g>
  </svg>;
}
