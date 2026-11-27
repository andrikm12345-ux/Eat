import { describe, expect, it } from 'vitest';
import { repos } from '../db/repos';
import { fixOverstatedProtein } from './goalFix';

async function person(kg = 85.1) {
  await repos.profile.save({
    sex: 'female',
    birthDate: '1986-05-01',
    heightCm: 169,
    activityLevel: 'light',
    exerciseCaloriesMode: 'half',
    weekStartsOn: 1,
    units: 'metric',
  } as never);
  await repos.weights.create({ date: '2026-11-23', time: '08:00', kg } as never);
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

describe('fixOverstatedProtein', () => {
  it('corrects an overstated protein (calories and fat stay, carbs take the difference)', async () => {
    await person();
    const g = await goal({});
    const fixed = await fixOverstatedProtein(repos);
    expect(fixed).toEqual([{ id: g.id, was: 187, now: 138 }]);
    const now = await repos.goals.get(g.id);
    expect(now).toMatchObject({ protein: 138, fat: 51, carbs: 207, kcal: 1840 });
    // once is enough
    expect(await fixOverstatedProtein(repos)).toEqual([]);
  });

  it('a hand-made goal with its own numbers is left alone; a copy of the automatic one is fixed', async () => {
    await person();
    const auto = await goal({});
    const own = await goal({ validFrom: '2026-11-25', source: 'manual', protein: 200, carbs: 100 });
    const copy = await goal({ validFrom: '2026-11-21', source: 'manual' });
    await fixOverstatedProtein(repos);
    expect((await repos.goals.get(auto.id))?.protein).toBe(138);
    expect((await repos.goals.get(copy.id))?.protein).toBe(138);
    expect((await repos.goals.get(own.id))?.protein).toBe(200);
  });

  it('a normal goal is not touched, and nothing happens without a profile or weight', async () => {
    const ok = await goal({ protein: 130, carbs: 214 });
    expect(await fixOverstatedProtein(repos)).toEqual([]);
    await goal({});
    expect(await fixOverstatedProtein(repos)).toEqual([]); // no profile/weight yet
    expect((await repos.goals.get(ok.id))?.protein).toBe(130);
  });
});
