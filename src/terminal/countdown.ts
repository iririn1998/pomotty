import { performance } from 'node:perf_hooks';
import process from 'node:process';

/** フェーズの残り時間を表示する処理です。 */
type CountdownDisplay = {
  /** 指定した長さのカウントダウン表示を開始します。 */
  readonly start: (durationMs: number) => void;

  /** カウントダウン表示を止め、表示中の行を消去します。 */
  readonly stop: () => void;
};

/** 定期実行を登録し、解除する処理を返します。 */
type ScheduleTick = (tick: () => void) => () => void;

/** カウントダウン表示の作成時に差し替えられる処理を定義します。 */
type CreateCountdownDisplayParameters = {
  /** 残り時間を表示するかを示します。省略時は標準出力が対話端末かで判定します。 */
  readonly enabled?: boolean;

  /** 現在時刻をミリ秒で返す処理です。 */
  readonly now?: () => number;

  /** 表示更新の定期実行を登録する処理です。 */
  readonly scheduleTick?: ScheduleTick;

  /** 表示を書き込む処理です。 */
  readonly write?: (output: string) => void;
};

const CLEAR_LINE_SEQUENCE = '\r\u001B[2K',
  DUMB_TERMINAL = 'dumb',
  MILLISECONDS_PER_SECOND = 1000,
  MINIMUM_REMAINING_MS = 0,
  NO_HOURS = 0,
  SECONDS_PER_MINUTE = 60,
  SECONDS_PER_HOUR = SECONDS_PER_MINUTE * SECONDS_PER_MINUTE,
  TICK_INTERVAL_MS = 250,
  TIME_PART_LENGTH = 2,
  TIME_PART_PADDING = '0',
  /** 何も表示しないカウントダウン表示です。 */
  DISABLED_COUNTDOWN_DISPLAY: CountdownDisplay = {
    start: () => {
      // 対話端末以外では、行の上書きでログを汚さないよう表示しません。
    },
    stop: () => {
      // 開始していないため止めるものがありません。
    },
  },
  /** 分・秒を2桁へ0埋めします。 */
  padTimePart = (value: number): string =>
    String(value).padStart(TIME_PART_LENGTH, TIME_PART_PADDING),
  /**
   * 残り時間を`M:SS`または`H:MM:SS`へ整形します。
   *
   * 判定と表示の両方に切り上げた表示秒を使うため、残り1msは`0:01`、
   * 残り3599.5秒は`1:00:00`になります。
   */
  formatRemainingTime = (remainingMs: number): string => {
    const displaySeconds = Math.ceil(
        Math.max(MINIMUM_REMAINING_MS, remainingMs) / MILLISECONDS_PER_SECOND,
      ),
      hours = Math.floor(displaySeconds / SECONDS_PER_HOUR),
      minutes = Math.floor((displaySeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
      seconds = padTimePart(displaySeconds % SECONDS_PER_MINUTE);

    if (hours === NO_HOURS) {
      return `${minutes}:${seconds}`;
    }

    return `${hours}:${padTimePart(minutes)}:${seconds}`;
  },
  /** 標準出力が行の上書き表示に対応した対話端末か判定します。 */
  isInteractiveOutput = (): boolean =>
    process.stdout.isTTY === true && process.env.TERM !== DUMB_TERMINAL,
  /** 実時間で表示を定期更新します。更新待ちだけではプロセスを終了待ちにしません。 */
  scheduleRealTick: ScheduleTick = (tick) => {
    const interval = setInterval(tick, TICK_INTERVAL_MS);

    interval.unref();
    return () => {
      clearInterval(interval);
    };
  },
  /** 開始前の更新解除処理です。解除する更新がないため何もしません。 */
  cancelNothing = (): void => {
    // 開始前は解除する更新がありません。
  },
  /**
   * 1行を上書きして残り時間を表示し続けるカウントダウン表示を作成します。
   *
   * 表示秒が変わったときだけ書き込み、停止時は表示行を消去して
   * カーソルを行頭へ戻すため、後続の出力は同じ行から始まります。
   */
  createCountdownDisplay = ({
    enabled = isInteractiveOutput(),
    now = () => performance.now(),
    scheduleTick = scheduleRealTick,
    write = (output) => {
      process.stdout.write(output);
    },
  }: CreateCountdownDisplayParameters = {}): CountdownDisplay => {
    if (!enabled) {
      return DISABLED_COUNTDOWN_DISPLAY;
    }

    let cancelTick = cancelNothing,
      endsAt = MINIMUM_REMAINING_MS,
      renderedOutput = '',
      running = false;
    const render = (): void => {
        const output = `⏳ ${formatRemainingTime(endsAt - now())} remaining`;

        if (output === renderedOutput) {
          return;
        }

        renderedOutput = output;
        write(`${CLEAR_LINE_SEQUENCE}${output}`);
      },
      stop = (): void => {
        if (!running) {
          return;
        }

        running = false;
        cancelTick();
        cancelTick = cancelNothing;
        renderedOutput = '';
        write(CLEAR_LINE_SEQUENCE);
      };

    return {
      start: (durationMs) => {
        stop();
        endsAt = now() + durationMs;
        running = true;
        render();
        cancelTick = scheduleTick(render);
      },
      stop,
    };
  };

export { createCountdownDisplay, formatRemainingTime };
export type { CountdownDisplay, CreateCountdownDisplayParameters, ScheduleTick };
