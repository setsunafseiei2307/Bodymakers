/**
 * 料理1食ぶんの栄養価。
 *
 * 成分表に「カツ丼」は無いので、成分表にある食品を組み合わせて作る。
 * そのぶん、何をどれだけ使ったかを必ず全部出す。
 * 配合が分かれば「うちは卵1個」と読み替えられるし、数字を鵜呑みにせずに済む。
 */

import { useMemo, useState } from 'react';

import { fmt } from '../../lib/format';
import { calcDish, dishesByCategory } from '../../lib/dishes';
import { FOOD_SOURCE, type NutrientKey } from '../../lib/foods';
import { Segmented, Slip } from './ui';
import { addMealsToToday } from '../../lib/storage';
import { url } from '../../lib/url';
import type { MealType } from '../../lib/today';

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '朝食' }, { value: 'lunch', label: '昼食' },
  { value: 'dinner', label: '夕食' }, { value: 'snack', label: '間食' },
];

const DISH_MICRONUTRIENT_GROUPS: { title: string; nutrients: { key: NutrientKey; label: string; unit: string; digits: number }[] }[] = [
  { title: 'ビタミン', nutrients: [
    { key: 'vitaminA', label: 'A', unit: 'μg RAE', digits: 0 }, { key: 'vitaminD', label: 'D', unit: 'μg', digits: 1 },
    { key: 'vitaminE', label: 'E', unit: 'mg', digits: 1 }, { key: 'vitaminK', label: 'K', unit: 'μg', digits: 0 },
    { key: 'vitaminB1', label: 'B1', unit: 'mg', digits: 2 }, { key: 'vitaminB2', label: 'B2', unit: 'mg', digits: 2 },
    { key: 'vitaminB6', label: 'B6', unit: 'mg', digits: 2 }, { key: 'vitaminB12', label: 'B12', unit: 'μg', digits: 1 },
    { key: 'folate', label: '葉酸', unit: 'μg', digits: 0 }, { key: 'pantothenic', label: 'パントテン酸', unit: 'mg', digits: 2 },
    { key: 'biotin', label: 'ビオチン', unit: 'μg', digits: 1 }, { key: 'vitaminC', label: 'C', unit: 'mg', digits: 0 },
  ] },
  { title: 'ミネラル', nutrients: [
    { key: 'potassium', label: 'カリウム', unit: 'mg', digits: 0 }, { key: 'calcium', label: 'カルシウム', unit: 'mg', digits: 0 },
    { key: 'magnesium', label: 'マグネシウム', unit: 'mg', digits: 0 }, { key: 'phosphorus', label: 'リン', unit: 'mg', digits: 0 },
    { key: 'iron', label: '鉄', unit: 'mg', digits: 1 }, { key: 'zinc', label: '亜鉛', unit: 'mg', digits: 1 },
    { key: 'copper', label: '銅', unit: 'mg', digits: 2 }, { key: 'manganese', label: 'マンガン', unit: 'mg', digits: 2 },
    { key: 'sodium', label: 'ナトリウム', unit: 'mg', digits: 0 },
  ] },
];

