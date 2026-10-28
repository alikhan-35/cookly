import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ResultsPage } from './pages/ResultsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { FridgePage } from './pages/FridgePage';

const RacionCatalogPage = lazy(() => import('./pages/RacionCatalogPage').then(module => ({ default: module.RacionCatalogPage })));
const RacionRecipePage = lazy(() => import('./pages/RacionRecipePage').then(module => ({ default: module.RacionRecipePage })));
const RacionCookingPage = lazy(() => import('./pages/RacionCookingPage').then(module => ({ default: module.RacionCookingPage })));

function RecipeLoading() {
  return <div className="container preview-state" role="status">Открываем рецепты…</div>;
}

function RetiredRecipe() {
  return <div className="container empty-state"><h1>Каталог обновился</h1><p>Этот рецепт из прежней домашней коллекции больше не участвует в подборе. Найдите подходящее блюдо в основном каталоге.</p><Link className="button primary" to="/catalog">Открыть каталог рецептов</Link></div>;
}

export function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<HomePage/>}/>
    <Route path="recipes" element={<ResultsPage/>}/>
    <Route path="catalog" element={<Suspense fallback={<RecipeLoading/>}><RacionCatalogPage/></Suspense>}/>
    <Route path="recipe/racion/:id" element={<Suspense fallback={<RecipeLoading/>}><RacionRecipePage/></Suspense>}/>
    <Route path="cook/racion/:id" element={<Suspense fallback={<RecipeLoading/>}><RacionCookingPage/></Suspense>}/>
    <Route path="recipe/:id" element={<RetiredRecipe/>}/>
    <Route path="cook/:id" element={<RetiredRecipe/>}/>
    <Route path="fridge" element={<FridgePage/>}/>
    <Route path="preview/racion" element={<Navigate to="/catalog" replace/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Route></Routes>;
}
