import { createVirtualTerminal } from '#src/terminal/virtual-terminal.test-helper.ts';
import type { RunCliParameters } from './run.ts';
import type { SoundPlayer } from '#src/notification/sound.ts';
import type { TerminationSignal } from '#src/terminal/terminal-guard.ts';
import type { VirtualTerminal } from '#src/terminal/virtual-terminal.test-helper.ts';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { confirmWorkStart } from '#src/terminal/input.ts';
import { runCli } from './run.ts';

/**
 * シナリオで押せるキーです。
 *
 * 名前付きのキーは端末が送るバイト列へ変換します。それ以外の文字列は
 * そのままのバイト列として送ります。
 */
type ScenarioKey =
  | 'alt+s'
  | 'ctrl+c'
  | 'ctrl+s'
  | 'down'
  | 'enter'
  | 'space'
  | 'up'
  | (string & Record<never, never>);

/**
 * 経過させる時間です。
 *
 * 数値はミリ秒、文字列は`M:SS`、`H:MM:SS`、または末尾に`.mmm`を付けた形式です。
 */
type ScenarioDuration = number | string;

/** シナリオを開始するときの値です。 */
type ScenarioOptions = {
  /** CLI引数です。 */
  readonly arguments_?: readonly string[];

  /** 端末の列数です。 */
  readonly columns?: number;

  /** 標準入出力をTTYとして扱い、残り時間の画面を描き直すかを示します。 */
  readonly interactive?: boolean;

  /** 画面に色を付けるかを示します。 */
  readonly color?: boolean;

  /** そのほかに差し替える`runCli`の値です。 */
  readonly overrides?: Partial<RunCliParameters>;
};

/**
 * 仮想の時計、端末、キーボードでCLIを1回実行するシナリオです。
 *
 * 時間は`advance()`などを呼んだときだけ進み、タイマーの各tickはその間に
 * 順番に実行されます。キー入力は実際の端末と同じバイト列を標準入力へ
 * 書き込み、Node.jsのキー解釈を経てアプリへ届きます。
 */
type Scenario = {
  /** アプリが描画した画面を再現する端末です。 */
  readonly terminal: VirtualTerminal;

  /** シナリオ開始からの壁時計の経過時間（ミリ秒）です。 */
  readonly elapsedMs: () => number;

  /**
   * 再生、終了コードの設定、終了処理などの外部への作用を、発生時刻付きで返します。
   *
   * 各要素は`'15:00.000 play:work'`のように`壁時計の経過時間 作用`の形式です。
   */
  readonly log: () => readonly string[];

  /** キーを順番に押し、アプリが入力を処理し終えるまで待ちます。 */
  readonly press: (...keys: readonly ScenarioKey[]) => Promise<void>;

  /**
   * 時間を指定した分だけ進めます。
   *
   * 進める間に期限が来たtickは順番に実行します。最後のtickから指定時刻までの
   * 端数も時計に反映するため、tickの途中でキーを押す状況も再現できます。
   */
  readonly advance: (duration: ScenarioDuration) => Promise<void>;

  /**
   * 待機中のtimerを発火させずに時間を進めます。
   *
   * イベントループが詰まってtickが遅れた状況を再現します。続けてキーを押すと、
   * tickより先にキー入力が処理される状況になります。期限を過ぎたtimerは、
   * 次の`advance()`で直ちに発火します。
   */
  readonly stall: (duration: ScenarioDuration) => void;

  /**
   * 壁時計だけを指定した分だけずらします。負の値で時計を戻せます。
   *
   * NTPによる時刻合わせなどを再現します。待機中のtimerの発火時刻は変わりません。
   */
  readonly shiftClock: (duration: ScenarioDuration) => void;

  /**
   * OSのスリープを再現します。
   *
   * 待機中のtimerを止めたまま壁時計だけを進め、復帰直後に待機中のtimerを発火させます。
   */
  readonly suspend: (duration: ScenarioDuration) => Promise<void>;

  /** プロセスへシグナルを送ります。 */
  readonly signal: (signal: TerminationSignal | 'exit') => Promise<void>;

  /** 端末の列数を変更します。 */
  readonly resize: (columns: number) => Promise<void>;

  /** 標準入力を閉じます。 */
  readonly closeInput: () => Promise<void>;

  /** CLIの実行が終わっていれば`true`です。 */
  readonly finished: () => boolean;

  /** CLIの終了コードを返します。実行中の場合や例外で終わった場合は例外を投げます。 */
  readonly exitCode: () => number;

  /** 標準入力のraw modeを切り替えた履歴です。 */
  readonly rawModes: () => readonly boolean[];

  /** プロセスへ登録されたままのリスナーの数です。 */
  readonly processListenerCount: () => number;
};

