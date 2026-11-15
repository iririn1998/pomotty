import path from 'node:path';

/** 標準の設定ファイルの場所を決める環境です。 */
type ConfigPathEnvironment = {
  /** 環境変数です。 */
  readonly env: Readonly<Record<string, string | undefined>>;

  /** ホームディレクトリです。不明な場合は空文字列です。 */
  readonly homeDirectory: string;

  /** 実行中のOSです。 */
  readonly platform: NodeJS.Platform;
};

const APPLICATION_DIRECTORY = 'pomotty',
  CONFIG_FILE_NAME = 'config.json',
  /** 環境変数の値が空でない絶対パスなら返します。 */
  absoluteDirectory = (
    pathModule: path.PlatformPath,
    value: string | undefined,
  ): string | undefined => {
    if (typeof value === 'string' && value !== '' && pathModule.isAbsolute(value)) {
      return value;
    }

    return undefined;
  },
  /** ホームディレクトリ配下の既定の設定ディレクトリを返します。 */
  homeConfigDirectory = (
    pathModule: path.PlatformPath,
    homeDirectory: string,
    segments: readonly string[],
  ): string | undefined => {
    if (homeDirectory === '') {
      return undefined;
    }

    return pathModule.join(homeDirectory, ...segments);
  },
  /**
   * 標準の設定ファイルのパスを返します。
   *
   * Windowsでは`%APPDATA%\pomotty\config.json`、それ以外では
   * `$XDG_CONFIG_HOME/pomotty/config.json`（未設定なら`~/.config/pomotty/config.json`）です。
   * XDG Base Directoryの仕様に従い、相対パスの`XDG_CONFIG_HOME`は無視します。
   * 設定ディレクトリを決められない場合は`undefined`を返します。
   */
  resolveDefaultConfigPath = ({
    env,
    homeDirectory,
    platform,
  }: ConfigPathEnvironment): string | undefined => {
    let pathModule = path.posix,
      configDirectory: string | undefined;

    if (platform === 'win32') {
      pathModule = path.win32;
      configDirectory =
        absoluteDirectory(pathModule, env.APPDATA) ??
        homeConfigDirectory(pathModule, homeDirectory, ['AppData', 'Roaming']);
    } else {
      configDirectory =
        absoluteDirectory(pathModule, env.XDG_CONFIG_HOME) ??
        homeConfigDirectory(pathModule, homeDirectory, ['.config']);
    }

    if (configDirectory === undefined) {
      return undefined;
    }

    return pathModule.join(configDirectory, APPLICATION_DIRECTORY, CONFIG_FILE_NAME);
  };

export { resolveDefaultConfigPath };
export type { ConfigPathEnvironment };
