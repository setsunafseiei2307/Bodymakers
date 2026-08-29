/**
 * 診断結果の表示。
 *
 * スクリーンショットで共有されることを前提に、
 * 「レベル」「上位何%」「推定1RM」がひと目で読めるようにしている。
 * 数値だけが独り歩きしないよう、出典と注記もカード内に含める。
 */

import { fmt } from '../../lib/format';
import {
  LEVELS,
  LIFT_LABELS,
  STANDARDS_SOURCE,
  type LevelId,
  type LiftId,
} from '../../lib/strength/standards';
import {
  topPercent,
  type Diagnosis,
  type LiftDiagnosis,
  type LevelThreshold,
} from '../../lib/strength/diagnose';

/** レベルIDごとのCSSクラス修飾子。色はCSS側のトークンで持つ。 */
const LEVEL_CLASS: Record<LevelId, string> = {
  beginner: 'level--beginner',
  novice: 'level--novice',
  intermediate: 'level--intermediate',
  advanced: 'level--advanced',
  elite: 'level--elite',
};

/** 順位を「上位◯%」の文字列にする。範囲外のときは断定しない書き方にする。 */
function rankText(percentile: number, bound: 'in-range' | 'below' | 'above'): string {
  const top = topPercent(percentile);
  if (bound === 'below') return `上位${fmt(top, 0)}%より下（基準表の範囲外）`;
  if (bound === 'above') return `上位${fmt(top, 0)}%以内`;
  return `上位${fmt(top, 1)}%`;
}

/**
 * 「上位66%」は数字が大きいほど順位が低いため、方向を読み違えられやすい。
 * 「◯%の人より強い」という平易な言い換えを添えて補う。
 */
function strongerThanText(
  percentile: number,
  bound: 'in-range' | 'below' | 'above',
): string {
  if (bound === 'below') return '基準表の下限（上位99%）に届いていません';
  return `競技会出場者の ${fmt(percentile, 1)}% より強い水準です`;
}

/**
 * パーセンタイルのゲージ。
 * 5段階の帯を背景に敷き、その上に現在位置のマーカーを置く。
 */
function LevelGauge({
  percentile,
  bound,
  label,
}: {
  percentile: number;
  bound: 'in-range' | 'below' | 'above';
  label: string;
}) {
  // マーカーが端で見切れないよう 1〜99% の範囲に収める
  const position = Math.min(99, Math.max(1, percentile));

  return (
    <div className="gauge">
      <div
        className="gauge__track"
        role="img"
        aria-label={`${label}：${rankText(percentile, bound)}`}
      >
        {LEVELS.map((level) => (
          <span
            key={level.id}
            className={`gauge__band ${LEVEL_CLASS[level.id]}`}
            style={{ flexGrow: level.maxPercentile - level.minPercentile }}
          />
        ))}
        <span className="gauge__marker" style={{ left: `${position}%` }} aria-hidden="true">
          <span className="gauge__marker-dot" />
        </span>
      </div>
      {/*
        目盛りは両端だけを出す。5段階すべてを帯の幅に比例して並べると、
        幅の狭い帯（初心者・エリートは各10%）でラベルが見切れる。
        5段階の内訳は帯の色と、結果カードのバッジで分かる。
      */}
      <div className="gauge__scale" aria-hidden="true">
        <span className="gauge__scale-end">{LEVELS[0].label}</span>
        <span className="gauge__scale-end">{LEVELS[LEVELS.length - 1].label}</span>
      </div>
    </div>
  );
}

