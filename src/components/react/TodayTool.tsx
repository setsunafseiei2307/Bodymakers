/**
 * 今日の記録。
 *
 * 【この画面の役割】
 * 開いたら「今日やること」だけが見える。詳細は選んだ人にだけ出す。
 *
 * 以前はこの1ファイルが1275行あり、Training / Nutrition / Food / Exercise /
 * Recovery / Adaptive / Coach / Progress / Program を同時に描いていた。
 * 機能は揃っていたが、開いた瞬間に9種類の情報が並ぶので、
 * 今日やることがどれなのか読み取れなかった。
 *
 * いまはこのファイルは司会だけをする。
 *   - 状態と計算 … today/useTodayState.ts（中身は一切変えていない）
 *   - 描画 … today/TodayOverview / TodayTraining / TodayNutrition /
 *            TodayRecovery / TodayProgress
 *
 * 機能は1つも消していない。消したのは「初期表示に置くこと」であって、
 * 微量栄養素も、重量が変わった理由も、週次分析も、それぞれの画面に残っている。
 *
 * 保存キー（bodymakers:data:v1）と保存処理は従来どおり。
 */

import { useState } from 'react';

import TodayOverview, { type TodayView } from './today/TodayOverview';
import TodayTraining from './today/TodayTraining';
import TodayNutrition from './today/TodayNutrition';
import TodayRecovery from './today/TodayRecovery';
import TodayProgress from './today/TodayProgress';
import { useTodayState } from './today/useTodayState';

const VIEW_TITLES: Record<Exclude<TodayView, 'overview'>, string> = {
  training: '今日のトレーニング',
  nutrition: '今日の食事',
  body: '体重・記録',
  progress: '今週のまとめ',
};

export default function TodayTool() {
  const ctx = useTodayState();
  const [view, setView] = useState<TodayView>('overview');

  function open(next: TodayView) {
    setView(next);
    // 詳細へ移ったら先頭から読ませる。前の画面のスクロール位置を引き継がない。
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (view === 'overview') {
    return (
      <div className="tool">
        <TodayOverview ctx={ctx} onOpen={open} />
      </div>
    );
  }

  return (
    <div className="tool">
      <div className="td__detail-head">
        <button type="button" className="td__back" onClick={() => open('overview')}>
          ← 今日やること
        </button>
        <h1>{VIEW_TITLES[view]}</h1>
      </div>

      {view === 'training' && <TodayTraining ctx={ctx} />}
      {view === 'nutrition' && <TodayNutrition ctx={ctx} />}
      {view === 'body' && <TodayRecovery ctx={ctx} />}
      {view === 'progress' && <TodayProgress ctx={ctx} />}
    </div>
  );
}
