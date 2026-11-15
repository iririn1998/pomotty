import { PRESET_NAME_RULE, isValidPresetName } from '#src/config/presets.ts';
import type { PartialTimerValues, TimerValueKey } from '#src/config/values.ts';
import { describeTimerValueRange, isValidTimerValue } from '#src/config/values.ts';
import type { ConfigSelection } from '#src/config/load.ts';
import { escapeDiagnostic } from '#src/diagnostics/escape.ts';

/** タイマー起動に利用するCLI引数です。 */
type TimerCliArguments = {
  /** どの設定ファイルを読むかの指定です。 */
  readonly config: ConfigSelection;
  readonly kind: 'run';

  /** CLIで指定した作業時間、休憩時間、繰り返し回数です。指定しない項目はキーを持ちません。 */
  readonly overrides: PartialTimerValues;

  /** `--preset`で指定したプリセット名です。 */
  readonly preset?: string;
};

/** プリセット一覧の表示に利用するCLI引数です。 */
type ListPresetsCliArguments = {
  /** どの設定ファイルを読むかの指定です。 */
  readonly config: ConfigSelection;
  readonly kind: 'list-presets';
};

/** CLI引数の解析結果です。 */
type ParseCliArgumentsResult =
  | TimerCliArguments
  | ListPresetsCliArguments
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string };

/** 数値を指定できるCLIオプションです。 */
type NumericOption = '--break' | '--work' | '--loop';

/** 値を受け取るCLIオプションです。短縮形は正式名へ変換して扱います。 */
type ValueOption = NumericOption | '--config' | '--preset';

/** 値を受け取らないCLIオプションです。 */
type FlagOption = '--list-presets' | '--no-config';

/** CLI引数1個から取り出したオプション名と値です。 */
type OptionArgument = {
  readonly consumesNextArgument: boolean;
  readonly optionName: string;
  readonly value?: string;
};

/** 解析中に集めた値です。 */
type ParsedValues = {
  configPath?: string;
  listPresets: boolean;
  noConfig: boolean;
  overrides: Partial<Record<TimerValueKey, number>>;
  preset?: string;
};

