import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { PantryProvider } from './hooks/usePantry';
import { ProfileProvider } from './hooks/useProfile';
import './styles.css';
import './fridge.css';
import './enhancements.css';
import './recipe-fix.css';
import { FridgeProvider } from './hooks/useFridge';
import { ToastProvider } from './hooks/useToast';
import { ResetDataProvider } from './hooks/useResetData';
import { RecipeSessionProvider } from './hooks/useRecipeSession';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter><ToastProvider><ResetDataProvider><ProfileProvider><FridgeProvider><PantryProvider><RecipeSessionProvider><App /></RecipeSessionProvider></PantryProvider></FridgeProvider></ProfileProvider></ResetDataProvider></ToastProvider></HashRouter>,
);
