import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** コマンド解決に使うファイルシステム操作です。 */
type CommandFileSystem = {
  /** シンボリックリンクを解決した絶対パスを返します。存在しない場合は例外を投げます。 */
  readonly realpath: (target: string) => string;

  /** 実行可能な通常ファイルなら`true`を返します。 */
  readonly isExecutableFile: (target: string) => boolean;
};

/** 起動時に1回だけ解決した再生コマンドの絶対パスです。 */
type PlayerCommands = {
  readonly afplay?: string;
  readonly aplay?: string;
  readonly paplay?: string;
  readonly powershell?: string;
};

/** コマンド解決の入力です。 */
type ResolvePlayerCommandsParameters = {
  /** 起動時の作業ディレクトリです。 */
  readonly cwd?: string;

  /** 起動時の環境変数です。 */
  readonly environment?: NodeJS.ProcessEnv;

  /** ファイルシステム操作です。 */
  readonly fileSystem?: CommandFileSystem;

  /** 解決対象のOSです。 */
  readonly platform?: NodeJS.Platform;
};

/** 実行ファイル探索の規則です。 */
type SearchContext = {
  /** 大文字小文字を区別せずにパスを比較する場合は`true`です。 */
  readonly caseInsensitive: boolean;

  /** 実行時に除外する起動時cwdの候補です。 */
  readonly excludedDirectories: readonly string[];

  /** ファイルシステム操作です。 */
  readonly fileSystem: CommandFileSystem;

  /** OSに対応するパス操作です。 */
  readonly pathApi: typeof path.posix;
};

