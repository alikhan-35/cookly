import { ArrowUpRight, Heart, Leaf } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Logo } from './Logo';
import { ProfileSettings } from './ProfileSettings';
import { useState } from 'react';
import { AnalyticsSettingsButton } from './AnalyticsConsentBanner';

export function Layout() {
  const [profileOpen, setProfileOpen] = useState(false);
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    else { window.scrollTo(0, 0); document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }); }
  }, [pathname, hash]);
  return <>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); const main = document.getElementById('main'); main?.focus(); main?.scrollIntoView(); }}>Перейти к содержимому</a>
    <header className="site-header"><div className="container header-inner">
      <Link to="/" aria-label="Cookly — на главную"><Logo /></Link>
      <nav aria-label="Основная навигация"><NavLink to="/" end>Главная</NavLink><NavLink to="/fridge">Мой холодильник</NavLink><Link to="/#how-it-works">Как это работает</Link></nav>
      <div className="header-actions"><button className="profile-button" onClick={() => setProfileOpen(true)}>Мой профиль</button><Link className="header-cta" to="/#pantry">Начнём готовить <ArrowUpRight size={16}/></Link></div>
    </div></header>
    <main id="main" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer container">
      <Link to="/" aria-label="Cookly — на главную"><Logo compact /></Link>
      <span>Меньше раздумий. Больше домашнего.</span>
      <AnalyticsSettingsButton />
      <span className="footer-made">С заботой о вашей кухне <Heart size={14}/></span>
    </footer>
    {profileOpen && <ProfileSettings onClose={() => setProfileOpen(false)}/>}
  </>;
}
export function Eyebrow({ children }: { children: React.ReactNode }) { return <span className="eyebrow"><Leaf size={14}/>{children}</span>; }
