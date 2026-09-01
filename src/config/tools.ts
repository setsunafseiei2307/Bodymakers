/**
 * ツールの一覧。
 *
 * ナビ・一覧ページ・トップページの導線がすべてここを参照する。
 * ツールを足すときは、ページを作ってこの配列に1行足せば全部に反映される。
 *
 * 記事から「読んだあとに使うツール」を指すのにも使う。
 * 記事の frontmatter に primaryTool: 'burn' と書くと、記事末のCTAが
 * この表を見て切り替わる。以前はレイアウトにCTAを直書きしていたため、
 * ダイエットの記事にも筋力診断への誘導が出ていた。
 */

/** 記事の frontmatter から指すための識別子。 */
export type ToolKey =
  | 'strength'
  | 'oneRm'
  | 'rpe'
  | 'plan'
  | 'today'
  | 'burn'
  | 'nutrition'
  | 'foods'
  | 'fitness'
  | 'programs'
  | 'smolov';

export interface ToolEntry {
  /** 記事の frontmatter から指すときの名前 */
  key: ToolKey;
  href: string;
  /** 一覧に出す名前 */
  label: string;
  /** 票の帯に出す英字ラベル */
  code: string;
  /** 一覧カードの説明文 */
  summary: string;
  /**
   * 記事末のCTAの見出しの既定値。
   * 「詳しくはこちら」ではなく、読んだ直後にやりたくなることを書く。
   * 記事側で ctaLabel を書けばそちらが優先される。
   */
  cta: string;
  /**
   * 記事末のCTAの本文。summary より短く、行動の直前に読む前提で書く。
   */
  ctaText: string;
  /** 主軸の機能として強調するか */
  primary?: boolean;
}

