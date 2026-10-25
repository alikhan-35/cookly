import type { ExternalRecipe } from '../types';

export type TranslationStatus = 'draft' | 'translated' | 'ready_for_review' | 'needs_review' | 'approved';
export type NormalizedUnit = 'g' | 'ml' | 'tsp' | 'tbsp' | 'cup' | 'packet' | 'piece';

export interface IngredientQuantity {
  originalAmount: string | null;
  originalUnit: string | null;
  normalizedAmount: number | null;
  normalizedUnit: NormalizedUnit | null;
  canScale: boolean;
  needsClarification: boolean;
  note?: string;
}

export interface NormalizedCatalogIngredient {
  slot: number;
  originalName: string;
  nameRu: string;
  canonicalIngredientId: string | null;
  originalMeasure: string;
  measureRu: string;
  quantity: IngredientQuantity;
}

export interface RecipeTranslation {
  externalId: string;
  sourceFingerprint: string;
  titleRu: string;
  categoryRu: string;
  /** Indexes must retain the source ingredient order, including repeated names. */
  ingredientsRu: string[];
  measuresRu?: string[];
  /** Editorial steps, never automatic sentence splitting. */
  stepsRu: string[];
  status: TranslationStatus;
  /** Initial editorial notes; a current version-bound assessment can reclassify them. */
  issues?: string[];
  advisories?: string[];
}

export interface TranslationReview {
  externalId: string;
  sourceFingerprint: string;
  translationFingerprint: string;
  decision: 'approved' | 'needs_review';
  reviewer: string;
  reviewedAt: string;
  notes: string;
}

export interface CatalogQualityIssue { code: string; message: string; }

export interface RecipeAuditFinding {
  category: 'A' | 'B' | 'C';
  problem: string;
  evidence: string;
  critical: boolean;
  autoFixable: boolean;
  humanCheck: string;
  resolved?: boolean;
}

/** Readiness assessment is separate from an approval decision. */
export interface RecipeReadinessAssessment {
  externalId: string;
  sourceFingerprint: string;
  translationFingerprint: string;
  checkedAt: string;
  /** Only this exact set of earlier concerns was reclassified by the assessment. */
  assessedEditorialIssues: string[];
  findings: RecipeAuditFinding[];
  /** Explicit source-instruction clarifications, never identity inferred from a Russian label. */
  ingredientClarifications?: { slot: number; originalName: string; canonicalName: string; evidence: string }[];
}

export interface LocalizedCatalogRecipe {
  original: ExternalRecipe;
  titleRu: string;
  categoryRu: string;
  ingredients: NormalizedCatalogIngredient[];
  stepsRu: string[];
  instructionsRu: string;
  status: TranslationStatus;
  issues: CatalogQualityIssue[];
  advisories: string[];
  /** Editorial approval does not invent the missing serving/nutrition model. */
  readyForMainCookly: false;
}