/** CLIの実行結果です。 */
type Outcome = { readonly error: unknown } | { readonly exitCode: number };

/** 待機中のtickです。 */
type PendingSleep = {
  /** 待機を終えます。 */
  readonly resolve: () => void;

  /** 単調時計で待機を終える時刻です。 */
  readonly wakeAt: number;
};

const START_TIME = Date.UTC(2026, 0, 1),
  MS_PER_SECOND = 1000,
  SECONDS_PER_MINUTE = 60,
  MINUTES_PER_HOUR = 60,
  /** 名前付きのキーと、端末が送るバイト列の対応です。 */
  KEY_SEQUENCES: Readonly<Record<string, string>> = {
    'alt+s': '\u001Bs',
    'ctrl+c': '\u0003',
    'ctrl+s': '\u0013',
    down: '\u001B[B',
    enter: '\r',
    space: ' ',
    up: '\u001B[A',
  },
  /** `M:SS`、`H:MM:SS`、および末尾の`.mmm`を受け付ける形式です。 */
  DURATION_PATTERN =
    /^(?:(?<hours>\d+):)?(?<minutes>\d+):(?<seconds>\d{2})(?:\.(?<milliseconds>\d{3}))?$/u,
  /** 経過させる時間をミリ秒へ変換します。 */
  toMilliseconds = (duration: ScenarioDuration): number => {
    if (typeof duration === 'number') {
      return duration;
    }

    const groups = DURATION_PATTERN.exec(duration)?.groups;

    if (groups === undefined) {
      throw new Error(`時間の形式が不正です: ${duration}`);
    }

    const { hours = '0', minutes = '0', seconds = '0', milliseconds = '0' } = groups;

    return (
      ((Number(hours) * MINUTES_PER_HOUR + Number(minutes)) * SECONDS_PER_MINUTE +
        Number(seconds)) *
        MS_PER_SECOND +
      Number(milliseconds)
    );
  },
  /** 経過時間を`M:SS.mmm`または`H:MM:SS.mmm`へ整形します。 */
  formatElapsed = (elapsedMs: number): string => {
    const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND),
      hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)),
      minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR,
      seconds = String(totalSeconds % SECONDS_PER_MINUTE).padStart(2, '0'),
      milliseconds = String(elapsedMs % MS_PER_SECOND).padStart(3, '0');

    if (hours === 0) {
      return `${minutes}:${seconds}.${milliseconds}`;
    }

    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}.${milliseconds}`;
  },
  /** 大きな数字の書体です。アプリの書体とは独立に定義し、画面の読み取りに使います。 */
  BIG_GLYPHS: Readonly<Record<string, readonly string[]>> = {
    '0': ['###', '# #', '# #', '# #', '###'],
    '1': ['## ', ' # ', ' # ', ' # ', '###'],
    '2': ['###', '  #', '###', '#  ', '###'],
    '3': ['###', '  #', '###', '  #', '###'],
    '4': ['# #', '# #', '###', '  #', '  #'],
    '5': ['###', '#  ', '###', '  #', '###'],
    '6': ['###', '#  ', '###', '# #', '###'],
    '7': ['###', '  #', '  #', '  #', '  #'],
    '8': ['###', '# #', '###', '# #', '###'],
    '9': ['###', '# #', '###', '  #', '###'],
    ':': [' ', '#', ' ', '#', ' '],
  },
  BIG_ROWS = 5,
  /** 大きな数字の文字の間の空白のセル数です。 */
  BIG_GAP = 1,
  /** 書体の1行を、`#`を`██`とした端末上の文字列へ変換します。 */
  renderGlyphRow = (row: string): string => row.replaceAll('#', '██').replaceAll(' ', '  '),
  /** 現在のタイマー画面の見出しに一致します。 */
  FRAME_HEADER = /(?:WORK|BREAK|PAUSED)/u,
  /**
   * 画面の末尾にあるタイマー画面の各行を返します。
   *
   * 最後に表示されたフェーズの見出し行から画面の末尾までを返します。
   */
  currentFrame = (lines: readonly string[]): readonly string[] => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (FRAME_HEADER.test(lines[index] ?? '')) {
        return lines.slice(index);
      }
    }

    throw new Error('タイマー画面が表示されていません。');
  },
  /** 大きな数字の各行の、指定した位置から始まる文字を書体と照合します。 */
  readGlyphs = (rows: readonly string[], position: number): string => {
    if (position >= (rows[0]?.length ?? 0)) {
      return '';
    }

    const found = Object.entries(BIG_GLYPHS).find(([, pattern]) =>
      pattern.every((row, index) => {
        const rendered = renderGlyphRow(row);

        return rows[index]?.slice(position, position + rendered.length) === rendered;
      }),
    );

    if (found === undefined) {
      throw new Error(`大きな数字を読み取れません:\n${rows.join('\n')}`);
    }

    const [character, pattern] = found,
      glyphWidth = renderGlyphRow(pattern[0] ?? '').length;

    return `${character}${readGlyphs(rows, position + glyphWidth + BIG_GAP)}`;
  },
  /**
   * 標準の画面に大きな数字で表示された残り時間を読み取ります。
   *
   * 見出し行の2行下から5行を書体と照合し、`14:59`のような文字列を返します。
   */
  readBigClock = (lines: readonly string[]): string => {
    const rows = currentFrame(lines).slice(2, 2 + BIG_ROWS),
      indent = Math.min(...rows.map((row) => row.length - row.trimStart().length)),
      width = Math.max(...rows.map((row) => row.length));

    return readGlyphs(
      rows.map((row) => row.slice(indent).padEnd(width - indent)),
      0,
    );
  },
  /** タイマーの処理とキー入力の解釈が終わるまで、イベントループを1周させます。 */
  flush = (): Promise<void> =>
    new Promise((resolve) => {
      setImmediate(resolve);
    }),
  /** TTYかどうかを指定でき、raw modeの切り替えを記録する標準入力を作成します。 */
  createStdin = (isTTY: boolean, rawModes: boolean[]): PassThrough & { readonly isTTY: boolean } =>
    Object.assign(new PassThrough(), {
      isTTY,
      setRawMode(this: PassThrough, mode: boolean) {
        rawModes.push(mode);
        return this;
      },
    }),
  /**
   * 仮想の時計、端末、キーボードでCLIを開始し、開始確認の表示まで進めます。
   *
   * 開始確認には実際の選択画面を使い、仮想のキーボードから操作します。
   *
   * @param options CLI引数と端末の条件。
   */
  startScenario = async ({
    arguments_ = [],
    color = false,
    columns,
    interactive = true,
    overrides = {},
  }: ScenarioOptions = {}): Promise<Scenario> => {
    const terminal = createVirtualTerminal({ columns, isTTY: interactive }),
      processEvents = new EventEmitter(),
      rawModes: boolean[] = [],
      sideEffects: string[] = [],
      stdin = createStdin(interactive, rawModes);
    /**
     * タイマーを駆動する単調時計（シナリオ開始からのミリ秒）です。
     *
     * アプリが読む壁時計は、これに`clockOffset`を足した値です。実際のNode.jsと
     * 同じく、壁時計をずらしてもtimerの発火時刻は変わりません。
     */
    let monotonic = 0,
      clockOffset = 0,
      pendingSleep: PendingSleep | undefined,
      activityWaiter: (() => void) | undefined,
      outcome: Outcome | undefined;

    const elapsedMs = (): number => monotonic + clockOffset,
      record = (effect: string): void => {
        sideEffects.push(`${formatElapsed(elapsedMs())} ${effect}`);
      },
      soundPlayer: SoundPlayer = {
        play: (phase, { completionNotice = false } = {}) => {
          record(`play:${phase}${completionNotice ? ':completion-notice' : ''}`);
        },
        shutdown: ({ complete }) => {
          record(`shutdown:${complete ? 'complete' : 'abort'}`);
          return Promise.resolve();
        },
      },
      /** アプリが次の待機を始めたとき、または終了したときに呼び出します。 */
      notifyActivity = (): void => {
        const waiter = activityWaiter;

        activityWaiter = undefined;
        waiter?.();
      },
      /**
       * 待機中のtickを終え、アプリが次の待機を始めるか終了するまで待ちます。
       *
       * 通常はマイクロタスクだけで次の待機が始まるため、イベントループを
       * 待たずに進めます。イベントループを1周しても次の待機も終了もなければ、
       * アプリが想定外の処理を待っているとみなして例外を投げます。
       */
      wakePendingSleep = async (sleeping: PendingSleep): Promise<void> => {
        const activity = new Promise<boolean>((resolve) => {
          activityWaiter = (): void => {
            resolve(true);
          };
        });

        pendingSleep = undefined;
        monotonic = Math.max(monotonic, sleeping.wakeAt);
        sleeping.resolve();

        if (!(await Promise.race([activity, flush().then(() => false)]))) {
          activityWaiter = undefined;
          throw new Error('アプリが次のtickを待機せず、終了もしませんでした。');
        }
      },
      /** 単調時計で`target`までに期限が来るtickを、1つずつ順番に実行します。 */
      wakeDueSleeps = async (target: number): Promise<void> => {
        const sleeping = pendingSleep;

        if (sleeping === undefined || sleeping.wakeAt > target) {
          return;
        }

        await wakePendingSleep(sleeping);
        await wakeDueSleeps(target);
      },
      sleep = (durationMs: number, signal?: AbortSignal): Promise<void> =>
        new Promise((resolve, reject) => {
          const abort = (): void => {
            pendingSleep = undefined;
            reject(new Error('The operation was aborted'));
          };

          signal?.addEventListener('abort', abort, { once: true });
          pendingSleep = {
            resolve: (): void => {
              signal?.removeEventListener('abort', abort);
              resolve();
            },
            wakeAt: monotonic + durationMs,
          };
          notifyActivity();
        }),
      /** CLIを実行し、終了コードまたは例外を記録します。 */
      run = async (): Promise<void> => {
        try {
          outcome = {
            exitCode: await runCli({
              arguments_,
              color,
              confirmStart: ({ signal, write }) =>
                confirmWorkStart({ input: stdin, signal, write }),
              createSoundPlayer: () => soundPlayer,
              interactive,
              now: () => START_TIME + elapsedMs(),
              processEvents,
              scheduleExit: (exitCode, delayMs) => {
                record(`schedule-exit:${exitCode}:${delayMs}ms`);
              },
              setExitCode: (exitCode) => {
                record(`exit-code:${exitCode}`);
              },
              sleep,
              stdin,
              stdout: terminal,
              writeError: (output) => {
                record(`stderr:${output.trimEnd()}`);
              },
              ...overrides,
            }),
          };
        } catch (error) {
          outcome = { error };
        }

        notifyActivity();
      },
      /** キーを1つずつ押し、それぞれの処理を終えてから次のキーを押します。 */
      pressKeys = async (keys: readonly ScenarioKey[]): Promise<void> => {
        const [key, ...rest] = keys;

        if (key === undefined) {
          return;
        }

        stdin.write(KEY_SEQUENCES[key] ?? key);
        await flush();
        await pressKeys(rest);
      };

    void run();
    await flush();

    return {
      advance: async (duration) => {
        const target = monotonic + toMilliseconds(duration);

        await wakeDueSleeps(target);
        monotonic = target;
        // 中断などで待機中のtimerがなくなった後の終了処理も終えます。
        await flush();
      },
      closeInput: async () => {
        stdin.end();
        await flush();
        await flush();
      },
      elapsedMs,
      exitCode: () => {
        if (outcome === undefined) {
          throw new Error('CLIはまだ実行中です。');
        }

        if ('error' in outcome) {
          throw outcome.error;
        }

        return outcome.exitCode;
      },
      finished: () => outcome !== undefined,
      log: () => [...sideEffects],
      press: async (...keys) => {
        await pressKeys(keys);
      },
      processListenerCount: () =>
        processEvents
          .eventNames()
          .reduce((count, event) => count + processEvents.listenerCount(event), 0),
      rawModes: () => [...rawModes],
      resize: async (newColumns) => {
        terminal.resize(newColumns);
        await flush();
      },
      shiftClock: (duration) => {
        clockOffset += toMilliseconds(duration);
      },
      signal: async (signal) => {
        processEvents.emit(signal);
        await flush();
      },
      stall: (duration) => {
        monotonic += toMilliseconds(duration);
      },
      suspend: async (duration) => {
        clockOffset += toMilliseconds(duration);

        if (pendingSleep !== undefined) {
          await wakePendingSleep(pendingSleep);
        }
      },
      terminal,
    };
  };

export { currentFrame, formatElapsed, readBigClock, startScenario, toMilliseconds };
export type { Scenario, ScenarioDuration, ScenarioKey, ScenarioOptions };