export const TOOLS: readonly ToolEntry[] = [
  {
    key: 'fitness',
    href: '/tools/fitness',
    label: '総合身体能力スコア',
    code: 'FITNESS',
    summary:
      '懸垂・5km・体重比BIG3・プランクを、明示したマイルストーンで評価します。人口順位ではなく、前回の自分と比べるためのBodymakers独自スコアです。',
    primary: true,
    cta: '総合的な現在地を記録する',
    ctaText: '測った種目だけで、筋力・自重・心肺・体幹の進捗を一枚にまとめます。',
  },
  {
    key: 'strength',
    href: '/strength-standards',
    label: '筋力レベル診断',
    code: 'STRENGTH',
    summary:
      'ベンチ・スクワット・デッドリフトの記録から、同じ性別・体重の人と比べた5段階レベルとパーセンタイルを判定します。公式競技会の実データ387,265人分が基準。',
    cta: 'あなたの記録は上位何%か調べる',
    ctaText:
      '挙上重量とレップ数を入れるだけで、同じ性別・体重帯の競技者387,265人の中での位置が出ます。',
  },
  {
    key: 'oneRm',
    href: '/tools/one-rep-max',
    label: '1RM・RPE換算',
    code: 'ONE REP MAX',
    summary:
      '挙上重量とレップ数から1RMを推定します。余力（RPE）を入れた計算、懸垂やディップスの体重込みの計算にも同じ画面で切り替えられます。',
    cta: '今日のセットから1RMを計算する',
    ctaText:
      '重量とレップ数から、1回だけ挙げられる重量を推定します。7つの換算式の平均とばらつきを同時に出します。',
  },
  {
    key: 'rpe',
    href: '/tools/rpe',
    label: 'RPE換算',
    code: 'RPE',
    summary:
      '「あと何回できたか」から1RMを逆算し、次のセットの目安重量表を出します。1RM換算と同じツールで、開いたときの計算方法が違うだけです。',
    cta: 'RPEから今日の重量を逆算する',
    ctaText:
      '重量・レップ数・RPEから1RMを推定し、レップ数とRPEの組み合わせごとの目安重量を表にします。',
  },
  {
    key: 'plan',
    href: '/tools/plan',
    label: 'ダイエット計画',
    code: 'PLAN',
    summary:
      '「いつまでに何kg」から、週あたりのペースと1日のカロリー収支を出します。今の体重・目標体重・期間の3つだけで結果が出ます。増量（バルクアップ）にも対応。',
    cta: '自分の目標ペースを作る',
    ctaText:
      '今の体重・目標体重・期間の3つを入れるだけで、1日あたりどれだけの差が要るかが出ます。ペースが速すぎないかも一緒に示します。',
  },
  {
    key: 'today',
    href: '/tools/today',
    label: '今日の記録',
    code: 'TODAY',
    summary:
      '食べたものと動いたものを入れると、摂取カロリー・PFC・消費カロリー・差し引きが一度に出ます。身長と年齢を足せば「この調子なら1か月で何kg」まで分かります。',
    cta: '今日の収支を計算する',
    ctaText:
      '今日の運動と食事から、摂取・消費・鍛えた部位・「この調子なら月に何kg」までをまとめて出します。',
  },
  {
    key: 'burn',
    href: '/tools/burn',
    label: '運動の消費カロリー',
    code: 'BURN',
    summary:
      'ウォーキング・ランニング・筋トレなどの消費カロリーをメッツから計算し、「ごはん茶碗◯杯ぶん」と食べ物で言い換えます。逆に「ご飯1杯を消費するには何分歩くか」も分かります。',
    cta: '自分の体重で消費カロリーを出す',
    ctaText:
      '活動・時間・体重からメッツで消費カロリーを計算し、「ごはん何杯ぶん」に言い換えます。',
  },
  {
    key: 'nutrition',
    href: '/tools/nutrition',
    label: 'PFC・カロリー計算',
    code: 'MACROS',
    summary:
      '基礎代謝と活動量から1日の消費カロリーを求め、目標に応じたPFCの配分を計算します。',
    cta: '自分のカロリーとPFCを計算する',
    ctaText:
      '体格と活動量から、基礎代謝・必要カロリー・たんぱく質／脂質／炭水化物の目安を出します。',
  },
  {
    key: 'foods',
    href: '/tools/foods',
    label: '食品の栄養価',
    code: 'FOOD',
    summary:
      '日本食品標準成分表の全2,538食品から、カロリーとPFCを調べます。カツ丼や親子丼など31品の料理は、使った材料とグラム数の内訳つきで出します。',
    cta: '食べたものの栄養を調べる',
    ctaText:
      '食品成分表の収載値から、カロリーとPFCを調べられます。丼ものや定食は材料の内訳つきで出します。',
  },
  {
    key: 'programs',
    href: '/tools/programs',
    label: 'トレーニングプログラム生成',
    code: 'PROGRAM',
    summary:
      '1RM・トレーニング歴・週の頻度・目的から、4週間の重量とセットを生成します。初心者の線形進歩、中級者の週単位進行、経験者の強度・ボリューム分割に対応。',
    cta: '次の4週間を組み立てる',
    ctaText:
      '今の1RMと通える回数から、無理なく進めるための4週間の重量・回数・セットを作ります。',
  },
  {
    key: 'smolov',
    href: '/tools/smolov',
    label: 'Smolov プログラム生成',
    code: 'SMOLOV',
    summary:
      '1RMから Smolov の4週間分のメニューを生成します。負荷が非常に高いプログラムです。',
    cta: '1RMからメニューを生成する',
    ctaText:
      '1RMを入れると Smolov の4週間分のメニューが出ます。負荷が非常に高いプログラムです。',
  },
] as const;

/** frontmatter の検証に使うキーの一覧。 */
export const TOOL_KEYS = TOOLS.map((tool) => tool.key);

/** キーからツールを引く。見つからなければ undefined。 */
export function findTool(key: string | undefined): ToolEntry | undefined {
  if (!key) return undefined;
  return TOOLS.find((tool) => tool.key === key);
}
