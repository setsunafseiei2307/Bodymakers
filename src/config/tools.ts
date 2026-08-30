/**
 * ツールの一覧。
 *
 * ナビ・一覧ページ・トップページの導線がすべてここを参照する。
 * ツールを足すときは、ページを作ってこの配列に1行足せば全部に反映される。
 */

export interface ToolEntry {
  href: string;
  /** 一覧に出す名前 */
  label: string;
  /** 票の帯に出す英字ラベル */
  code: string;
  /** 一覧カードの説明文 */
  summary: string;
  /** 主軸の機能として強調するか */
  primary?: boolean;
}

export const TOOLS: readonly ToolEntry[] = [
  {
    href: '/strength-standards',
    label: '筋力レベル診断',
    code: 'STRENGTH',
    summary:
      'ベンチ・スクワット・デッドリフトの記録から、同じ性別・体重の人と比べた5段階レベルとパーセンタイルを判定します。公式競技会の実データ387,265人分が基準。',
    primary: true,
  },
  {
    href: '/tools/one-rep-max',
    label: '1RM換算',
    code: 'ONE REP MAX',
    summary:
      '挙上重量とレップ数から1RMを推定します。7つの換算式の値と、推定の幅も表示します。',
  },
  {
    href: '/tools/rpe',
    label: 'RPE換算',
    code: 'RPE',
    summary:
      '「あと何回できたか」から1RMを逆算し、次のセットの目安重量表を出します。',
  },
  {
    href: '/tools/plan',
    label: 'ダイエット計画',
    code: 'PLAN',
    summary:
      '「いつまでに何kg」から、週あたりのペースと1日のカロリー収支を出します。体重・目標体重・目標日の3つだけで結果が出ます。増量（バルクアップ）にも対応。',
  },
  {
    href: '/tools/today',
    label: '今日の記録',
    code: 'TODAY',
    summary:
      '食べたものと動いたものを入れると、摂取カロリー・PFC・消費カロリー・差し引きが一度に出ます。身長と年齢を足せば「この調子なら1か月で何kg」まで分かります。',
  },
  {
    href: '/tools/burn',
    label: '運動の消費カロリー',
    code: 'BURN',
    summary:
      'ウォーキング・ランニング・筋トレなどの消費カロリーをメッツから計算し、「ごはん茶碗◯杯ぶん」と食べ物で言い換えます。逆に「ご飯1杯を消費するには何分歩くか」も分かります。',
  },
  {
    href: '/tools/nutrition',
    label: 'PFC・カロリー計算',
    code: 'MACROS',
    summary:
      '基礎代謝と活動量から1日の消費カロリーを求め、目標に応じたPFCの配分を計算します。',
  },
  {
    href: '/tools/foods',
    label: '食品の栄養価',
    code: 'FOOD',
    summary:
      '日本食品標準成分表の全2,538食品から、カロリーとPFCを調べます。分量を変えると成分値も変わります。',
  },
  {
    href: '/tools/smolov',
    label: 'Smolov プログラム生成',
    code: 'SMOLOV',
    summary:
      '1RMから Smolov の4週間分のメニューを生成します。負荷が非常に高いプログラムです。',
  },
] as const;
