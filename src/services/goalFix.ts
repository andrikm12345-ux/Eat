import { computeMacros, PROTEIN_MAX_SHARE } from '../domain/macros';
import type { Goal } from '../domain/types';
import type { Repos } from '../db/repos';

/** A goal whose protein is above this share of its calories is checked (the rule is 30 %). */
const CHECK_SHARE = 0.33;

export type GoalFix = { id: string; was: number; now: number };

const share = (g: Pick<Goal, 'protein' | 'kcal'>) => (g.kcal > 0 ? (4 * g.protein) / g.kcal : 0);

/**
 * Goals made before the rule "protein is at most 30 % of the calories" (a body-fat estimate from
 * absurd measurements pushed protein to 40 %: 187 g of 1840 kcal) get their protein recalculated
 * once. Calories and fat stay, carbs take the difference. A goal the person set by hand is left
 * alone, unless it is a copy of an automatic one (the same numbers: they only changed something
 * else). Safe to run on every start and after every sync: a corrected goal no longer matches.
 */
export async function fixOverstatedProtein(r: Repos): Promise<GoalFix[]> {
  const profile = await r.profile.get();
  const weight = await r.weights.latest();
  if (!profile?.heightCm || !weight?.kg) return [];
  const goals = (await r.goals.list()).filter((g) => !g.deletedAt);
  const out: GoalFix[] = [];
  for (const g of goals) {
    if (share(g) <= CHECK_SHARE) continue;
    const copyOfAuto = goals.some(
      (o) => o.id !== g.id && o.source !== 'manual' && o.protein === g.protein && o.kcal === g.kcal,
    );
    if (g.source === 'manual' && !copyOfAuto) continue;
    const m = computeMacros({
      kcal: g.kcal,
      weightKg: weight.kg,
      heightCm: profile.heightCm,
      goalType: g.type,
    });
    if (
      m.protein >= g.protein ||
      share({ protein: m.protein, kcal: g.kcal }) > PROTEIN_MAX_SHARE + 0.05
    )
      continue;
    const carbs = Math.max(0, Math.round((g.kcal - 4 * m.protein - 9 * g.fat) / 4));
    await r.goals.update(g.id, { protein: m.protein, carbs });
    out.push({ id: g.id, was: g.protein, now: m.protein });
  }
  return out;
}
