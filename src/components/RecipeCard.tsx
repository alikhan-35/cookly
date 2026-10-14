import { ArrowUpRight, Check, Clock3, Signal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Recipe, RecipeMatch } from '../types';
import { FoodArt } from './FoodArt';
import { MarketButton } from './MockStore';

export interface RecommendationAnalyticsContext {
  recommendation_position: number;
  missing_ingredients_count: number;
  matched_ingredients_count: number;
  search_source: 'manual' | 'fridge';
}

export function RecipeCard({ recipe, match, analyticsContext }: { recipe: Recipe; match?: RecipeMatch; analyticsContext?: RecommendationAnalyticsContext }) {
  const missing = match?.missing.length ?? 0;
  const navigationState = analyticsContext ? { recommendation: analyticsContext } : undefined;
  return <article className="recipe-card">
    <Link to={`/recipe/${recipe.id}`} state={navigationState} className={`recipe-image food-${recipe.visual}`} tabIndex={-1} aria-hidden="true"><FoodArt kind={recipe.visual}/><span className="category-badge">{recipe.category}</span></Link>
    <div className="recipe-card-body">
      <div className="recipe-meta"><span><Clock3 size={14}/>{recipe.cookingTime} мин</span><span><Signal size={14}/>{recipe.difficulty}</span><span><Users size={14}/>{recipe.servings} порц.</span></div>
      <h3><Link to={`/recipe/${recipe.id}`} state={navigationState}>{recipe.name}</Link></h3>
      {match ? <div className="match-info">{match.profileFit && <span className="profile-fit">Подходит вашему профилю</span>}<span className={`match-badge ${missing === 0 ? 'complete' : ''}`}>{missing === 0 ? <><Check size={14}/> Все продукты есть</> : `Не хватает ${missing} ${missing === 1 ? 'продукта' : 'продуктов'}`}</span><p>Есть {match.matchedCount} из {match.requiredCount} ингредиентов</p>{missing > 0 && <p className="missing-list">Добавить: {match.missing.map(i => i.name.toLocaleLowerCase('ru')).join(', ')}</p>}{Boolean(match.substitutionCount) && <p className="substitution-count"><Check size={13}/> {match.substitutionCount} ингредиент можно заменить</p>}</div> : <><p className="card-description">{recipe.description}</p><p className="card-nutrition">≈ {Math.round(recipe.nutrition.calories / recipe.baseServings)} ккал · Б {Math.round(recipe.nutrition.protein / recipe.baseServings)} г · Ж {Math.round(recipe.nutrition.fat / recipe.baseServings)} г · У {Math.round(recipe.nutrition.carbs / recipe.baseServings)} г на порцию</p></>}
      {match && missing > 0 && <MarketButton recipe={recipe} missing={match.missing} compact/>}
      <Link className="recipe-link" to={`/recipe/${recipe.id}`} state={navigationState}>Посмотреть рецепт <ArrowUpRight size={17}/></Link>
    </div>
  </article>;
}
