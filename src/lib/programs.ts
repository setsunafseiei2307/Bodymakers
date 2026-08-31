/**
 * Bodymakers独自の4週間プログラム生成。
 * 特定の有料プログラムを複製せず、線形進歩・週単位の波・デロードという
 * 広く使われる負荷管理の原則だけで組み立てる。
 */

import { isFiniteNumber } from './format';
import { roundToIncrement } from './onerm';

export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';
export type TrainingGoal = 'strength' | 'muscle' | 'habit';

export interface ProgramInput {
  exercise: string;
  oneRmKg: number;
  experience: TrainingExperience;
  daysPerWeek: number;
  goal: TrainingGoal;
}

export interface ProgramSession {
  week: number;
  day: number;
  label: string;
  sets: number;
  reps: number;
  percent: number;
  weightKg: number;
  note: string;
}

export interface TrainingProgram {
  id: 'linear' | 'weekly-wave' | 'volume-strength';
  name: string;
  summary: string;
  sessions: ProgramSession[];
  progression: string;
}

function roundedLoad(oneRmKg: number, percent: number): number {
  return roundToIncrement(oneRmKg * (percent / 100), 2.5) ?? 0;
}

export function buildTrainingProgram(input: ProgramInput): TrainingProgram | null {
  if (!isFiniteNumber(input.oneRmKg) || input.oneRmKg <= 0 || input.oneRmKg > 600) return null;
  if (!Number.isInteger(input.daysPerWeek) || input.daysPerWeek < 2 || input.daysPerWeek > 6) return null;

  if (input.experience === 'beginner') {
    const basePercent = input.goal === 'muscle' ? 62.5 : 67.5;
    const sets = input.goal === 'habit' ? 3 : input.goal === 'muscle' ? 4 : 3;
    const reps = input.goal === 'strength' ? 5 : 8;
    const sessions: ProgramSession[] = [];
    for (let week = 1; week <= 4; week += 1) {
      for (let day = 1; day <= input.daysPerWeek; day += 1) {
        const sessionIndex = (week - 1) * input.daysPerWeek + day - 1;
        const deload = week === 4;
        const percent = deload ? 55 : Math.min(80, basePercent + sessionIndex * 1.5);
        sessions.push({
          week,
          day,
          label: deload ? '軽めに整える' : '同じフォームで少しずつ伸ばす',
          sets: deload ? Math.max(2, sets - 1) : sets,
          reps,
          percent,
          weightKg: roundedLoad(input.oneRmKg, percent),
          note: '全セット成功し、フォームに余裕があれば次回2.5kg上げる',
        });
      }
    }
    return {
      id: 'linear',
      name: '4週間 線形進歩',
      summary: '同じ種目を週ごとではなくセッションごとに少しずつ重くする、初心者向けの構成です。',
      sessions,
      progression: '失敗した日は重量を据え置き、2回続けて失敗したら10%下げてフォームを作り直します。',
    };
  }

  if (input.daysPerWeek <= 3) {
    const sessions: ProgramSession[] = [];
    const templates = input.goal === 'muscle'
      ? [
          { label: '筋量・ボリューム', percent: 65, sets: 4, reps: 8 },
          { label: '軽め・技術', percent: 57.5, sets: 3, reps: 6 },
          { label: '筋力', percent: 75, sets: 3, reps: 5 },
        ]
      : input.goal === 'habit'
        ? [
            { label: '基本練習', percent: 65, sets: 3, reps: 5 },
            { label: '短時間・技術', percent: 55, sets: 2, reps: 5 },
            { label: '少し重く', percent: 75, sets: 3, reps: 3 },
          ]
        : [
            { label: 'ボリューム', percent: 70, sets: 4, reps: 6 },
            { label: '軽め・技術', percent: 62.5, sets: 3, reps: 5 },
            { label: '強度', percent: 82.5, sets: 4, reps: 3 },
          ];
    for (let week = 1; week <= 4; week += 1) {
      for (let day = 1; day <= input.daysPerWeek; day += 1) {
        const base = templates[(day - 1) % templates.length] ?? templates[0];
        const deload = week === 4;
        const percent = deload ? base.percent - 12.5 : base.percent + (week - 1) * 2.5;
        sessions.push({
          week,
          day,
          label: deload ? `${base.label}・デロード` : base.label,
          sets: deload ? Math.max(2, base.sets - 1) : base.sets,
          reps: base.reps,
          percent,
          weightKg: roundedLoad(input.oneRmKg, percent),
          note: day === input.daysPerWeek ? '最後の1セットも1〜2回の余力を残す' : 'フォーム速度を保つ',
        });
      }
    }
    return {
      id: 'weekly-wave',
      name: '4週間 週単位ウェーブ',
      summary: 'ボリューム・技術・強度の日を分け、週単位で少しずつ上げる中級者向け構成です。',
      sessions,
      progression: '4週目を軽くしたあと、1RMを再測定せず、全セットに余裕があれば次の4週を+2.5kgで始めます。',
    };
  }

  const sessions: ProgramSession[] = [];
  const daysToTrainLift = Math.min(3, input.daysPerWeek);
  for (let week = 1; week <= 4; week += 1) {
    const deload = week === 4;
    for (let day = 1; day <= daysToTrainLift; day += 1) {
      const variants = input.goal === 'muscle'
        ? [
            { label: '筋量・ボリューム', percent: 62.5, sets: 5, reps: 8 },
            { label: '技術', percent: 57.5, sets: 4, reps: 5 },
            { label: '筋力', percent: 77.5, sets: 4, reps: 4 },
          ]
        : input.goal === 'habit'
          ? [
              { label: '基本練習', percent: 65, sets: 3, reps: 5 },
              { label: '短時間・技術', percent: 55, sets: 3, reps: 3 },
              { label: '少し重く', percent: 77.5, sets: 3, reps: 3 },
            ]
          : [
              { label: 'ボリューム', percent: 67.5, sets: 5, reps: 6 },
              { label: '技術・速度', percent: 60, sets: 6, reps: 3 },
              { label: '強度', percent: 85, sets: 4, reps: 3 },
            ];
      const base = variants[day - 1] ?? variants[0];
      const percent = deload ? base.percent - 15 : base.percent + (week - 1) * 2.5;
      sessions.push({
        week,
        day,
        label: deload ? `${base.label}・デロード` : base.label,
        sets: deload ? Math.max(2, base.sets - 2) : base.sets,
        reps: base.reps,
        percent,
        weightKg: roundedLoad(input.oneRmKg, percent),
        note: '補助種目は回復を妨げない範囲で2〜3種目',
      });
    }
  }
  return {
    id: 'volume-strength',
    name: '4週間 ボリューム・強度分割',
    summary: `同じリフトは週3回までにして目的を日ごとに分けます。残り${input.daysPerWeek - daysToTrainLift}日は別部位・補助種目・回復へ使います。`,
    sessions,
    progression: 'バー速度やフォームが落ちたら、その日は5〜10%下げます。4週ごとに疲労を抜いてから更新します。',
  };
}
