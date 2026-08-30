/**
 * 食品検索ツール。
 *
 * 日本食品標準成分表の全2,538食品から、名前で絞り込んで栄養価を見る。
 * 分量を変えると成分値が比例して変わる。
 *
 * 表示の順は「カテゴリ一覧 → 検索 → 食品を選ぶ → 分量を変える」。
 * 全件を最初から出しても選べないので、検索語かカテゴリが決まるまでは一覧を出さない。
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import {
  FOOD_SOURCE,
  categorySummaries,
  foodsInCategory,
  isEstimated,
  scaleFood,
  searchFoods,
  commonFoods,
  commonFoodCount,
  type Food,
  type NutrientKey,
} from '../../lib/foods';
import { NumberField, Slip } from './ui';
import { url } from '../../lib/url';

/** 表示する成分と、その見出し・単位。 */
const NUTRIENTS: { key: NutrientKey; label: string; unit: string; digits: number }[] = [
  { key: 'kcal', label: 'エネルギー', unit: 'kcal', digits: 0 },
  { key: 'protein', label: 'たんぱく質', unit: 'g', digits: 1 },
  { key: 'fat', label: '脂質', unit: 'g', digits: 1 },
  { key: 'carbs', label: '炭水化物', unit: 'g', digits: 1 },
  { key: 'fiber', label: '食物繊維', unit: 'g', digits: 1 },
  { key: 'salt', label: '食塩相当量', unit: 'g', digits: 2 },
];
import { useQueryDefaults } from './useQueryDefaults';

const MAX_GRAMS = 5000;
const RESULT_LIMIT = 60;

