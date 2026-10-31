import Dexie, { type Table } from 'dexie';
import type {
  Achievement,
  AiRun,
  BlobRecord,
  Checkin,
  DayMeta,
  Entry,
  Food,
  Goal,
  Measurement,
  Profile,
  Recipe,
  Setting,
  TdeeHistory,
  Template,
  Weight,
  Workout,
} from '../domain/types';

export const SCHEMA_VERSION = 1;
export const DB_NAME = 'dnevnik';

/**
 * Dexie schema v1. Only indexed fields are listed; other fields are stored as-is.
 * Future versions must use `version(n).stores(...).upgrade(...)` and export a
 * backup before touching user data.
 */
export const SCHEMA_V1 = {
  profile: 'id',
  goals: 'id, validFrom',
  foods: 'id, barcode, searchKey, useCount, lastUsedAt',
  recipes: 'id, name',
  templates: 'id, name',
  entries: 'id, date, [date+time]',
  dayMeta: 'date',
  weights: 'id, date',
  measurements: 'id, date',
  workouts: 'id, date',
  tdeeHistory: 'date',
  checkins: 'id, weekStart, status',
  achievements: 'id',
  aiRuns: 'id, kind, createdAt',
  blobs: 'id',
  settings: 'key',
} as const;

export type TableName = keyof typeof SCHEMA_V1;

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  goals!: Table<Goal, string>;
  foods!: Table<Food, string>;
  recipes!: Table<Recipe, string>;
  templates!: Table<Template, string>;
  entries!: Table<Entry, string>;
  dayMeta!: Table<DayMeta, string>;
  weights!: Table<Weight, string>;
  measurements!: Table<Measurement, string>;
  workouts!: Table<Workout, string>;
  tdeeHistory!: Table<TdeeHistory, string>;
  checkins!: Table<Checkin, string>;
  achievements!: Table<Achievement, string>;
  aiRuns!: Table<AiRun, string>;
  blobs!: Table<BlobRecord, string>;
  settings!: Table<Setting, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(SCHEMA_VERSION).stores(SCHEMA_V1);
  }
}

export const db = new AppDB();
