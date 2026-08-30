/**
 * 診断結果の表示。
 *
 * 見せ方は「計測機器のリザルト票」。スクリーンショットで共有される前提なので、
 * 上端の帯・レベル・体重比・3種目の三角チャートまでが1画面に収まるようにしている。
 * 数字だけが独り歩きしないよう、出典と注記も同じ票の中に含める。
 */

import { fmt } from '../../lib/format';
import {
  LEVELS,
  LIFT_LABELS,
  STANDARDS_SOURCE,
  tierProgress,
  type LevelId,
  type LiftId,
} from '../../lib/strength/standards';
import {
  topPercent,
  type Diagnosis,
  type LevelThreshold,
  type LiftDiagnosis,
} from '../../lib/strength/diagnose';
import ShareCard from './ShareCard';
import { SITE_NAME } from '../../config/site';
import { buildShareCard, drawShareCard } from '../../lib/strength/shareCard';
import { url } from '../../lib/url';

/** レベルIDごとのCSSクラス。色はCSS側のトークンで持つ。 */
const LEVEL_CLASS: Record<LevelId, string> = {
  beginner: 'lv-beginner',
  novice: 'lv-novice',
  intermediate: 'lv-intermediate',
  advanced: 'lv-advanced',
  elite: 'lv-elite',
};

/** 三角チャートの軸の並び。上・右下・左下の順に置く。 */
const RADAR_AXES: readonly LiftId[] = ['squat', 'deadlift', 'bench'] as const;

/** 順位の言い換え。数字の向きを読み違えられないよう「◯%より強い」で出す。 */
function rankText(percentile: number, bound: 'in-range' | 'below' | 'above'): string {
  // 「範囲外」とだけ返すと、競技会の記録より下にいる人＝ほとんどの人を
  // 突き放すことになる。どこにいるかを事実として伝える言い方にする。
  if (bound === 'below') return '競技会の記録を基準にした表より下';
  if (bound === 'above') return `上位${fmt(topPercent(percentile), 0)}%以内`;
  return `競技者の${fmt(percentile, 1)}%より上`;
}

/**
 * 3種目のバランスを示す三角チャート。
 *
 * 半径にはパーセンタイルではなく tierProgress（0〜5）を使う。
 * 区切りが分布の下側に密集しているため、パーセンタイルをそのまま使うと
 * 初心者〜中級の差が中心付近で潰れて読めなくなる。
 */
function Radar({ lifts }: { lifts: LiftDiagnosis[] }) {
  // 三角形は正方形を使い切らないので、viewBox は実際に描く範囲だけにする。
  // 余らせるとラベルが頂点から離れて浮いて見える。
  const size = 168;
  const height = 122;
  const cx = size / 2;
  const cy = 74;
  const maxR = 56;

  // 上(-90°) → 右下(30°) → 左下(150°)
  const angles = [-90, 30, 150].map((deg) => (deg * Math.PI) / 180);

  const point = (index: number, ratio: number): [number, number] => [
    cx + Math.cos(angles[index]) * maxR * ratio,
    cy + Math.sin(angles[index]) * maxR * ratio,
  ];

  const ring = (ratio: number): string =>
    [0, 1, 2]
      .map((i) => point(i, ratio).map((n) => n.toFixed(1)).join(','))
      .join(' ');

  const byLift = new Map(lifts.map((lift) => [lift.lift, lift]));
  const values = RADAR_AXES.map((axis) => {
    const lift = byLift.get(axis);
    return lift ? tierProgress(lift.percentile) / LEVELS.length : 0;
  });

  // 面積が0にならないよう、最小の半径を確保する（未入力の種目は中心に寄る）
  const shape = values
    .map((v, i) => point(i, Math.max(0.06, v)).map((n) => n.toFixed(1)).join(','))
    .join(' ');

  const weakest = lifts.reduce<LiftDiagnosis | null>(
    (worst, lift) => (worst == null || lift.percentile < worst.percentile ? lift : worst),
    null,
  );

  const label = RADAR_AXES.map((axis) => {
    const lift = byLift.get(axis);
    return lift ? `${LIFT_LABELS[axis]}は${lift.level.label}` : `${LIFT_LABELS[axis]}は未入力`;
  }).join('、');

  return (
    <svg className="radar" viewBox={`0 0 ${size} ${height}`} role="img" aria-label={label}>
      {/* 5段階ぶんの目盛り */}
      {[1, 2, 3, 4, 5].map((tier) => (
        <polygon
          key={tier}
          points={ring(tier / 5)}
          className={tier === 5 ? 'radar__ring radar__ring--outer' : 'radar__ring'}
        />
      ))}

      {/* 軸 */}
      {[0, 1, 2].map((i) => {
        const [x, y] = point(i, 1);
        return (
          <line key={i} className="radar__axis" x1={cx} y1={cy} x2={x} y2={y} />
        );
      })}

      {/* 実測の面 */}
      <polygon className="radar__shape" points={shape} />

      {/* 頂点。最も弱い種目だけ色を変える */}
      {RADAR_AXES.map((axis, i) => {
        const lift = byLift.get(axis);
        if (lift == null) return null;
        const [x, y] = point(i, Math.max(0.06, values[i]));
        const isWeak = weakest != null && lifts.length > 1 && weakest.lift === axis;
        return (
          <circle
            key={axis}
            className={isWeak ? 'radar__dot radar__dot--weak' : 'radar__dot'}
            cx={x}
            cy={y}
            r={isWeak ? 5 : 3.5}
          />
        );
      })}

      {/* 軸ラベル。各頂点のすぐ外側に置く */}
      <text className="radar__label" x={cx} y={10} textAnchor="middle">
        スクワット
      </text>
      <text className="radar__label" x={size} y={height - 2} textAnchor="end">
        デッド
      </text>
      <text className="radar__label" x={0} y={height - 2} textAnchor="start">
        ベンチ
      </text>
    </svg>
  );
}

