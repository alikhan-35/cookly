import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserProfile } from '../types';
import { trackEvent } from '../utils/analytics';
import { readJson, writeJson } from '../utils/storage';

export const defaultProfile: UserProfile = { familySize: 2, hasChildren: false, dislikes: [], allergies: [], dietary: 'Без ограничений', difficulty: 'Любые' };
const KEY = 'cookly:profile';
export function validateProfile(value: unknown): UserProfile {
  const item = value && typeof value === 'object' ? value as Partial<UserProfile> : {};
  const names = (input: unknown): string[] => Array.isArray(input) ? [...new Set(input.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).map(name => name.trim().slice(0, 60)))].slice(0, 20) : [];
  return {
    familySize: typeof item.familySize === 'number' && Number.isInteger(item.familySize) && item.familySize >= 1 && item.familySize <= 6 ? item.familySize : 2,
    hasChildren: item.hasChildren === true,
    dislikes: names(item.dislikes), allergies: names(item.allergies),
    dietary: ['Без ограничений','Вегетарианское','Без свинины','Без лактозы','Другое'].includes(item.dietary ?? '') ? item.dietary! : 'Без ограничений',
    difficulty: ['Простые блюда','Средние','Любые'].includes(item.difficulty ?? '') ? item.difficulty! : 'Любые',
  };
}
interface ProfileContextValue { profile: UserProfile; updateProfile: (profile: UserProfile) => void; resetProfile: () => void; }
const ProfileContext = createContext<ProfileContextValue | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => validateProfile(readJson<unknown>(KEY, {})));
  function updateProfile(next: UserProfile) { setProfile(next); writeJson(KEY, next); trackEvent('profile_updated', { familySize: next.familySize, dietary: next.dietary, hasChildren: next.hasChildren }); }
  function resetProfile() { updateProfile(defaultProfile); }
  return <ProfileContext.Provider value={{ profile, updateProfile, resetProfile }}>{children}</ProfileContext.Provider>;
}
export function useProfile() { const context = useContext(ProfileContext); if (!context) throw new Error('ProfileProvider is required'); return context; }
