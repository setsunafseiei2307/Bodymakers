/**
 * 計測の受け口。
 *
 * いまは何も送らない。計測サービスを決めていないため、
 * ベンダーのSDKもスニペットも入れない。
 *
 * ここにあるのは「どのイベントを、どの項目で数えるか」という約束だけ。
 * 送り先を決めたときに、この1つの関数の中身を差し替えれば済むようにしてある。
 *
 * 個人を特定できる値は送らない。体重・年齢・食事内容・記録そのものは
 * イベントの項目に入れない。数えるのは画面と操作だけ。
 */

import type { HomeStateId } from './home/state';

/** Homeで今回実際に発火させるイベント。 */
export type HomeEventName =
  | 'home_view'
  | 'hero_cta_click'
  | 'hero_secondary_click'
  | 'draft_resume_click';

/**
 * 契約として名前だけ決めておくイベント。
 * 今回はHomeだけの改修なので、発火はまだ実装しない。
 */
export type ReservedEventName =
  | 'quiz_start'
  | 'quiz_question_view'
  | 'quiz_abandon'
  | 'quiz_complete'
  | 'plan_view'
  | 'today_start'
  | 'today_complete';

export type EventName = HomeEventName | ReservedEventName;

/**
 * CTAの位置。
 * 画面下に固定するCTAは今回作っていないため 'sticky' は持たせない。
 */
export type CtaPosition = 'hero' | 'final';

export interface EventProperties {
  state?: HomeStateId;
  position?: CtaPosition;
}

/**
 * 送り先が決まるまでは何もしない。
 * 呼び出し側はこの関数だけを見ていればよく、送信の有無を気にしなくてよい。
 */
export function track(_event: EventName, _properties: EventProperties = {}): void {
  // 送信先は未定。ここで例外を出すと画面が壊れるので、常に静かに何もしない。
}
