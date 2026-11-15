import { expect, test } from 'vitest';
import { resolveDefaultConfigPath } from './path.ts';

test.each([
  {
    env: { XDG_CONFIG_HOME: '/xdg' },
    expected: '/xdg/pomotty/config.json',
    name: '絶対パスのXDG_CONFIG_HOMEを使う',
  },
  {
    env: {},
    expected: '/home/u/.config/pomotty/config.json',
    name: 'XDG_CONFIG_HOMEがなければ~/.configを使う',
  },
  {
    env: { XDG_CONFIG_HOME: '' },
    expected: '/home/u/.config/pomotty/config.json',
    name: '空のXDG_CONFIG_HOMEは無視する',
  },
  {
    env: { XDG_CONFIG_HOME: 'relative/dir' },
    expected: '/home/u/.config/pomotty/config.json',
    name: '相対パスのXDG_CONFIG_HOMEは無視する',
  },
])('Linux/macOS: $name', ({ env, expected }) => {
  expect(resolveDefaultConfigPath({ env, homeDirectory: '/home/u', platform: 'linux' })).toBe(
    expected,
  );
  expect(resolveDefaultConfigPath({ env, homeDirectory: '/home/u', platform: 'darwin' })).toBe(
    expected,
  );
});

test.each([
  {
    env: { APPDATA: String.raw`C:\Users\u\AppData\Roaming` },
    expected: String.raw`C:\Users\u\AppData\Roaming\pomotty\config.json`,
    name: 'APPDATAを使う',
  },
  {
    env: {},
    expected: String.raw`C:\Users\u\AppData\Roaming\pomotty\config.json`,
    name: 'APPDATAがなければホームディレクトリから組み立てる',
  },
  {
    env: { APPDATA: 'relative', XDG_CONFIG_HOME: String.raw`D:\xdg` },
    expected: String.raw`C:\Users\u\AppData\Roaming\pomotty\config.json`,
    name: '相対パスのAPPDATAは無視し、XDG_CONFIG_HOMEは使わない',
  },
])('Windows: $name', ({ env, expected }) => {
  expect(
    resolveDefaultConfigPath({ env, homeDirectory: String.raw`C:\Users\u`, platform: 'win32' }),
  ).toBe(expected);
});

test.each(['linux', 'win32'] as const)(
  '%s: 設定ディレクトリを決められなければundefinedを返す',
  (platform) => {
    expect(resolveDefaultConfigPath({ env: {}, homeDirectory: '', platform })).toBeUndefined();
  },
);
