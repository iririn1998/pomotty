import type { FrameLine, FrameSegment } from './frame-line.ts';
import type { TimerPhase, TimerSettings, TimerState } from '#src/timer/timer.ts';
import { cellWidth } from './frame-line.ts';
import { formatDuration } from './clock.ts';

/** タイムラインの1サイクル分の状態です。 */
type CycleStatus = {
  /** 休憩の経過率（0〜1）です。 */
  readonly breakRatio: number;

  /** 行末に表示する状態です。 */
  readonly label: string;

  /** 作業の経過率（0〜1）です。 */
  readonly workRatio: number;
};

/** タイムラインの作業と休憩のバーのセル数です。 */
type TimelineCells = Readonly<Record<TimerPhase, number>>;

const BLOCK = '█',
  EMPTY_CELL = '░',
  /** 1セルの充填を8段階で表す文字です。先頭は未充填です。 */
  EIGHTH_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
  EIGHTHS_PER_CELL = 8,
  INDENT = '  ',
  LABEL_GAP = '  ',
  BAR_GAP = ' ',
  CURRENT_LABEL = '◀ now',
  DONE_LABEL = '✓',
  FIRST_CYCLE = 1,
  NOT_STARTED = 0,
  NO_CYCLES = 0,
  COMPLETED = 1,
  ONE_CELL = 1,
  /** タイムラインの前後に表示するサイクル数です。 */
  TIMELINE_CONTEXT = 2,
  /** タイムラインの作業と休憩のバーを合わせたセル数です。 */
  TIMELINE_CELLS = 20,
  /** タイムラインで作業または休憩へ割り当てる最小セル数です。 */
  TIMELINE_MIN_CELLS = 2,
  /** タイムラインに並べるサイクルの最大数です。 */
  TIMELINE_MAX_ROWS = 5,
  /**
   * 経過率に応じて、1セルを8段階に分けて伸びるバーを作成します。
   *
   * 充填部分だけに`tone`を付けます。
   */
  createSmoothBar = (ratio: number, cells: number, tone: TimerPhase): FrameLine => {
    const eighths = Math.floor(ratio * cells * EIGHTHS_PER_CELL),
      fullCells = Math.floor(eighths / EIGHTHS_PER_CELL),
      partial = EIGHTH_BLOCKS[eighths % EIGHTHS_PER_CELL] ?? '',
      filled = `${BLOCK.repeat(fullCells)}${partial}`;

    return [{ text: filled, tone }, { text: EMPTY_CELL.repeat(cells - cellWidth(filled)) }];
  },
  /** タイムラインの作業と休憩のバーのセル数を、時間の比率で求めます。 */
  timelineCellsFor = (settings: TimerSettings): TimelineCells => {
    const totalMs = settings.workDurationMs + settings.breakDurationMs,
      work = Math.min(
        TIMELINE_CELLS - TIMELINE_MIN_CELLS,
        Math.max(
          TIMELINE_MIN_CELLS,
          Math.round((TIMELINE_CELLS * settings.workDurationMs) / totalMs),
        ),
      );

    return { break: TIMELINE_CELLS - work, work };
  },
  /** タイムラインに表示するサイクルの範囲を、現在のサイクルを中心に求めます。 */
  timelineRangeFor = (cycle: number, loopCount: number): readonly [number, number] => {
    const lastStart = Math.max(FIRST_CYCLE, loopCount - TIMELINE_MAX_ROWS + FIRST_CYCLE),
      first = Math.min(lastStart, Math.max(FIRST_CYCLE, cycle - TIMELINE_CONTEXT));

    return [first, Math.min(loopCount, first + TIMELINE_MAX_ROWS - FIRST_CYCLE)];
  },
  /** タイムラインのサイクル1行分の経過率と状態表示を求めます。 */
  cycleStatusFor = (row: number, state: TimerState, ratio: number): CycleStatus => {
    if (row < state.cycle) {
      return { breakRatio: COMPLETED, label: DONE_LABEL, workRatio: COMPLETED };
    }

    if (row > state.cycle) {
      return { breakRatio: NOT_STARTED, label: '', workRatio: NOT_STARTED };
    }

    if (state.phase === 'work') {
      return { breakRatio: NOT_STARTED, label: CURRENT_LABEL, workRatio: ratio };
    }

    return { breakRatio: ratio, label: CURRENT_LABEL, workRatio: COMPLETED };
  },
  /** タイムラインのサイクル1行を作成します。 */
  createCycleRow = (label: string, status: CycleStatus, cells: TimelineCells): FrameLine => {
    const row: FrameSegment[] = [
      { text: `${INDENT}${label}${LABEL_GAP}` },
      ...createSmoothBar(status.workRatio, cells.work, 'work'),
      { text: BAR_GAP },
      ...createSmoothBar(status.breakRatio, cells.break, 'break'),
    ];

    if (status.label !== '') {
      row.push({ text: `${LABEL_GAP}${status.label}` });
    }

    return row;
  },
  /** 作業と休憩の長さの凡例を、それぞれのバーの開始位置へ揃えて作成します。 */
  createLegend = (settings: TimerSettings, cells: TimelineCells): string => {
    const workLegend = `work ${formatDuration(settings.workDurationMs)}`,
      breakLegend = `break ${formatDuration(settings.breakDurationMs)}`,
      breakColumn = cells.work + ONE_CELL;

    if (cellWidth(workLegend) < breakColumn) {
      return `${workLegend.padEnd(breakColumn)}${breakLegend}`;
    }

    return `${workLegend} · ${breakLegend}`;
  },
  /** 省略したサイクルがある場合だけ、その数を示す行を返します。 */
  hiddenCyclesLines = (text: string, count: number): readonly FrameLine[] => {
    if (count <= NO_CYCLES) {
      return [];
    }

    return [[{ text }]];
  },
  /**
   * サイクルごとのタイムラインを作成します。
   *
   * 各行に作業と休憩のバーを並べ、完了したサイクルへ`✓`、現在のサイクルへ
   * `◀ now`を付けます。サイクルが多い場合は現在の前後だけを表示し、
   * 省略したサイクル数を上下に示します。
   */
  createTimeline = (
    state: TimerState,
    settings: TimerSettings,
    ratio: number,
  ): readonly FrameLine[] => {
    const cells = timelineCellsFor(settings),
      [first, last] = timelineRangeFor(state.cycle, settings.loopCount),
      labelWidth = cellWidth(`#${last}`),
      prefix = ' '.repeat(cellWidth(`${INDENT}${LABEL_GAP}`) + labelWidth),
      hiddenBefore = first - FIRST_CYCLE,
      hiddenAfter = settings.loopCount - last,
      rows = Array.from({ length: last - first + FIRST_CYCLE }, (_value, index) => {
        const cycle = first + index;

        return createCycleRow(
          `#${cycle}`.padEnd(labelWidth),
          cycleStatusFor(cycle, state, ratio),
          cells,
        );
      });

    return [
      ...hiddenCyclesLines(`${prefix}⋮ ${hiddenBefore} done`, hiddenBefore),
      ...rows,
      ...hiddenCyclesLines(`${prefix}⋮ ${hiddenAfter} more`, hiddenAfter),
      [{ text: `${prefix}${createLegend(settings, cells)}` }],
    ];
  };

export { createTimeline };
