import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ResultsPage } from './pages/ResultsPage';
import { RecipePage } from './pages/RecipePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CookingModePage } from './pages/CookingModePage';
import { FridgePage } from './pages/FridgePage';

export function App() {
  return <Routes><Route element={<Layout />}><Route index element={<HomePage/>}/><Route path="recipes" element={<ResultsPage/>}/><Route path="recipe/:id" element={<RecipePage/>}/><Route path="cook/:id" element={<CookingModePage/>}/><Route path="fridge" element={<FridgePage/>}/><Route path="*" element={<NotFoundPage/>}/></Route></Routes>;
}