export default function DishPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>('snack');

  // カテゴリごとにまとめて計算しておく。品数が増えたので、
  // 一列に並べると目当ての料理を探しにくい。
  const groups = useMemo(
    () =>
      dishesByCategory().map((group) => ({
        category: group.category,
        results: group.dishes.map((dish) => calcDish(dish)),
      })),
    [],
  );
  const total = groups.reduce((sum, group) => sum + group.results.length, 0);

  return (
    <Slip code="DISH" title="料理から調べる">
      <p className="tool__note">
        成分表に載っているのは食材です。料理は当サイトで材料を組み合わせて計算しています。
        押すと<strong>使った材料とグラム数を全部</strong>表示します。全{total}品。
      </p>

      {groups.map((group) => (
      <section key={group.category} className="dish__group">
      <h3 className="dish__groupTitle">{group.category}</h3>
      <ul className="dish__list">
        {group.results.map(({ dish, totals, rows, missing }) => {
          const open = openId === dish.id;
          return (
            <li key={dish.id} className="dish__item">
              <button
                type="button"
                className={`dish__head${open ? ' is-open' : ''}`}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : dish.id)}
              >
                <span className="dish__media" aria-hidden="true">
                  {dish.imageUrl ? <img src={dish.imageUrl} alt="" className="dish__image" /> : <span className="dish__image dish__image--placeholder">{dish.emoji}</span>}
                </span>
                <span className="dish__name">{dish.name}</span>
                <span className="dish__kcal num">
                  {fmt(totals.kcal, 0)}
                  <small> kcal</small>
                </span>
              </button>

              {open && (
                <div className="dish__detail">
                  <p className="dish__serving">{dish.serving}</p>

                  <div className="stats">
                    <div className="stat">
                      <span className="stat__label">たんぱく質</span>
                      <span className="stat__value num">{fmt(totals.protein, 0)}</span>
                      <span className="stat__unit">g</span>
                    </div>
                    <div className="stat">
                      <span className="stat__label">脂質</span>
                      <span className="stat__value num">{fmt(totals.fat, 0)}</span>
                      <span className="stat__unit">g</span>
                    </div>
                    <div className="stat">
                      <span className="stat__label">炭水化物</span>
                      <span className="stat__value num">{fmt(totals.carbs, 0)}</span>
                      <span className="stat__unit">g</span>
                    </div>
                  </div>

                  <p className="dish__salt">
                    食物繊維 {fmt(totals.fiber, 1)}g ／ 食塩相当量 {fmt(totals.salt, 1)}g
                  </p>

                  <Segmented label="食事区分" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />
                  <button type="button" className="button button--block" onClick={() => {
                    if (addMealsToToday(dish.ingredients, mealType)) setSavedId(dish.id);
                  }}>
                    今日の食事に追加
                  </button>
                  {savedId === dish.id && <div className="app-toast" role="status"><strong>今日の食事に追加しました</strong><a href={url('/tools/today#meals')}>今日の記録を見る →</a></div>}

                  {dish.composite && dish.compositeNote && (
                    <p className="dish__composite">
                      <strong>この料理の内訳について：</strong>
                      {dish.compositeNote}
                    </p>
                  )}

                  {/* ここが本題。配合を伏せたまま数字だけ出さない */}
                  <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
                    <table className="rows">
                      <caption className="visually-hidden">
                        {dish.name}の材料とグラム数
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">材料</th>
                          <th scope="col">分量</th>
                          <th scope="col">カロリー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.food.id}>
                            <th scope="row">
                              <a className="dish__food-link" href={url(`/tools/foods?food=${row.food.id}`)}>{row.food.name}</a>
                              <span className="dish__official">
                                収載名「{row.food.officialName}」／食品番号 {row.food.id}
                              </span>
                            </th>
                            <td className="num">{fmt(row.grams, 0)} g</td>
                            <td className="num">
                              {row.kcal == null ? 'データなし' : `${fmt(row.kcal, 0)} kcal`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="dish__micronutrients">
                    {DISH_MICRONUTRIENT_GROUPS.map((group) => (
                      <details key={group.title} className="food__nutrient-group">
                        <summary>{group.title}</summary>
                        <div className="food__nutrient-grid" style={{ marginTop: 'var(--s2)' }}>
                          {group.nutrients.map((nutrient) => (
                            <div key={nutrient.key} className="food__nutrient-card">
                              <span className="food__nutrient-label">{nutrient.label}</span>
                              <strong className="food__nutrient-value num">{fmt(totals[nutrient.key], nutrient.digits)}</strong>
                              <span className="food__nutrient-unit">{nutrient.unit}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                    {Object.keys(missing).length > 0 && <p className="tool__note">未測定の材料成分は合計に含めていません。</p>}
                  </div>

                  <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
                    材料ごとの数値は{FOOD_SOURCE.publisher}「{FOOD_SOURCE.title}」の収載値
                    （{FOOD_SOURCE.basis}）です。分量は標準的な一人前として当サイトが決めたもので、
                    店や作り方によって変わります。分量が違えば、その割合で増減します。
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </section>
      ))}
    </Slip>
  );
}
