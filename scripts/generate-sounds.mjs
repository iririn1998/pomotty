import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SAMPLE_RATE = 44_100,
  CHANNEL_COUNT = 1,
  BITS_PER_SAMPLE = 16,
  BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8,
  DURATION_SECONDS = 0.8,
  SAMPLE_COUNT = Math.round(SAMPLE_RATE * DURATION_SECONDS),
  HEADER_SIZE = 44,
  MAXIMUM_AMPLITUDE = 0.3,
  FADE_SECONDS = 0.025,
  FADE_SAMPLE_COUNT = SAMPLE_RATE * FADE_SECONDS,
  outputDirectory = path.resolve(
    process.argv.at(2) ?? fileURLToPath(new URL('../assets', import.meta.url)),
  ),
  /** 作業終了音と休憩終了音を出力先へ生成します。 */
  main = async () => {
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.resolve(outputDirectory, 'work-end.wav'), createWave([440, 330])),
      writeFile(path.resolve(outputDirectory, 'break-end.wav'), createWave([660, 880])),
    ]);
  };

/**
 * 指定した周波数列からモノラルのPCM WAVEデータを生成します。
 *
 * @param {readonly number[]} frequencies 順番に鳴らす周波数。
 * @returns {Buffer} 生成したWAVEデータ。
 */
const createWave = (frequencies) => {
  const dataSize = SAMPLE_COUNT * BYTES_PER_SAMPLE,
    buffer = Buffer.alloc(HEADER_SIZE + dataSize),
    byteRate = SAMPLE_RATE * CHANNEL_COUNT * BYTES_PER_SAMPLE,
    blockAlignment = CHANNEL_COUNT * BYTES_PER_SAMPLE;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlignment, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const progress = index / SAMPLE_COUNT,
      frequencyIndex = Math.min(Math.floor(progress * frequencies.length), frequencies.length - 1),
      frequency = frequencies[frequencyIndex],
      elapsedSeconds = index / SAMPLE_RATE,
      fadeIn = Math.min(1, index / FADE_SAMPLE_COUNT),
      fadeOut = Math.min(1, (SAMPLE_COUNT - index - 1) / FADE_SAMPLE_COUNT),
      envelope = Math.min(fadeIn, fadeOut),
      sample = Math.sin(2 * Math.PI * frequency * elapsedSeconds) * MAXIMUM_AMPLITUDE * envelope;

    buffer.writeInt16LE(Math.round(sample * 32_767), HEADER_SIZE + index * BYTES_PER_SAMPLE);
  }

  return buffer;
};

try {
  await main();
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
}
