import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import type { CommandFileSystem, PlayerCommands } from './commands.ts';
import { describe, expect, test } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { resolvePlayerCommands } from './commands.ts';

type FakeFileSystemDefinition = {
  /** 存在するディレクトリです。 */
  readonly directories?: readonly string[];

  /** 実行可能な通常ファイルです。 */
  readonly executables?: readonly string[];

  /** 実行できない通常ファイルです。 */
  readonly files?: readonly string[];

  /** シンボリックリンクとrealpath後の値です。 */
  readonly links?: Readonly<Record<string, string>>;
};

const CWD = '/home/user/project',
  EXECUTABLE_MODE = 0o755,
  /** 指定したエントリだけが存在する偽のファイルシステムを作成します。 */
  createFileSystem = ({
    directories = [],
    executables = [],
    files = [],
    links = {},
  }: FakeFileSystemDefinition): CommandFileSystem => {
    const existing = new Set([...directories, ...executables, ...files]);

    return {
      isExecutableFile: (target) => executables.includes(target),
      realpath: (target) => {
        const linked = links[target];

        if (linked !== undefined) {
          return linked;
        }

        if (existing.has(target)) {
          return target;
        }

        throw new Error(`ENOENT: ${target}`);
      },
    };
  },
  linuxCommandsFor = (
    pathValue: string | undefined,
    definition: FakeFileSystemDefinition,
  ): PlayerCommands =>
    resolvePlayerCommands({
      cwd: CWD,
      environment: { PATH: pathValue },
      fileSystem: createFileSystem(definition),
      platform: 'linux',
    });

describe('macOS', () => {
  test('固定の/usr/bin/afplayだけを使う', () => {
    expect(
      resolvePlayerCommands({
        environment: { PATH: '/opt/bin' },
        fileSystem: createFileSystem({ executables: ['/usr/bin/afplay', '/opt/bin/afplay'] }),
        platform: 'darwin',
      }),
    ).toEqual({ afplay: '/usr/bin/afplay' });
  });

  test('/usr/bin/afplayが実行できなければPATHから代替を探さない', () => {
    expect(
      resolvePlayerCommands({
        environment: { PATH: '/opt/bin' },
        fileSystem: createFileSystem({
          executables: ['/opt/bin/afplay'],
          files: ['/usr/bin/afplay'],
        }),
        platform: 'darwin',
      }),
    ).toEqual({});
  });
});

