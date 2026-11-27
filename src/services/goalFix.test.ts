import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { fixOverstatedProtein } from './goalFix';

async function person(over: object = {}, weights: number[] = [84]) {
  await repos.profile.save({
    sex: 'female',
    birthDate: '1986-05-01',
    heightCm: 169,
    activityLevel: 'light',
    exerciseCaloriesMode: 'half',
    weekStartsOn: 1,
    units: 'metric',
    ...over,
  } as never);
  for (const kg of weights) {
    await repos.weights.create({
      date: '2026-11-20',
      time: '08:00',
      kg,
      source: 'manual',
    } as never);
    await new Promise((r) => setTimeout(r, 3));
  }
}
const goal = (over: object) =>
  repos.goals.create({
    validFrom: '2026-11-20',
    type: 'lose',
    rateKgPerWeek: -0.62,
    kcal: 1840,
    protein: 187,
    fat: 51,
    carbs: 158,
    source: 'wizard',
    ...over,
  } as never);

describe('goal correction', () => {
  it('the case that showed the mistake: a woman, 169 cm, 84 kg, 1840 kcal from a 3 % body fat', async () => {
    await person({}, [84, 86.1, 87.2]);
    const g = await goal({});
    const fixed = await fixOverstatedProtein(repos);
    expect(fixed).toEqual([
      { id: g.id, wasKcal: 1840, nowKcal: 1540, was: 187, now: 115, recalculated: true },
    ]);
    const now = await repos.goals.get(g.id);
    // Mifflin 1535 kcal × 1.375 = 2111; the floor is the metabolic rate: 1540 kcal, ~0.52 kg/week
    expect(now).toMatchObject({ kcal: 1540, protein: 115, fat: 46, carbs: 167, fiber: 22 });
    expect(now?.rateKgPerWeek).toBeCloseTo(-0.52, 2);
    // once is enough
    expect(await fixOverstatedProtein(repos)).toEqual([]);
  });

  it('a hand-made goal with its own numbers is left alone; a copy of the automatic one gets the same fix', async () => {
    await person({}, [84, 87.2]);
    const auto = await goal({});
    const own = await goal({ validFrom: '2026-11-25', source: 'manual', protein: 200, kcal: 2500 });
    const copy = await goal({ validFrom: '2026-11-21', source: 'manual', targetWeightKg: 77 });
    await fixOverstatedProtein(repos);
    expect(await repos.goals.get(auto.id)).toMatchObject({ kcal: 1540, protein: 115 });
    expect(await repos.goals.get(copy.id)).toMatchObject({ kcal: 1540, protein: 115 });
    expect(await repos.goals.get(own.id)).toMatchObject({ kcal: 2500, protein: 200 });
  });

  it('a sound gain goal (even a fast one, the person’s choice) is not touched', async () => {
    await person({ sex: 'male', birthDate: '1999-03-10', heightCm: 180 }, [66]);
    // Mifflin 1655 × 1.375 = 2276, plus 0.99 kg/week × 1100 = 3365 → 3360
    const g = await goal({
      type: 'gain',
      rateKgPerWeek: 0.99,
      kcal: 3360,
      protein: 119,
      fat: 93,
      carbs: 512,
    });
    expect(await fixOverstatedProtein(repos)).toEqual([]);
    expect(await repos.goals.get(g.id)).toMatchObject({ kcal: 3360, protein: 119 });
  });

  it('a gain goal inflated by the same mistake comes down; the pace stays the person’s choice', async () => {
    await person({ sex: 'male', birthDate: '1999-03-10', heightCm: 180 }, [66]);
    const g = await goal({
      type: 'gain',
      rateKgPerWeek: 0.25,
      kcal: 3000,
      protein: 119,
      fat: 83,
      carbs: 436,
    });
    // 2276 + 275 = 2551 → 2550 is right; 3000 implies a TDEE of 2725 (ratio 1.20)
    const fixed = await fixOverstatedProtein(repos);
    expect(fixed.map((f) => f.nowKcal)).toEqual([2550]);
    expect((await repos.goals.get(g.id))?.rateKgPerWeek).toBeCloseTo(0.25, 2);
  });

  it('a sound goal with only an overstated protein: protein is corrected, calories stay', async () => {
    await person({}, [84]);
    // calories that are right for her (1540), protein 187 g (49 %)
    const g = await goal({ kcal: 1540, rateKgPerWeek: -0.52, protein: 187, fat: 46, carbs: 61 });
    const fixed = await fixOverstatedProtein(repos);
    expect(fixed).toEqual([
      { id: g.id, wasKcal: 1540, nowKcal: 1540, was: 187, now: 115, recalculated: false },
    ]);
    expect(await repos.goals.get(g.id)).toMatchObject({
      kcal: 1540,
      protein: 115,
      fat: 46,
      carbs: 167,
    });
  });

  it('a normal goal is not touched, and nothing happens without a profile or weight', async () => {
    const ok = await goal({ kcal: 1540, rateKgPerWeek: -0.52, protein: 115, fat: 46, carbs: 167 });
    expect(await fixOverstatedProtein(repos)).toEqual([]);
    await goal({});
    expect(await fixOverstatedProtein(repos)).toEqual([]); // no profile/weight yet
    expect((await repos.goals.get(ok.id))?.protein).toBe(115);
  });
});
