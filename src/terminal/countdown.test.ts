import { createCountdownDisplay, formatRemainingTime } from './countdown.ts';
import { expect, test } from 'vitest';

type FakeCountdown = {
  readonly advance: (elapsedMs: number) => void;
  readonly cancelCount: () => number;
  readonly display: ReturnType<typeof createCountdownDisplay>;
  readonly writes: readonly string[];
};

const CLEAR_LINE = '\r\u001B[2K',
  COUNT_INCREMENT = 1,
  FIVE_MINUTES_MS = 300_000,
  HALF_SECOND_MS = 500,
  ONE_SECOND_MS = 1000,
  START_TIME_MS = 10_000,
  createFakeCountdown = (): FakeCountdown => {
    const ticks: (() => void)[] = [],
      writes: string[] = [];
    let cancelled = 0,
      currentTime = START_TIME_MS;

    return {
      advance: (elapsedMs) => {
        currentTime += elapsedMs;

        for (const tick of ticks) {
          tick();
        }
      },
      cancelCount: () => cancelled,
      display: createCountdownDisplay({
        enabled: true,
        now: () => currentTime,
        scheduleTick: (tick) => {
          ticks.push(tick);
          return () => {
            cancelled += COUNT_INCREMENT;
            ticks.splice(ticks.indexOf(tick), COUNT_INCREMENT);
          };
        },
        write: (output) => {
          writes.push(output);
        },
      }),
      writes,
    };
  };

test.each([
  { expected: '0:00', remainingMs: 0 },
  { expected: '0:00', remainingMs: -1 },
  { expected: '0:01', remainingMs: 1 },
  { expected: '0:07', remainingMs: 7000 },
  { expected: '5:00', remainingMs: 300_000 },
  { expected: '14:30', remainingMs: 870_000 },
  { expected: '59:59', remainingMs: 3_599_000 },
  { expected: '1:00:00', remainingMs: 3_599_500 },
  { expected: '1:00:00', remainingMs: 3_600_000 },
  { expected: '1:30:00', remainingMs: 5_400_000 },
  { expected: '24:00:00', remainingMs: 86_400_000 },
])('残り$remainingMs msを$expectedと表示する', ({ expected, remainingMs }) => {
  expect(formatRemainingTime(remainingMs)).toBe(expected);
});

test('開始時に全体の残り時間を表示する', () => {
  const countdown = createFakeCountdown();

  countdown.display.start(FIVE_MINUTES_MS);

  expect(countdown.writes).toEqual([`${CLEAR_LINE}⏳ 5:00 remaining`]);
});

test('表示秒が変わったときだけ同じ行を上書きする', () => {
  const countdown = createFakeCountdown();

  countdown.display.start(FIVE_MINUTES_MS);
  countdown.advance(HALF_SECOND_MS);
  countdown.advance(HALF_SECOND_MS);
  countdown.advance(HALF_SECOND_MS);
  countdown.advance(HALF_SECOND_MS);

  expect(countdown.writes).toEqual([
    `${CLEAR_LINE}⏳ 5:00 remaining`,
    `${CLEAR_LINE}⏳ 4:59 remaining`,
    `${CLEAR_LINE}⏳ 4:58 remaining`,
  ]);
});

test('期限を過ぎても0:00より減らさない', () => {
  const countdown = createFakeCountdown();

  countdown.display.start(ONE_SECOND_MS);
  countdown.advance(ONE_SECOND_MS);
  countdown.advance(ONE_SECOND_MS);

  expect(countdown.writes).toEqual([
    `${CLEAR_LINE}⏳ 0:01 remaining`,
    `${CLEAR_LINE}⏳ 0:00 remaining`,
  ]);
});

test('停止すると更新を解除して表示行を消去する', () => {
  const countdown = createFakeCountdown();

  countdown.display.start(FIVE_MINUTES_MS);
  countdown.display.stop();
  countdown.advance(ONE_SECOND_MS);
  countdown.display.stop();

  expect(countdown.cancelCount()).toBe(COUNT_INCREMENT);
  expect(countdown.writes).toEqual([`${CLEAR_LINE}⏳ 5:00 remaining`, CLEAR_LINE]);
});

test('再開始すると前の更新を解除して新しい時間から表示する', () => {
  const countdown = createFakeCountdown();

  countdown.display.start(FIVE_MINUTES_MS);
  countdown.display.start(ONE_SECOND_MS);
  countdown.advance(ONE_SECOND_MS);

  expect(countdown.cancelCount()).toBe(COUNT_INCREMENT);
  expect(countdown.writes).toEqual([
    `${CLEAR_LINE}⏳ 5:00 remaining`,
    CLEAR_LINE,
    `${CLEAR_LINE}⏳ 0:01 remaining`,
    `${CLEAR_LINE}⏳ 0:00 remaining`,
  ]);
});

test('無効な場合は何も書き込まず更新も登録しない', () => {
  const calls: string[] = [],
    display = createCountdownDisplay({
      enabled: false,
      scheduleTick: () => {
        calls.push('schedule');
        return (): void => {
          calls.push('cancel');
        };
      },
      write: (output) => {
        calls.push(output);
      },
    });

  display.start(FIVE_MINUTES_MS);
  display.stop();

  expect(calls).toEqual([]);
});
