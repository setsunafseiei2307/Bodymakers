/**
 * 運動と食べ物を、カロリーで行き来する。
 *
 * 「30分歩いたら何kcal？」と「ご飯1杯を消費するには何分？」は
 * 同じ計算の裏表なので、1つの画面で両方向を出す。
 *
 * 数字だけでは量が伝わらないため、消費カロリーは必ず食べ物の個数に言い換える。
 * そのとき「1食ぶんを何gと見なしたか」も併せて出し、解釈の余地を残さない。
 */

import { useMemo, useState } from 'react';

import { fmt, parseNumber } from '../../lib/format';
import { ACTIVITIES, METS_SOURCE, activityGroups, burnedKcal, findActivity, minutesForKcal } from '../../lib/mets';
import { PORTIONS, foodEquivalents } from '../../lib/foodEquivalent';
import { FOOD_SOURCE, findFood } from '../../lib/foods';
import { url } from '../../lib/url';
import { NumberField, Segmented, SelectField, Slip } from './ui';
import { useQueryDefaults } from './useQueryDefaults';

type Mode = 'burn' | 'food';

/** 分を「1時間20分」の形にする。 */
function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 1) return '1分未満';
  const total = Math.round(minutes);
  if (total < 60) return `${total}分`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export default function BurnTool() {
  const [mode, setMode] = useState<Mode>('burn');
  const [weight, setWeight] = useState('');
  const [activityId, setActivityId] = useState(ACTIVITIES[0].id);
  const [minutes, setMinutes] = useState('30');
  const [portionId, setPortionId] = useState(PORTIONS[0].foodId);

  // 記事から /tools/burn?activity=walk-brisk のように送られてくる。
  // 収録していない活動IDや範囲外の数値は無視して既定値のままにする。
  useQueryDefaults((params) => {
    const id = params.get('activity');
    if (id && findActivity(id)) setActivityId(id);

    const min = params.get('minutes');
    const minValue = min == null ? null : parseNumber(min);
    if (minValue != null && minValue > 0 && minValue <= 600) setMinutes(String(minValue));

    const kg = params.get('weight');
    const kgValue = kg == null ? null : parseNumber(kg);
    if (kgValue != null && kgValue >= 30 && kgValue <= 300) setWeight(String(kgValue));
  });

  const weightKg = parseNumber(weight);
  const minutesValue = parseNumber(minutes);
  const activity = findActivity(activityId);

  const weightError =
    weight !== '' && (weightKg == null || weightKg < 30 || weightKg > 300)
      ? '30〜300kg の範囲で入力してください。'
      : undefined;
  const minutesError =
    minutes !== '' && (minutesValue == null || minutesValue < 0 || minutesValue > 600)
      ? '0〜600分の範囲で入力してください。'
      : undefined;

  /** 運動 → 消費カロリー */
  const burned = useMemo(() => {
    if (activity == null || weightKg == null || minutesValue == null) return null;
    if (weightError || minutesError) return null;
    return burnedKcal(activity.mets, minutesValue, weightKg);
  }, [activity, weightKg, minutesValue, weightError, minutesError]);

  const equivalents = useMemo(() => (burned == null ? [] : foodEquivalents(burned)), [burned]);

  /** 食べ物 → 各運動で何分か */
  const portion = PORTIONS.find((p) => p.foodId === portionId) ?? PORTIONS[0];
  const portionFood = findFood(portion.foodId);
  const portionKcal =
    portionFood?.kcal == null ? null : (portionFood.kcal * portion.grams) / 100;

  const timesNeeded = useMemo(() => {
    if (portionKcal == null || weightKg == null || weightError) return [];
    return ACTIVITIES.map((a) => ({
      activity: a,
      minutes: minutesForKcal(a.mets, portionKcal, weightKg),
    })).filter((row) => row.minutes != null);
  }, [portionKcal, weightKg, weightError]);

  return (
    <div className="tool">
      <Slip code="BURN" title="運動と食べ物を行き来する">
        <Segmented
          label="調べたいこと"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'burn', label: '運動 → カロリー' },
            { value: 'food', label: '食べ物 → 運動時間' },
          ]}
        />

        <NumberField
          label="体重"
          unit="kg"
          value={weight}
          onChange={setWeight}
          placeholder="70"
          error={weightError}
          hint="消費カロリーは体重に比例するので、これだけは必要です。"
        />

        {mode === 'burn' ? (
          <>
            <SelectField
              label="何をした？"
              value={activityId}
              onChange={setActivityId}
              options={activityGroups().flatMap((g) =>
                g.items.map((a) => ({ value: a.id, label: `${g.group}／${a.label}` })),
              )}
              hint={activity ? `${activity.mets} メッツ${activity.note ? `（${activity.note}）` : ''}` : undefined}
            />
            <NumberField
              label="どれくらい"
              unit="分"
              value={minutes}
              onChange={setMinutes}
              placeholder="30"
              inputMode="numeric"
              error={minutesError}
            />
          </>
        ) : (
          <SelectField
            label="何を食べた？"
            value={portionId}
            onChange={setPortionId}
            options={PORTIONS.map((p) => ({ value: p.foodId, label: p.label }))}
            hint={portion.note}
          />
        )}
      </Slip>

      {/* --- 運動 → カロリー --- */}
      {mode === 'burn' && burned != null && activity && (
        <>
          <div className="slip record lv-intermediate">
            <div className="slip__band">
              <span>BURN</span>
              <span>
                {activity.label} {formatMinutes(minutesValue ?? 0)}
              </span>
            </div>
            <div className="record__body">
              <div className="record__head">
                <p className="record__level num">{fmt(burned, 0)}</p>
                <p className="record__ratio">
                  <span>消費</span>
                  <em className="num">kcal</em>
                </p>
              </div>
              <div className="record__bar" aria-hidden="true" />
              <p className="record__total">
                {activity.mets} メッツ × {formatMinutes(minutesValue ?? 0)} × 体重{' '}
                {fmt(weightKg, 1)}kg
              </p>
            </div>
          </div>

          <Slip code="FOOD" title="食べ物でいうと">
            <ul className="burn__list">
              {equivalents.map((item) => (
                <li className="burn__row" key={item.food.id}>
                  <span className="burn__name">
                    {item.food.emoji && <span aria-hidden="true">{item.food.emoji} </span>}
                    {item.label}
                    <span className="burn__sub">
                      {fmt(item.kcalPerPortion, 0)}kcal（{item.note}）
                    </span>
                  </span>
                  {/* 単位は品目名の側（茶碗1杯・1枚・1本）が持っているので、
                      ここは倍率として出す。「0.6個ぶん」のような不自然さを避ける */}
                  <span className="burn__value num">
                    <small>× </small>
                    {fmt(item.portions, 1)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="source-note" style={{ marginTop: 'var(--s4)' }}>
              カロリーは{FOOD_SOURCE.publisher}「{FOOD_SOURCE.title}」の収載値
              （{FOOD_SOURCE.basis}）です。1食ぶんのグラム数は当サイトで決めた目安で、
              各行の括弧内に書いてあります。実際の量が違えばそのぶん増減します。
            </p>
          </Slip>
        </>
      )}

      {/* --- 食べ物 → 運動時間 --- */}
      {mode === 'food' && portionKcal != null && timesNeeded.length > 0 && (
        <>
          <div className="slip record lv-intermediate">
            <div className="slip__band">
              <span>FOOD</span>
              <span>{portion.label}</span>
            </div>
            <div className="record__body">
              <div className="record__head">
                <p className="record__level num">{fmt(portionKcal, 0)}</p>
                <p className="record__ratio">
                  <span>およそ</span>
                  <em className="num">kcal</em>
                </p>
              </div>
              <div className="record__bar" aria-hidden="true" />
              <p className="record__total">{portion.note}</p>
            </div>
          </div>

          <Slip code="TIME" title="消費するのにかかる時間">
            <ul className="burn__list">
              {timesNeeded.map((row) => (
                <li className="burn__row" key={row.activity.id}>
                  <span className="burn__name">
                    {row.activity.label}
                    <span className="burn__sub">
                      {row.activity.mets} メッツ
                      {row.activity.note ? `（${row.activity.note}）` : ''}
                    </span>
                  </span>
                  <span className="burn__value num">{formatMinutes(row.minutes!)}</span>
                </li>
              ))}
            </ul>
          </Slip>
        </>
      )}

      {/* --- 出典と注記。数字を出す画面には必ず添える --- */}
      <Slip code="SOURCE" title="計算方法と出典">
        <p className="note">
          <span className="note__title">消費カロリー ＝ メッツ × 時間 × 体重 × 1.05</span>
          メッツは安静時を1とした運動強度の単位です。この式で出るのは
          <strong>安静時のぶんを含んだ総消費量</strong>で、「その運動で余分に使った量」では
          ありません。同じ運動をしても、体力・気温・フォームによって実際の消費量は変わります。
        </p>

        <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
          メッツ値の出典: {METS_SOURCE.publisher}「{METS_SOURCE.title}」{' '}
          <a href={METS_SOURCE.url} target="_blank" rel="noopener noreferrer">
            出典ページ
          </a>
          <br />
          元データ: {METS_SOURCE.original}{' '}
          <a href={METS_SOURCE.originalUrl} target="_blank" rel="noopener noreferrer">
            原文
          </a>
        </p>

        <p className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
          <span className="note__title">収録しているのは抜粋です</span>
          日常的な{ACTIVITIES.length}種類だけを載せています。一覧に無い活動は、
          近い値で代用せず「データなし」として扱っています。
        </p>

        <p className="next" style={{ marginTop: 'var(--s4)' }}>
          <a href={url('/articles/exercise-calorie-reality')}>
            運動で消費できる量の話を読む →
          </a>
          <a href={url('/tools/plan')}>ダイエット計画を立てる →</a>
        </p>
      </Slip>
    </div>
  );
}
