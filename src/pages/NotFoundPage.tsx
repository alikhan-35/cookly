import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CookingPot } from 'lucide-react';
export function NotFoundPage() { useEffect(() => { document.title = 'Страница не найдена — Cookly'; }, []); return <div className="container empty-state"><CookingPot size={44}/><h1>Кажется, здесь ничего не готовится</h1><p>Такой страницы нет. Вернёмся на кухню?</p><Link className="button primary" to="/">На главную</Link></div>; }
