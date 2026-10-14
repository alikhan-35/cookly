import { useCallback, useRef, useState } from 'react';
import type { RecipeFeedback } from '../types';
import { trackEvent } from '../services/analytics';
import { readJson, writeJson } from '../utils/storage';

const KEY = 'cookly:feedback';
export function useFeedback() {
  const [feedback, setFeedback] = useState<RecipeFeedback[]>(() => {
    const saved = readJson<unknown>(KEY, []);
    return Array.isArray(saved) ? saved.filter((item): item is RecipeFeedback => Boolean(item && typeof item === 'object' && typeof (item as RecipeFeedback).recipeId === 'string' && typeof (item as RecipeFeedback).liked === 'boolean')) : [];
  });
  const latest = useRef(feedback);
  const rate = useCallback((recipeId: string, recipeCategory: string, liked: boolean) => {
    if (latest.current.find(item => item.recipeId === recipeId)?.liked === liked) return;
    const next = [...latest.current.filter(item => item.recipeId !== recipeId), { recipeId, liked, timestamp: new Date().toISOString() }];
    latest.current = next;
    setFeedback(next); writeJson(KEY, next);
    trackEvent(liked ? 'recipe_liked' : 'recipe_disliked', { recipe_id: recipeId, recipe_category: recipeCategory });
  }, []);
  return { feedback, rate, get: (id: string) => feedback.find(item => item.recipeId === id) };
}
