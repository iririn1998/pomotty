import type { SoundProcess, SpawnSoundProcess } from './sound.ts';
import { expect, test } from 'vitest';
import path from 'node:path';
import { playCompletionSound } from './sound.ts';
import { readFile } from 'node:fs/promises';

const LAST_ARGUMENT_INDEX = -1,
  RIFF_END_INDEX = 4,
  RIFF_START_INDEX = 0,
  inactiveProcess: SoundProcess = {
    onClose: Boolean,
    onError: Boolean,
  };

test('作業完了と休憩完了で異なる音源を再生する', () => {
  const soundFiles: string[] = [],
    spawnProcess: SpawnSoundProcess = (_command, commandArguments) => {
      const soundFile = commandArguments.at(LAST_ARGUMENT_INDEX);

      if (soundFile) {
        soundFiles.push(soundFile);
      }

      return inactiveProcess;
    };

  playCompletionSound('work', { platform: 'darwin', spawnProcess });
  playCompletionSound('break', { platform: 'darwin', spawnProcess });

  expect(soundFiles.map((soundFile) => path.basename(soundFile))).toEqual([
    'work-end.wav',
    'break-end.wav',
  ]);
});

test('同梱する2つの通知音は異なるPCM WAVEデータである', async () => {
  const [workSound, breakSound] = await Promise.all([
    readFile(new URL('../../assets/work-end.wav', import.meta.url)),
    readFile(new URL('../../assets/break-end.wav', import.meta.url)),
  ]);

  expect(workSound.subarray(RIFF_START_INDEX, RIFF_END_INDEX).toString('ascii')).toBe('RIFF');
  expect(breakSound.subarray(RIFF_START_INDEX, RIFF_END_INDEX).toString('ascii')).toBe('RIFF');
  expect(workSound.equals(breakSound)).toBe(false);
});

test('音声コマンドがない環境でも異なるベルで通知する', () => {
  const notifications: string[] = [],
    writeFallback = (output: string): void => {
      notifications.push(output);
    };

  playCompletionSound('work', { platform: 'aix', writeFallback });
  playCompletionSound('break', { platform: 'aix', writeFallback });

  expect(notifications).toEqual(['\u0007', '\u0007\u0007']);
});
