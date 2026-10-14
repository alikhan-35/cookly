import { useState } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { trackEvent } from '../services/analytics';
import { readJson, writeJson } from '../utils/storage';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';

type UsefulnessAnswer = 'yes' | 'no';
const STORAGE_KEY = 'cookly:recipe-usefulness';

function readAnswer(answerKey: string): UsefulnessAnswer | undefined {
  const answers = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  const answer = answers[answerKey];
  return answer === 'yes' || answer === 'no' ? answer : undefined;
}

export function RecipeUsefulnessPrompt({ recipeId, recipeCategory }: { recipeId: string; recipeCategory: string }) {
  const { configured, consent, participantCode } = useAnalyticsPreferences();
  const answerKey = `${participantCode || 'anonymous'}:${recipeId}`;
  const [answerState, setAnswerState] = useState<{ key: string; answer: UsefulnessAnswer | undefined }>(() => ({
    key: answerKey,
    answer: readAnswer(answerKey),
  }));
  const answer = answerState.key === answerKey ? answerState.answer : readAnswer(answerKey);

  function answerQuestion(next: UsefulnessAnswer) {
    if (answer || consent !== 'granted') return;
    const answers = readJson<Record<string, unknown>>(STORAGE_KEY, {});
    writeJson(STORAGE_KEY, { ...answers, [answerKey]: next });
    setAnswerState({ key: answerKey, answer: next });
    trackEvent('recipe_usefulness_answered', { recipe_id: recipeId, recipe_category: recipeCategory, answer: next });
  }

  if (!configured || consent !== 'granted') return null;

  return <aside className="recipe-usefulness" aria-labelledby="recipe-usefulness-title">
    <div>
      <strong id="recipe-usefulness-title">Достаточно ли этого рецепта, чтобы приготовить блюдо без поиска в других источниках?</strong>
      <small>Один короткий ответ поможет улучшить Cookly.</small>
    </div>
    {answer ? <p className="recipe-usefulness-saved" role="status"><Check size={16}/> Спасибо, ответ сохранён</p> : <div className="recipe-usefulness-actions">
      <button type="button" onClick={() => answerQuestion('yes')}><ThumbsUp size={16}/> Да</button>
      <button type="button" onClick={() => answerQuestion('no')}><ThumbsDown size={16}/> Нет</button>
    </div>}
  </aside>;
}
