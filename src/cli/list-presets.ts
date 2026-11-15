import type { PresetEntry, PresetSource } from '#src/config/resolve.ts';

/** 1行のうち、幅をそろえる列です。 */
type PresetColumns = readonly string[];

const COLUMN_SEPARATOR = '  ',
  DEFAULT_MARKER = '*',
  MINIMUM_WIDTH = 0,
  NOT_DEFAULT_MARKER = ' ',
  /** 定義元ごとの表示です。 */
  SOURCE_LABELS: Readonly<Record<PresetSource, string>> = {
    'built-in': 'built-in',
    config: 'config',
    'config-override': 'config (overrides built-in)',
  },
  /** 既定のプリセットを示す印を返します。 */
  defaultMarker = (entry: PresetEntry): string => {
    if (entry.isDefault) {
      return DEFAULT_MARKER;
    }

    return NOT_DEFAULT_MARKER;
  },
  /** 幅をそろえる列を作ります。 */
  presetColumns = ({ name, values }: PresetEntry): PresetColumns => [
    name,
    `work ${values.work}`,
    `break ${values.break}`,
    `loop ${values.loop}`,
  ],
  /**
   * プリセット一覧を表示用の文字列へ変換します。
   *
   * 列の幅をそろえ、`defaultPreset`で指定されたプリセットには`*`を付けます。
   *
   * @param entries 表示するプリセット。
   * @returns 標準出力へ書き込む文字列。
   */
  formatPresetList = (entries: readonly PresetEntry[]): string => {
    const rows = entries.map((entry) => ({ columns: presetColumns(entry), entry })),
      columnWidth = (columnIndex: number): number =>
        Math.max(
          MINIMUM_WIDTH,
          ...rows.map(({ columns }) => columns[columnIndex]?.length ?? MINIMUM_WIDTH),
        ),
      lines = rows.map(({ columns, entry }) => {
        const cells = columns.map((cell, columnIndex) => cell.padEnd(columnWidth(columnIndex)));

        return `${defaultMarker(entry)} ${[...cells, SOURCE_LABELS[entry.source]].join(COLUMN_SEPARATOR)}`;
      });

    if (entries.some((entry) => entry.isDefault)) {
      lines.push('', `${DEFAULT_MARKER} default preset`);
    }

    return `${lines.join('\n')}\n`;
  };

export { formatPresetList };
