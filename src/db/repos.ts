import Dexie from 'dexie';
import { goalFor } from '../domain/goals';
import { sumNutrients } from '../domain/nutrients';
import { normalizeSearch } from '../domain/text';
import type { DayMeta, Entry, Food, Goal, LocalDate, Profile, TdeeHistory } from '../domain/types';
import { db as defaultDb, type AppDB } from './db';
import { clock } from './ids';
import { createRepo, type NewRecord, type Patch } from './repo';

export const DEFAULT_DAY_META = { complete: false, waterMl: 0 } as const;

/** Builds all repositories bound to a database instance. */
export function makeRepos(db: AppDB) {
  const goals = createRepo(db.goals);
  const entries = createRepo(db.entries);
  const weights = createRepo(db.weights);
  const foods = createRepo(db.foods);

  return {
    db,

    profile: {
      async get(): Promise<Profile | undefined> {
        return db.profile.get('me');
      },
      /** Upsert of the single profile row. */
      async save(data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) {
        return db.transaction('rw', db.profile, async () => {
          const cur = await db.profile.get('me');
          const now = clock.now();
          const rec: Profile = {
            ...data,
            id: 'me',
            createdAt: cur?.createdAt ?? now,
            updatedAt: now,
          };
          await db.profile.put(rec);
          return rec;
        });
      },
    },

    goals: {
      ...goals,
      /** Goal in force on `date` (max validFrom ≤ date). */
      async goalFor(date: LocalDate): Promise<Goal | undefined> {
        const candidates = await db.goals.where('validFrom').belowOrEqual(date).toArray();
        return goalFor(candidates, date);
      },
    },

    entries: {
      ...entries,
      /** Creates an entry; `totals` is computed from item snapshots. */
      async add(data: Omit<NewRecord<Entry>, 'totals'>): Promise<Entry> {
        return entries.create({
          ...data,
          totals: sumNutrients(data.items.map((i) => i.nutrients)),
        } as NewRecord<Entry>);
      },
      /** Updates an entry and recomputes totals when items change. */
      async edit(id: string, patch: Patch<Entry>): Promise<Entry> {
        const p = patch.items
          ? { ...patch, totals: sumNutrients(patch.items.map((i) => i.nutrients)) }
          : patch;
        return entries.update(id, p);
      },
      /** Non-deleted entries of a day, ordered by time. */
      async byDate(date: LocalDate): Promise<Entry[]> {
        return db.entries
          .where('[date+time]')
          .between([date, Dexie.minKey], [date, Dexie.maxKey])
          .filter((e) => !e.deletedAt)
          .toArray();
      },
      async inRange(from: LocalDate, to: LocalDate): Promise<Entry[]> {
        return db.entries
          .where('date')
          .between(from, to, true, true)
          .filter((e) => !e.deletedAt)
          .toArray();
      },
    },

    weights: {
      ...weights,
      async inRange(from: LocalDate, to: LocalDate) {
        return db.weights
          .where('date')
          .between(from, to, true, true)
          .filter((w) => !w.deletedAt)
          .toArray();
      },
      async latest() {
        const all = await weights.list();
        return all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).at(-1);
      },
    },

    foods: {
      ...foods,
      /** Creates a food with a normalized `searchKey` and zeroed usage stats. */
      async add(
        data: Omit<NewRecord<Food>, 'searchKey' | 'useCount'> & { useCount?: number },
      ): Promise<Food> {
        return foods.create({
          ...data,
          useCount: data.useCount ?? 0,
          searchKey: foodSearchKey(data.name, data.brand),
        } as NewRecord<Food>);
      },
      async edit(id: string, patch: Patch<Food>): Promise<Food> {
        if (!('name' in patch) && !('brand' in patch)) return foods.update(id, patch);
        const cur = await foods.get(id, { includeDeleted: true });
        if (!cur) throw new Error(`Record not found: foods/${id}`);
        const name = patch.name ?? cur.name;
        const brand = 'brand' in patch ? patch.brand : cur.brand;
        return foods.update(id, { ...patch, searchKey: foodSearchKey(name, brand) });
      },
      async byBarcode(barcode: string): Promise<Food | undefined> {
        return (await foods.where('barcode', barcode))[0];
      },
      /** Registers a use: bumps counter, remembers time and grams. */
      async markUsed(id: string, grams: number): Promise<void> {
        await db.transaction('rw', db.foods, async () => {
          const f = await db.foods.get(id);
          if (!f) return;
          const now = clock.now();
          await db.foods.put({
            ...f,
            useCount: f.useCount + 1,
            lastUsedAt: now,
            lastGrams: grams,
            updatedAt: now,
          });
        });
      },
    },

    dayMeta: {
      /** Day metadata with defaults when nothing is stored yet. */
      async get(date: LocalDate): Promise<DayMeta> {
        const r = await db.dayMeta.get(date);
        if (r && !r.deletedAt) return r;
        const now = clock.now();
        return { date, ...DEFAULT_DAY_META, createdAt: now, updatedAt: now };
      },
      async upsert(date: LocalDate, patch: Patch<Omit<DayMeta, 'date'>>): Promise<DayMeta> {
        return db.transaction('rw', db.dayMeta, async () => {
          const cur = await db.dayMeta.get(date);
          const now = clock.now();
          const base = cur && !cur.deletedAt ? cur : { date, ...DEFAULT_DAY_META, createdAt: now };
          const rec: DayMeta = { ...base, ...patch, date, updatedAt: now };
          delete rec.deletedAt;
          await db.dayMeta.put(rec);
          return rec;
        });
      },
    },

    tdeeHistory: {
      async put(data: Omit<TdeeHistory, 'createdAt' | 'updatedAt' | 'deletedAt'>) {
        const cur = await db.tdeeHistory.get(data.date);
        const now = clock.now();
        const rec: TdeeHistory = { ...data, createdAt: cur?.createdAt ?? now, updatedAt: now };
        await db.tdeeHistory.put(rec);
        return rec;
      },
      async get(date: LocalDate) {
        return db.tdeeHistory.get(date);
      },
    },

    settings: {
      async get<T>(key: string, fallback: T): Promise<T> {
        const r = await db.settings.get(key);
        return r && !r.deletedAt ? (r.value as T) : fallback;
      },
      async set(key: string, value: unknown): Promise<void> {
        await db.transaction('rw', db.settings, async () => {
          const cur = await db.settings.get(key);
          const now = clock.now();
          await db.settings.put({ key, value, createdAt: cur?.createdAt ?? now, updatedAt: now });
        });
      },
      async remove(key: string): Promise<void> {
        await db.settings.delete(key);
      },
    },

    recipes: createRepo(db.recipes),
    templates: createRepo(db.templates),
    measurements: createRepo(db.measurements),
    workouts: createRepo(db.workouts),
    checkins: createRepo(db.checkins),
    aiRuns: createRepo(db.aiRuns),
    blobs: createRepo(db.blobs),
  };
}

export function foodSearchKey(name: string, brand?: string): string {
  return normalizeSearch(brand ? `${name} ${brand}` : name);
}

export type Repos = ReturnType<typeof makeRepos>;

export const repos = makeRepos(defaultDb);
