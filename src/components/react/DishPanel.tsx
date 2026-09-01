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
import { FOOD_SOURCE } from '../../lib/foods';
import { Slip } from './ui';
import { addMealsToToday } from '../../lib/storage';

export default function DishPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

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
        {group.results.map(({ dish, totals, rows }) => {
          const open = openId === dish.id;
          return (
            <li key={dish.id} className="dish__item">
              <button
                type="button"
                className={`dish__head${open ? ' is-open' : ''}`}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : dish.id)}
              >
                <span className="dish__name">
                  <span aria-hidden="true">{dish.emoji} </span>
                  {dish.name}
                </span>
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

                  <button
                    type="button"
                    className="button button--block"
                    onClick={() => {
                      if (addMealsToToday(dish.ingredients)) setSavedId(dish.id);
                    }}
                  >
                    今日の食事に追加
                  </button>
                  {savedId === dish.id && <p className="tool__status" role="status">{dish.name}を今日の記録に追加しました。</p>}

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
                              {row.food.name}
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
