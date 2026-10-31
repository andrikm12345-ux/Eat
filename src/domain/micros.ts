import { MIN_COVERAGE, NUTRIENT_DEFS, type NutrientDef } from './nutrientDefs';
import type { Nutrients, Sex } from './types';

export type MicroRow = {
  def: NutrientDef;
  /** Average per logged day. */
  avg: number;
  rda: number;
  /** avg / rda. */
  ratio: number;
  /** Share of the period's kcal coming from items where this nutrient is known. */
  coverage: number;
  /** Coverage < 60 %: no conclusion is drawn. */
  lowData: boolean;
  /** Target nutrient clearly below the norm (< 80 %) with enough data. */
  deficit: boolean;
  /** Above the limit / UL with enough data. */
  above: boolean;
};

/**
 * Micronutrients over a period: sum / days vs the reference, and data coverage =
 * share of kcal from items that report the nutrient.
 */
export function microReport(
  items: readonly Nutrients[],
  days: number,
  sex: Sex,
  age: number,
): MicroRow[] {
  const totalKcal = items.reduce((s, n) => s + n.kcal, 0);
  return NUTRIENT_DEFS.map((def) => {
    let sum = 0;
    let known = 0;
    for (const n of items) {
      const v = n[def.key];
      if (typeof v === 'number') {
        sum += v;
        known += n.kcal;
      }
    }
    const coverage = totalKcal > 0 ? known / totalKcal : 0;
    const avg = days > 0 ? sum / days : 0;
    const rda = def.rda(sex, age);
    const ratio = avg / rda;
    const lowData = coverage < MIN_COVERAGE;
    const limit = def.kind === 'limit' ? rda : def.ul;
    return {
      def,
      avg,
      rda,
      ratio,
      coverage,
      lowData,
      deficit: !lowData && def.kind === 'target' && ratio < 0.8,
      above: !lowData && limit !== undefined && avg > limit,
    };
  });
}