/** 5段階それぞれの到達重量表。 */
function ThresholdTable({
  thresholds,
  currentLevelId,
  oneRmKg,
}: {
  thresholds: LevelThreshold[];
  currentLevelId: LevelId;
  oneRmKg: number;
}) {
  return (
    <div className="table-scroll">
      <table className="threshold-table">
        <caption className="visually-hidden">
          この体重帯でそれぞれのレベルに到達するのに必要な推定1RM
        </caption>
        <thead>
          <tr>
            <th scope="col">レベル</th>
            <th scope="col">必要な推定1RM</th>
            <th scope="col">現在との差</th>
          </tr>
        </thead>
        <tbody>
          {thresholds.map((threshold) => {
            const isCurrent = threshold.level.id === currentLevelId;
            const delta = threshold.weightKg - oneRmKg;
            return (
              <tr
                key={threshold.level.id}
                className={isCurrent ? 'threshold-table__row--current' : undefined}
              >
                <th scope="row">
                  <span className={`level-dot ${LEVEL_CLASS[threshold.level.id]}`} />
                  {threshold.level.label}
                  {isCurrent && <span className="threshold-table__current">現在</span>}
                </th>
                <td className="threshold-table__weight">
                  {threshold.weightKg > 0 ? `${fmt(threshold.weightKg, 1)} kg` : '—'}
                </td>
                <td className="threshold-table__delta">
                  {threshold.weightKg <= 0 ? (
                    '—'
                  ) : delta <= 0 ? (
                    <span className="threshold-table__cleared">到達済み</span>
                  ) : (
                    <>+{fmt(delta, 1)} kg</>
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

/** 1種目分の結果カード。 */
function LiftCard({ lift }: { lift: LiftDiagnosis }) {
  return (
    <article className="lift-result">
      <header className="lift-result__header">
        <h3 className="lift-result__name">{LIFT_LABELS[lift.lift]}</h3>
        <span className={`level-badge ${LEVEL_CLASS[lift.level.id]}`}>{lift.level.label}</span>
      </header>

      <div className="lift-result__numbers">
        <div className="stat">
          <span className="stat__label">推定1RM</span>
          <span className="stat__value">
            {fmt(lift.oneRmKg, 1)}
            <span className="stat__unit">kg</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">順位</span>
          <span className="stat__value stat__value--small">
            {rankText(lift.percentile, lift.bound)}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">体重比</span>
          <span className="stat__value stat__value--small">
            {fmt(lift.bodyweightRatio, 2)}
            <span className="stat__unit">倍</span>
          </span>
        </div>
      </div>

      <LevelGauge
        percentile={lift.percentile}
        bound={lift.bound}
        label={LIFT_LABELS[lift.lift]}
      />

      <p className="lift-result__definition">{lift.level.description}</p>

      {lift.nextLevel && lift.nextLevel.deltaKg > 0 ? (
        <p className="lift-result__next">
          <strong>{lift.nextLevel.level.label}</strong>まであと
          <strong className="lift-result__delta"> {fmt(lift.nextLevel.deltaKg, 1)} kg</strong>
          （{fmt(lift.nextLevel.weightKg, 1)} kg で到達）
        </p>
      ) : lift.nextLevel == null ? (
        <p className="lift-result__next">最上位レベルに到達しています。</p>
      ) : null}

      <details className="lift-result__details">
        <summary>この体重帯のレベル別到達重量を見る</summary>
        <ThresholdTable
          thresholds={lift.thresholds}
          currentLevelId={lift.level.id}
          oneRmKg={lift.oneRmKg}
        />
        <p className="source-note">
          入力は {fmt(lift.input.weightKg, 1)}kg × {lift.input.reps}回。
          推定1RMは7つの換算式（Epley・Brzycki・Lander・Lombardi・O'Conner・Mayhew・Wathen）
          の平均値です
          {lift.oneRmSpreadKg > 0 && `（式による差は ${fmt(lift.oneRmSpreadKg, 1)}kg）`}。
        </p>
      </details>
    </article>
  );
}

export default function StrengthResult({ diagnosis }: { diagnosis: Diagnosis }) {
  const { total, lifts, weaknesses, sampleSize, bodyweightKg, sex } = diagnosis;
  // 3種目そろっていれば合計を、そうでなければ入力された最初の種目を主表示にする
  const headline = total ?? lifts[0];
  const headlineLabel = total ? '3種目合計' : LIFT_LABELS[lifts[0].lift];

  return (
    <section className="result" aria-label="診断結果">
      {/* --- 主表示。スクリーンショットで一番読まれる部分 --- */}
      <div className={`result__hero ${LEVEL_CLASS[headline.level.id]}`}>
        <p className="result__hero-context">
          {sex === 'M' ? '男性' : '女性'} / 体重 {fmt(bodyweightKg, 1)}kg / {headlineLabel}
        </p>
        <p className="result__hero-level">{headline.level.label}</p>
        <p className="result__hero-rank">{rankText(headline.percentile, headline.bound)}</p>
        <p className="result__hero-stronger">
          {strongerThanText(headline.percentile, headline.bound)}
        </p>
        <p className="result__hero-definition">{headline.level.description}</p>
        <div className="result__hero-gauge">
          <LevelGauge
            percentile={headline.percentile}
            bound={headline.bound}
            label={headlineLabel}
          />
        </div>
        {total && (
          <p className="result__hero-total">
            推定トータル {fmt(total.oneRmKg, 1)} kg（3種目の推定1RMの合計）
          </p>
        )}
      </div>

      {/* --- 種目別 --- */}
      <div className="result__lifts">
        {lifts.map((lift) => (
          <LiftCard key={lift.lift} lift={lift} />
        ))}
      </div>

      {/* --- 弱点 --- */}
      <div className="result__section">
        <h2 className="result__section-title">種目間のバランス</h2>
        {weaknesses.length === 0 ? (
          <div className="note">
            {lifts.length < 2
              ? '2種目以上を入力すると、種目間のバランスを比較できます。'
              : '3種目の順位に大きな偏りはありません。バランスは取れています。'}
          </div>
        ) : (
          <ul className="weakness-list">
            {weaknesses.map((weakness) => (
              <li className="weakness" key={weakness.lift}>
                <p className="weakness__title">
                  <span className="badge">相対的に弱い</span>
                  {LIFT_LABELS[weakness.lift as LiftId]}
                </p>
                <p className="weakness__body">
                  他の種目より
                  <strong> 約{fmt(weakness.percentileGap, 0)}ポイント </strong>
                  順位が低くなっています。主に使われるのは
                  <strong>{weakness.muscles}</strong>です。
                  {weakness.balancedKg != null && (
                    <>
                      {' '}
                      同水準の選手の種目間比率（中央値）に当てはめると
                      <strong> {fmt(weakness.balancedKg, 1)}kg </strong>
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
          個人の体格や競技特性によって最適な比率は変わるため、目安として扱ってください。
        </p>
      </div>

      {/* --- 出典。データを出す画面には必ず添える --- */}
      <div className="result__section">
        <h2 className="result__section-title">判定基準の出典</h2>
        <div className="note">
          <span className="note__title">
            {STANDARDS_SOURCE.name}（{STANDARDS_SOURCE.license}）
          </span>
          <p>
            公式競技会の記録データ
            {sampleSize != null && (
              <>
                のうち、この体重帯に該当する
                <strong> 約{sampleSize.toLocaleString('ja-JP')}人 </strong>
                の記録
              </>
            )}
            をもとに算出しています。対象はノーギア（Raw）・3種目実施（フルパワー）・
            {diagnosis.generatedAt.slice(0, 4)}年時点で集計した2010年以降の大会で、
            選手ごとに最高記録の1試合のみを使用しています。
          </p>
          <p className="source-note" style={{ marginTop: '0.5rem' }}>
            {STANDARDS_SOURCE.attribution}{' '}
            <a href={STANDARDS_SOURCE.url} target="_blank" rel="noopener noreferrer">
              openpowerlifting.org
            </a>
            {' / '}
            <a href={STANDARDS_SOURCE.dataUrl} target="_blank" rel="noopener noreferrer">
              データ配布元
            </a>
            {' / '}
            <a href="/sources">当サイトの集計方法</a>
          </p>
        </div>

        <div className="note note--warning">
          <span className="note__title">結果の読み方</span>
          <p>
            この判定は<strong>あくまで目安</strong>です。比較対象は競技会に出場した人たちで、
            一般のトレーニング人口より全体に高い水準にあります。順位が低く出ても、
            ジムでの標準より弱いという意味ではありません。
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            推定1RMは換算式による計算値で、実測とは差が出ます。
            体調・睡眠・フォーム・計測日によっても変動します。
            健康状態に不安がある場合は、無理に高重量を試さず医療機関にご相談ください。
          </p>
        </div>
      </div>

      {/* --- 回遊導線。診断結果から記事へ送る。
              アフィリエイトリンクを差し込む場合もこのブロックに追加する
              （例: プロテイン・トレーニングギアの紹介）。 --- */}
      <div className="result__section">
        <h2 className="result__section-title">次に読む</h2>
        <ul className="next-links">
          <li>
            <a href="/articles/category/training">トレーニングの記事を読む</a>
          </li>
          <li>
            <a href="/articles/category/nutrition">栄養・食事の記事を読む</a>
          </li>
          <li>
            <a href="/sources">この診断の集計方法と出典をくわしく見る</a>
          </li>
        </ul>
        {/* 広告枠（診断結果下）。現時点では広告タグを読み込まない。 */}
        <div className="ad-slot ad-slot--inline" aria-hidden="true" data-ad-slot="result" />
      </div>

      <p className="result__save-hint">
        結果は保存されません。残しておきたい場合はスクリーンショットを撮ってください。
      </p>
    </section>
  );
}