export default function FoodTool() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  /**
   * 成分表の全食品を対象にするか。
   *
   * 既定は false（よく食べる食品だけ）。成分表には同じ食材の未調理・半調理の
   * 状態違いが大量に入っていて、「米」で引くと85件出る。その大半は家庭の食事に
   * 出てこない形で、探しているごはんが埋もれる。まず日常の食品だけを見せて、
   * それ以外を調べたい人が自分で広げる形にしている。
   */
  const [showAll, setShowAll] = useState(false);

  // 記事から /tools/foods?q=鶏むね のように送られてくる。
  // 検索語はそのまま検索欄に入れる（絞り込みに使うだけで、表示には出さない）。
  useQueryDefaults((params) => {
    const q = params.get('q');
    if (q && q.length <= 40) setQuery(q);
    if (params.get('all') === '1') setShowAll(true);
  });

  const categories = useMemo(() => categorySummaries(), []);
  const commonTotal = useMemo(() => commonFoodCount(), []);

  /**
   * 食品を選んだら成分表まで画面を送る。
   * 一覧は画面の下にあるので、選んだ直後は成分表が画面の外にいる。
   */
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected == null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detailRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [selected]);

  const gramsValue = parseNumber(grams);
  const gramsError =
    grams !== '' && (gramsValue == null || gramsValue < 0 || gramsValue > MAX_GRAMS)
      ? `0〜${MAX_GRAMS}g の範囲で入力してください。`
      : undefined;

  /** 検索語があれば検索、無ければカテゴリの中身、どちらも無ければ空。 */
  const results = useMemo(() => {
    if (query.trim() !== '') {
      return searchFoods(query, { category, limit: RESULT_LIMIT, commonOnly: !showAll });
    }
    if (category) {
      const pool = showAll ? foodsInCategory(category) : commonFoods(category);
      return pool.slice(0, RESULT_LIMIT);
    }
    return [];
  }, [query, category, showAll]);

  /** 全食品まで広げたら何件になるか（「もっと探す」の案内に出す） */
  const widerCount = useMemo(() => {
    if (showAll) return 0;
    if (query.trim() !== '') {
      return searchFoods(query, { category, limit: 9999 }).length - results.length;
    }
    if (category) return foodsInCategory(category).length - commonFoods(category).length;
    return 0;
  }, [query, category, showAll, results.length]);

  const totalInCategory = category
    ? showAll
      ? foodsInCategory(category).length
      : commonFoods(category).length
    : 0;

  const scaled = useMemo(() => {
    if (selected == null || gramsValue == null || gramsError) return null;
    return scaleFood(selected, gramsValue);
  }, [selected, gramsValue, gramsError]);

  function reset() {
    setQuery('');
    setCategory(null);
    setSelected(null);
    setShowAll(false);
  }

  return (
    <div className="tool">
      <Slip code="SEARCH" title="食品を探す">
        <div className="tool__form">
          <NumberField
            label="食品名で検索"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setSelected(null);
            }}
            placeholder="鶏むね / まぐろ / ブロッコリー"
            inputMode="decimal"
            hint={
              category
                ? `「${category}」の中から探しています。`
                : `よく使う${commonTotal}件から探します。ひらがな・カタカナ・漢字のどれでも引けます。`
            }
          />

          {category ? (
            <p className="food__scope">
              <button type="button" className="button button--ghost" onClick={reset}>
                ← カテゴリ一覧に戻る
              </button>
            </p>
          ) : (
            query.trim() === '' && (
              <div className="food__cats">
                {categories.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="food__cat"
                    onClick={() => {
                      setCategory(item.name);
                      setSelected(null);
                    }}
                  >
                    <span className="food__cat-emoji" aria-hidden="true">
                      {item.emoji ?? ''}
                    </span>
                    <span className="food__cat-name">{item.name}</span>
                    {/* 主に出すのは、まず見せる「よく食べる食品」の件数 */}
                    <span className="food__cat-count">{commonFoods(item.name).length}</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </Slip>

      {/* 選んだ食品の成分。一覧より先に置く。
          結果を最後までスクロールしないと数値が見えないのを避けるため。 */}
      {selected && (
        <div ref={detailRef} className="food__detail">
          <Slip code="DETAIL" title={selected.name}>
          <NumberField
            label="分量"
            unit="g"
            value={grams}
            onChange={setGrams}
            placeholder="100"
            error={gramsError}
            hint={`0〜${MAX_GRAMS}g`}
          />

          {scaled && (
            <div className="table-scroll" style={{ marginTop: 'var(--s4)' }}>
              <table className="rows">
                <caption className="visually-hidden">
                  {selected.name} {fmt(gramsValue, 0)}g あたりの成分値
                </caption>
                <thead>
                  <tr>
                    <th scope="col">成分</th>
                    <th scope="col">{fmt(gramsValue, 0)}g あたり</th>
                    {gramsValue !== 100 && <th scope="col">100g あたり</th>}
                  </tr>
                </thead>
                <tbody>
                  {NUTRIENTS.map((nutrient) => {
                    const value = scaled[nutrient.key];
                    const base = selected[nutrient.key];
                    const estimated = isEstimated(selected, nutrient.key);
                    return (
                      <tr key={nutrient.key}>
                        <th scope="row">
                          {nutrient.label}
                          {estimated && (
                            <span className="food__est" title="成分表で推定値だった項目">
                              推定
                            </span>
                          )}
                        </th>
                        <td>
                          {value == null ? (
                            <span className="food__na">データなし</span>
                          ) : (
                            `${fmt(value, nutrient.digits)} ${nutrient.unit}`
                          )}
                        </td>
                        {gramsValue !== 100 && (
                          <td>
                            {base == null ? (
                              <span className="food__na">データなし</span>
                            ) : (
                              `${fmt(base, nutrient.digits)} ${nutrient.unit}`
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="source-note" style={{ marginTop: 'var(--s4)' }}>
            出典: {FOOD_SOURCE.publisher}「{FOOD_SOURCE.title}」{FOOD_SOURCE.section}／
            収載名「{selected.officialName}」（食品番号 {selected.id}）。
            数値は{FOOD_SOURCE.basis}の収載値です。
            {selected.estimated && selected.estimated.length > 0 && (
              <>「推定」と付いた項目は、成分表で括弧付き（推定値）だったものです。</>
            )}
          </p>

          <p className="next" style={{ marginTop: 'var(--s4)' }}>
            <a href={url('/tools/nutrition')}>1日のPFC目標を計算する →</a>
          </p>
          </Slip>
        </div>
      )}

      {(query.trim() !== '' || category) && (
        <Slip
          code="LIST"
          title={
            category && query.trim() === ''
              ? `${category}（${totalInCategory}件）`
              : `検索結果 ${results.length}件`
          }
        >
          {results.length === 0 ? (
            <div className="empty">
              <strong className="empty__title">見つかりませんでした</strong>
              {widerCount > 0 ? (
                <>
                  よく食べる食品の中にはありませんでした。
                  成分表の全食品まで広げると{widerCount}件見つかります。
                  <p style={{ marginTop: 'var(--s3)' }}>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => setShowAll(true)}
                    >
                      成分表の全食品から探す
                    </button>
                  </p>
                </>
              ) : (
                <>
                  別の言い方で試してください。成分表には料理名（「さばの味噌煮」など）は
                  ほとんど収載されていません。素材名で探すと見つかります。
                </>
              )}
            </div>
          ) : (
            <>
              <ul className="food__list">
                {results.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      className={`food__item${selected?.id === food.id ? ' is-selected' : ''}`}
                      onClick={() => setSelected(food)}
                      aria-pressed={selected?.id === food.id}
                    >
                      <span className="food__emoji" aria-hidden="true">
                        {food.emoji ?? ''}
                      </span>
                      <span className="food__name">
                        {food.name}
                        <span className="food__pfc">
                          P {fmt(food.protein, 1)} / F {fmt(food.fat, 1)} / C{' '}
                          {fmt(food.carbs, 1)}
                        </span>
                      </span>
                      <span className="food__kcal num">
                        {fmt(food.kcal, 0)}
                        <small> kcal</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {results.length >= RESULT_LIMIT && (
                <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                  上位{RESULT_LIMIT}件だけ表示しています。検索語を足すと絞り込めます。
                </p>
              )}

              {/* 日常の食品で足りない人だけが、自分で成分表の全件へ広げる */}
              {showAll ? (
                <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                  成分表の全食品を対象にしています。
                  <button
                    type="button"
                    className="food__widen"
                    onClick={() => setShowAll(false)}
                  >
                    よく食べる食品だけに戻す
                  </button>
                </p>
              ) : (
                widerCount > 0 && (
                  <p className="tool__note" style={{ marginTop: 'var(--s3)' }}>
                    よく食べる食品だけを出しています。
                    <button
                      type="button"
                      className="food__widen"
                      onClick={() => setShowAll(true)}
                    >
                      成分表の全食品から探す（他 {widerCount} 件）
                    </button>
                  </p>
                )
              )}
            </>
          )}
        </Slip>
      )}

      <p className="note">
        <span className="note__title">カロリーはPFCから計算していません</span>
        成分表のエネルギーは組成成分ベースで算出されており（食物繊維は約2kcal/g、
        アルコールは7kcal/g）、たんぱく質×4＋脂質×9＋炭水化物×4 では収載値と一致しません。
        表示しているのは成分表の収載値そのものです。
      </p>

      <p className="source-note">
        {FOOD_SOURCE.publisher}「{FOOD_SOURCE.title}」{FOOD_SOURCE.section}より、
        全2,538食品を収録しています。一覧には日常的によく食べる{commonTotal}件を先に出し、
        それ以外は「成分表の全食品から探す」で表示します。
        <a href={FOOD_SOURCE.url} target="_blank" rel="noopener noreferrer">
          出典ページ
        </a>
        {' / '}
        <a href={url('/sources')}>当サイトのデータの扱い</a>
      </p>
    </div>
  );
}
