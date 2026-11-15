import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';

/** 作業時間（分）、休憩時間（分）、作業と休憩の繰り返し回数です。 */
type TimerValues = {
  readonly break: number;
  readonly loop: number;
  readonly work: number;
};

/**
 * 一部だけを指定したタイマーの値です。
 *
 * 指定しない項目はキー自体を持たず、`undefined`を値として持ちません。
 */
type PartialTimerValues = {
  readonly break?: number;
  readonly loop?: number;
  readonly work?: number;
};

/** タイマーの値の項目名です。設定ファイルのキー名と同じです。 */
type TimerValueKey = keyof TimerValues;

/** 何も指定しない場合に作業と休憩を繰り返す回数です。 */
const DEFAULT_LOOP_COUNT = 3,
  /** 作業時間と休憩時間に指定できる最大の分数です。 */
  MAXIMUM_DURATION_MINUTES = 1440,
  /** 作業時間、休憩時間、繰り返し回数に指定できる最小値です。 */
  MINIMUM_TIMER_VALUE = 1,
  /** CLI、設定ファイル、プリセットのいずれでも指定しない場合の値です。 */
  DEFAULT_TIMER_VALUES: TimerValues = {
    break: DEFAULT_BREAK_DURATION_MINUTES,
    loop: DEFAULT_LOOP_COUNT,
    work: DEFAULT_WORK_DURATION_MINUTES,
  },
  /** タイマーの値の項目名を、設定ファイルでの並び順で列挙します。 */
  TIMER_VALUE_KEYS: readonly TimerValueKey[] = ['work', 'break', 'loop'],
  /** 項目ごとに指定できる最大値です。 */
  MAXIMUM_TIMER_VALUES: Readonly<Record<TimerValueKey, number>> = {
    break: MAXIMUM_DURATION_MINUTES,
    loop: Number.MAX_SAFE_INTEGER,
    work: MAXIMUM_DURATION_MINUTES,
  },
  /** 値が項目に指定できる範囲の整数か判定します。 */
  isValidTimerValue = (key: TimerValueKey, value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MINIMUM_TIMER_VALUE &&
    value <= MAXIMUM_TIMER_VALUES[key],
  /** 項目に指定できる範囲を説明する文章です。 */
  describeTimerValueRange = (key: TimerValueKey): string =>
    `an integer from ${MINIMUM_TIMER_VALUE} to ${MAXIMUM_TIMER_VALUES[key]}`;

export {
  DEFAULT_LOOP_COUNT,
  DEFAULT_TIMER_VALUES,
  MAXIMUM_DURATION_MINUTES,
  TIMER_VALUE_KEYS,
  describeTimerValueRange,
  isValidTimerValue,
};
export type { PartialTimerValues, TimerValueKey, TimerValues };
