import { createContext, useContext, useState, type ReactNode } from 'react';
import type { SubstitutionSelections } from '../types';
import { useProfile } from './useProfile';

interface RecipeSession { servings: number; selections: SubstitutionSelections }
interface SessionContext { sessions: Record<string, RecipeSession>; update: (id: string, patch: Partial<RecipeSession>) => void }
const Context = createContext<SessionContext | null>(null);
export function RecipeSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, RecipeSession>>({});
  const { profile } = useProfile();
  return <Context.Provider value={{ sessions, update: (id, patch) => setSessions(previous => ({ ...previous, [id]: { ...(previous[id] ?? { servings: profile.familySize, selections: {} }), ...patch } })) }}>{children}</Context.Provider>;
}
export function useRecipeSession(id: string) {
  const context = useContext(Context);
  const { profile } = useProfile();
  if (!context) throw new Error('RecipeSessionProvider required');
  const session = context.sessions[id] ?? { servings: profile.familySize, selections: {} };
  return { ...session, setServings: (servings: number) => context.update(id, { servings: Math.max(1, Math.min(6, Math.round(servings))) }), setSelections: (selections: SubstitutionSelections) => context.update(id, { selections }) };
}
