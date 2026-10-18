import type { FrameLine, FrameSegment } from './frame-line.ts';
import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/state.ts';
import { cellWidth, lineWidth, truncateLine } from './frame-line.ts';
import { formatClock, progressFor } from './clock.ts';
import type { PhaseProgress } from './clock.ts';
import { createTimeline } from './timeline.ts';

/** タイマー画面の生成に必要な値です。 */
type TimerViewParameters = {
  /** 現在のタイマー状態です。 */
  readonly state: TimerState;

  /** 状態の判定に使った現在時刻（Unix ms）です。 */
  readonly now: number;

  /** タイマーの実行条件です。 */
  readonly settings: TimerSettings;

  /** 端末の列数です。取得できない場合は`undefined`または0を渡します。 */
  readonly columns?: number;
};

/** 各レイアウトの生成に使う値です。 */
type LayoutParameters = {
  /** 現在のタイマー状態です。 */
  readonly state: TimerState;

  /** タイマーの実行条件です。 */
  readonly settings: TimerSettings;

  /** 現在のフェーズの進み具合です。 */
  readonly progress: PhaseProgress;

  /** 各行に使えるセル幅です。 */
  readonly width: number;
};

const BAR_WIDTH = 40,
  INDENT = '  ',
  /** 左右や中央へ並べる文字列の間に最低限空けるセル数です。 */
  MIN_GAP = 2,
  HALF = 2,
  NO_CELLS = 0,
  MIN_WIDTH = 1,
  PERCENT = 100,
  /** 端末が列数を提供しない場合の列数です。 */
  FALLBACK_COLUMNS = 80,
  /** 端末の自動折り返しを避けるために右端で空けるセル数です。 */
  RIGHT_MARGIN = 1,
  /** コンパクト表示を使う最小のセル幅です。これより狭い場合は1行で表示します。 */
  COMPACT_MIN_WIDTH = 20,
  BIG_DIGIT_ROWS = 5,
  /** 大きな数字の書体です。`#`を2セル幅のブロックとして描画します。 */
  BIG_DIGITS: Readonly<Record<string, readonly string[]>> = {
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
  BIG_PIXEL_ON = '██',
  BIG_PIXEL_OFF = '  ',
  BIG_DIGIT_GAP = ' ',
  LINE_FILLED = '━',
  LINE_EMPTY = '─',
  PHASE_ICONS = { break: '☕', work: '🍅' } as const,
  PHASE_LABELS = { break: 'BREAK', work: 'WORK' } as const,
  PAUSED_LABEL = 'PAUSED',
  /** 標準の画面に表示するキー操作の案内です。一時停止中はspaceの動作を再開と表示します。 */
  KEY_GUIDES = {
    paused: '[space] resume   [s] skip   [q] quit',
    running: '[space] pause   [s] skip   [q] quit',
  } as const,
  /** コンパクト表示に表示するキー操作の案内です。 */
  COMPACT_KEY_GUIDES = {
    paused: '[sp]resume [s]skip [q]quit',
    running: '[sp]pause [s]skip [q]quit',
  } as const,
  /** 一時停止中かでキー操作の案内を選びます。 */
  keyGuideKind = (state: TimerState): 'paused' | 'running' => {
    if (state.paused) {
      return 'paused';
    }

    return 'running';
  },
  /** 指定セル数の空白を返します。 */
  spaces = (cells: number): string => ' '.repeat(Math.max(NO_CELLS, cells)),
  /** 大きな数字の1ピクセルを2セルの文字列へ変換します。 */
  bigPixel = (pixel: string): string => {
    if (pixel === '#') {
      return BIG_PIXEL_ON;
    }

    return BIG_PIXEL_OFF;
  },
  /** 時刻の文字列を大きな数字の各行へ変換します。各行は同じセル幅です。 */
  renderBigClock = (clock: string): readonly string[] =>
    Array.from({ length: BIG_DIGIT_ROWS }, (_value, row) =>
      [...clock]
        .map((character) =>
          [...((BIG_DIGITS[character] ?? []).at(row) ?? '')]
            .map((pixel) => bigPixel(pixel))
            .join(''),
        )
        .join(BIG_DIGIT_GAP),
    ),
  /** 大きな数字の各行を、バーの幅の中央へ配置します。 */
  createBigClockLines = (clock: string, phase: TimerPhase): readonly FrameLine[] => {
    const rows = renderBigClock(clock),
      offset = Math.floor((BAR_WIDTH - cellWidth(rows.at(NO_CELLS) ?? '')) / HALF);

    return rows.map((row) => [
      { text: `${INDENT}${spaces(offset)}` },
      { text: row.trimEnd(), tone: phase },
    ]);
  },
  /** 経過率に応じた細い線のバーを作成します。充填部分だけに`tone`を付けます。 */
  createLineBar = (percent: number, cells: number, tone: TimerPhase): FrameLine => {
    const filled = Math.floor((percent * cells) / PERCENT);

    return [
      { text: LINE_FILLED.repeat(filled), tone },
      { text: LINE_EMPTY.repeat(cells - filled) },
    ];
  },
  /**
   * 3つの文字列をバーの幅の左端、中央、右端へ配置します。
   *
   * 収まらない場合は最低限の間隔で並べます。
   */
  spreadLabels = ([left, center, right]: readonly [string, string, string]): string => {
    const centerStart = Math.floor((BAR_WIDTH - cellWidth(center)) / HALF),
      leftGap = centerStart - cellWidth(left),
      rightGap = BAR_WIDTH - centerStart - cellWidth(center) - cellWidth(right);

    if (leftGap < MIN_GAP || rightGap < MIN_GAP) {
      return [left, center, right].join(spaces(MIN_GAP));
    }

    return `${left}${spaces(leftGap)}${center}${spaces(rightGap)}${right}`;
  },
  /** フェーズのアイコンと名前の表示片です。 */
  phaseSegment = ({ paused, phase }: TimerState): FrameSegment => {
    const label = `${PHASE_ICONS[phase]} ${PHASE_LABELS[phase]}`;

    if (paused) {
      return { text: `${label} ${PAUSED_LABEL}`, tone: phase };
    }

    return { text: label, tone: phase };
  },
  /** 1行表示のフェーズ名です。一時停止中は幅を節約するため`PAUSED`だけを表示します。 */
  minimalPhaseLabel = ({ paused, phase }: TimerState): string => {
    if (paused) {
      return PAUSED_LABEL;
    }

    return PHASE_LABELS[phase];
  },
  /** フェーズ名とサイクル番号をバーの幅の両端へ並べた見出し行です。 */
  createHeader = (state: TimerState, settings: TimerSettings): FrameLine => {
    const phase = phaseSegment(state),
      cycle = `Cycle ${state.cycle} / ${settings.loopCount}`,
      gap = Math.max(MIN_GAP, BAR_WIDTH - cellWidth(phase.text) - cellWidth(cycle));

    return [{ text: INDENT }, phase, { text: `${spaces(gap)}${cycle}` }];
  },
  /** 大きな数字、経過バー、サイクルのタイムライン、キー操作の案内を並べた標準の画面です。 */
  createFullFrame = ({ progress, settings, state }: LayoutParameters): readonly FrameLine[] => [
    createHeader(state, settings),
    [],
    ...createBigClockLines(formatClock(progress.remainingSeconds), state.phase),
    [],
    [{ text: INDENT }, ...createLineBar(progress.percent, BAR_WIDTH, state.phase)],
    [
      {
        text: `${INDENT}${spreadLabels([
          `${formatClock(progress.elapsedSeconds)} elapsed`,
          `${progress.percent}%`,
          `${formatClock(progress.totalSeconds)} total`,
        ])}`,
      },
    ],
    [],
    ...createTimeline(state, settings, progress.ratio),
    [],
    [{ text: `${INDENT}${KEY_GUIDES[keyGuideKind(state)]}` }],
  ],
  /** 大きな数字とタイムラインを省いた、狭い端末向けの画面です。 */
  createCompactFrame = ({
    progress,
    settings,
    state,
    width,
  }: LayoutParameters): readonly FrameLine[] => [
    [phaseSegment(state), { text: `${spaces(MIN_GAP)}${state.cycle}/${settings.loopCount}` }],
    [{ text: `${formatClock(progress.remainingSeconds)} left · ${progress.percent}%` }],
    createLineBar(progress.percent, Math.min(BAR_WIDTH, width), state.phase),
    [{ text: COMPACT_KEY_GUIDES[keyGuideKind(state)] }],
  ],
  /** 1行だけの画面です。 */
  createMinimalFrame = ({ progress, settings, state }: LayoutParameters): readonly FrameLine[] => [
    [
      { text: minimalPhaseLabel(state), tone: state.phase },
      { text: ` ${formatClock(progress.remainingSeconds)} ${state.cycle}/${settings.loopCount}` },
    ],
  ],
  /**
   * 端末幅に合わせてタイマー画面の各行を生成します。
   *
   * 各行は`max(1, columns - 1)`セル以内に収め、端末の自動折り返しに依存しません。
   * 標準の画面が収まらない場合はコンパクト表示、さらに狭い場合は1行表示にします。
   */
  createTimerFrame = ({ state, now, settings, columns }: TimerViewParameters): FrameLine[] => {
    const width = Math.max(MIN_WIDTH, (columns || FALLBACK_COLUMNS) - RIGHT_MARGIN),
      layout = { progress: progressFor(state, now, settings), settings, state, width },
      full = createFullFrame(layout);

    if (full.every((line) => lineWidth(line) <= width)) {
      return [...full];
    }

    if (width >= COMPACT_MIN_WIDTH) {
      return createCompactFrame(layout).map((line) => truncateLine(line, width));
    }

    return createMinimalFrame(layout).map((line) => truncateLine(line, width));
  };

export { createTimerFrame };
export type { TimerViewParameters };
