/**
 * Today の食事面。
 *
 * 栄養バランス（微量栄養素まで）と、食べたものの記録。
 * 微量栄養素と「今日あと何食べる？」は details の中に畳んである。
 * 開いた瞬間に全部見せると、情報の壁になって記録が止まるため。
 *
 * ロジックは持たない。状態も計算も useTodayState が持っていて、
 * ここは受け取ったものを描くだけ。
 */

import { fmt } from '../../../lib/format';
import type { TodayViewContext } from './useTodayState';
import { NUTRITION_REFERENCE_SOURCE } from '../../../lib/nutritionReference';
import { DISHES, calcDish } from '../../../lib/dishes';
import { MEAL_OPTIONS } from './constants';
import { NumberField, Segmented, Slip } from '../ui';

export default function TodayNutrition({ ctx }: { ctx: TodayViewContext }) {
  const {
    nutritionProgressItems, nutritionPriorityItems, foodRecommendations, nutritionMessage,
    mealType, setMealType, addRecommendedFood,
    mealText, setMealText, mealTextResult, addMealText, query, setQuery,
    addDish, frequent, addMeal, lastAddedCount, undoLastAdd, suggestions,
    mealCards, meals, setMeals, setGrams,
  } = ctx;

  return (
    <>
      <Slip code="BALANCE" title="今日の栄養バランス">
        {nutritionProgressItems.length === 0 ? <p className="tool__note">プロフィールまたは診断で年齢・性別を保存すると、厚労省の食事摂取基準（2025年版）との今日の進捗を表示します。</p> : <>
          <div className="nutrition-progress__featured">
            {(nutritionPriorityItems.length > 0 ? nutritionPriorityItems : nutritionProgressItems.filter((item) => item.kind !== 'dg-max').slice(0, 6)).slice(0, 6).map((item) => <section key={item.nutrient} className={`nutrition-progress nutrition-progress--${item.state}`}>
              <div><strong>{item.label}</strong><span className="num">{fmt(item.intake, item.digits)} / {fmt(item.value, item.digits)} {item.unit}</span></div>
              <progress value={Math.min(item.intake, item.value)} max={item.value} />
              <small>{item.remaining != null && item.remaining > 0 ? `今日の目安まであと${fmt(item.remaining, item.digits)} ${item.unit}` : '今日の目安に到達'}</small>
            </section>)}
          </div>
          <details className="tool__details nutrition-progress__details"><summary>すべての栄養素を見る</summary>
            {[['ビタミン', ['vitaminA','vitaminD','vitaminE','vitaminK','vitaminB1','vitaminB2','vitaminB6','vitaminB12','folate','pantothenic','biotin','vitaminC']], ['ミネラル', ['potassium','calcium','magnesium','phosphorus','iron','zinc','copper','manganese']], ['その他', ['fiber','salt']]].map(([title, keys]) => <section key={String(title)} className="nutrition-progress__group"><h3>{title}</h3>{nutritionProgressItems.filter((item) => (keys as string[]).includes(item.nutrient)).map((item) => <div key={item.nutrient} className={`nutrition-progress nutrition-progress--${item.state}`}><div><strong>{item.label}</strong>{item.status === 'unresolved' ? <span>基準未確定</span> : <span className="num">{fmt(item.intake, item.digits)} / {fmt(item.value, item.digits)} {item.unit}</span>}</div>{item.status === 'unresolved' ? <small>{item.unresolvedReason}</small> : item.kind === 'dg-max' ? <small>{item.state === 'over' ? '今日は目安を超えています' : `目標上限まであと${fmt(item.remaining ?? 0, item.digits)} ${item.unit}`}</small> : <><progress value={Math.min(item.intake, item.value)} max={item.value} /><small>{item.remaining != null && item.remaining > 0 ? `今日の目安まであと${fmt(item.remaining, item.digits)} ${item.unit}` : '今日の目安に到達'}</small></>}</div>)}</section>)}
          </details>
          {/* 食品候補は最初から開くと情報の壁になる。必要な人だけ開く。 */}
          <details className="tool__details"><summary>今日あと何食べる？を見る</summary>
          <section className="nutrition-recommendations"><div className="nutrition-recommendations__heading"><span>WHAT TO EAT</span><h3>今日あと何食べる？</h3><p>成分表の食品から、今日の目安までの距離を埋めやすい候補を出します。</p></div><Segmented label="追加する食事" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />
            {foodRecommendations.length === 0 ? <p className="tool__note">表示できる範囲の栄養素は、今日の目安に到達しています。</p> : <div className="nutrition-recommendations__grid">{foodRecommendations.map((recommendation) => <article key={recommendation.food.id} className="nutrition-recommendation-card"><span className="nutrition-recommendation-card__emoji" aria-hidden="true">{recommendation.food.emoji ?? '🍽️'}</span><div><strong>{recommendation.food.name}</strong><small>{recommendation.serving.label}</small></div><p>{recommendation.reason}</p><ul>{recommendation.contributions.slice(0, 2).map((contribution) => <li key={contribution.nutrient.nutrient}>{contribution.nutrient.label} <strong>+{fmt(contribution.value, contribution.nutrient.digits)} {contribution.nutrient.unit}</strong></li>)}</ul><button type="button" className="button button--block" onClick={() => addRecommendedFood(recommendation.food, recommendation.serving.grams)}>今日の食事に追加</button></article>)}</div>}
            {nutritionMessage && <p className="tool__status" role="status">{nutritionMessage}</p>}
          </section>
          </details>
          <p className="tool__note">1日の値だけで栄養状態を診断するものではありません。栄養成分: 日本食品標準成分表（八訂）増補2023年／基準値: {NUTRITION_REFERENCE_SOURCE.title}・{NUTRITION_REFERENCE_SOURCE.publisher}</p>
        </>}
      </Slip>

      <Slip code="EAT" title="食べたもの">
        <Segmented label="食事区分" options={MEAL_OPTIONS} value={mealType} onChange={setMealType} />
        <div className="today__natural">
          <NumberField
            label="まとめて入力"
            value={mealText}
            onChange={setMealText}
            placeholder="卵2個、ご飯200g、納豆"
            hint="料理辞書・部分一致・数量だけで解析します。AIへの送信はありません。"
          />
          <button type="button" className="button button--block" onClick={addMealText} disabled={mealText.trim() === ''}>
            食事リストに追加
          </button>
          {mealTextResult && (
            <div className="today__parseResult" role="status">
              {mealTextResult.matched.length > 0 && <p><strong>追加:</strong> {mealTextResult.matched.join('、')}</p>}
              {mealTextResult.assumptions.length > 0 && <p><strong>分量の仮定:</strong> {mealTextResult.assumptions.join('／')}</p>}
              {mealTextResult.unmatched.length > 0 && <p><strong>判断できなかったもの:</strong> {mealTextResult.unmatched.join('、')}（推測では追加していません）</p>}
            </div>
          )}
        </div>

        <NumberField
          label="食品を追加"
          value={query}
          onChange={setQuery}
          placeholder="ごはん / 鶏むね / ビール"
          hint="押すと100gで追加します。あとから分量を変えられます。"
        />

        {/* よく食べる料理は、材料をまとめて入れられるようにする */}
        <div className="today__dishes">
          <span className="field__label">料理からまとめて追加</span>
          <div className="today__chips">
            {DISHES.map((dish) => (
              <button
                key={dish.id}
                type="button"
                className="today__chip"
                onClick={() => addDish(dish.id)}
              >
                <span aria-hidden="true">{dish.emoji} </span>
                {dish.name}
                <span className="today__chip-kcal">
                  {Math.round(calcDish(dish).totals.kcal)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* よく食べるもの。1タップで前回の分量のまま入る。 */}
        {frequent.length > 0 && query.trim() === '' && (
          <div className="quick-food">
            <p className="quick-food__title">よく食べるもの</p>
            <ul className="quick-food__list">
              {frequent.map((item) => (
                <li key={item.food.id}>
                  <button
                    type="button"
                    className="quick-food__add"
                    onClick={() => addMeal(item.food, item.grams)}
                    aria-label={`${item.food.name} を ${item.grams}g 追加する`}
                  >
                    <span className="quick-food__name">
                      {item.food.emoji && <span aria-hidden="true">{item.food.emoji} </span>}
                      {item.food.name}
                    </span>
                    <span className="quick-food__grams num">{item.grams}g</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 押し間違いをその場で戻せるようにする。 */}
        {lastAddedCount > 0 && (
          <p className="quick-food__undo" role="status">
            追加しました。
            <button type="button" onClick={undoLastAdd}>元に戻す</button>
          </p>
        )}

        <ul className="today__suggest">
          {suggestions.map((food) => (
            <li key={food.id}>
              <button type="button" className="today__add" onClick={() => addMeal(food)}>
                <span className="today__add-name">
                  {food.emoji && <span aria-hidden="true">{food.emoji} </span>}
                  {food.name}
                </span>
                <span className="today__add-kcal num">
                  {fmt(food.kcal, 0)}
                  <small> kcal/100g</small>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div id="meals" className="today__meal-cards">
          {MEAL_OPTIONS.map((group) => {
            const cards = mealCards.filter((item) => item.mealType === group.value);
            const kcal = cards.reduce((sum, item) => sum + (item.kcal ?? 0), 0);
            return (
              <section key={group.value} className="today__meal-card">
                <h3><span>{group.label}</span><strong className="num">{cards.length === 0 ? '—' : `${fmt(kcal, 0)} kcal`}</strong></h3>
                {cards.length === 0 ? <p className="today__meal-empty">まだ追加されていません</p> : <ul className="today__list">
                  {cards.map((card) => <li className={`today__food-card${card.dishId ? ' today__food-card--dish' : ''}`} key={card.id}>
                    <div className="today__food-card-head">
                      <div><strong>{card.name}</strong><span className="num">{card.kcal == null ? 'データなし' : `${fmt(card.kcal, 0)} kcal`}　P {card.protein == null ? '—' : fmt(card.protein, 0)} / F {card.fat == null ? '—' : fmt(card.fat, 0)} / C {card.carbs == null ? '—' : fmt(card.carbs, 0)}</span></div>
                      <button type="button" className="today__remove" onClick={() => setMeals((list) => list.filter((_, index) => !card.entryIndexes.includes(index)))} aria-label={`${card.name}を削除`}>×</button>
                    </div>
                    {card.dishId ? <details className="today__dish-ingredients"><summary>材料を見る（{card.ingredients.length}品）</summary><ul>{card.ingredients.map((ingredient) => <li key={ingredient.entryIndex}><span>{ingredient.name}</span><input className="today__grams" type="text" inputMode="decimal" value={String(meals[ingredient.entryIndex]?.grams ?? '')} onChange={(event) => setGrams(ingredient.entryIndex, event.target.value)} aria-label={`${ingredient.name}のグラム数`} /><span>g</span></li>)}</ul></details> : <div className="today__food-card-single"><input className="today__grams" type="text" inputMode="decimal" value={String(meals[card.entryIndexes[0]]?.grams ?? '')} onChange={(event) => setGrams(card.entryIndexes[0]!, event.target.value)} aria-label={`${card.name}のグラム数`} /><span>g</span></div>}
                  </li>)}
                </ul>}
              </section>
            );
          })}
        </div>
      </Slip>
    </>
  );
}