describe('Linux', () => {
  test('PATHを順番に探索して最初の実行可能ファイルを返す', () => {
    expect(
      linuxCommandsFor('/usr/local/bin:/usr/bin', {
        directories: ['/usr/local/bin', '/usr/bin'],
        executables: ['/usr/bin/paplay', '/usr/bin/aplay', '/usr/local/bin/aplay'],
      }),
    ).toEqual({ aplay: '/usr/local/bin/aplay', paplay: '/usr/bin/paplay' });
  });

  test.each([
    { name: '空要素', pathValue: ':/usr/bin' },
    { name: '末尾の空要素', pathValue: '/usr/bin:' },
    { name: '相対ディレクトリ', pathValue: '.:/usr/bin' },
    { name: 'cwd自身', pathValue: `${CWD}:/usr/bin` },
    { name: 'cwd配下', pathValue: `${CWD}/bin:/usr/bin` },
    { name: 'node_modules/.bin', pathValue: '/opt/tools/node_modules/.bin:/usr/bin' },
  ])('$nameにある同名コマンドを実行しない', ({ pathValue }) => {
    const directories = ['/usr/bin', CWD, `${CWD}/bin`, '/opt/tools/node_modules/.bin'],
      executables = ['/usr/bin/paplay', '/usr/bin/aplay'];

    for (const directory of directories.slice(1)) {
      executables.push(`${directory}/paplay`, `${directory}/aplay`);
    }

    expect(linuxCommandsFor(pathValue, { directories, executables })).toEqual({
      aplay: '/usr/bin/aplay',
      paplay: '/usr/bin/paplay',
    });
  });

  test('cwd配下を指すシンボリックリンクのディレクトリを拒否する', () => {
    expect(
      linuxCommandsFor('/opt/link:/usr/bin', {
        directories: ['/usr/bin', `${CWD}/bin`],
        executables: [`${CWD}/bin/paplay`, '/usr/bin/paplay'],
        links: { '/opt/link': `${CWD}/bin` },
      }),
    ).toEqual({ paplay: '/usr/bin/paplay' });
  });

  test('cwd配下を指すシンボリックリンクのコマンドを拒否する', () => {
    expect(
      linuxCommandsFor('/opt/bin:/usr/bin', {
        directories: ['/opt/bin', '/usr/bin'],
        executables: [`${CWD}/paplay`, '/usr/bin/paplay'],
        links: { '/opt/bin/paplay': `${CWD}/paplay` },
      }),
    ).toEqual({ paplay: '/usr/bin/paplay' });
  });

  test('node_modules/.bin配下を指すシンボリックリンクを拒否する', () => {
    expect(
      linuxCommandsFor('/opt/bin', {
        directories: ['/opt/bin'],
        executables: ['/srv/node_modules/.bin/paplay'],
        links: { '/opt/bin/paplay': '/srv/node_modules/.bin/paplay' },
      }),
    ).toEqual({});
  });

  test('シンボリックリンクはrealpath後の絶対パスを返す', () => {
    expect(
      linuxCommandsFor('/usr/bin', {
        directories: ['/usr/bin'],
        executables: ['/usr/lib/pulse/paplay'],
        links: { '/usr/bin/paplay': '/usr/lib/pulse/paplay' },
      }),
    ).toEqual({ paplay: '/usr/lib/pulse/paplay' });
  });

  test('実行できないファイルとディレクトリを候補にしない', () => {
    expect(
      linuxCommandsFor('/opt/bin:/usr/bin', {
        directories: ['/opt/bin', '/usr/bin', '/opt/bin/aplay'],
        executables: ['/usr/bin/paplay', '/usr/bin/aplay'],
        files: ['/opt/bin/paplay'],
      }),
    ).toEqual({ aplay: '/usr/bin/aplay', paplay: '/usr/bin/paplay' });
  });

  test('PATH未設定時だけ既定のディレクトリを探索する', () => {
    const definition = {
      directories: ['/usr/local/bin', '/usr/bin', '/bin'],
      executables: ['/bin/paplay', '/usr/bin/aplay'],
    };

    expect(linuxCommandsFor(undefined, definition)).toEqual({
      aplay: '/usr/bin/aplay',
      paplay: '/bin/paplay',
    });
    expect(linuxCommandsFor('', definition)).toEqual({});
  });

  // Windowsではシンボリックリンクの作成に権限が必要で、実行権限の概念も異なります。
  test.skipIf(process.platform === 'win32')(
    '実際のファイルシステムでcwdに置いたコマンドを実行対象にしない',
    async () => {
      const temporaryPrefix = path.join(os.tmpdir(), 'pomotty-'),
        temporaryDirectory = await realpath(await mkdtemp(temporaryPrefix));

      try {
        const project = path.join(temporaryDirectory, 'project'),
          system = path.join(temporaryDirectory, 'system'),
          linked = path.join(temporaryDirectory, 'linked');

        await mkdir(project);
        await mkdir(system);
        await writeFile(path.join(project, 'paplay'), '#!/bin/sh\n');
        await writeFile(path.join(system, 'paplay'), '#!/bin/sh\n');
        await chmod(path.join(project, 'paplay'), EXECUTABLE_MODE);
        await chmod(path.join(system, 'paplay'), EXECUTABLE_MODE);
        await symlink(project, linked);

        expect(
          resolvePlayerCommands({
            cwd: project,
            environment: { PATH: ['', '.', linked, system].join(path.posix.delimiter) },
            platform: 'linux',
          }),
        ).toEqual({ paplay: path.join(system, 'paplay') });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );
});

describe('Windows', () => {
  const POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
    windowsCommandsFor = (
      systemRoot: string | undefined,
      definition: FakeFileSystemDefinition,
      cwd = String.raw`C:\Users\user\project`,
    ): PlayerCommands =>
      resolvePlayerCommands({
        cwd,
        environment: { PATH: String.raw`C:\Users\user\project`, SystemRoot: systemRoot },
        fileSystem: createFileSystem(definition),
        platform: 'win32',
      });

  test('SystemRoot配下の固定PowerShellを絶対パスで返す', () => {
    expect(
      windowsCommandsFor(String.raw`C:\Windows`, {
        directories: [String.raw`C:\Windows`],
        executables: [POWERSHELL, String.raw`C:\Users\user\project\powershell.exe`],
      }),
    ).toEqual({ powershell: POWERSHELL });
  });

  test.each([
    { name: '未設定', systemRoot: undefined },
    { name: '相対パス', systemRoot: 'Windows' },
    { name: 'ドライブ相対パス', systemRoot: 'C:Windows' },
    { name: '存在しないディレクトリ', systemRoot: String.raw`D:\Windows` },
  ])('SystemRootが$nameならcwdやPATHを探さず利用不能とする', ({ systemRoot }) => {
    expect(
      windowsCommandsFor(systemRoot, {
        directories: [String.raw`C:\Windows`],
        executables: [POWERSHELL, String.raw`C:\Users\user\project\powershell.exe`],
      }),
    ).toEqual({ powershell: undefined });
  });

  test('realpath後の候補がcwd配下なら大文字小文字を問わず拒否する', () => {
    expect(
      windowsCommandsFor(String.raw`C:\Windows`, {
        directories: [String.raw`C:\Windows`],
        executables: [String.raw`C:\Users\User\Project\powershell.exe`],
        links: { [POWERSHELL]: String.raw`C:\Users\User\Project\powershell.exe` },
      }),
    ).toEqual({ powershell: undefined });
  });

  test('realpath後の候補がnode_modules/.bin配下なら拒否する', () => {
    expect(
      windowsCommandsFor(String.raw`C:\Windows`, {
        directories: [String.raw`C:\Windows`],
        executables: [String.raw`D:\tools\node_modules\.bin\powershell.exe`],
        links: { [POWERSHELL]: String.raw`D:\tools\node_modules\.bin\powershell.exe` },
      }),
    ).toEqual({ powershell: undefined });
  });
});

describe('その他のOS', () => {
  test('対応しないOSでは再生コマンドを解決しない', () => {
    expect(
      resolvePlayerCommands({
        fileSystem: createFileSystem({ executables: ['/usr/bin/paplay'] }),
        platform: 'aix',
      }),
    ).toEqual({});
  });
});