const ARGUMENT_INDEX_INCREMENT = 1,
  ARGUMENTS_START_INDEX = 0,
  DURATION_PATTERN = /^[1-9][0-9]{0,3}$/u,
  EQUALS_SIGN = '=',
  EQUALS_SIGN_NOT_FOUND = -1,
  HELP_OPTIONS = ['--help', '-h'] as const,
  NEXT_ARGUMENT_OFFSET = 1,
  NO_OVERRIDES = 0,
  LOOP_PATTERN = /^[1-9][0-9]*$/u,
  /** 値を受け取らないオプションです。 */
  FLAG_OPTIONS: readonly FlagOption[] = ['--list-presets', '--no-config'],
  /** 値を受け取るオプションの名前と、その正式名です。 */
  VALUE_OPTIONS: ReadonlyMap<string, ValueOption> = new Map([
    ['--break', '--break'],
    ['--config', '--config'],
    ['--loop', '--loop'],
    ['--preset', '--preset'],
    ['--work', '--work'],
    ['-p', '--preset'],
  ]),
  /** 数値指定オプションと、設定ファイルでのキー名です。 */
  NUMERIC_OPTION_KEYS: Readonly<Record<NumericOption, TimerValueKey>> = {
    '--break': 'break',
    '--loop': 'loop',
    '--work': 'work',
  },
  /** 引数がヘルプオプションか判定します。 */
  isHelpOption = (value: string): boolean => HELP_OPTIONS.some((option) => option === value),
  /** 引数と一致する、値を受け取らないオプションを返します。 */
  findFlagOption = (argument: string): FlagOption | undefined =>
    FLAG_OPTIONS.find((option) => option === argument),
  /** 引数が、値を付けた値を受け取らないオプションなら、そのオプションを返します。 */
  findFlagOptionWithValue = (argument: string): FlagOption | undefined =>
    FLAG_OPTIONS.find((option) => argument.startsWith(`${option}${EQUALS_SIGN}`)),
  /** エラーの解析結果を生成します。 */
  createError = (message: string): ParseCliArgumentsResult => ({
    kind: 'error',
    message: `Error: ${message}\n`,
  }),
  /** 数値指定のエラーを生成します。 */
  createValueError = (option: NumericOption): ParseCliArgumentsResult =>
    createError(`${option} requires ${describeTimerValueRange(NUMERIC_OPTION_KEYS[option])}.`),
  /** オプションの重複エラーを生成します。 */
  createDuplicateError = (option: ValueOption | FlagOption): ParseCliArgumentsResult =>
    createError(`${option} may only be specified once.`),
  /** オプション値を仕様の範囲内の整数へ変換します。 */
  parseNumericValue = (option: NumericOption, value: string | undefined): number | undefined => {
    let pattern = DURATION_PATTERN;

    if (option === '--loop') {
      pattern = LOOP_PATTERN;
    }

    if (typeof value !== 'string' || !pattern.test(value)) {
      return;
    }

    const numericValue = Number(value);

    if (!isValidTimerValue(NUMERIC_OPTION_KEYS[option], numericValue)) {
      return;
    }

    return numericValue;
  },
  /** 引数をオプション名と値へ分離します。 */
  parseOptionArgument = (argument: string, nextArgument: string | undefined): OptionArgument => {
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
  /**
   * 値を受け取るオプションの値を検証して記録します。
   *
   * @returns 値が不正ならエラーの解析結果、正しければ`undefined`。
   */
  applyValueOption = (
    parsed: ParsedValues,
    option: ValueOption,
    value: string | undefined,
  ): ParseCliArgumentsResult | undefined => {
    if (option === '--preset') {
      if (typeof value !== 'string' || !isValidPresetName(value)) {
        return createError(`--preset requires a preset name (${PRESET_NAME_RULE}).`);
      }

      parsed.preset = value;
      return;
    }

    if (option === '--config') {
      if (typeof value !== 'string' || value === '') {
        return createError('--config requires a file path.');
      }

      parsed.configPath = value;
      return;
    }

    const numericValue = parseNumericValue(option, value);

    if (typeof numericValue !== 'number') {
      return createValueError(option);
    }

    parsed.overrides[NUMERIC_OPTION_KEYS[option]] = numericValue;
  },
  /** 集めた値から、読む設定ファイルの指定を作ります。 */
  configSelection = ({ configPath, noConfig }: ParsedValues): ConfigSelection => {
    if (noConfig) {
      return { kind: 'none' };
    }

    if (typeof configPath === 'string') {
      return { kind: 'file', path: configPath };
    }

    return { kind: 'default' };
  },
  /** オプション同士の組み合わせを検証し、解析結果を作ります。 */
  createResult = (parsed: ParsedValues): ParseCliArgumentsResult => {
    if (typeof parsed.configPath === 'string' && parsed.noConfig) {
      return createError('--config and --no-config cannot be used together.');
    }

    const config = configSelection(parsed);

    if (parsed.listPresets) {
      if (
        Object.keys(parsed.overrides).length > NO_OVERRIDES ||
        typeof parsed.preset === 'string'
      ) {
        return createError(
          '--list-presets cannot be combined with --work, --break, --loop, or --preset.',
        );
      }

      return { config, kind: 'list-presets' };
    }

    if (typeof parsed.preset === 'string') {
      return { config, kind: 'run', overrides: parsed.overrides, preset: parsed.preset };
    }

    return { config, kind: 'run', overrides: parsed.overrides };
  },
  /** CLI引数から作業時間、休憩時間、繰り返し回数、プリセット、設定ファイルの指定を解析します。 */
  parseCliArguments = (arguments_: readonly string[]): ParseCliArgumentsResult => {
    if (arguments_.some((argument) => isHelpOption(argument))) {
      return { kind: 'help' };
    }

    const specifiedOptions = new Set<ValueOption | FlagOption>(),
      parsed: ParsedValues = { listPresets: false, noConfig: false, overrides: {} };

    for (
      let argumentIndex = ARGUMENTS_START_INDEX;
      argumentIndex < arguments_.length;
      argumentIndex += ARGUMENT_INDEX_INCREMENT
    ) {
      const argument = arguments_[argumentIndex] ?? '',
        flagOption = findFlagOption(argument);

      if (typeof flagOption === 'string') {
        if (specifiedOptions.has(flagOption)) {
          return createDuplicateError(flagOption);
        }

        specifiedOptions.add(flagOption);

        if (flagOption === '--list-presets') {
          parsed.listPresets = true;
        } else {
          parsed.noConfig = true;
        }
      } else {
        const flagOptionWithValue = findFlagOptionWithValue(argument);

        if (typeof flagOptionWithValue === 'string') {
          return createError(`${flagOptionWithValue} does not take a value.`);
        }

        const { consumesNextArgument, optionName, value } = parseOptionArgument(
            argument,
            arguments_[argumentIndex + NEXT_ARGUMENT_OFFSET],
          ),
          valueOption = VALUE_OPTIONS.get(optionName);

        if (typeof valueOption !== 'string') {
          return createError(`Unknown option: ${escapeDiagnostic(argument)}`);
        }

        if (specifiedOptions.has(valueOption)) {
          return createDuplicateError(valueOption);
        }

        const error = applyValueOption(parsed, valueOption, value);

        if (typeof error === 'object') {
          return error;
        }

        specifiedOptions.add(valueOption);

        if (consumesNextArgument) {
          argumentIndex += NEXT_ARGUMENT_OFFSET;
        }
      }
    }

    return createResult(parsed);
  };

export { parseCliArguments };
export type { ListPresetsCliArguments, ParseCliArgumentsResult, TimerCliArguments };