const AFPLAY_PATH = '/usr/bin/afplay',
  DEFAULT_LINUX_PATH = ['/usr/local/bin', '/usr/bin', '/bin'],
  NODE_MODULES_SEGMENT = 'node_modules',
  BIN_SEGMENT = '.bin',
  NEXT_SEGMENT_OFFSET = 1,
  POWERSHELL_SEGMENTS = ['System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'],
  /** 実行可能な通常ファイルか判定します。 */
  isExecutableFile = (target: string): boolean => {
    try {
      if (!statSync(target).isFile()) {
        return false;
      }

      accessSync(target, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  nodeFileSystem: CommandFileSystem = {
    isExecutableFile,
    realpath: (target) => realpathSync(target),
  },
  /** パス比較用の正規化を行います。 */
  comparablePath = (value: string, context: SearchContext): string => {
    const normalized = context.pathApi.normalize(value);

    if (context.caseInsensitive) {
      return normalized.toLowerCase();
    }

    return normalized;
  },
  /** `child`が`parent`自身またはその配下か判定します。 */
  isWithin = (parent: string, child: string, context: SearchContext): boolean => {
    const relative = context.pathApi.relative(
      comparablePath(parent, context),
      comparablePath(child, context),
    );

    return (
      relative === '' ||
      (!relative.startsWith(`..${context.pathApi.sep}`) &&
        relative !== '..' &&
        !context.pathApi.isAbsolute(relative))
    );
  },
  /** パス要素に連続した`node_modules/.bin`を含むか判定します。 */
  containsNodeModulesBin = (value: string, context: SearchContext): boolean => {
    const segments = comparablePath(value, context)
      .split(context.pathApi.sep)
      .filter((segment) => segment !== '');

    return segments.some(
      (segment, index) =>
        segment === NODE_MODULES_SEGMENT && segments[index + NEXT_SEGMENT_OFFSET] === BIN_SEGMENT,
    );
  },
  /** 起動時cwd配下または`node_modules/.bin`配下のパスを拒否します。 */
  isExcluded = (value: string, context: SearchContext): boolean =>
    containsNodeModulesBin(value, context) ||
    context.excludedDirectories.some((directory) => isWithin(directory, value, context)),
  /** シンボリックリンクを解決したパスを返し、失敗した場合は`undefined`を返します。 */
  tryRealpath = (target: string, context: SearchContext): string | undefined => {
    try {
      return context.fileSystem.realpath(target);
    } catch {
      return undefined;
    }
  },
  /** 起動時cwdとそのrealpathを除外対象として返します。 */
  excludedDirectoriesFor = (cwd: string, fileSystem: CommandFileSystem): readonly string[] => {
    try {
      return [cwd, fileSystem.realpath(cwd)];
    } catch {
      return [cwd];
    }
  },
  /**
   * ディレクトリ内のコマンドを検証し、利用可能なら絶対パスを返します。
   *
   * ディレクトリと候補の両方をrealpath後にも検査し、シンボリックリンクで
   * cwd配下や`node_modules/.bin`の除外を迂回できないようにします。
   */
  commandInDirectory = (
    directory: string,
    name: string,
    context: SearchContext,
  ): string | undefined => {
    if (!context.pathApi.isAbsolute(directory) || isExcluded(directory, context)) {
      return undefined;
    }

    const realDirectory = tryRealpath(directory, context);

    if (realDirectory === undefined || isExcluded(realDirectory, context)) {
      return undefined;
    }

    const candidate = tryRealpath(context.pathApi.join(realDirectory, name), context);

    if (
      candidate === undefined ||
      isExcluded(candidate, context) ||
      !context.fileSystem.isExecutableFile(candidate)
    ) {
      return undefined;
    }

    return candidate;
  },
  /** Linuxの`PATH`をNode.js内で探索し、最初に見つかったコマンドの絶対パスを返します。 */
  findInPath = (
    name: string,
    environment: NodeJS.ProcessEnv,
    context: SearchContext,
  ): string | undefined => {
    const directories = environment.PATH?.split(path.posix.delimiter) ?? DEFAULT_LINUX_PATH;

    for (const directory of directories) {
      // 空要素は作業ディレクトリを意味するため、絶対パス判定で除外します。
      const resolved = commandInDirectory(directory, name, context);

      if (resolved !== undefined) {
        return resolved;
      }
    }

    return undefined;
  },
  /** `SystemRoot`配下の固定PowerShellだけを検証して返します。 */
  findWindowsPowerShell = (
    environment: NodeJS.ProcessEnv,
    context: SearchContext,
  ): string | undefined => {
    const systemRoot = environment.SystemRoot;

    if (systemRoot === undefined || !path.win32.isAbsolute(systemRoot)) {
      return undefined;
    }

    const realSystemRoot = tryRealpath(systemRoot, context);

    if (realSystemRoot === undefined) {
      return undefined;
    }

    const candidate = tryRealpath(path.win32.join(realSystemRoot, ...POWERSHELL_SEGMENTS), context);

    if (
      candidate === undefined ||
      isExcluded(candidate, context) ||
      !context.fileSystem.isExecutableFile(candidate)
    ) {
      return undefined;
    }

    return candidate;
  },
  /**
   * 再生コマンドを絶対パスへ1回だけ解決します。
   *
   * 引数検証後かつ端末初期化前に呼び出し、結果を保持して使い回します。
   * 実行時に裸のコマンド名を`spawn()`へ渡さないことで、cwdや相対PATH、
   * `node_modules/.bin`に置かれた同名コマンドを実行しないようにします。
   * 利用できないコマンドは結果に含めず、通常のフォールバックへ進ませます。
   *
   * @param parameters 解決対象のOSと起動時の環境。
   * @returns 利用可能な再生コマンドの絶対パス。
   */
  resolvePlayerCommands = ({
    cwd = process.cwd(),
    environment = process.env,
    fileSystem = nodeFileSystem,
    platform = process.platform,
  }: ResolvePlayerCommandsParameters = {}): PlayerCommands => {
    switch (platform) {
      case 'darwin': {
        if (fileSystem.isExecutableFile(AFPLAY_PATH)) {
          return { afplay: AFPLAY_PATH };
        }

        return {};
      }
      case 'linux': {
        const context: SearchContext = {
          caseInsensitive: false,
          excludedDirectories: excludedDirectoriesFor(cwd, fileSystem),
          fileSystem,
          pathApi: path.posix,
        };

        return {
          aplay: findInPath('aplay', environment, context),
          paplay: findInPath('paplay', environment, context),
        };
      }
      case 'win32': {
        const context: SearchContext = {
          caseInsensitive: true,
          excludedDirectories: excludedDirectoriesFor(cwd, fileSystem),
          fileSystem,
          pathApi: path.win32,
        };

        return { powershell: findWindowsPowerShell(environment, context) };
      }
      default: {
        return {};
      }
    }
  };

export { resolvePlayerCommands };
export type { CommandFileSystem, PlayerCommands, ResolvePlayerCommandsParameters };
