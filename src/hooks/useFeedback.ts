import { useCallback, useState } from 'react';
import type { RecipeFeedback } from '../types';
import { trackEvent } from '../utils/analytics';
import { readJson, writeJson } from '../utils/storage';

const KEY = 'cookly:feedback';
export function useFeedback() {
  const [feedback, setFeedback] = useState<RecipeFeedback[]>(() => {
    const saved = readJson<unknown>(KEY, []);
    return Array.isArray(saved) ? saved.filter((item): item is RecipeFeedback => Boolean(item && typeof item === 'object' && typeof (item as RecipeFeedback).recipeId === 'string' && typeof (item as RecipeFeedback).liked === 'boolean')) : [];
  });
  const rate = useCallback((recipeId: string, liked: boolean) => {
    const next = [...feedback.filter(item => item.recipeId !== recipeId), { recipeId, liked, timestamp: new Date().toISOString() }];
    setFeedback(next); writeJson(KEY, next);
    trackEvent(liked ? 'recipe_liked' : 'recipe_disliked', { recipeId });
  }, [feedback]);
  return { feedback, rate, get: (id: string) => feedback.find(item => item.recipeId === id) };
}