/** 5段階それぞれの到達重量。 */
function ThresholdTable({
  thresholds,
  currentLevelId,
  oneRmKg,
  bodyweightKg,
}: {
  thresholds: LevelThreshold[];
  currentLevelId: LevelId;
  oneRmKg: number;
  /** 体重比を出すために使う。0以下なら比の列は出さない */
  bodyweightKg: number;
}) {
  return (
    <div className="table-scroll">
      <table className="ledger">
        <caption className="visually-hidden">
          この体重帯でそれぞれのレベルに到達するのに必要な推定1RM
        </caption>
        <thead>
          <tr>
            <th scope="col">レベル</th>
            <th scope="col">必要な推定1RM</th>
            <th scope="col">体重比</th>
            <th scope="col">差</th>
          </tr>
        </thead>
        <tbody>
          {thresholds.map((threshold) => {
            const isCurrent = threshold.level.id === currentLevelId;
            const delta = threshold.weightKg - oneRmKg;
            return (
              <tr key={threshold.level.id} className={isCurrent ? 'ledger__row--now' : undefined}>
                <th scope="row">
                  <span className={`dot ${LEVEL_CLASS[threshold.level.id]}`} />
                  {threshold.level.label}
                  {isCurrent && <span className="ledger__now">現在</span>}
                </th>
                <td className="num">
                  {threshold.weightKg > 0 ? `${fmt(threshold.weightKg, 1)} kg` : '—'}
                </td>
                <td className="num">
                  {threshold.weightKg > 0 && bodyweightKg > 0
                    ? `${fmt(threshold.weightKg / bodyweightKg, 2)} 倍`
                    : '—'}
                </td>
                <td className="num">
                  {threshold.weightKg <= 0 ? (
                    '—'
                  ) : delta <= 0 ? (
                    <span className="ledger__cleared">到達済み</span>
                  ) : (
                    <>+{fmt(delta, 1)}</>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 種目1行ぶんの台帳表示。 */
function LiftRow({ lift, bodyweightKg }: { lift: LiftDiagnosis; bodyweightKg: number }) {
  return (
    <details className={`lift ${LEVEL_CLASS[lift.level.id]}`}>
      <summary className="lift__row">
        <span className="lift__name">{LIFT_LABELS[lift.lift]}</span>
        <span className="lift__nums">
          <span className="lift__kg num">
            {fmt(lift.oneRmKg, 1)}
            <small> kg</small>
          </span>
          <span className="lift__ratio num">体重の {fmt(lift.bodyweightRatio, 2)} 倍</span>
        </span>
        <span className="lift__tag">{lift.level.label}</span>
      </summary>

      <div className="lift__detail">
        <p className="lift__line">
          {rankText(lift.percentile, lift.bound)}。
          {lift.nextLevel && lift.nextLevel.deltaKg > 0 ? (
            <>
              <strong>{lift.nextLevel.level.label}</strong>まであと
              <strong className="lift__delta"> {fmt(lift.nextLevel.deltaKg, 1)}kg</strong>
              （{fmt(lift.nextLevel.weightKg, 1)}kg で到達）
            </>
          ) : lift.nextLevel == null ? (
            <>最上位レベルに到達しています。</>
          ) : null}
        </p>

        <ThresholdTable
          thresholds={lift.thresholds}
          currentLevelId={lift.level.id}
          oneRmKg={lift.oneRmKg}
          bodyweightKg={bodyweightKg}
        />

        <p className="source-note">
          入力 {fmt(lift.input.weightKg, 1)}kg × {lift.input.reps}回。推定1RMは7式
          （Epley・Brzycki・Lander・Lombardi・O&apos;Conner・Mayhew・Wathen）の平均
          {lift.oneRmSpreadKg > 0 && `／式による差 ${fmt(lift.oneRmSpreadKg, 1)}kg`}。
        </p>
      </div>
    </details>
  );
}

export default function StrengthResult({ diagnosis }: { diagnosis: Diagnosis }) {
  const { total, lifts, weaknesses, sampleSize, bodyweightKg, sex, generatedAt } = diagnosis;
  const headline = total ?? lifts[0];
  const headlineLabel = total ? '3種目合計' : LIFT_LABELS[lifts[0].lift];
  const headlineRatio = headline.oneRmKg / bodyweightKg;

  // 合計評価には nextLevel を持たせていないので、しきい値表から同じ形を作る。
  const headlineIndex = LEVELS.findIndex((level) => level.id === headline.level.id);
  const nextThreshold =
    headlineIndex >= 0 && headlineIndex < LEVELS.length - 1
      ? headline.thresholds[headlineIndex + 1]
      : null;

  return (
    <section className="result" aria-label="診断結果">
      {/* --- リザルト票。スクリーンショットで一番読まれる部分 --- */}
      <div className={`slip record ${LEVEL_CLASS[headline.level.id]}`}>
        <div className="slip__band">
          <span>STRENGTH RECORD</span>
          <span>{generatedAt.replace(/-/g, '.')}</span>
        </div>

        <div className="record__body">
          <p className="record__meta">
            <span>{sex === 'M' ? '男性' : '女性'}</span>
            <span>体重 {fmt(bodyweightKg, 1)}kg</span>
            <span>{headlineLabel}</span>
          </p>

          <div className="record__head">
            <p className="record__level">{headline.level.label}</p>
            <p className="record__ratio">
              <span>{total ? '合計 / 体重' : '体重比'}</span>
              <em className="num">{fmt(headlineRatio, 2)}</em>
            </p>
          </div>

          <div className="record__bar" aria-hidden="true" />

          <p className="record__total">
            {total ? '合計' : '推定1RM'}{' '}
            <b className="num">{fmt(headline.oneRmKg, 1)}</b> kg
            <span className="record__sep">/</span>
            {nextThreshold == null ? (
              <>最上位レベル</>
            ) : (
              <>
                {nextThreshold.level.label}まで{' '}
                <b className="num">
                  +{fmt(Math.max(0, nextThreshold.weightKg - headline.oneRmKg), 1)}
                </b>{' '}
                kg
              </>
            )}
          </p>

          <div className="record__rule" />

          {/* 1種目だけだと三角形が1本の線に潰れて意味を持たないので、
              2種目以上そろったときだけチャートを出す */}
          <div className={lifts.length < 2 ? 'record__grid record__grid--single' : 'record__grid'}>
            {lifts.length >= 2 && <Radar lifts={lifts} />}
            <div className="record__lifts">
              {lifts.map((lift) => (
                <LiftRow key={lift.lift} lift={lift} bodyweightKg={bodyweightKg} />
              ))}
              <p className="record__hint">種目名を押すと内訳が開きます</p>
            </div>
          </div>
        </div>
      </div>

      {/* この物差しが何なのかを、結果のすぐ下で必ず説明する。
          競技会の記録との比較なので、一般の人の中での順位ではない。
          そこを書かないと「初心者」の3文字だけが残ってしまう。 */}
      <div className="yardstick">
        <h3 className="yardstick__title">この判定は何と比べたものか</h3>
        <p className="yardstick__text">
          基準にしているのは<strong>公式競技会に出場した{fmt(sampleSize, 0)}人の記録</strong>です。
          ジムに通う人や一般の人と比べたものではありません。
        </p>
        <p className="yardstick__text">
          競技会に出る人は、そもそも何年もトレーニングを続けている人たちです。
          つまり<strong>この表はかなり厳しい物差し</strong>で、
          ここで「初心者」や「初級」と出ても、一般の人と比べれば十分に強い可能性が高いです。
          {headline.bound === 'below' && (
            <>
              　表より下と出た場合も同じです。競技者の記録が並ぶ表の外側にいるだけで、
              おかしなことは何も起きていません。
            </>
          )}
        </p>
        <p className="yardstick__text yardstick__text--muted">
          一般人口を対象にした信頼できる大規模データは公開されていないため、
          当サイトでは「一般の人の中で上位何%」という数字は出していません。
          推測で基準を作ることはしない方針です。
        </p>
        <p className="yardstick__ratio">
          比べる相手を変えたいときは<strong>体重比</strong>を見てください。
          今回は<em className="num"> {fmt(headlineRatio, 2)}倍 </em>です。
          他人ではなく、前回の自分と比べられます。
        </p>
      </div>

      {/* --- 共有カード。結果票とは別物として、投稿用の1枚だけを作る --- */}
      <div className="slip">
        <div className="slip__band">
          <span>SHARE</span>
          <span>結果を保存・共有する</span>
        </div>
        <div className="slip__body">
          <ShareCard
            draw={(ctx) => drawShareCard(ctx, buildShareCard(diagnosis), SITE_NAME)}
            filename="bodymakers-strength.png"
            title="筋力レベル診断"
            revision={`${headline.level.id}-${headline.oneRmKg}-${lifts.length}`}
          />
        </div>
      </div>

      {/* --- 弱点 --- */}
      <div className="slip">
        <div className="slip__band">
          <span>BALANCE</span>
          <span>種目間のバランス</span>
        </div>
        <div className="slip__body">
          {weaknesses.length === 0 ? (
            <p className="note">
              {lifts.length < 2
                ? '2種目以上を入力すると、種目間のバランスを比較できます。'
                : '3種目の順位に大きな偏りはありません。バランスは取れています。'}
            </p>
          ) : (
            <ul className="weak-list">
              {weaknesses.map((weakness) => (
                <li className="weak" key={weakness.lift}>
                  <p className="weak__head">
                    <span className="tag tag--signal">弱点</span>
                    <span>{LIFT_LABELS[weakness.lift as LiftId]}</span>
                  </p>
                  <p className="weak__body">
                    他の種目より <b className="num">{fmt(weakness.percentileGap, 0)}</b>{' '}
                    ポイント順位が低くなっています。主に使われるのは
                    <strong>{weakness.muscles}</strong>です。
                    {weakness.balancedKg != null && (
                      <>
                        {' '}
                        同水準の選手の種目間比率に当てはめると
                        <b className="num"> {fmt(weakness.balancedKg, 1)}kg </b>
                        前後が目安になります。
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="source-note">
            種目間比率は基準データと同じ母集団から算出した中央値です。
            体格や競技特性によって最適な比率は変わるため、目安として扱ってください。
          </p>
        </div>
      </div>

      {/* --- 出典。データを出す画面には必ず添える --- */}
      <div className="slip">
        <div className="slip__band">
          <span>SOURCE</span>
          <span>判定基準の出典</span>
        </div>
        <div className="slip__body">
          <p className="note">
            <span className="note__title">
              {STANDARDS_SOURCE.name}（{STANDARDS_SOURCE.license}）
            </span>
            公式競技会の記録データ
            {sampleSize != null && (
              <>
                のうち、この体重帯に該当する
                <b className="num"> 約{sampleSize.toLocaleString('ja-JP')}人 </b>
                の記録
              </>
            )}
            をもとに算出しています。対象はノーギア（Raw）・3種目実施のフルパワー大会で、
            選手ごとに最高記録の1試合のみを使用しています。
          </p>

          <p className="source-note" style={{ marginTop: 'var(--s3)' }}>
            {STANDARDS_SOURCE.attribution}{' '}
            <a href={STANDARDS_SOURCE.url} target="_blank" rel="noopener noreferrer">
              openpowerlifting.org
            </a>
            {' / '}
            <a href={url('/sources')}>当サイトの集計方法</a>
          </p>

          <p className="note note--warn" style={{ marginTop: 'var(--s4)' }}>
            <span className="note__title">結果の読み方</span>
            この判定は<strong>あくまで目安</strong>です。推定1RMは換算式による計算値で、
            実測とは差が出ます。体調・睡眠・フォーム・計測日によっても変動します。
            健康状態に不安がある場合は、無理に高重量を試さず医療機関にご相談ください。
          </p>
        </div>
      </div>

      {/* --- 回遊導線。アフィリエイトリンクを入れる場合もこのブロックに置き、PR表記を添える --- */}
      <div className="slip">
        <div className="slip__band">
          <span>NEXT</span>
          <span>次に読む</span>
        </div>
        <div className="slip__body">
          <ul className="next">
            <li>
              <a href={url('/articles/category/training')}>トレーニングの記事を読む</a>
            </li>
            <li>
              <a href={url('/articles/category/nutrition')}>栄養・食事の記事を読む</a>
            </li>
            <li>
              <a href={url('/sources')}>この診断の集計方法と出典をくわしく見る</a>
            </li>
          </ul>
        </div>
      </div>

      <p className="result__save">
        入力した内容も結果も、この端末の外には送られません。
        残したい場合は上の共有カードを保存するか、スクリーンショットを撮ってください。
      </p>
    </section>
  );
}
