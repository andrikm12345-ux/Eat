// Core domain types. Dates are local calendar days `YYYY-MM-DD`; times are `HH:mm`.

export type LocalDate = string;
export type LocalTime = string;
export type IsoDateTime = string;

/** Nutrient amounts. Foods store them per 100 g, entries store absolute values. */
export type Nutrients = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  salt?: number;
  sodium?: number;
  /** Micronutrients; units are fixed in NUTRIENT_DEFS. */
  [microKey: string]: number | undefined;
};

export type BaseRecord = {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Soft delete marker (enables Undo). */
  deletedAt?: IsoDateTime;
};

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';
export type ExerciseCaloriesMode = 'none' | 'half' | 'full';
export type GoalType = 'lose' | 'maintain' | 'gain';

export type Profile = BaseRecord & {
  id: 'me';
  sex: Sex;
  birthDate: LocalDate;
  heightCm: number;
  activityLevel: ActivityLevel;
  exerciseCaloriesMode: ExerciseCaloriesMode;
  weekStartsOn: 1;
  units: 'metric';
};

export type Goal = BaseRecord & {
  id: string;
  validFrom: LocalDate;
  type: GoalType;
  /** kg per week; negative = losing. */
  rateKgPerWeek: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  waterMl?: number;
  targetWeightKg?: number;
  source: 'wizard' | 'checkin' | 'manual';
  note?: string;
};

export type Serving = { label: string; grams: number };

export type Food = BaseRecord & {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Nutrients;
  servings: Serving[];
  source: 'user' | 'off' | 'base' | 'ai_label';
  verified: boolean;
  offRaw?: object;
  lastUsedAt?: IsoDateTime;
  useCount: number;
  lastGrams?: number;
  /** Normalized name for search: lower case, ё→е. */
  searchKey: string;
};

export type Recipe = BaseRecord & {
  id: string;
  name: string;
  photoBlobId?: string;
  steps: { text: string; photoBlobId?: string }[];
  ingredients: { foodId: string; grams: number }[];
  cookedWeightG?: number;
  servingsCount: number;
  /** Cached. */
  per100g: Nutrients;
};

export type TemplateItem = {
  foodId?: string;
  recipeId?: string;
  /** Item name at save time (kept next to the snapshot: `Nutrients` cannot hold strings). */
  name: string;
  grams: number;
  /** Absolute nutrients for `grams` at save time. */
  snapshot: Nutrients;
};

export type Template = BaseRecord & { id: string; name: string; items: TemplateItem[] };

export type Confidence = 'high' | 'medium' | 'low';

export type EntryItem = {
  foodId?: string;
  recipeId?: string;
  name: string;
  grams: number;
  /** Snapshot at save time; later food edits do not change past days. */
  nutrients: Nutrients;
  confidence?: Confidence;
};

export type EntrySource =
  'manual' | 'barcode' | 'ai_photo' | 'ai_text' | 'template' | 'repeat' | 'quick';

export type Entry = BaseRecord & {
  id: string;
  date: LocalDate;
  time: LocalTime;
  mealLabel?: string;
  items: EntryItem[];
  /** Cached sum of item nutrients. */
  totals: Nutrients;
  source: EntrySource;
  aiRunId?: string;
  note?: string;
};

export type DayMeta = BaseRecord & {
  date: LocalDate;
  /** "Day fully logged". */
  complete: boolean;
  waterMl: number;
  steps?: number;
  activeKcal?: number;
  note?: string;
};

export type Weight = BaseRecord & {
  id: string;
  date: LocalDate;
  time: LocalTime;
  kg: number;
  source: 'manual' | 'import';
};

export type Measurement = BaseRecord & {
  id: string;
  date: LocalDate;
  neckCm?: number;
  chestCm?: number;
  waistCm?: number;
  abdomenCm?: number;
  hipsCm?: number;
  thighCm?: number;
  armCm?: number;
  bodyFatPct?: number;
  method?: 'navy' | 'manual';
};

export type Workout = BaseRecord & {
  id: string;
  date: LocalDate;
  time: LocalTime;
  type: string;
  durationMin: number;
  kcal?: number;
  note?: string;
  source: 'manual' | 'import';
};

export type TdeeHistory = BaseRecord & {
  date: LocalDate;
  trendKg: number;
  tdee: number;
  /** 0..1 */
  confidence: number;
  intakeAvg: number;
  windowDays: number;
};

export type Checkin = BaseRecord & {
  id: string;
  weekStart: LocalDate;
  proposedKcal: number;
  acceptedKcal?: number;
  tdee: number;
  trendDeltaKgPerWeek: number;
  status: 'pending' | 'accepted' | 'skipped';
  explanation: string;
};

export type Achievement = BaseRecord & { id: string; unlockedAt: IsoDateTime; progress?: number };

export type AiRun = BaseRecord & {
  id: string;
  kind: 'photo' | 'text' | 'label' | 'weekly';
  model: string;
  /** Never contains the API key. */
  request: object;
  response: object;
  latencyMs: number;
  error?: string;
};

export type BlobRecord = BaseRecord & {
  id: string;
  blob: Blob;
  mime: string;
  /** What the blob is for (non-indexed). */
  kind?: 'progress' | 'recipe' | 'step';
  /** Day the photo belongs to (progress photos). */
  date?: LocalDate;
};

export type Setting = BaseRecord & { key: string; value: unknown };
