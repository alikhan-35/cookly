import { createContext, useContext, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearCooklyData } from '../utils/storage';
import { trackEvent } from '../utils/analytics';
import { useToast } from './useToast';

const Context = createContext<(() => void) | null>(null);
export function ResetDataProvider({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  function reset() {
    // The reset action is observable before deletion; the resulting analytics store is empty.
    trackEvent('test_data_reset');
    const cleared = clearCooklyData();
    navigate('/', { replace: true });
    setGeneration(value => value + 1);
    toast(cleared ? 'Данные Cookly сброшены' : 'Текущие данные сброшены. Браузер не разрешил очистить сохранённые данные.');
  }
  return <Context.Provider value={reset}><div key={generation} className="app-session">{children}</div></Context.Provider>;
}
export function useResetData() { const reset = useContext(Context); if (!reset) throw new Error('ResetDataProvider required'); return reset; }
