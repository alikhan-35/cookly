import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

const ToastContext = createContext<{ toast: (message: string) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((value: string) => {
    clearTimeout(timer.current);
    setMessage(value);
    timer.current = setTimeout(() => setMessage(''), 5500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToastContext.Provider value={{ toast }}>{children}<div className="toast-region" role="status" aria-live="polite" aria-atomic="true">{message && <div className="toast"><Check size={18}/><span>{message}</span><button aria-label="Закрыть уведомление" onClick={() => setMessage('')}><X size={17}/></button></div>}</div></ToastContext.Provider>;
}
export function useToast() { const value = useContext(ToastContext); if (!value) throw new Error('ToastProvider required'); return value; }
