import type { Food, Nutrients, Serving } from '../domain/types';
import { clock } from './ids';
import { foodSearchKey, type Repos } from './repos';

export const BASE_FOODS_SETTING = 'baseFoodsVersion';

type BaseFile = {
  version: number;
  foods: { id: string; name: string; per100g: Nutrients; servings: Serving[] }[];
};

/**
 * Loads the bundled base catalog into IndexedDB when its version changed.
 * User stats (useCount, lastUsedAt, lastGrams) of existing rows are preserved.
 */
/**
 * The bundled catalog: the USDA base plus everyday Russian dishes (borscht, plov, curd 5%…),
 * which the USDA has not. The version moves when either file changes.
 */
async function loadBundled(): Promise<BaseFile> {
  const [base, ru] = await Promise.all([
    import('../data/baseFoods.json'),
    import('../data/ruFoods.json'),
  ]);
  const b = base.default as BaseFile;
  const extra = ru.default as BaseFile;
  return { version: b.version * 1000 + extra.version, foods: [...b.foods, ...extra.foods] };
}

export async function ensureBaseFoods(
  r: Repos,
  load: () => Promise<BaseFile> = loadBundled,
): Promise<boolean> {
  const current = await r.settings.get<number>(BASE_FOODS_SETTING, 0);
  const data = await load();
  if (current >= data.version) return false;
  const now = clock.now();
  await r.db.transaction('rw', r.db.foods, r.db.settings, async () => {
    const existing = new Map(
      (await r.db.foods.bulkGet(data.foods.map((f) => f.id)))
        .filter((f): f is Food => !!f)
        .map((f) => [f.id, f]),
    );
    const rows: Food[] = data.foods.map((f) => {
      const prev = existing.get(f.id);
      return {
        id: f.id,
        name: f.name,
        per100g: f.per100g,
        servings: f.servings,
        source: 'base',
        verified: true,
        searchKey: foodSearchKey(f.name),
        useCount: prev?.useCount ?? 0,
        ...(prev?.lastUsedAt ? { lastUsedAt: prev.lastUsedAt } : {}),
        ...(prev?.lastGrams ? { lastGrams: prev.lastGrams } : {}),
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
    });
    await r.db.foods.bulkPut(rows);
    await r.settings.set(BASE_FOODS_SETTING, data.version);
  });
  return true;
}
