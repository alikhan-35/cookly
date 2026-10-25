import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ResultsPage } from './pages/ResultsPage';
import { RecipePage } from './pages/RecipePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CookingModePage } from './pages/CookingModePage';
import { FridgePage } from './pages/FridgePage';

const RacionCatalogPage = lazy(() => import('./pages/RacionCatalogPage').then(module => ({ default: module.RacionCatalogPage })));
const RacionRecipePage = lazy(() => import('./pages/RacionRecipePage').then(module => ({ default: module.RacionRecipePage })));
const RacionCookingPage = lazy(() => import('./pages/RacionCookingPage').then(module => ({ default: module.RacionCookingPage })));

function RecipeLoading() {
  return <div className="container preview-state" role="status">Открываем рецепты…</div>;
}

export function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<HomePage/>}/>
    <Route path="recipes" element={<ResultsPage/>}/>
    <Route path="catalog" element={<Suspense fallback={<RecipeLoading/>}><RacionCatalogPage/></Suspense>}/>
    <Route path="recipe/racion/:id" element={<Suspense fallback={<RecipeLoading/>}><RacionRecipePage/></Suspense>}/>
    <Route path="cook/racion/:id" element={<Suspense fallback={<RecipeLoading/>}><RacionCookingPage/></Suspense>}/>
    <Route path="recipe/:id" element={<RecipePage/>}/>
    <Route path="cook/:id" element={<CookingModePage/>}/>
    <Route path="fridge" element={<FridgePage/>}/>
    <Route path="preview/racion" element={<Navigate to="/catalog" replace/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Route></Routes>;
}
