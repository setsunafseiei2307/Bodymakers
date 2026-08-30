import { describe, it, expect } from 'vitest';
import {
  FOODS,
  categorySummaries,
  commonFoods,
  findFood,
  foodCategories,
  foodsInCategory,
  isEstimated,
  normalizeQuery,
  scaleFood,
  searchFoods,
  type Food,
  type NutrientKey,
} from '../lib/foods';
import source from './foods-source.json';

type SourceRow = {
  officialName: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  salt: number | null;
};

const SOURCE = source as Record<string, SourceRow>;
const NUTRIENTS: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt'];

describe('食品データと成分表の一致', () => {
  it('成分表の全2,538食品を収録している', () => {
    expect(FOODS).toHaveLength(2538);
  });

  it('食品番号が重複していない', () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('検証用データと件数が一致する', () => {
    expect(Object.keys(SOURCE)).toHaveLength(FOODS.length);
  });

  // foods.ts を手で書き換えてしまった場合に気づけるようにする。
  // foods-source.json は元Excelから抽出した値をそのまま持っている。
  it('全食品の成分値が成分表の収載値と一致する', () => {
    const mismatches: string[] = [];
    for (const food of FOODS) {
      const row = SOURCE[food.id];
      if (!row) {
        mismatches.push(`${food.id} が成分表側に存在しない`);
        continue;
      }
      for (const key of NUTRIENTS) {
        if (food[key] !== row[key]) {
          mismatches.push(`${food.id} ${food.name} の ${key}: ${food[key]} ≠ ${row[key]}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('全食品の収載名が成分表と一致する', () => {
    const mismatches = FOODS.filter((f) => f.officialName !== SOURCE[f.id]?.officialName).map(
      (f) => `${f.id}: ${f.officialName} ≠ ${SOURCE[f.id]?.officialName}`,
    );
    expect(mismatches).toEqual([]);
  });

  it('エネルギー・PFCが欠損しているのは成分表で未測定の1件だけ', () => {
    const missing = FOODS.filter(
      (f) => f.kcal == null || f.protein == null || f.fat == null || f.carbs == null,
    ).map((f) => f.id);
    // 09059「わかめ カットわかめ 水煮の汁」は成分表そのものが未測定。
    // 推測で埋めず、画面では「データなし」と表示する。
    // 成分表が更新されて値が入ったらこのテストが落ちるので、そこで気づける。
    expect(missing).toEqual(['09059']);
  });

  it('成分値が負になっていない', () => {
    const negative: string[] = [];
    for (const food of FOODS) {
      for (const key of NUTRIENTS) {
        const value = food[key];
        if (value != null && value < 0) negative.push(`${food.id} ${key}`);
      }
    }
    expect(negative).toEqual([]);
  });
});

describe('絵文字', () => {
  it('emoji は文字列か null のどちらか', () => {
    for (const food of FOODS) {
      expect(food.emoji === null || typeof food.emoji === 'string').toBe(true);
    }
  });

  it('絵文字を持つ食品は空文字ではない', () => {
    const empty = FOODS.filter((f) => f.emoji !== null && f.emoji.trim() === '');
    expect(empty).toEqual([]);
  });

  it('該当する絵文字が無い食品は null になっている', () => {
    expect(findFood('04032')?.emoji).toBeNull(); // 木綿豆腐
    expect(findFood('17007')?.emoji).toBeNull(); // しょうゆ（濃口）
    expect(findFood('06054')?.emoji).toBeNull(); // カリフラワー
  });

  it('紛らわしい名前でも正しい絵文字が付いている', () => {
    expect(findFood('11047')?.emoji).toBe('🥩'); // 牛もも（🍑ではない）
    expect(findFood('11221')?.emoji).toBe('🍗'); // 鶏もも（🍑ではない）
    expect(findFood('07136')?.emoji).toBe('🍑'); // もも（白肉種）
    expect(findFood('12004')?.emoji).toBe('🥚'); // 鶏卵（🍗ではない）
    expect(findFood('13003')?.emoji).toBe('🥛'); // 牛乳（🥩ではない）
    expect(findFood('17042')?.emoji).toBeNull(); // マヨネーズ（🥚ではない）
    expect(findFood('06287')?.emoji).toBeNull(); // 大豆もやし（🫘ではない）
  });
});

describe('normalizeQuery', () => {
  it('カタカナをひらがなに寄せる', () => {
    expect(normalizeQuery('マグロ')).toBe('まぐろ');
    expect(normalizeQuery('ブロッコリー')).toBe('ぶろっこりー');
  });

  it('全角英数を半角にし、小文字化する', () => {
    expect(normalizeQuery('ＡＢＣ')).toBe('abc');
    expect(normalizeQuery('11227')).toBe('11227');
  });

  it('空白と中黒を落とす', () => {
    expect(normalizeQuery('鶏 むね')).toBe('鶏むね');
    expect(normalizeQuery('生・ゆで')).toBe('生ゆで');
  });

  it('空文字でも壊れない', () => {
    expect(normalizeQuery('')).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('よく食べる食品の絞り込み', () => {
  it('印が付いているのは全食品の一部だけ', () => {
    const common = FOODS.filter((f) => f.common);
    expect(common.length).toBeGreaterThan(300);
    expect(common.length).toBeLessThan(FOODS.length);
  });

  it('日常的な食品には印が付いている', () => {
    // 主食・肉・卵・野菜・酒・ソフトドリンク・調味料が一通り入っていること
    const musts = [
      '01088', // ごはん（精白米）
      '01085', // ごはん（玄米）
      '01064', // スパゲッティ（ゆで）
      '01128', // そば（ゆで）
      '01039', // うどん（ゆで）
      '12004', // 鶏卵（全卵・生）
      '11220', // 鶏むね（若どり・皮なし・生）
      '06061', // キャベツ（生）
      '16006', // ビール（淡色）
      '16053', // コーラ
      '17007', // しょうゆ（濃口）
    ];
    for (const id of musts) {
      const food = FOODS.find((f) => f.id === id);
      expect(food, `食品番号 ${id} が見つからない`).toBeDefined();
      expect(food?.common, `${food?.name}（${id}）に印が付いていない`).toBe(true);
    }
  });

  it('家庭の食事に出てこない状態のものには印が付かない', () => {
    // 水稲穀粒（炊く前の米粒）や全かゆは、日常の記録では選ばれない
    for (const id of ['01083', '01090', '01081']) {
      expect(FOODS.find((f) => f.id === id)?.common).toBe(false);
    }
  });

  it('commonFoods はカテゴリで絞れる', () => {
    const all = commonFoods();
    const grain = commonFoods('穀類');
    expect(grain.length).toBeGreaterThan(0);
    expect(grain.length).toBeLessThan(all.length);
    expect(grain.every((f) => f.category === '穀類' && f.common)).toBe(true);
  });

  it('commonOnly を付けると印のある食品だけが返る', () => {
    const hits = searchFoods('米', { commonOnly: true, limit: 100 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((f) => f.common)).toBe(true);
  });

  it('「米」で引くと、穀粒やかゆより先にごはんが出る', () => {
    // 成分表には米が85件あり、その大半は炊く前・かゆ・おもゆの状態。
    // 印のある食品を先に並べることで、探しているごはんが上に来る。
    const hits = searchFoods('米', { limit: 10 });
    const first = hits.findIndex((f) => f.id === '01088');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(5);
  });
});

describe('searchFoods', () => {
  it('空の入力では何も返さない', () => {
    expect(searchFoods('')).toEqual([]);
    expect(searchFoods('   ')).toEqual([]);
  });

  it('表示名で引ける', () => {
    const hits = searchFoods('ささみ');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((f) => f.name.includes('ささみ'))).toBe(true);
  });

  it('カタカナでもひらがなでも同じ結果になる', () => {
    const a = searchFoods('マグロ').map((f) => f.id);
    const b = searchFoods('まぐろ').map((f) => f.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('成分表の収載名からも引ける（表示名は漢字でも読みで当たる）', () => {
    const hits = searchFoods('にわとり');
    expect(hits.some((f) => f.name.startsWith('鶏'))).toBe(true);
  });

  it('食品番号で引ける', () => {
    const hits = searchFoods('11227');
    expect(hits[0]?.name).toBe('ささみ（生）');
  });

  it('前方一致が先に並ぶ', () => {
    const hits = searchFoods('牛');
    expect(hits[0]?.name.startsWith('牛')).toBe(true);
  });

  it('該当が無ければ空配列', () => {
    expect(searchFoods('そんな食品はない')).toEqual([]);
  });

  it('漢字の表示名を読みで引ける', () => {
    // 表示名は「鶏むね」だが、実際には「とりむね」と打たれる
    expect(searchFoods('とりむね').some((f) => f.name.startsWith('鶏むね'))).toBe(true);
    expect(searchFoods('ぶたばら').some((f) => f.name.startsWith('豚ばら'))).toBe(true);
    expect(searchFoods('ぎゅうにゅう').some((f) => f.name.startsWith('牛乳'))).toBe(true);
    expect(searchFoods('なっとう').some((f) => f.name.includes('納豆'))).toBe(true);
    expect(searchFoods('ゆでたまご').some((f) => f.name === 'ゆで卵')).toBe(true);
  });

  it('別名から成分表側の語を引ける', () => {
    expect(searchFoods('しゃけ').some((f) => f.name.includes('さけ'))).toBe(true);
    expect(searchFoods('チキン').some((f) => f.name.startsWith('鶏'))).toBe(true);
  });

  it('空白区切りは全部を含むものだけ返す（AND検索）', () => {
    const hits = searchFoods('ささみ 焼き');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe('ささみ（焼き）');

    const both = searchFoods('とり ささみ');
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((f) => f.name.includes('ささみ'))).toBe(true);
  });

  it('AND検索で片方が一致しなければ空', () => {
    expect(searchFoods('ささみ そんな調理法はない')).toEqual([]);
  });

  it('全角スペースでも区切れる', () => {
    expect(searchFoods('ささみ　焼き').map((f) => f.name)).toEqual(['ささみ（焼き）']);
  });

  it('limit で件数を制限できる', () => {
    expect(searchFoods('生', { limit: 3 })).toHaveLength(3);
    expect(searchFoods('生', { limit: 0 })).toEqual([]);
  });

  it('limit が負でも空配列を返して落ちない', () => {
    expect(searchFoods('生', { limit: -5 })).toEqual([]);
  });
});

describe('scaleFood', () => {
  const chicken = findFood('11220') as Food; // 鶏むね 皮なし 生: 105kcal P23.3 F1.9 C0.1

  it('100gなら収載値と同じ', () => {
    const scaled = scaleFood(chicken, 100);
    expect(scaled?.kcal).toBeCloseTo(105);
    expect(scaled?.protein).toBeCloseTo(23.3);
  });

  it('グラム数に比例する', () => {
    const scaled = scaleFood(chicken, 250);
    expect(scaled?.kcal).toBeCloseTo(262.5);
    expect(scaled?.protein).toBeCloseTo(58.25);
  });

  it('0gなら全て0', () => {
    const scaled = scaleFood(chicken, 0);
    expect(scaled?.kcal).toBe(0);
    expect(scaled?.protein).toBe(0);
  });

  it('負・NaN・Infinity は null', () => {
    expect(scaleFood(chicken, -1)).toBeNull();
    expect(scaleFood(chicken, NaN)).toBeNull();
    expect(scaleFood(chicken, Infinity)).toBeNull();
  });

  it('未測定の項目は null のまま', () => {
    const food: Food = { ...chicken, fiber: null };
    expect(scaleFood(food, 200)?.fiber).toBeNull();
  });

  it('カロリーをPFCから計算し直さない（成分表の収載値に比例させる）', () => {
    // ひじき（乾）は食物繊維が多く、4/9/4 で計算すると収載値と大きくずれる
    const hijiki = findFood('09050') as Food;
    const scaled = scaleFood(hijiki, 100);
    expect(scaled?.kcal).toBe(hijiki.kcal);
    const naive =
      (hijiki.protein ?? 0) * 4 + (hijiki.fat ?? 0) * 9 + (hijiki.carbs ?? 0) * 4;
    expect(Math.abs(naive - (hijiki.kcal ?? 0))).toBeGreaterThan(50);
  });
});

describe('カテゴリ', () => {
  it('成分表の18食品群があり、件数の合計が2,538になる', () => {
    const cats = categorySummaries();
    expect(cats).toHaveLength(18);
    expect(cats.reduce((sum, c) => sum + c.count, 0)).toBe(2538);
  });

  it('件数がその カテゴリの実データと一致する', () => {
    for (const c of categorySummaries()) {
      expect(foodsInCategory(c.name)).toHaveLength(c.count);
    }
  });

  it('全カテゴリに代表の絵文字がある', () => {
    const missing = categorySummaries().filter((c) => !c.emoji).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  it('foodsInCategory はそのカテゴリの食品だけを返す', () => {
    const meat = foodsInCategory('肉類');
    expect(meat).toHaveLength(317);
    expect(meat.every((f) => f.category === '肉類')).toBe(true);
  });

  it('存在しないカテゴリは空配列', () => {
    expect(foodsInCategory('存在しない')).toEqual([]);
    expect(foodsInCategory('')).toEqual([]);
  });

  it('カテゴリを指定するとその中だけを検索する（AND）', () => {
    const all = searchFoods('焼き');
    const meat = searchFoods('焼き', { category: '肉類' });
    expect(meat.length).toBeGreaterThan(0);
    expect(meat.length).toBeLessThan(all.length);
    expect(meat.every((f) => f.category === '肉類')).toBe(true);
  });

  it('カテゴリ内に無い語は0件になる（絞り込みが効いている）', () => {
    expect(searchFoods('まぐろ', { category: '肉類' })).toEqual([]);
    expect(searchFoods('まぐろ').length).toBeGreaterThan(0);
  });

  it('category に null / undefined を渡すと全件から検索する', () => {
    const base = searchFoods('まぐろ').map((f) => f.id);
    expect(searchFoods('まぐろ', { category: null }).map((f) => f.id)).toEqual(base);
    expect(searchFoods('まぐろ', { category: undefined }).map((f) => f.id)).toEqual(base);
  });
});

describe('findFood / foodCategories / isEstimated', () => {
  it('存在しない番号は null', () => {
    expect(findFood('99999')).toBeNull();
    expect(findFood('')).toBeNull();
  });

  it('カテゴリが重複せず取得できる', () => {
    const cats = foodCategories();
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('肉類');
    expect(cats).toContain('魚介類');
  });

  it('全食品のカテゴリが一覧に含まれる', () => {
    const cats = new Set(foodCategories());
    expect(FOODS.every((f) => cats.has(f.category))).toBe(true);
  });

  it('推定値の項目を判定できる', () => {
    const withEstimate = FOODS.find((f) => (f.estimated?.length ?? 0) > 0) as Food;
    expect(withEstimate).toBeDefined();
    const key = withEstimate.estimated?.[0] as NutrientKey;
    expect(isEstimated(withEstimate, key)).toBe(true);
  });

  it('推定値を持たない食品では false', () => {
    const plain = FOODS.find((f) => !f.estimated) as Food;
    expect(isEstimated(plain, 'kcal')).toBe(false);
  });
});
