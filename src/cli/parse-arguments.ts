import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '@/timer/timer.ts';

/** タイマー起動に利用するCLI引数です。 */
type TimerCliArguments = {
  readonly breakDurationMinutes: number;
  readonly kind: 'run';
  readonly workDurationMinutes: number;
};

/** CLI引数の解析結果です。 */
type ParseCliArgumentsResult =
  | TimerCliArguments
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string };

/** 時間を指定できるCLIオプションです。 */
type DurationOption = '--break' | '--work';

/** CLI引数1個から取り出したオプション名と値です。 */
type DurationArgument = {
  readonly consumesNextArgument: boolean;
  readonly optionName: string;
  readonly value?: string;
};

const ARGUMENT_INDEX_INCREMENT = 1,
  ARGUMENTS_START_INDEX = 0,
  DURATION_PATTERN = /^[1-9][0-9]{0,3}$/u,
  EQUALS_SIGN = '=',
  EQUALS_SIGN_NOT_FOUND = -1,
  HELP_OPTIONS = ['--help', '-h'] as const,
  MAXIMUM_DURATION_MINUTES = 1440,
  NEXT_ARGUMENT_OFFSET = 1,
  /** 引数が時間指定オプションか判定します。 */
  isDurationOption = (value: string): value is DurationOption =>
    value === '--break' || value === '--work',
  /** 引数がヘルプオプションか判定します。 */
  isHelpOption = (value: string): boolean => HELP_OPTIONS.some((option) => option === value),
  /** 時間指定のエラーを生成します。 */
  createDurationError = (option: DurationOption): ParseCliArgumentsResult => ({
    kind: 'error',
    message: `Error: ${option} requires an integer from 1 to 1440.\n`,
  }),
  /** 時間指定の重複エラーを生成します。 */
  createDuplicateError = (option: DurationOption): ParseCliArgumentsResult => ({
    kind: 'error',
    message: `Error: ${option} may only be specified once.\n`,
  }),
  /** 分数を仕様の範囲内の整数へ変換します。 */
  parseDurationMinutes = (value: string | undefined): number | undefined => {
    if (typeof value !== 'string' || !DURATION_PATTERN.test(value)) {
      return;
    }

    const durationMinutes = Number(value);

    if (durationMinutes > MAXIMUM_DURATION_MINUTES) {
      return;
    }

    return durationMinutes;
  },
  /** 引数を時間オプション名と値へ分離します。 */
  parseDurationArgument = (
    argument: string,
    nextArgument: string | undefined,
  ): DurationArgument => {
    const equalsSignIndex = argument.indexOf(EQUALS_SIGN);

    if (equalsSignIndex === EQUALS_SIGN_NOT_FOUND) {
      return {
        consumesNextArgument: true,
        optionName: argument,
        value: nextArgument,
      };
    }

    return {
      consumesNextArgument: false,
      optionName: argument.slice(ARGUMENTS_START_INDEX, equalsSignIndex),
      value: argument.slice(equalsSignIndex + NEXT_ARGUMENT_OFFSET),
    };
  },
  /** CLI引数から作業時間と休憩時間を解析します。 */
  parseCliArguments = (arguments_: readonly string[]): ParseCliArgumentsResult => {
    if (arguments_.some((argument) => isHelpOption(argument))) {
      return { kind: 'help' };
    }

    const specifiedOptions = new Set<DurationOption>();
    let breakDurationMinutes = DEFAULT_BREAK_DURATION_MINUTES,
      workDurationMinutes = DEFAULT_WORK_DURATION_MINUTES;

    for (
      let argumentIndex = ARGUMENTS_START_INDEX;
      argumentIndex < arguments_.length;
      argumentIndex += ARGUMENT_INDEX_INCREMENT
    ) {
      const argument = arguments_[argumentIndex] ?? '',
        durationArgument = parseDurationArgument(
          argument,
          arguments_[argumentIndex + NEXT_ARGUMENT_OFFSET],
        ),
        { consumesNextArgument, optionName, value } = durationArgument;

      if (!isDurationOption(optionName)) {
        return {
          kind: 'error',
          message: `Error: Unknown option: ${argument}\n`,
        };
      }

      if (specifiedOptions.has(optionName)) {
        return createDuplicateError(optionName);
      }

      const durationMinutes = parseDurationMinutes(value);

      if (typeof durationMinutes !== 'number') {
        return createDurationError(optionName);
      }

      specifiedOptions.add(optionName);

      if (consumesNextArgument) {
        argumentIndex += NEXT_ARGUMENT_OFFSET;
      }

      if (optionName === '--work') {
        workDurationMinutes = durationMinutes;
      } else {
        breakDurationMinutes = durationMinutes;
      }
    }

    return {
      breakDurationMinutes,
      kind: 'run',
      workDurationMinutes,
    };
  };

export { parseCliArguments };
export type { ParseCliArgumentsResult, TimerCliArguments };
