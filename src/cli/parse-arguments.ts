import { DEFAULT_BREAK_DURATION_MINUTES, DEFAULT_WORK_DURATION_MINUTES } from '#src/timer/timer.ts';
import { DEFAULT_LOOP_COUNT, MAXIMUM_LOOP_COUNT } from './constants.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';

/** タイマー起動に利用するCLI引数です。 */
type TimerCliArguments = {
  readonly breakDurationMinutes: number;
  readonly finalBreak: boolean;
  readonly kind: 'run';
  readonly loopCount: number;
  readonly workDurationMinutes: number;
};

/** CLI引数の解析結果です。 */
type ParseCliArgumentsResult =
  | TimerCliArguments
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'error'; readonly message: string };

/** 数値を指定できるCLIオプションです。 */
type NumericOption = '--break' | '--work' | '--loop';

/** 値を取らないCLIオプションです。 */
type FlagOption = '--final-break';

/** CLI引数1個から取り出したオプション名と値です。 */
type NumericArgument = {
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
  LOOP_PATTERN = /^[1-9][0-9]{0,2}$/u,
  VERSION_OPTIONS = ['--version', '-v'] as const,
  /** 引数が数値指定オプションか判定します。 */
  isNumericOption = (value: string): value is NumericOption =>
    value === '--break' || value === '--work' || value === '--loop',
  /** 引数が値を取らないオプションか判定します。 */
  isFlagOption = (value: string): value is FlagOption => value === '--final-break',
  /** 引数がヘルプオプションか判定します。 */
  isHelpOption = (value: string): boolean => HELP_OPTIONS.some((option) => option === value),
  /** 引数がバージョン表示オプションか判定します。 */
  isVersionOption = (value: string): boolean => VERSION_OPTIONS.some((option) => option === value),
  /** 数値指定のエラーを生成します。 */
  createValueError = (option: NumericOption): ParseCliArgumentsResult => {
    let maximum = MAXIMUM_DURATION_MINUTES;

    if (option === '--loop') {
      maximum = MAXIMUM_LOOP_COUNT;
    }

    return {
      kind: 'error',
      message: `Error: ${option} requires an integer from 1 to ${maximum}.\n`,
    };
  },
  /** 値を取らないオプションに値を指定したエラーを生成します。 */
  createFlagValueError = (option: FlagOption): ParseCliArgumentsResult => ({
    kind: 'error',
    message: `Error: ${option} does not take a value.\n`,
  }),
  /** オプションの重複エラーを生成します。 */
  createDuplicateError = (option: NumericOption | FlagOption): ParseCliArgumentsResult => ({
    kind: 'error',
    message: `Error: ${option} may only be specified once.\n`,
  }),
  /** オプション値を仕様の範囲内の整数へ変換します。 */
  parseNumericValue = (option: NumericOption, value: string | undefined): number | undefined => {
    let pattern = DURATION_PATTERN,
      maximum = MAXIMUM_DURATION_MINUTES;

    if (option === '--loop') {
      pattern = LOOP_PATTERN;
      maximum = MAXIMUM_LOOP_COUNT;
    }

    if (typeof value !== 'string' || !pattern.test(value)) {
      return;
    }

    const numericValue = Number(value);

    if (numericValue > maximum) {
      return;
    }

    return numericValue;
  },
  /** 引数をオプション名と値へ分離します。 */
  parseNumericArgument = (argument: string, nextArgument: string | undefined): NumericArgument => {
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
  /** CLI引数から作業時間、休憩時間、繰り返し回数、最後の休憩の有無を解析します。 */
  parseCliArguments = (arguments_: readonly string[]): ParseCliArgumentsResult => {
    if (arguments_.some((argument) => isHelpOption(argument))) {
      return { kind: 'help' };
    }

    if (arguments_.some((argument) => isVersionOption(argument))) {
      return { kind: 'version' };
    }

    const specifiedOptions = new Set<NumericOption | FlagOption>();
    let breakDurationMinutes = DEFAULT_BREAK_DURATION_MINUTES,
      finalBreak = false,
      loopCount = DEFAULT_LOOP_COUNT,
      workDurationMinutes = DEFAULT_WORK_DURATION_MINUTES;

    for (
      let argumentIndex = ARGUMENTS_START_INDEX;
      argumentIndex < arguments_.length;
      argumentIndex += ARGUMENT_INDEX_INCREMENT
    ) {
      const argument = arguments_[argumentIndex] ?? '',
        numericArgument = parseNumericArgument(
          argument,
          arguments_[argumentIndex + NEXT_ARGUMENT_OFFSET],
        ),
        { consumesNextArgument, optionName, value } = numericArgument;

      if (!isFlagOption(optionName) && !isNumericOption(optionName)) {
        return {
          kind: 'error',
          message: `Error: Unknown option: ${escapeDiagnostic(argument)}\n`,
        };
      }

      if (specifiedOptions.has(optionName)) {
        return createDuplicateError(optionName);
      }

      specifiedOptions.add(optionName);

      // 値を取らないオプションは`=`付きの値を拒否し、後続の引数を値として消費しません。
      if (isFlagOption(optionName)) {
        if (!consumesNextArgument) {
          return createFlagValueError(optionName);
        }

        finalBreak = true;
      } else {
        const numericValue = parseNumericValue(optionName, value);

        if (typeof numericValue !== 'number') {
          return createValueError(optionName);
        }

        if (consumesNextArgument) {
          argumentIndex += NEXT_ARGUMENT_OFFSET;
        }

        if (optionName === '--work') {
          workDurationMinutes = numericValue;
        } else if (optionName === '--loop') {
          loopCount = numericValue;
        } else {
          breakDurationMinutes = numericValue;
        }
      }
    }

    return {
      breakDurationMinutes,
      finalBreak,
      kind: 'run',
      loopCount,
      workDurationMinutes,
    };
  };

export { parseCliArguments };
export type { ParseCliArgumentsResult, TimerCliArguments };
