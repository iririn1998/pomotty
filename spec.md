# ポモドーロタイマー CLI 仕様書

## 1. 概要

ターミナル上で動作するポモドーロタイマー。`npx` から即座に起動でき、フォアグラウンドで残り時間を表示し続ける。フェーズ切り替え時に音でユーザーへ知らせ、macOS / Linux ではデスクトップ通知も発生させる。Windows は音のみとし、デスクトップ通知には対応しない。

### 設計方針

| 方針                            | 理由                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| ランタイム依存パッケージゼロ    | `npx` の初回起動を最速にする。`postinstall` やネイティブバイナリのDLを回避 |
| 実行コードを1ファイルにバンドル | 実行時のモジュール解決を単純化する。tsdownでビルドし、別途wav音源2個を同梱 |
| フォアグラウンド動作            | デーモン・ソケット・PIDファイル・バージョン不一致の問題を全て回避          |
| 絶対時刻ベースのタイマー        | スリープ復帰・イベントループ遅延後も、現在フェーズの終了を正しく検知する   |

### 動作環境

- Node.js `^22.18.0 || >=24.11.0`
- macOS / Linux / Windows

Node.js 18と20はリリース時点でEOLのため対象外とする。Node.js 22系は22.18.0以上、Node.js 24系は24.11.0以上を対象とし、23.xと24.0〜24.10は対象外とする。CLIの実行、ビルド、型チェック、テストで同じ範囲を使用し、`package.json`の`engines`、README、CIもこの値へ統一する。実装はサポート範囲の下限であるNode.js 22.18.0で動作する構文とAPIだけを使用する。

### 機能対応表

| 機能               | macOS | Linux                                  | Windows              |
| ------------------ | ----- | -------------------------------------- | -------------------- |
| タイマー・キー操作 | 対応  | 対応                                   | 対応                 |
| 通知音             | 対応  | 対応                                   | 対応                 |
| デスクトップ通知   | 対応  | 対応（`notify-send` が利用可能な場合） | **非対応（音のみ）** |

通知用コマンドが存在しない、権限がない、または実行に失敗した場合もタイマーは継続する。デスクトップ通知は補助機能であり、タイマー本体の動作保証には含めない。

---

## 2. コマンド仕様

サブコマンドは持たない。単一コマンド + オプション構成とする。

```
npx pomotty [options]
```

### オプション

| オプション             | 既定値   | 説明                                                                                     |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `--work <min>`         | `25`     | 作業時間（分）。1〜1440の整数                                                            |
| `--break <min>`        | `5`      | 短い休憩時間（分）。1〜1440の整数                                                        |
| `--long-break <min>`   | `15`     | 長い休憩時間（分）。1〜1440の整数                                                        |
| `--cycles <n>`         | `4`      | 長い休憩に入るまでに自然終了させる作業セット数。1〜100の整数                             |
| `--task <name>`        | なし     | タスク名。画面と、対応OSではデスクトップ通知に表示                                       |
| `--no-sound`           | —        | 音を無効化                                                                               |
| `--no-notify`          | —        | デスクトップ通知を無効化（macOS / Linuxのみ。Windowsでは受理するが動作に影響しない）     |
| `--sound-work <path>`  | 同梱音源 | 作業終了音の差し替え。読み取り可能なwavファイル                                          |
| `--sound-break <path>` | 同梱音源 | 休憩終了音の差し替え。読み取り可能なwavファイル                                          |
| `--volume <0-1>`       | `0.6`    | 0〜1の有限小数。音量（macOSの`afplay`とLinuxの`paplay`で有効。`aplay`とWindowsでは無視） |
| `--help` / `-h`        | —        | ヘルプ表示                                                                               |
| `--version` / `-v`     | —        | バージョン表示                                                                           |

### 使用例

```bash
npx pomotty
npx pomotty --work 50 --break 10 --cycles 2
npx pomotty --task "仕様書レビュー" --no-sound
```

### ヘルプ表示

`--help`の出力は次を規範とする。末尾には改行をちょうど1個付ける。列幅に応じた折り返しや色付けは行わず、TTY / 非TTYで同じ文字列を出力する。

```text
使い方: pomotty [options]

オプション:
  --work <min>         作業時間。1〜1440の整数（既定: 25）
  --break <min>        短い休憩時間。1〜1440の整数（既定: 5）
  --long-break <min>   長い休憩時間。1〜1440の整数（既定: 15）
  --cycles <n>         長い休憩までの自然終了WORK数。1〜100（既定: 4）
  --task <name>        タスク名
  --no-sound           音を無効化
  --no-notify          デスクトップ通知を無効化
  --sound-work <path>  作業終了音のwavファイル
  --sound-break <path> 休憩終了音のwavファイル
  --volume <0-1>       音量（既定: 0.6）
  -h, --help           このヘルプを表示
  -v, --version        バージョンを表示

キー操作（インタラクティブTTYのみ）:
  space  一時停止 / 再開
  s      現フェーズをskip
  q      終了
  Ctrl+C 終了

動作:
  WORKと休憩を終了操作まで無期限に繰り返します。
  --cyclesは総実行回数ではなく、LONG_BREAKまでの間隔です。
  非TTYではキー操作を無効化し、終了にはOSシグナルを使用します。

通知:
  macOS / Linuxではデスクトップ通知を利用できます。
  Windowsは音のみです。--no-notifyは受理しますが動作に影響しません。
  macOSで通知が出ない場合は、システム設定の通知一覧で該当する通知元を確認してください。

音量と音源:
  --volumeはmacOS（afplay）とLinux（paplay）で有効です。
  Linuxでaplayへフォールバックした場合とWindowsでは無視されます。
  Windowsで差し替え音源を使う場合は、非圧縮PCMのRIFF WAVEが必要です。

引数:
  `-`で始まる値は`--task=-h`のように`=`形式で指定します。
  位置引数と`--`によるオプション終端は使用できません。
```

`--version`は`pomotty <package.jsonのversion>`という1行をstdoutへ出力し、末尾に改行をちょうど1個付ける。バージョン1.0.0の出力は厳密に`pomotty 1.0.0\n`となる。

引数の解析と検証は、raw mode、タイマー、音、通知を初期化する前に完了させる。`--help`と`--version`は情報をstdoutへ出力して終了コード`0`で終了し、タイマーを開始しない。最初のstdout書き込み前に最小の`error`リスナーを登録し、help / version書き込みの同期throwまたは非同期`error`が`EPIPE`なら終了コード`0`、その他なら`1`とする。この経路でもサマリ、ANSI、診断は出力しない。

値付きロングオプションは`--work 25`と`--work=25`の両形式を受理する。ただし、値が`-`で始まる場合は、すべての値付きオプションで`--option=value`形式だけを受理する。分離形式でオプション直後に現れた`-`始まりのargv要素は値として消費せず、独立したオプションとして解釈する。したがって`--task=-h`はタスク名`-h`として受理するが、`--task -h`の`-h`はhelpオプションとなる。`--task --title`は未知のオプションとして拒否する。

短縮形は`-h`と`-v`だけとし、`-hv`のような結合は受理しない。位置引数とオプション終端は持たないため、単独の`--`も、それ以降の値の有無にかかわらず終了コード`2`で拒否する。

help / versionの先行判定では、argv要素全体が`--help`または`-h`と一致するものだけをhelpとして扱い、`--task=-h`の値部分は走査しない。helpがあれば、重複を含むほかの引数を検証せず終了コード`0`で終了する。helpがなく、同じ規則で`--version`または`-v`が見つかった場合もバージョン表示を優先する。この優先経路に限り、help / version自身を含む重複オプション検証を行わない。

単独`--`は引数終端として機能しないため、先行判定の走査も止めない。したがって`pomotty -- --help`はhelpを表示し、`pomotty -- --version`はversionを表示するが、情報オプションを含まない`pomotty --`と`pomotty -- value`は終了コード`2`となる。

### 入力値の検証

値の受理可否は実装差を生まないよう、正規表現で厳密に定義する。`--task`を除く各オプションは、前後の空白を含めた文字列をそのまま照合し、暗黙のtrimは行わない。`--task`だけは「ユーザー入力の安全な取り扱い」の正規化規則に従い、正規化の一部として前後の空白を除去する。

| 対象                                  | 受理する形式                             | 追加の範囲条件                                                                                   |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `--work` / `--break` / `--long-break` | `/^[1-9][0-9]{0,3}$/`                    | 1〜1440                                                                                          |
| `--cycles`                            | `/^[1-9][0-9]{0,2}$/`                    | 1〜100                                                                                           |
| `--volume`                            | `/^(?:0\|1\|0\.[0-9]{1,6}\|1\.0{1,6})$/` | 0〜1（両端を含む）                                                                               |
| `--sound-work` / `--sound-break`      | 空文字ではない任意の文字列               | 解決後のパスが、存在する読み取り可能な通常ファイルで、拡張子が`.wav`（大文字小文字を区別しない） |
| `--task`                              | 任意の文字列                             | 正規化規則に従って処理する。長さによる拒否は行わない                                             |

上記の正規表現により、先行`+`と`-`、先行ゼロ（`025`）、前後の空白、指数表記（`1e0`）、小数点のみの表記（`.5`、`1.`）、`NaN`、`Infinity`、`0x`表記、全角数字はすべて拒否される。時間系オプションの最小値は`1`なので、先頭桁を`[1-9]`に固定することで`0`と先行ゼロを正規表現の段階で除ける。数値オプションの小数は`--volume`以外では受理しない。`--volume`の小数点以下は6桁までとし、7桁以上は拒否する（音量に必要な精度をはるかに超えるため）。範囲条件は正規表現の照合後に整数値・実数値として判定する。

- 値を必要とするオプションの値不足、未知のオプション、位置引数、単独の`--`と`--`以降の値は拒否する
- 同じオプションの重複は拒否する。`node:util`の`parseArgs`は既定で最後の値を採用するため、該当オプションを`multiple: true`で受け取り、要素数が2以上なら拒否する
- 音源パスは相対・絶対を問わず、常に起動時の`process.cwd()`を基準に`path.resolve()`を通して絶対パスへ正規化し、タイマー開始前に検証する。これにより`-`で始まる値が再生コマンドのオプションとして解釈される余地をなくす
- `--no-sound`指定時も、同時に指定された音源パスと`--volume`は検証する。ただし再生処理は行わない
- `--no-notify`はWindowsでも受理し、何も行わない。移植可能な起動スクリプトを維持するため、エラーにはしない
- 不正入力では、理由と対象オプションを後述の`escapeDiagnostic()`でエスケープしてstderrへ1回出力し、`pomotty --help`を案内して終了コード`2`で終了する

stderrの`error`リスナーは最初の診断書き込みより前に登録する。この登録はraw modeや端末表示の初期化には含めず、エラー時は`stderrUnavailable = true`として以後の診断を省略するだけとする。診断の同期的な書き込み例外または非同期`error`で終了コード`2`を変更してはならない。

```text
エラー: --workには1〜1440の整数を指定してください（入力: "0"）
使い方は`pomotty --help`で確認できます。
```

#### 引数検証の受け入れ条件

- 各数値オプションについて最小値と最大値を受理し、その外側、空文字、小数、`NaN`、`Infinity`を終了コード`2`で拒否する
- `+25`、`025`、`" 25"`、`"25 "`、`1e0`、`.5`、`1.`、`0x19`、全角数字`２５`を終了コード`2`で拒否する
- `--work 0`は正規表現の段階で拒否され、`--work 1440`は受理、`--work 1441`は範囲条件で拒否される
- `--volume`は`0`、`1`、`0.6`、`0.60`、`1.0`を受理し、`1.1`、`-0.1`、`.5`、`0.1234567`を拒否する
- 同じオプションを2回指定した場合は、値が同一でも終了コード`2`で拒否する
- 不正な引数ではraw modeへ入らず、タイマー、音、通知の子プロセスを開始しない
- stdoutが正常なら`--help`と`--version`はTTY / 非TTYのどちらでもANSIエスケープを出さず、終了コード`0`で終了する。stdoutエラー時は前述の例外規則に従う
- 音源パスは別のcwdから起動しても、起動時のcwdを基準に一度だけ解決される
- 絶対パスで指定した音源も`path.resolve()`を通り、`..`を含むパスが正規化される
- `--task=-h`と`--task=--title`はタスク値として受理し、`--task -h`はhelp表示、`--task --title`は終了コード`2`となる
- `--work=-1`は値として解析した後に数値文法違反となり、単独の`--`は終了コード`2`となる
- `-- --help`はhelp、`-- --version`はversionの先行判定となり、`--`だけ、`-- value`、`-- --unknown`は終了コード`2`となる

### ユーザー入力の安全な取り扱い

`--task` の値と `--sound-work` / `--sound-break` のパスは信頼できない入力として扱う。タスク名は表示前に正規化し、音源パスはファイルシステム上の値を保持したまま、コードではなくデータとして子プロセスへ渡す。

- `--task` は引数解析直後に、次の順序でちょうど1回だけ正規化する。順序を入れ替えると結果が変わるため、実装もテストもこの順序に従う
  1. `String.prototype.toWellFormed()`相当で、対応しないUTF-16サロゲートをそれぞれU+FFFDへ置換する。正しいサロゲートペアは変更しない
  2. 除去対象文字を半角空白1個へ置換する
  3. 前後の空白を除去する
  4. Unicode 15.1.0のUAX #29で定義される拡張書記素クラスタ単位で先頭から走査し、採用済みクラスタのUnicodeコードポイント総数が120以下となる最長の接頭辞を採用する。次のクラスタを全体として追加すると120を超える場合、そのクラスタとそれ以降を切り捨てる。クラスタの途中では切断しない
  5. 切り捨て後の末尾に空白が残った場合は、もう一度前後の空白を除去する
- 除去対象は次のとおりとする

| 範囲            | 内容                                 | 理由                     |
| --------------- | ------------------------------------ | ------------------------ |
| U+0000–U+001F   | C0制御文字（ESC、CR、LF、TABを含む） | エスケープシーケンス注入 |
| U+007F–U+009F   | DELとC1制御文字                      | 同上                     |
| U+061C          | ALM                                  | 双方向表示の反転         |
| U+200B          | ZWSP                                 | 不可視の幅ゼロ文字       |
| U+200E / U+200F | LRM / RLM                            | 双方向表示の反転         |
| U+2028–U+202E   | LS、PS、双方向埋め込み・上書き       | 改行と双方向表示の反転   |
| U+2066–U+206F   | 双方向分離子と非推奨の方向書式制御   | 双方向表示の反転         |
| U+FEFF          | ZWNBSP / BOM                         | 不可視の幅ゼロ文字       |

- 書記素分割にはUnicode 15.1.0へ固定したデータを使用し、OS、ロケール、実行時ICUバージョンによって結果を変えない。`Intl.Segmenter`を実行環境のデータのまま使用してはならない
- NFC、NFD、NFKC、NFKDなどのUnicode正規化は行わず、well-formed化、除去対象文字の置換、trim、上限処理以外ではユーザーのコードポイント列を変更しない。U+FFFDは1コードポイント・1セルとして扱う
- U+200C（ZWNJ）とU+200D（ZWJ）は**除去しない**。ペルシア語・インド系文字の正書法と絵文字ZWJシーケンスで正当に使われるため、表示の安全性は§5の表示セル幅計算側で担保する
- 画面表示時はさらに利用可能な表示セル幅に合わせて省略する
- 正規化後に空文字となった場合は、タスク名の指定なしとして扱う
- タスク名を非 TTY ログやエラーメッセージへ出す場合も、同じ正規化済み文字列だけを使用する
- 音源パスを診断メッセージへ出す場合は制御文字をエスケープし、端末へ未加工で出力しない
- 子プロセスは常に§8で検証した絶対パスを`spawn(commandPath, args, { shell: false })`で起動し、ユーザー入力をシェルコマンド文字列へ連結しない
- macOS の AppleScript と Windows の PowerShell は固定スクリプトとし、タイトル、本文、音源パスは `argv` または環境変数で渡す
- Linux の `notify-send`、`paplay`、`aplay` と macOS の `afplay` には、各入力値を独立した引数として渡す
- `notify-send`ではend-of-optionsの`--`をユーザー由来引数の前に置き、`-`で始まるタスク名をオプションとして解釈させない。`osascript`は`--`を引数リストから取り除く保証がないため、§8のとおりスクリプトをstdinから渡す形式を用いる
- 再生コマンドへ渡す音源パスは§2の検証段階で必ず絶対パスへ正規化済みであり、`-`で始まることはない

```ts
const CONTROL_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u2028-\u202e\u2066-\u206f\ufeff]/gu;

const truncateAtGraphemeBoundary = (value: string, limit: number) => {
  let usedCodePoints = 0;
  const accepted: string[] = [];

  for (const grapheme of segmentGraphemesUnicode15_1(value)) {
    const size = Array.from(grapheme).length;
    if (usedCodePoints + size > limit) break;
    accepted.push(grapheme);
    usedCodePoints += size;
  }

  return accepted.join('');
};

const sanitizeTask = (value: string) => {
  const replaced = value.toWellFormed().replace(CONTROL_CHARS, ' ').trim();
  return truncateAtGraphemeBoundary(replaced, 120).trim();
};
```

診断へユーザー由来のargv、パス、またはそれらを含む例外メッセージを埋め込む場合は、次の`escapeDiagnostic()`相当の処理を必ず通す。

1. 入力をUnicodeコードポイント単位で最大160個まで走査し、超過した場合は末尾に`…`を付ける。対応しないサロゲートはUTF-16コード単位1個として扱う
2. `\\`を`\\\\`、`"`を`\\"`へ変換する
3. C0、DEL、C1は大文字2桁の`\\xHH`へ変換する
4. U+061C、U+200B、U+200E–U+200F、U+2028–U+202E、U+2066–U+206F、U+FEFFは大文字の`\\u{HEX}`へ変換する
5. 対応しないサロゲートは大文字4桁の`\\uXXXX`へ変換し、それ以外の文字はそのまま残す
6. 結果全体をASCIIの二重引用符で囲む

エスケープ後の文字列だけをstderrへ出し、元の入力を同じ診断へ重ねて出してはならない。これにより改行、ANSI、双方向制御による診断表示の偽装と、極端に長い入力による無制限出力を防ぐ。

#### セキュリティ受け入れ条件

- ESC、改行、OSC / CSI を含む `--task` を渡しても、画面消去、色変更、任意行の追加が発生しない
- RLO（U+202E）、LRM / RLM（U+200E / U+200F）、ALM（U+061C）、ZWSP（U+200B）、BOM（U+FEFF）を含む `--task` が、正規化後にそれらを含まない
- ZWJ絵文字シーケンスと結合文字列は、120コードポイント上限処理でも表示幅による省略でも、拡張書記素クラスタの途中で切断されない
- 正規化順序は`well-formed化 → 置換 → trim → 書記素境界を守った120コードポイント上限 → trim`で固定する
- 121コードポイント以上の`--task`は拒否せず、120コードポイント以下の最長の完全な書記素クラスタ接頭辞へ切り詰める。ASCII 121文字は120文字になるが、ASCII 119文字の後に120上限を超えるZWJ絵文字が続く場合は、その絵文字全体を採用せず119文字となる
- 改行、ESC、RLO、引用符、対応しないサロゲート、160コードポイントを超える値を診断へ含めても、`escapeDiagnostic()`の規則どおり1行の有限長文字列になる
- タスク名の対応しないサロゲートはU+FFFDへ置換され、書記素分割、120コードポイント上限、表示幅計算が実行環境によらず同じ結果になる
- 引用符、セミコロン、PowerShell 構文を含む音源パスが、コードとして評価されず1個のパス値として処理される
- 引用符やAppleScript構文を含むタスク名が、通知タイトルとして表示されるか安全に失敗し、任意のAppleScriptとして実行されない
- `-h` や `--title` のような、ハイフンで始まるタスク名が通知コマンドのオプションとして解釈されない

---

## 3. 状態機械

```
idle ──起動──> WORK

WORK ──自然終了──> completedInBlock を +1
                    ├── completedInBlock < cycles ──> BREAK
                    └── completedInBlock = cycles ──> LONG_BREAK

WORK ──skip──> BREAK（カウンターは変更しない）
BREAK ──自然終了 / skip──> WORK
LONG_BREAK ──自然終了 / skip──> completedInBlock を 0 にして WORK
```

`cycles`は、長い休憩に入るまでに**自然終了した作業フェーズ数**を表す。起動時の`completedInBlock`は`0`。作業が自然終了した時点で`completedInBlock`と`completedPomodoros`をそれぞれ1増やし、`completedInBlock === cycles`なら`LONG_BREAK`へ、それ以外なら`BREAK`へ遷移する。`LONG_BREAK`中は`completedInBlock === cycles`を維持し、長い休憩の自然終了またはskip時に`0`へ戻してから`WORK`を開始する。

### 遷移時の挙動

| イベント             | カウンター                                   | 音・通知                                                            | 遷移後                                                       |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| WORKの自然終了       | `completedPomodoros`と`completedInBlock`を+1 | 作業終了音。macOS / Linuxでは「お疲れさま。N分休憩」も通知          | `completedInBlock === cycles`ならLONG_BREAK、それ以外はBREAK |
| WORKのskip           | 変更なし                                     | なし                                                                | BREAK                                                        |
| BREAKの自然終了      | 変更なし                                     | 休憩終了音。macOS / Linuxでは「休憩終了。作業に戻りましょう」も通知 | WORK                                                         |
| BREAKのskip          | 変更なし                                     | なし                                                                | WORK                                                         |
| LONG_BREAKの自然終了 | `completedInBlock`を0にする                  | 休憩終了音。macOS / Linuxでは「休憩終了。作業に戻りましょう」も通知 | WORK                                                         |
| LONG_BREAKのskip     | `completedInBlock`を0にする                  | なし                                                                | WORK                                                         |

音と通知は自然終了時だけ発生させ、手動skipでは発生させない。Windowsでは自然終了時の通知手段を音だけとし、手動skipでは音も発生させない。遷移先フェーズは常に実行状態で、所定の時間を全量設定して開始する。

### 保持する状態

| フィールド           | 型                                  | 説明                                                |
| -------------------- | ----------------------------------- | --------------------------------------------------- |
| `phase`              | `'work' \| 'break' \| 'long_break'` | 現在のフェーズ                                      |
| `paused`             | `boolean`                           | 一時停止中か                                        |
| `endsAt`             | `number \| null`                    | 実行中の終了予定時刻（Unix ms）。一時停止中は`null` |
| `remainingMs`        | `number \| null`                    | 一時停止時の残り時間。実行中は`null`                |
| `completedInBlock`   | `number`                            | 現在ブロック内で自然終了した作業数                  |
| `completedPomodoros` | `number`                            | 起動以降に自然終了した作業セット総数                |

引数検証、外部コマンド解決、表示モードの初期化に成功した後、初回表示の直前に`startNow = Date.now()`を1回取得する。初期状態は`phase = 'work'`、`paused = false`、`endsAt = startNow + workDurationMs`、`remainingMs = null`、`completedInBlock = 0`、`completedPomodoros = 0`とする。起動自体では音・通知を発生させず、初回フレームまたは起動ログを1回だけ出力する。

状態は次の不変条件を満たす。

- 実行中は`paused === false`、`endsAt`は有限数、`remainingMs === null`
- 一時停止中は`paused === true`、`endsAt === null`、`remainingMs > 0`
- `completedPomodoros`は0以上の整数で、skipでは増加しない
- `0 <= completedInBlock <= cycles`
- `phase === 'long_break'`なら`completedInBlock === cycles`
- `phase === 'work'`または`phase === 'break'`なら`completedInBlock < cycles`

#### 状態遷移の受け入れ条件

- `cycles = 1`では最初のWORK自然終了後にLONG_BREAKへ入り、その終了またはskip後に`completedInBlock = 0`のWORKを開始する
- WORKを`cycles - 1`回自然終了した状態でWORKをskipしてもLONG_BREAKには入らず、両カウンターも増えない
- WORKのskip後はBREAK、BREAKのskip後はWORKとなり、いずれも遷移先を所定の時間で実行状態として開始する
- LONG_BREAKの自然終了とskipは、どちらも`completedInBlock`を0へ戻す
- 一時停止中にどのフェーズをskipしても一時停止状態を引き継がず、`endsAt = skip検知時刻 + 遷移先フェーズ時間`として再開する
- `transitionFromSkip()`自体は音とデスクトップ通知を発生させない。期限到達済みフェーズを先に自然終了として精算した同一キーイベントでは、その自然終了に由来する音・通知要求だけは発生する
- `now === endsAt`では自然終了を手動操作より優先する。期限到達済みWORKに対するspace、skip、quitのいずれでも、WORK完了カウンターが1増え、自然終了の音・通知要求が1回だけ発生する
- `now < endsAt`であれば手動操作を現在フェーズへ適用し、WORKのskipではカウンターを増やさない
- tickとキーイベントの配送順を入れ替えても、期限到達フェーズの完了判定、カウンター、手動操作適用後のフェーズが一致する

---

## 4. タイマー実装

`setInterval` でカウンタをデクリメントする方式は採用しない。スリープ復帰やイベントループ遅延でズレるため、**終了予定時刻を絶対値で保持し、毎フレーム現在時刻と比較する**。`setInterval` は更新のきっかけとしてのみ使用し、経過時間の情報源にはしない。

```ts
let transitioning = false;

const settleExpiredPhase = (now: number): boolean => {
  if (
    shuttingDown ||
    transitioning ||
    state.paused ||
    state.endsAt === null ||
    now < state.endsAt
  ) {
    return false;
  }

  transitionFromTimeout(now);
  return true;
};

const tickTimer = setInterval(() => {
  if (state.paused || state.endsAt === null) return;

  const now = Date.now();
  if (settleExpiredPhase(now)) return;

  render(Math.max(0, state.endsAt - now));
}, 250);
```

更新間隔は**250ms**とする。イベントループが継続して実行可能な通常時のポーリング量子を細かくするためであり、OSスケジューリングや同期処理による遅延上限は保証しない。絶対期限との比較により、遅延が250msを超えても経過時間自体に累積誤差は生じない。

`render()`は実行中の各tickから呼び出すが、内部で§5の規則によりANSI装飾前の論理フレームを比較し、変化がなければstdoutへ1バイトも書かない。tickの呼び出し頻度と実際の描画頻度は別物である。

### `transitioning` ガード

`transitioning` は遷移処理の再入だけを防ぐためのフラグで、次の規則で操作する。

- `transitionFromTimeout()`と`transitionFromSkip()`は先頭で`shuttingDown || transitioning`なら何もせず`false`を返し、それ以外では同期的に`transitioning = true`として処理を始める
- 状態（`phase`、`paused`、`endsAt`、`remainingMs`、各カウンター）の更新が完了した時点で、**同期的に `false`** に戻す
- 音と通知の発火は状態更新の後に行うが、その**完了は待たない**。子プロセスの結果に関わらず `transitioning` はすでに `false` に戻っている
- 遷移処理内で例外が発生した場合も `finally` で必ず `false` に戻す。戻し忘れると以降のすべての遷移が停止するため、この経路はテストで固定する

つまり `transitioning` が `true` である区間は同期処理1回分だけであり、非同期の待ちを跨がない。

### 終了予定時刻を過ぎた場合

OS のスリープ、休止状態、プロセスの一時停止、イベントループ遅延などにより `Date.now() >= endsAt` となった場合は、次の規則で処理する。

1. 現在フェーズを**1回だけ**完了させる
2. 現在フェーズが作業なら、完了ポモドーロ数とサイクル進捗を通常の時間経過による終了と同様に更新する
3. 次フェーズを決定し、その`endsAt`を`settleExpiredPhase()`へ渡された`now + 次フェーズの所要時間`に設定する。遷移処理内で`Date.now()`を再取得しない
4. 状態と `endsAt` の更新後、完了したフェーズに対応する音と通知を1回だけ発生させる
5. スリープ中に経過した可能性がある複数フェーズは復元せず、catch-up遷移は行わない

遅延時間に対する閾値は設けない。通常の250ms以内の遅延も長時間のスリープも、同じ `Date.now() >= endsAt` の条件で扱う。`transitioning` ガードを用い、同じフェーズに対するカウンター更新、音、通知の多重実行を防ぐ。

`settleExpiredPhase(now)`は期限到達を確定する唯一の入口とし、tickと手動キー操作の双方がこの関数を使用する。`transitionFromTimeout()`をほかの場所から直接呼び出してはならない。

space、`s`、`q`、raw mode中の`Ctrl+C`を処理するときは、後述の再入ガードを通過したキーイベントごとに`now = Date.now()`を1回だけ取得し、`settleExpiredPhase(now)`を呼んだ後で手動操作を処理する。期限精算によってフェーズが自然終了した場合、**同じキー操作を遷移後の新しいフェーズへ適用する**。例えば期限到達済みのWORKで`s`を受けた場合は、まずWORKを自然終了としてカウンターへ加算してBREAKを開始し、その後同じ`s`でBREAKをskipしてWORKへ進む。`q`またはraw mode中の`Ctrl+C`では、WORK完了を反映してからshutdownとサマリ生成を行う。

`handleManualAction()`の先頭では`shuttingDown === true`または`transitioning === true`ならイベント全体を破棄する。その後にだけ`now`を取得して期限精算と操作を行う。`settleExpiredPhase()`が`false`を返したことだけを、常に手動操作を続行してよい根拠にはしない。

OSから直接配送された終了シグナル、stdoutのEPIPE、stdinのerror、内部エラーは期限精算を行わず、§7の終了処理を直ちに開始する。これらは手動キーイベントではない。

例えば10:00に25分の作業を開始し、10:10から11:00までスリープした場合、復帰した11:00に作業を1回完了として処理し、11:00から所定時間の休憩を開始する。10:25以降に相当する休憩・作業フェーズを遡って生成しない。

バージョン1ではシステムの壁時計を正とする。実行中にシステム時計が未来へ変更されて `endsAt` を超えた場合も同じ規則で完了させ、過去へ変更された場合は表示上の残り時間が増えることを許容する。時計変更の検知・補正はスコープ外とする。

### 一時停止・再開・skip

一時停止・再開・skipは、前述の共通期限精算を済ませた後の現在状態へ適用する。一時停止時は`remainingMs = endsAt - now`を保存し、`endsAt = null`、`paused = true`とする。共通期限精算後なので、この時点の`remainingMs`は必ず正数である。期限到達と同時にspaceを受けた場合は、元フェーズを自然終了させた後、遷移先フェーズを全量の残り時間で一時停止する。

再開時は同じキーイベントで取得した`now`を使い、`endsAt = now + remainingMs`で終了予定時刻を復元した後、`remainingMs = null`、`paused = false`とする。一時停止中はタイマーの時間が経過しない。

skipは自然終了とは別の`transitionFromSkip(now)`として処理する。現在の`paused`、`endsAt`、`remainingMs`を破棄し、状態機械のskip規則に従って遷移先を決定する。遷移先は`paused = false`、`remainingMs = null`、`endsAt = now + 遷移先フェーズ時間`として開始する。カウンター更新、音、通知は「遷移時の挙動」表に従う。

---

## 5. 画面表示

### 表示モード

起動時に次の条件で表示モードを1回決定する。

```ts
const interactive =
  process.stdin.isTTY === true && process.stdout.isTTY === true && process.env.TERM !== 'dumb';
```

- `interactive === true`: インライン描画とraw modeによるキー操作を有効にする
- `interactive === false`: 行単位ログモードとし、ANSI、色、カーソル操作、raw mode、キー操作をすべて無効にする
- `NO_COLOR`環境変数が存在し、かつ値が空文字ではない場合は色だけを無効にする（[no-color.org](https://no-color.org/)の規定に合わせる）。TTYのインライン描画とキー操作は維持する。`NO_COLOR=`（空文字）は未設定と同じ扱いとする

バージョン1のユーザー向けメッセージは日本語に統一する。状態識別子の`WORK`、`BREAK`、`LONG_BREAK`、`PAUSED`はログ解析と視認性のため英語の固定文字列とし、ローカライズ対象外とする。

### 時間の表示形式

残り時間は次の規則で整形する。`--work`などは最大1440分を許可するため、60分以上を`MM:SS`で表すと桁があふれてレイアウト計算が破綻する。

描画に使う残量を状態フィールド`remainingMs`と区別して`visibleRemainingMs`と呼ぶ。実行中は`Math.max(0, state.endsAt - now)`、一時停止中は非nullの`state.remainingMs`を使う。描画関数へはこの有限な0以上の値を渡し、実行中にnullである状態フィールドを時間書式や進捗式へ直接渡してはならない。

まず**表示秒**を`displaySeconds = Math.ceil(visibleRemainingMs / 1000)`で求め、形式の判定も整形も残りミリ秒ではなく`displaySeconds`に対して行う。判定と表示で異なる量を使うと、`3599.5`秒のときに「1時間未満」と判定されながら`60:00`と表示される矛盾が生じる。

| `displaySeconds` | 形式                                        | 例                               |
| ---------------- | ------------------------------------------- | -------------------------------- |
| 3599以下         | `M:SS`（分は0埋めしない、秒は必ず2桁）      | `5:00`、`14:30`、`0:07`、`59:59` |
| 3600以上         | `H:MM:SS`（時は0埋めしない、分秒は必ず2桁） | `1:00:00`、`24:00:00`            |

- 残り1msでも`displaySeconds`は`1`となり`0:01`と表示する。`0:00`は`visibleRemainingMs === 0`のときだけ現れる
- 形式は動的に決まる。90分の作業は`1:30:00`で始まり、`displaySeconds`が3599へ落ちた時点で`59:59`へ切り替わる
- 形式の切り替えで行幅が変わるため、レイアウト判定と省略処理は毎フレームの整形後の文字列に対して行う

### レイアウト

標準レイアウト（60列以上）の例：

```
  🍅 WORK  ●●○○   仕様書レビュー

     14:30

  ████████████░░░░░░░░░░░░░░░░  42%

  [space] pause   [s] skip   [q] quit
```

- 色が有効な場合、WORKのアクセントはSGR 31（赤）、BREAK / LONG_BREAKはSGR 32（緑）とする。着色対象は`🍅`、`${phaseStatus}`、バーの`█`部分だけで、各対象の直後にSGR 39で前景色を既定値へ戻す。太字など他のSGR属性は付けない。`PAUSED`は元フェーズの色を継承する。`NO_COLOR`有効時はSGR列を一切生成しない
- プログレスバーとパーセントはフェーズの**経過率**を表す。`floor((durationMs - visibleRemainingMs) / durationMs * 100)`を0〜100に丸める
- サイクル進捗の表記は**レイアウトごとに固定**する
  - 標準レイアウトのみ、`cycles <= 12`なら`●○`で`completedInBlock / cycles`を表示する。`●`は自然終了したWORK数、`○`は残り数とする
  - 標準レイアウトでも`cycles > 12`なら幅の増大を避けるため`2/20`の数値形式を使用する
  - コンパクトレイアウトと最小レイアウトは、`cycles`の値にかかわらず**常に数値形式**を使用する
- LONG_BREAK中は進捗が満了状態となり、その終了またはskip後のWORKでは0へ戻る
- タスク名は`--task`指定時のみ表示し、利用可能な表示セル幅に合わせて末尾を`…`で省略する
- 一時停止中の`PAUSED`表示はレイアウトごとに次のとおりとする
  - 標準: ヘッダのフェーズ名の直後に`PAUSED`を置く（`🍅 WORK PAUSED  ●●○○ …`）
  - コンパクト: フェーズ名の直後に`PAUSED`を置く（行全体は`WORK PAUSED 2/4`）
  - 最小: フェーズ名を`PAUSED`へ置き換え、`PAUSED 14:30 2/4`とする。フェーズ名と一時停止の両方を表示する幅がないため、一時停止を優先する

端末幅に応じて次のレイアウトへ切り替える。

| 利用可能列数 | レイアウト                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| 60以上       | 標準。ヘッダ、時刻、バー、キーガイド、タスク名                                 |
| 30〜59       | コンパクト。`WORK 2/4`、時刻、パーセント、短縮キーガイド。バーとタスク名は省略 |
| 29以下       | 最小。`WORK 14:30 2/4`の1行だけ。収まらない場合は右端を省略                    |

ANSI装飾を付ける前の論理フレームは、次のテンプレートで構築する。`${phaseStatus}`は通常時の`WORK` / `BREAK` / `LONG_BREAK`である。一時停止中は標準・コンパクトで`${phase} PAUSED`、最小で`PAUSED`とする。`${cycle}`はそのレイアウトの規則で整形したサイクル進捗、`${taskPart}`はタスクがある場合だけ`   ${task}`、`${pauseAction}`は実行中なら`pause`、一時停止中なら`resume`である。

```text
標準:
  🍅 ${phaseStatus}  ${cycle}${taskPart}

     ${time}

  ${bar30}  ${percent}%

  [space] ${pauseAction}   [s] skip   [q] quit

コンパクト:
${phaseStatus} ${cycle}
${time}  ${percent}%
[sp]${pauseAction} [s]skip [q]quit

最小:
${phaseStatus} ${time} ${cycle}
```

標準の`${bar30}`は常に30セルで、左から`floor(percent * 30 / 100)`セルを`█`、残りを`░`とする。標準ヘッダのタスクだけを先に省略し、それでも固定UIが幅上限を超える異常に狭い状況では行全体へ同じ省略処理を適用する。コンパクトと最小の各行も必ず幅上限を通す。

設定可能な最大フェーズ時間24時間と最大サイクル数100だけを考えた最小レイアウトの最長ケースは、実行中の`LONG_BREAK 24:00:00 100/100`（27セル）である。`columns = 28`では上限`Math.max(1, columns - 1) = 27`セルへちょうど収まり、`columns = 27`以下では後述の書記素単位省略を適用する。

システム時計を過去へ変更した場合は残り時間の時部分が任意の桁数まで増え得るため、有限の「絶対的な最長ケース」は存在しない。すべての最小レイアウト行に対して毎回セル幅上限を適用し、コードポイント単位で直接削除しない。

利用可能列数は`Math.max(1, process.stdout.columns || 80)`で求め、TTYが列数を提供しない場合は80列とする。

#### Unicode書記素と表示セル幅

書記素分割、East Asian Width、絵文字プロパティにはUnicode 15.1.0の固定データを使用する。実行時のICU、OS、ロケール、端末の言語設定には依存させない。実装は固定データを同梱するか、同等の固定テーブルをバンドルへ含める。

表示文字列はUnicode 15.1.0の拡張書記素クラスタへ分割し、クラスタごとに次の優先順で幅を決定する。

1. アプリが生成したANSI制御列は0セルとする。ANSI列をUnicode文字列の一部として幅計算しない
2. Grapheme_Extend、ZWJ、Variation Selector、その他のDefault_Ignorable_Code_Pointだけからなり、独立した表示基底を持たないクラスタは0セルとする
3. Unicode 15.1の標準化されたtext variation sequenceとしてVS15を含むクラスタは、表示基底のEast_Asian_WidthやEmoji_Presentationにかかわらず1セルとする
4. Unicode Emoji 15.1のRGI絵文字シーケンス、Emoji_Presentation文字、VS16による絵文字表示、keycapシーケンスを含むクラスタは2セルとする
5. それ以外で、表示基底にEast_Asian_Widthが`W`または`F`のコードポイントを含むクラスタは2セルとする
6. 残りの表示可能なクラスタは1セルとする。East_Asian_Widthが`A`の文字はロケールにかかわらず1セルとする

結合文字、ZWJ、Variation Selectorは基底クラスタへセルを加算しない。文字列全体の幅は各クラスタ幅の合計とする。固定UI、タスク名、省略記号、最小レイアウトの全行で同じ関数を使う。少なくとも`A = 1`、`界 = 2`、`e`+結合アキュート = 1、`👨‍👩‍👧 = 2`、`☀︎ = 1`（VS15）、`☀️ = 2`（VS16）、`… = 1`、単独の結合文字 = 0を固定テストとする。

幅上限を超える文字列は、完全な書記素クラスタからなる最長の接頭辞と`…`で省略する。`…`の1セルを先に予約し、接頭辞の幅を`上限 - 1`以下にする。上限が1セルなら`…`だけを出力する。書記素クラスタ、ZWJシーケンス、結合文字列、ANSI制御列の途中では切断しない。

固定UIとタスク名はこの規範による端末表示セル数で計算し、各物理行を`Math.max(1, columns - 1)`セル以内に収める。端末の自動折り返しに依存しない。

### 描画方式

代替画面バッファは使用せず、`node:readline`の`moveCursor`、`cursorTo`、`clearLine`を利用したインライン描画とする。画面末尾全体を消す`\x1b[0J`は使用しない。

描画フレームは改行を含まない文字列の配列`frameLines`として構築し、配列の1要素を端末の1物理行とする。空文字列も空の物理行1行として数える。各要素はセル幅制限を適用済みとし、描画時は各行の末尾にちょうど1個の改行を出力する。**最終行にも改行を出力し、描画完了時のカーソルをフレーム直後の行の列0へ固定する**。

- 初回描画では上方向へカーソルを移動せず、フレームをそのまま出力する
- `renderedRows`は直前に描画した`frameLines.length`とする
- 2回目以降は直前フレームの先頭行へ戻り、旧フレームの全物理行を`clearLine(..., 0)`で個別に消してから新フレームを描く
- 新フレームの行数が減った場合も余った旧行は前項ですべて消えており、新フレーム描画後のカーソルは新フレーム直後の行の列0に置く
- 通常時の`renderedRows`は端末による折り返しを含まない。折り返し自体を前述のセル幅制限で防止する
- 終了時は同じ行単位処理で現在フレームだけを消し、元のシェル出力や画面下部を消さない

カーソルの制御は次のとおりとする。

- インタラクティブ端末へ変更を加えたかを`terminalTouched`で記録する。raw modeを有効化する直前に同期的終了保険を登録し、`setRawMode(true)`が例外なく戻った時点、またはカーソル非表示を試みる直前に`terminalTouched = true`とする
- `interactive === true`のときだけ、初回描画の直前に`terminalTouched = true`と`cursorHidden = true`を同期的に設定してから、1回`\x1b[?25l`を書き込む。`write()`のboolean戻り値は成功可否ではなくbackpressureを表すため成否判定へ使わない。同期throwまたは後発のstdoutエラーが起きても、余分なカーソル表示は無害なので復元要否フラグを維持する
- `rawModeEnabledByApp`と`cursorHidden`は、アプリが現在復元すべき状態を個別に表す。通常cleanupと`restoreTerminalSync`はフラグが立っている操作だけをbest effortで戻し、対応する復元操作が同期throwせず完了した場合だけそのフラグを解除する。throwした場合はフラグを残し、終了時保険による再試行を許す
- `restoreTerminalSync`は`terminalTouched === true`の場合だけ動作する。フレーム消去、サマリ、子プロセス操作は行わず、raw modeとカーソルだけを同期的に復元する。実環境でカーソルを戻すときは`fs.writeSync(process.stdout.fd, '\x1b[?25h')`、単体テストでは注入した同期writerを使い、`process.stdout.write()`、callback、Promiseへ依存しない。`stdoutUnavailable`でも`cursorHidden === true`なら同期復元をbest effortで試し、非TTYでは同期writer自体を呼ばない
- `process.on('exit', restoreTerminalSync)`はインタラクティブ初期化時に1回だけ登録する。通常cleanup後に再実行されても副作用がないよう冪等にする
- 行単位ログモードでは`terminalTouched`が立たないため、通常cleanupと同期保険のどちらもANSIエスケープを一切出力しない

250msごとに終了判定を行うが、各描画要求ではまずANSI装飾前の`frameLines`と色状態を構築し、直前の配列長・各行内容・色状態と完全一致した場合だけstdout書き込みを省略する。この比較には表示秒、percent、バー充填数、phase、pause状態、サイクル進捗、タスク、端末幅による省略結果がすべて反映される。一時停止・再開・skip・フェーズ遷移時は即座に再描画する。

### ターミナル幅の変更

`process.stdout.on('resize', handler)`を監視し、`process.stdout.columns`からレイアウトと各行の省略幅を再計算して即座に再描画する。既に出力した行を縮小時に再折り返しするかどうかは端末依存であり、旧フレームの物理行数を安全に検知できない。このためresize時だけは上方向へ移動して旧フレームを消去せず、現在行を`cursorTo(0)`で列0へ合わせ、`renderedRows = 0`として新フレームを初回描画と同じ方法で追記する。旧フレームはスクロールバックへ残す。この安全上の例外により既存のシェル出力を誤って消去しない。以後の通常tickでは新フレームだけを追跡・消去する。標準レイアウトのバーは規範どおり30セル固定であり、resizeでバー自体のセル数は変えない。`SIGWINCH`を直接監視しない。cleanup時に`resize`リスナーを解除する。

### 行単位ログモード

`interactive === false`の場合は、起動時とフェーズ遷移時にだけstdoutへ1行出力する。

```text
[10:00:00] WORK 開始 (25:00)
[10:25:00] WORK 完了 → BREAK 開始 (5:00)
[10:30:00] BREAK 完了 → WORK 開始 (25:00)
```

- タイムスタンプは実行環境のローカル時刻による`HH:mm:ss`
- 括弧内のフェーズ時間は「時間の表示形式」と同じ整形関数を使う。90分の作業なら`(1:30:00)`となる
- 正規化済みタスク名がある場合は、すべての行の末尾へ` task=${JSON.stringify(task)}`を付ける。タスク名がなければsuffixも余分な空白も付けない。例: `[10:00:00] WORK 開始 (25:00) task="仕様書レビュー"`
- 通常ログはstdout、診断とエラーはstderrへ出力する
- ANSI、色、カーソル制御、ターミナルベルは出力しない
- stdinキー操作は提供せず、終了はOSシグナルによって行う
- インタラクティブモードでは`q`、raw mode中の`Ctrl+C`、またはOSシグナルで終了する。行単位ログモードではstdinを監視せず、`q`や`\x03`を含む入力バイトを終了操作として扱わない。OSシグナルまたは出力エラーが発生しない限り、WORKと休憩を無期限に繰り返す。`cycles`は総実行回数ではなく、LONG_BREAKまでの間隔である
- stdoutで`EPIPE`が発生した場合は出力先が閉じられたものとして、サマリを出力せず終了コード`0`でcleanupする。その他のstdoutエラーは終了コード`1`とする

インライン描画を採用する目的は、現在のターミナル文脈を保ったまま動作させ、終了時に最終サマリだけを通常のスクロールバックへ残すことである。各ポモドーロの履歴や「今日の完了数」は保存しない。履歴保存は将来の作業ログ機能の責務とする。

---

## 6. キー入力

キー入力は`interactive === true`の場合だけ有効にする。チャンク境界を跨いでCSI、SS3、Metaキーなどを復号できるインクリメンタルな`keyDecoder`を使い、rawバイトを文字単位で走査してはならない。`node:readline`のkeypress復号を内部部品として利用してよいが、stdinへ直接`emitKeypressEvents(process.stdin)`を接続するだけの実装は、後述の64バイト上限、500ms timeout、disposeを保証できないため不可とする。ラッパーまたは専用復号器がこれらを一元管理する。

引数検証後の初期化順序は次で固定する。

1. stdinへ接続していない復号器を構築し、`stdinWasRaw = process.stdin.isRaw === true`と`stdinWasFlowing = process.stdin.readableFlowing === true`を記録する
2. §5の同期的終了保険を登録する
3. `stdinWasRaw === false`の場合だけ`process.stdin.setRawMode(true)`を呼び、同期例外なく戻った直後に`rawModeEnabledByApp = true`と`terminalTouched = true`を設定する。既にraw modeならアプリが解除すべき状態ではない
4. 同じ同期ターン内で復号器をstdinへ接続し、`keypress`ハンドラを登録する。raw mode有効化と接続の間に`await`やtimerを挟まない
5. stdinがまだflowingでなければ`process.stdin.resume()`を呼ぶ。復号器の接続または明示的`resume()`によって、`stdinWasFlowing === false`からflowingへ変えた場合にだけ`stdinResumedByApp = true`とする

`keyDecoder`は内部で`data`リスナーを追加してstdinをflowingへ変える可能性があるため、これをraw modeより前に**接続**してはならず、その変化も`stdinResumedByApp`の判定へ含める。cleanupでは`keypress`ハンドラと復号器が追加した全リスナーを`keyDecoder.dispose()`で解除し、`stdinResumedByApp === true`の場合だけ`pause()`する。途中で初期化に失敗した場合も、既に変更した端末状態を復元して終了コード`1`とする。

| キー      | 動作                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| `space`   | 一時停止 / 再開                                                                                  |
| `s` / `S` | §4の期限精算後の現フェーズをskipして次へ。skip自体は作業完了数に加算せず、音・通知も発生させない |
| `q` / `Q` | 終了                                                                                             |
| `Ctrl+C`  | 終了                                                                                             |

操作判定には復号済みキーイベントの`name`、`ctrl`、`meta`、`shift`だけを使用する。raw文字列や`sequence`の末尾に`s`または`q`が含まれるかを検索してはならない。

- `key.name`が`s`または`q`で、`ctrl !== true`かつ`meta !== true`の場合だけ通常キーとして受理する。`shift`は無視するため、ShiftまたはCapsLockによる`S`と`Q`も受理する
- spaceも`ctrl !== true`かつ`meta !== true`の単独キーイベントだけを受理する
- `Ctrl+C`は`key.name === 'c'`、`ctrl === true`、`meta !== true`の場合だけ終了操作として受理する
- `Ctrl+S`、`Alt+q`、ファンクションキー、矢印キー、マウスレポート、その他の未定義イベントは無視する

`s`は実行中・一時停止中のどちらでも受け付ける。一時停止中にskipした場合も、遷移先フェーズは一時停止を引き継がず、所定の時間で実行状態として開始する。

キーリピート抑止、デバウンス、入力チャンク単位の重複除去は行わない。復号器が生成したキーイベントを1件ずつ到着順に処理し、各イベントへ1回だけ対応する操作を適用する。同じ入力チャンクから`s`イベントが2件復号された場合は、2回のskipとして扱う。最初の遷移後に同じチャンクの残りを破棄してはならない。

`shuttingDown === true`になった後のキーイベントだけはすべて無視する。したがって`s`、`q`の順ならskip後に終了し、`q`、`s`の順なら終了開始後の`s`を無視する。`transitioning`は同期的な状態更新の再入防止だけに使用し、キーリピート抑止には使用しない。

復号器はエスケープシーケンスが複数の入力チャンクへ分割されても、完全なキーイベントへ復号するまで操作を発火しない。例えばF4のSS3シーケンス`ESC O S`は末尾の`S`をskipとして扱わず、`Alt+q`の`ESC q`はquitとして扱わない。

ESC開始シーケンスの保留上限は64バイト、保留時間は500msとする。完全なキーイベントになる前に上限またはtimeoutへ達した場合は、保留中シーケンス全体を未定義入力として破棄し、その内部バイトを通常キーとして再解釈しない。stdinの`end`でも未完シーケンスを破棄する。UTF-8のチャンク分割には`StringDecoder('utf8')`相当を使い、複数チャンクに分かれた1文字を個別キーとして扱わない。保留timerはshutdownで解除する。

raw modeではCtrl+CがSIGINTとして配送されずキーイベントになるため、復号済みイベントとして自前で処理する。

```ts
keyDecoder.on('keypress', (_text, key) => {
  if (shuttingDown || key === undefined) return;

  if (key.ctrl === true && key.meta !== true && key.name === 'c') {
    handleManualAction('ctrl-c');
    return;
  }

  if (key.ctrl === true || key.meta === true) return;

  if (key.name === 'space') handleManualAction('toggle-pause');
  else if (key.name === 's') handleManualAction('skip');
  else if (key.name === 'q') handleManualAction('quit');
});
```

`handleManualAction()`は各イベントにつき`Date.now()`を1回だけ取得し、§4の`settleExpiredPhase(now)`を呼んでから操作を適用する。stdinの`error`は期限精算をせず`requestShutdown('stdin-error', 1, false)`へ集約する。

raw modeに起因する次の入力も明示的に規定する。

| 入力               | raw modeでの挙動                                      | 本アプリの扱い                               |
| ------------------ | ----------------------------------------------------- | -------------------------------------------- |
| `Ctrl+D`（`\x04`） | EOFにならず生バイトとして届く                         | 未定義キーとして無視する。終了はしない       |
| `Ctrl+Z`（`\x1a`） | ISIGが無効なためSIGTSTPは発生せず、生バイトとして届く | 未定義キーとして無視する。サスペンドはしない |
| `Ctrl+\`（`\x1c`） | 同様にSIGQUITは発生しない                             | 未定義キーとして無視する                     |

stdinの`end`イベントは`interactive === true`では通常発生しないが、発生した場合は期限精算をせず`requestShutdown('stdin-end', 0, true)`へ集約する。行単位ログモードではstdinへリスナーを登録しない。

---

## 7. 終了処理

カーソルを隠したまま、あるいはraw modeのまま終了するとターミナルの表示や入力が乱れるため、**捕捉可能な全終了経路**を単一の`requestShutdown()`へ集約する。`SIGKILL`、`SIGSTOP`、OSや端末自体の強制終了は捕捉できないため、復元を保証しない。

`requestShutdown(reason, exitCode, showSummary, diagnostic?)`は`async`関数にせず、最初の呼び出しで`shutdownPromise`を作成してcleanup開始前に保存する。最初の呼び出しだけがshutdownを開始し、2回目以降は参照同一性まで同じ`shutdownPromise`を返す。終了理由、終了コード、サマリ有無、任意の異常診断は最初の呼び出しで固定し、後発エラーで変更しない。Promiseはrejectせず、後述の手順1〜11の同期処理と段階timerの登録が完了した時点でresolveする。子の`close`、1500ms後の切り離し、親プロセス終了は待たない。

本仕様では、終了不能なOS子プロセスを完全に回収することより、**親プロセスをshutdown開始から2秒で終了させることを優先する**。通常はイベントループの自然終了を利用するが、2秒の期限に達した場合だけ`process.exit(exitCode)`を最終手段として使用する。この場合はstdout / stderrの最終書き込みが途中で切れる可能性を許容する。OSまたは同期処理がイベントループ自体を停止させた時間は、JavaScriptから上限を保証できない。

shutdownは次の順序で開始する。

1. `shuttingDown = true`を同期的に設定し、注入可能な単調時計`clock.monotonicNow()`を1回呼んで`shutdownStartedAt`を保存し、終了コードと`shutdownDeadline = shutdownStartedAt + 2000`を固定する
2. `shutdownDeadline`までの残り時間で強制終了timerを登録する。このtimerは`unref()`し、期限時に`restoreTerminalSync()`を実行してから`process.exit(exitCode)`を呼ぶ
3. 実行中の音・通知操作すべてについて冪等な`operation.cancel()`を呼ぶ。以後、再生候補、通知、ベルを新規に開始してはならない
4. tick、再生・通知timeout、resize debounceなど通常動作用timerを解除する。shutdown自身が使う強制終了timerと子プロセス終了timerは解除しない
5. stdinの`keypress` / `end` / `error`とキー復号器が追加した内部リスナー、stdoutの`resize`、その他の通常動作用リスナーを解除する。通常時のstdout / stderr `error`リスナーを外す前に、後述のshutdown専用リスナーを登録する
6. インラインフレームをbest effortで消去し、raw modeとカーソルを直ちに復元する。子プロセスの終了待ちより端末復元を優先する
7. `showSummary === true`かつstdoutが利用可能なら、サマリを1回だけ書く。`drain`は待たない
8. `diagnostic`があれば、§2の`escapeDiagnostic()`を適用した1行をstderrへbest effortで1回だけ書く。`drain`は待たない
9. アプリが`stdin.resume()`した場合だけ`process.stdin.pause()`し、`stdinResumedByApp = false`とする
10. `process.exitCode = exitCode`を設定する
11. shutdown開始時点で追跡中の子プロセスへ終了要求を送り、後述の段階的終了処理を開始する

cleanupの各同期操作は個別に`try/catch`し、一部の復元失敗で残りのcleanupを中断してはならない。

500ms、1500ms、2000msの各段階timerは、登録時点から固定時間だけ待つのではなく、`delay = Math.max(0, shutdownStartedAt + offset - clock.monotonicNow())`で残り時間を求めて登録する。cleanup自体に時間がかかっても「shutdown開始から」の上限を後ろへずらしてはならない。

### shutdown中の出力エラー

shutdown開始時は、通常動作中のstdout `error`リスナーを外す**前**にshutdown専用リスナーを登録する。このリスナーは`requestShutdown()`を再度呼ばず、`stdoutUnavailable = true`を設定するだけとする。

すべてのstdout書き込みは同期throwも`try/catch`して、`error`イベントと同じ`handleStdoutFailure(error)`へ渡す。shutdown開始前は、`error.code === 'EPIPE'`ならサマリなし・終了コード`0`、その他ならサマリなし・終了コード`1`で`requestShutdown()`を呼ぶ。shutdown開始後にフレーム消去、カーソル復元、サマリ書き込みから同期throwまたは`error`が発生しても、最初に決定した終了コードを変更せず、`stdoutUnavailable = true`として以降のstdout書き込みを省略する。

`stream.write()`に起因する`error`イベントは同期的`try/catch`では捕捉できないため、最終書き込み後もshutdown専用リスナーをプロセス終了まで維持する。2秒の期限を守るため、stdoutの`drain`や書き込みcallbackは待たない。

stderrには通常動作中から`error`リスナーを置き、エラー時は`stderrUnavailable = true`として以後のベルと診断を省略する。stderrはタイマーの通常ログ先ではないため、このエラーだけではshutdownや終了コード変更を行わない。引数エラーの診断書き込みで同期例外またはstderrエラーが発生した場合も、既定の終了コード`2`を維持する。

stderrにもfatal診断を書き込む前からshutdown専用`error`リスナーを登録し、`stderrUnavailable = true`を設定するだけとする。同期的なstderr書き込み例外も同じフラグへ集約し、`requestShutdown()`を再帰的に呼ばない。以後の診断書き込みは省略し、リスナーはプロセス終了まで維持する。

### 子プロセスの終了と親プロセスの上限

shutdown開始時に、全再生・通知操作を先にキャンセルしてから`activeChildren`を処理する。

1. shutdown開始直後、まだ`close`していない全子へ`kill()`を1回送る
2. 500ms後、まだ`close`していない子へ`kill('SIGKILL')`を1回送る
3. shutdown開始から1500ms後も`close`していない子は、親側のstdin / stdout / stderr pipeをdestroyし、`child.unref()`してイベントループから切り離す
4. shutdown開始から2000ms後も親が生存していれば、強制終了timerが`process.exit(exitCode)`を呼ぶ

各段階のtimerは前述の絶対offsetに対して登録し、`unref()`する。全子が早期に`close`した場合は500ms / 1500msのtimerを解除し、自然終了を妨げない。`activeChildren`からの削除は`close`受信時だけ行い、`kill()`または`unref()`しただけでは終了済みとして記録しない。

POSIXの`kill()`は対象プロセスへsignalを送るだけで子孫プロセスまでは終了しない。Windowsの`child.kill()`も`taskkill /T`相当のプロセスツリー終了ではない。OSまたは対象プロセスが終了要求を受け付けない場合、2秒後も子プロセスがOS上に残る可能性を明示的に許容する。その場合でも、イベントループが応答する限り親プロセスは期限時に終了する。

| 終了経路                                   | 終了コード | サマリ                                           |
| ------------------------------------------ | ---------: | ------------------------------------------------ |
| `q`                                        |          0 | 出力する                                         |
| raw mode中のCtrl+C / `SIGINT`              |        130 | 出力する                                         |
| `SIGTERM`（対応OSのみ）                    |        143 | 出力する                                         |
| `SIGHUP`（対応OSのみ）                     |        129 | stdoutが利用可能なら出力する                     |
| `SIGQUIT`（POSIXのみ）                     |        131 | stdoutが利用可能なら出力する                     |
| `SIGBREAK`（Windowsのみ）                  |        149 | stdoutが利用可能なら出力する                     |
| stdinの`end`                               |          0 | 出力する                                         |
| stdoutの`EPIPE`                            |          0 | 出力しない                                       |
| その他のstdin / stdoutエラー               |          1 | 出力しない                                       |
| `uncaughtException` / `unhandledRejection` |          1 | サマリは出力せず、端末復元後に診断をstderrへ出す |
| 引数エラー                                 |          2 | ターミナル初期化前なので出力しない               |
| `--help` / `--version`                     |          0 | 出力しない                                       |

シグナルハンドラは、そのOSでNode.jsがイベント名をサポートする場合だけ登録し、未対応シグナルの登録で起動を失敗させない。POSIXでは`SIGINT`、`SIGTERM`、`SIGHUP`、`SIGQUIT`、Windowsでは`SIGINT`、`SIGHUP`、`SIGBREAK`を対象とする。raw mode中に押された`Ctrl+\`は§6のとおりキーイベントとして無視し、OSから配送された`SIGQUIT`だけを終了理由として扱う。Windowsのシグナル配送は端末ホストに依存するため、ハンドラ呼び出し自体は注入テストし、実機スモークでは配送された経路だけを確認する。

shutdown中に解除するのはUI、tick、キー復号器、resizeなど通常動作用のリスナーだけとする。OSシグナル、`uncaughtException`、`unhandledRejection`、`process.exit`、shutdown専用stdout / stderr、子プロセスの`error` / `close`リスナーはプロセス終了まで維持する。shutdown中に後続のシグナルまたは異常が届いても、そのハンドラは`requestShutdown()`を再度呼んで同じPromiseを受け取るだけで、既定動作による途中終了や終了コードの変更を起こさない。

`uncaughtException`と`unhandledRejection`のハンドラは処理を継続するためではなく、端末を復元して異常終了するためだけに使用する。捕捉値は`try { String(value) } catch { "例外値を文字列化できませんでした" }`相当で安全に文字列化して`diagnostic`へ渡し、raw modeとカーソルの復元後に`escapeDiagnostic()`済みの1行をstderrへ出す。悪意ある`toString()`の再例外やstderrのEPIPEでcleanupを中断してはならず、stack全体や元の文字列を別途出力してはならない。

`process.on('exit', restoreTerminalSync)`の登録条件と動作は§5に従う。これは最後の同期的な保険であり、フレーム消去、子プロセス終了、サマリ出力などの通常shutdown処理は行わない。

#### 終了処理の受け入れ条件

- 通常終了可能な再生・通知子はshutdown時に終了し、`close`後に追跡集合から除去される
- kill不能な子は1500ms後に親から切り離され、OS上に残ることがある。子が残らないことは親プロセスの保証事項にしない
- kill不能な子、未flushのstdout、残存ハンドルがあっても、イベントループが応答する限り親プロセスはshutdown開始から2000ms後の最初のtimer実行機会に終了する
- shutdown開始後は、新しい再生・通知子プロセスとベルが発生しない
- shutdown開始後のstdout EPIPEは、決定済み終了コードを変更せず、再帰的shutdownを起こさない
- 非TTYの全終了経路と`restoreTerminalSync`でANSIエスケープを出力しない
- `requestShutdown()`を複数回呼んでも、cleanup、サマリ、kill、強制終了timerは各1系列だけ実行され、全呼び出しが同じPromiseを受け取る
- cleanupに600msを要しても500ms段階は直ちに実行され、1500ms / 2000ms段階は`shutdownStartedAt`基準の期限を維持する
- fatal診断のstderrがEPIPEになっても再帰的shutdownや未処理`error`を起こさず、決定済み終了コードを維持する

### 終了時サマリ

正常終了および捕捉可能な終了シグナルでは、インタラクティブ表示中ならインラインフレームを消し、サマリを1回だけ通常の1行としてスクロールバックへ残す。行単位ログモードでは既存ログに続けてサマリを出力する。

```
🍅 完了: 3 ポモドーロ / タイマー完了換算時間: 1時間15分
```

`タイマー完了換算時間`は`completedPomodoros * workDurationMs`で計算する。自然終了として精算したWORKだけを含み、現在進行中のWORK、途中で終了したWORK、skipしたWORKは含めない。一時停止時間は含めない。スリープ復帰や未来への壁時計変更で自然終了として処理されたWORKも所定時間を完了したものとして算入するため、**実際に集中していた経過時間を表す値ではない**。この意味を誤認させないため「完了作業時間」とは呼ばない。この値は現在のプロセス起動以降の集計であり、「今日」の永続統計ではない。

`completedPomodoros * workDurationMs`は常に分単位の整数になるため（`--work`は整数分のみ受理する）、秒は表示しない。書式は次のとおり。

| 総分数              | 書式       | 例                                                  |
| ------------------- | ---------- | --------------------------------------------------- |
| 0                   | `0分`      | `🍅 完了: 0 ポモドーロ / タイマー完了換算時間: 0分` |
| 1〜59               | `M分`      | `25分`                                              |
| 60以上かつ分が0     | `H時間`    | `2時間`                                             |
| 60以上かつ分が0以外 | `H時間M分` | `1時間15分`                                         |

時の桁は上限を設けない（`--work 1440`で100ポモドーロ完了すれば`2400時間`となる）。1ポモドーロも完了していない場合もサマリは出力し、`0 ポモドーロ / タイマー完了換算時間: 0分`とする。

---

## 8. 通知

### 外部コマンドの安全な解決

`shell: false`は引数のシェル評価を防ぐが、実行ファイル探索の安全性までは保証しない。音・通知コマンドは引数検証後かつ端末初期化前に1回だけ絶対パスへ解決し、結果を保持する。実行時に裸のコマンド名を`spawn()`へ渡してはならない。

- macOSは`/usr/bin/afplay`と`/usr/bin/osascript`だけを使う。存在しない、通常ファイルでない、または実行できない場合は利用不能として通常のフォールバックへ進み、`PATH`から代替を探さない
- Windowsは`SystemRoot`が絶対パスであることを確認し、`SystemRoot`と`<SystemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe`を`realpath()`したうえで、その候補だけを使う。`SystemRoot`が未設定または不正、候補が通常ファイルでない、またはrealpath後の候補がcwd配下か`node_modules/.bin`配下なら利用不能とする。裸の`powershell` / `powershell.exe`、cwd、`PATH`は使わない
- Linuxは`PATH`をシェルや`which`へ渡さず、Node.js内で探索する。空要素と相対ディレクトリを除外し、各ディレクトリと候補を`realpath()`する。起動時cwd自身とその配下、およびパス要素に`node_modules/.bin`を含むディレクトリを除外し、最初に見つかった実行可能な通常ファイルの絶対パスを保持する。`PATH`未設定時だけ`/usr/local/bin`、`/usr/bin`、`/bin`をこの順で探索する。対象は`paplay`、`aplay`、`notify-send`である

候補の`realpath()`後にもcwd配下および`node_modules/.bin`除外を再確認し、シンボリックリンクで規則を迂回できないようにする。起動後にcwdや`PATH`が変更されても再解決しない。すべての起動は保持した絶対パスと独立した引数配列を`spawn(commandPath, args, { shell: false })`へ渡す。

この脅威モデルでは、親プロセスから渡された環境変数、受理した絶対PATHディレクトリ、OSインストールディレクトリを信頼する。本規則が防ぐのはシェル評価、相対PATH、cwd配下、`node_modules/.bin`によるプロジェクトローカルな取り違えであり、悪意ある絶対`PATH` / `SystemRoot`、loader関連環境変数、解決後の実行ファイル置換は防がない。コマンドのTOCTOUは音源と同様に明示的な非保証とし、起動失敗は通常のフォールバックへ流す。

### 非同期操作のキャンセル

音・通知要求ごとに操作オブジェクトを作成し、`activeOperations`で追跡する。操作結果は`success`、`failure`、`cancelled`の3種類とし、`cancelled`を通常の失敗として扱ってはならない。`Operation`は冪等な`cancel()`と、解除関数を返す`onCancel(callback)`を持つ。既にcancel済みの操作へ登録したcallbackは登録中に同期的に1回呼ばれる。

各再生・通知試行はspawn前にcancel callbackを登録し、callback内でonceガード付きの`finish('cancelled')`を同期的に呼ぶ。`finish()`は通常timeoutとcancel callbackを解除する。shutdown開始時は全操作の`cancel()`を呼ぶ。`spawn()`の直前、子プロセスの`error` / `close` / timeout処理、Promise解決後、Linuxの次候補へ進む直前、最終ベルを出す直前に`shuttingDown`または操作のcancel状態を確認する。`failure`の場合だけ次候補またはベルへ進み、`cancelled`の場合は何も開始せず終了する。

共通`spawnTracked()`はshutdown開始後の呼び出しを`cancelled`として拒否する。子をspawnした直後にキャンセル済みと判明した場合は、その子を`activeChildren`へ登録し、内部の`error` / `close`安全リスナーを登録したうえで直ちにkillし、子を呼び出し側へ公開せず`cancelled`を返す。フォールバックは開始しない。

通常時は再生・通知の候補チェーンが最終結果へ達した時点で、`finally`により操作を`activeOperations`から除去する。cancel callbackにより、kill不能な子が`close`しなくても操作Promiseと候補チェーンは直ちに`cancelled`で完了する。timeout後またはcancel後も`close`していない子は操作とは別に`activeChildren`へ残す。shutdownはcancelした操作Promiseの解決を待たず、追跡中の子と親プロセスの期限を§7で直接管理する。

### 音

ランタイム依存パッケージを追加せず、前項で解決したOSコマンドを直接`spawn`する。再生は状態遷移を待たせないが、すべての子プロセスを`activeChildren`集合で追跡する。通常動作中は`detached`と`unref()`を使用せず、shutdown時の切り離しだけは§7に従う。

| OS      | コマンド                                                                                            | `--volume`             |
| ------- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| macOS   | `/usr/bin/afplay -v <volume> <file>`                                                                | 対応。値をそのまま渡す |
| Linux   | `<paplayPath> --volume=<0-65536> <file>`（失敗時は`<aplayPath> <file>`）                            | `paplay`のみ対応       |
| Windows | `<powershellPath> -NoProfile -NonInteractive -Command <固定スクリプト>`（音源パスは環境変数で渡す） | 非対応                 |

`paplay`の`--volume`はPulseAudioの線形ボリューム値で、`65536`が100%にあたる。`Math.round(volume * 65536)`を10進整数として渡す。`aplay`は再生時の音量指定手段を持たないため、`aplay`へフォールバックした場合は`--volume`を無視する。この非一貫性はヘルプとREADMEに明記する。

音源パスは§2の検証で絶対パスへ正規化済みであり、`-`で始まらないことが保証されている。

WindowsのPowerShell起動は非同期で行い、起動時間によってタイマーの次フェーズ開始を遅らせない。

前フェーズの再生が終わる前に次の再生要求が発生した場合（極端に短いフェーズ設定など）は、**前の再生を打ち切らず並行させる**。フェーズ境界の通知は取りこぼさないことを優先し、`activeChildren`には両方が並ぶ。それぞれ独立に10秒タイムアウトの対象となる。

Windows では音源パスを PowerShell コードへ文字列補間しない。固定スクリプトが `POMOTTY_SOUND_FILE` 環境変数を読み取る。

```ts
const script = [
  '$player = [System.Media.SoundPlayer]::new($env:POMOTTY_SOUND_FILE)',
  '$player.PlaySync()',
].join('; ');

const result = await runPlayer(
  operation,
  powershellPath,
  ['-NoProfile', '-NonInteractive', '-Command', script],
  {
    env: { ...process.env, POMOTTY_SOUND_FILE: file },
  },
);
```

この`await`は音操作の非同期候補チェーン内だけで行い、フェーズ遷移側は候補チェーン全体を待たない。`result === 'failure'`の場合だけベルへ進み、`cancelled`では何も開始しない。

#### 音源

システム標準音は環境差が大きい（macOS の `/System/Library/Sounds/` は確実に存在するが、Linux の freedesktop サウンドテーマは未インストールの環境が多い）。**短いwavを2つ同梱する**。44.1kHz・16bit・mono・0.5〜1.5秒では、RIFFヘッダを含めて各ファイルは概ね44〜133KBとなる。この実サイズをREADMEや公開物レビューでも前提とする。

作業終了音と休憩終了音は**明確に鳴らし分ける**。席を外している状態で、音だけで「休憩開始」か「作業開始」かを判別できる必要があるため、低め・落ち着いた音と高め・喚起する音で対比をつける。

##### フォーマット要件

Windows の `System.Media.SoundPlayer` は**非圧縮 PCM の RIFF WAVE しか再生できない**。ADPCM、IEEE float、`WAVE_FORMAT_EXTENSIBLE` は例外になる。したがって同梱音源と、ユーザーが `--sound-work` / `--sound-break` で差し替える音源の双方に次の制約がある。

| 項目               | 同梱音源の仕様           | ユーザー音源に必要な条件               |
| ------------------ | ------------------------ | -------------------------------------- |
| コンテナ           | RIFF WAVE                | RIFF WAVE                              |
| コーデック         | PCM（`audioFormat = 1`） | PCM（`audioFormat = 1`）               |
| ビット深度         | 16bit                    | 8bit または 16bit                      |
| サンプリング周波数 | 44100Hz                  | 任意                                   |
| チャンネル         | モノラル                 | 任意                                   |
| 長さ               | 0.5〜1.5秒               | 任意（10秒のタイムアウトに収まること） |

`--sound-work` / `--sound-break` の検証は拡張子`.wav`の確認までとし、**中身のフォーマット検証は行わない**。非PCMのwavを指定した場合、macOSとLinuxでは再生できてもWindowsでは失敗しベルへフォールバックする。この制約はREADMEの`--sound-*`の説明に明記する。

##### 生成と権利

同梱音源は**リポジトリ内のスクリプトで生成する**。外部素材を持ち込まないことで、帰属表示や再配布条件の確認を構造的に不要にする。

- `scripts/generate-sounds.mjs` を用意し、`node:fs`だけで正弦波を合成してRIFF WAVEヘッダを書き出す（外部依存なし）
- 作業終了音は低め（例: 440Hz→330Hzの2音）、休憩終了音は高め（例: 660Hz→880Hzの2音）とし、クリックノイズを避けるため両端に短いフェードを掛ける
- 生成物 `assets/work-end.wav` と `assets/break-end.wav` はリポジトリにコミットする。ビルド時生成にはしない（公開物の再現性とCIの単純さを優先する）
- 生成スクリプトは `files` に含めず、パッケージには生成済みwavだけを同梱する
- 音源の著作権はプロジェクト本体と同じライセンスに従う。別途の帰属表示ファイルは設けない

`package.json` の `files` に `assets/*.wav` を含めること。

`scripts/verify-wav.mjs`は外部コマンドや追加パッケージを使わず、Node.jsの`Buffer` APIで同梱2ファイルを機械検証する。各wavは次の条件をすべて満たす。

1. 先頭4バイトが`RIFF`、8〜11バイトが`WAVE`で、`buffer.readUInt32LE(4) + 8 === buffer.length`を満たす
2. 各chunk headerが8バイト以上残っていることを確認し、little-endianの宣言サイズと偶数バイト境界のpaddingに従って最後まで走査でき、宣言データやpaddingがファイル終端を超えない
3. サイズが厳密に16の`fmt `チャンクと、`data`チャンクがそれぞれちょうど1個存在し、`audioFormat = 1`、`channels = 1`、`sampleRate = 44100`、`bitsPerSample = 16`、`blockAlign = 2`、`byteRate = 88200`である
4. `data`サイズが正の2の倍数で、サンプル数から求めた長さが0.5〜1.5秒の範囲内である
5. 少なくとも1個のサンプルが0以外で、`work-end.wav`と`break-end.wav`の`data`が同一でない
6. `generate-sounds.mjs --output-dir <temp>`を一時ディレクトリへ再実行した結果が、コミット済み2ファイルとそれぞれバイト単位で一致する。生成スクリプトは出力先を必須引数として受け取り、この検証でワークツリーを書き換えない

ワークツリー内の音源と、生成済みtarballをインストールして得た音源の両方へ同じ検証関数を適用する。壊れたRIFFサイズ、切れたチャンク、IEEE float、空の`data`、範囲外の長さは必ず拒否する。

#### フォールバック

| OS      | 試行順序                                  |
| ------- | ----------------------------------------- |
| macOS   | `afplay` → ターミナルベル                 |
| Linux   | `paplay` → `aplay` → ターミナルベル       |
| Windows | PowerShell `SoundPlayer` → ターミナルベル |

コマンドが存在しない場合だけでなく、同期的な`spawn`例外、子プロセスの`error`、シグナル終了、非ゼロ終了コード、10秒のタイムアウトを失敗として扱う。`error`後に`close`も発生し得るため、各試行はonceガードで1回だけ成功・失敗を確定する。

Linuxでは`paplay`がどの理由で失敗しても`aplay`を1回試す。両方失敗した場合だけベルへ進む。成功は`close`イベントで`code === 0 && signal === null`の場合に限る。再生結果はフェーズ遷移やタイマー継続の成否に影響させない。

`spawnTracked()`の型は次で固定し、生の`ChildProcessOptions`、`stdio`、`shell`を呼び出し側から受け取らない。

```ts
type SpawnTrackedResult =
  { result: 'success'; child: ChildProcess } | { result: 'failure' | 'cancelled' };

type StdioProfile = 'ignore' | 'stdin-pipe';
type SpawnTrackedOptions = {
  env?: NodeJS.ProcessEnv;
  stdioProfile: StdioProfile;
};
```

同関数は起動直前にcancel状態を再確認し、保持済み絶対パスだけを受理して、`windowsHide: true`と`shell: false`を内部で固定する。`ignore`はstdin / stdout / stderrをすべて`ignore`、`stdin-pipe`はstdinだけ`pipe`でstdout / stderrを`ignore`とする内部定数へ対応させる。spawn成功直後に子を`activeChildren`へ加え、`close`による集合削除リスナーと、`close`まで有効な内部`error`安全リスナーを登録する。その後でcancel状態を再確認し、cancel済みなら直ちにkillして`{ result: 'cancelled' }`を返す。利用不能またはspawn失敗は`{ result: 'failure' }`、成功だけが子を含む判別共用体を返す。

```ts
type OperationResult = 'success' | 'failure' | 'cancelled';
type PlayerOptions = { env?: NodeJS.ProcessEnv };

const runPlayer = (
  operation: Operation,
  commandPath: string,
  args: string[],
  options: PlayerOptions = {},
) =>
  new Promise<OperationResult>((resolve) => {
    if (shuttingDown || operation.cancelled) {
      resolve('cancelled');
      return;
    }

    let settled = false;
    let child;
    let timeout: NodeJS.Timeout | undefined;
    let removeCancelListener = () => {};

    const finish = (result: OperationResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      removeCancelListener();
      resolve(shuttingDown || operation.cancelled ? 'cancelled' : result);
    };

    removeCancelListener = operation.onCancel(() => finish('cancelled'));
    if (settled) {
      removeCancelListener();
      return;
    }

    try {
      const spawned = spawnTracked(operation, commandPath, args, {
        env: options.env,
        stdioProfile: 'ignore',
      });

      if (spawned.result !== 'success') {
        finish(spawned.result);
        return;
      }

      child = spawned.child;
      child.once('error', () => finish('failure'));
      child.once('close', (code, signal) => {
        finish(code === 0 && signal === null ? 'success' : 'failure');
      });
    } catch {
      finish(shuttingDown || operation.cancelled ? 'cancelled' : 'failure');
      return;
    }

    timeout = setTimeout(() => {
      child?.kill();
      finish(shuttingDown || operation.cancelled ? 'cancelled' : 'failure');
    }, 10_000);
  });
```

`PlayerOptions`は`env`だけを許可し、`shell`、`stdio`、`windowsHide`を呼び出し側から上書きできない型にする。通知用の呼び出しを含め、`spawnTracked()`の公開型から生の`stdio`と`shell`を除外する。shutdownによるcancel callbackは子の`close`を待たずPromiseを確定し、子の終了自体は`activeChildren`と§7へ委ねる。

タイムアウト時は後続候補へ進むが、子プロセスは`close`を確認するまで`activeChildren`から除去しない。`kill()`後1秒以内に`close`しなければ強制終了（`kill('SIGKILL')`）を1回試み、その補助timerもshutdownで解除する。shutdown経路での終了手順と上限は§7の「子プロセスの終了とハングの回避」に従う。

音源は§2で起動時に検証済みだが、実行中に削除・置換される可能性がある（TOCTOU）。再生前の再検証は行わず、**通常の再生失敗として同じフォールバック経路で扱う**。検証は起動時の入力ミスを早期に知らせるためのものであり、実行時の保証ではない。

最終フォールバックのベルは、`shuttingDown === false`、操作がcancelされていない、`stderrUnavailable === false`、`interactive === true && process.stderr.isTTY === true`のすべてを満たす場合だけ、stderrへ**1バイトの`\x07`**を1回書く。stdoutには書かず、行単位ログ、CI、パイプ出力ではベルを省略する。`--no-sound`指定時は再生コマンドもベルも実行しない。

### デスクトップ通知

macOS / Linux では音と同時に発火させる。音は聴覚、通知は視覚のバックアップという役割分担。Windows ではデスクトップ通知処理を呼び出さない。

#### 通知タイトルと本文

macOSとLinuxで同一の論理タイトル・本文を使用する。正規化後のタスク名がなければ`title = "pomotty"`、あれば`title = "pomotty — " + task`とする。

- WORK自然終了時の本文は`"お疲れさま。" + nextBreakMinutes + "分休憩"`とする。`nextBreakMinutes`は実際の遷移先がBREAKなら`--break`、LONG_BREAKなら`--long-break`の値である
- BREAKまたはLONG_BREAK自然終了時の本文は`"休憩終了。作業に戻りましょう"`とする
- ユーザー由来のタスク名はtitleだけに含め、bodyには含めない。freedesktop通知のbodyはmarkupとして解釈され得るため、ユーザー由来文字列をLinuxのbodyへ入れない
- skip、`--no-notify`、Windows、shutdown開始後は通知子プロセスを起動しない

titleとbodyはそれぞれ独立したargv要素として渡し、AppleScriptコードまたはシェル文字列へ補間しない。

| OS      | コマンド                                                               |
| ------- | ---------------------------------------------------------------------- |
| macOS   | `/usr/bin/osascript - <title> <body>` にスクリプトをstdinから流し込む  |
| Linux   | `<notifySendPath> -- <title> <body>`（それぞれ独立した引数として渡す） |
| Windows | **非対応（音のみ）。通知コマンドは起動しない**                         |

通知も音と同様、失敗してもタイマーを継続する。通知子プロセスも`activeChildren`で追跡し、5秒で終了しなければ`kill()`して失敗として確定する。その後1秒以内に`close`しなければ`kill('SIGKILL')`を1回試す。強制終了要求後も`close`しない子は追跡を打ち切らず、shutdown時に§7の対象とする。補助timerはshutdownで解除する。通知には代替コマンドやターミナルベルのフォールバックを設けない。

#### macOS

AppleScript へタイトルや本文を直接補間してはならない。固定スクリプトの `run argv` ハンドラで受け取る。

```applescript
on run argv
  set notificationTitle to item 1 of argv
  set notificationBody to item 2 of argv
  display notification notificationBody with title notificationTitle
end run
```

スクリプトの渡し方は `-e` ではなく、**引数 `-` によるstdin入力**とする。`-e` 形式では、

- `osascript` が end-of-options の `--` を引数リストから取り除く保証がなく、取り除かれない場合は `item 1 of argv` が `"--"` になり通知が壊れる
- 複数行のハンドラを1個の `-e` へ改行込みで渡したときの解釈が処理系依存になる

という2点の不確実性がある。`-` を使えばスクリプト本文とユーザー由来引数が入力チャネルごと分離され、`--` に依存せずに `argv` の先頭がタイトルになる。

```ts
const spawned = spawnTracked(operation, osascriptPath, ['-', title, body], {
  stdioProfile: 'stdin-pipe',
});

if (spawned.result !== 'success') {
  finish(spawned.result);
} else {
  const child = spawned.child;
  child.once('error', () => finish('failure'));
  child.once('close', (code, signal) => {
    finish(code === 0 && signal === null ? 'success' : 'failure');
  });

  const input = child.stdin;
  if (input === null) {
    child.kill();
    finish('failure');
  } else {
    input.once('error', () => {
      child.kill();
      finish(shuttingDown || operation.cancelled ? 'cancelled' : 'failure');
    });

    try {
      input.end(APPLESCRIPT);
    } catch {
      child.kill();
      finish(shuttingDown || operation.cancelled ? 'cancelled' : 'failure');
    }
  }
}
```

`title` と `body` は正規化済みの文字列であり、`-` で始まっていてもスクリプト引数として扱われる。すべての通知プロセスで`spawnTracked()`が`shell: false`を固定する。

`child.stdin`の`error`は`ChildProcess`本体の`error`とは別イベントであるため、必ず個別に処理する。stdinのEPIPE、`end()`の同期例外、childの`error`、`close`、5秒timeout、操作のcancel callbackは同じonceガードで1回だけ確定する。stdinエラー時も`activeChildren`から即時削除せず、`close`を受け取るまで追跡する。shutdown中のstdinエラーは`cancelled`として扱い、追加処理を開始しない。

macOS通知はbest effortとする。`osascript`の終了コード`0`はスクリプトが受理されたことだけを表し、通知の実表示や権限付与を保証しない。通知設定へ表示される主体はスクリプトの実行形態とmacOS版に依存するため、Terminal.app、iTerm2、VS Codeなど特定のホストへ固定しない。[Appleの通知スクリプト説明](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html)に沿い、READMEとhelpでは「最初の通知試行後にシステム設定 > 通知で関連する通知元を確認する」と案内する。アプリから表示成否を区別できないため、検知や再試行は行わない。

#### Linux

`notify-send` は通知デーモンが動作していない環境（SSHセッション、コンテナ、ヘッドレス）では失敗する。無用な子プロセス生成と5秒の待ちを避けるため、`DISPLAY`と`WAYLAND_DISPLAY`の値がそれぞれ`undefined`または空文字列なら未設定とみなし、**両方が未設定の場合は`notify-send`を起動せず**、通知をスキップして成功扱いとする。この判定は起動時に1回行い、結果を保持する。

#### 音・通知処理の受け入れ条件

- `error`と`close`が両方発生しても、次候補またはベルは1回だけ実行される
- Linuxで`paplay`が非ゼロ終了した場合も`aplay`を試し、`aplay`成功時はベルを鳴らさない
- macOS / Windowsの再生失敗、およびLinuxの全候補失敗では、インタラクティブTTYだけでベルを1回出力する
- 再生・通知プロセスがハングしてもタイマーは継続し、規定時間後に終了要求と強制終了要求を行う。OS上の終了自体は保証せず、kill不能な子はshutdown時に§7で切り離せる
- 通常の再生・通知子はshutdownで終了する。kill不能な子がOS上に残り得る場合も、§7の規則で親プロセスは期限時に終了する
- `paplay`実行中にshutdownした場合、Promiseが`cancelled`となり、`aplay`とベルへ進まない
- shutdown開始後の`spawnTracked()`は子を起動せず、ベルも出さない。spawn直後の競合で得た子は追跡して直ちにkillする
- `--volume 0.5` のとき、`paplay` へ渡す引数が `--volume=32768` になる
- `aplay` へフォールバックした場合、引数に音量指定が含まれない
- 起動時に検証した音源が実行中に削除・置換されても、通常の再生失敗としてフォールバックし、タイマーは継続する
- `DISPLAY`と`WAYLAND_DISPLAY`が両方`undefined`、両方空文字列、または片方が`undefined`でもう片方が空文字列のLinuxでは`notify-send`が起動されず、片方に空でない値があれば起動を試す
- `osascript` へ渡す引数配列が `['-', title, body]` であり、`--` を含まない
- `osascript`のstdinがEPIPEになってもonceガードが`failure`を1回だけ確定し、タイマーは継続する。shutdown中なら`cancelled`となる
- タスクなしではtitleが厳密に`pomotty`、タスクありでは`pomotty — <正規化済みtask>`となる
- 短い休憩と長い休憩でWORK終了本文の分数が実際の遷移先時間と一致する
- `<a>`、`<img>`、`&`を含むタスク名が通知bodyへ入らない
- cwd、相対PATH要素、または`node_modules/.bin`に同名コマンドを置いても実行されず、全OSで`spawn()`の第1引数が検証済み絶対パスとなる
- 呼び出し側のオプションから`shell: true`を注入できない
- 再生中に次のフェーズ遷移が起きた場合、前の再生はkillされず2個の子プロセスが並行する

---

## 9. パッケージング

### package.json

```json
{
  "name": "pomotty",
  "version": "1.0.0",
  "description": "A zero-runtime-dependency Pomodoro timer for the terminal.",
  "type": "module",
  "bin": { "pomotty": "./dist/cli.js" },
  "files": ["dist/cli.js", "assets/*.wav"],
  "engines": { "node": "^22.18.0 || >=24.11.0" },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "npm run test:unit",
    "test:unit": "node --test \"test/unit/**/*.test.ts\"",
    "test:package": "node --test \"test/package/**/*.test.ts\"",
    "verify:wav": "node scripts/verify-wav.mjs",
    "check": "npm run typecheck && npm run build && npm run test:unit && npm run verify:wav",
    "prepack": "npm run check",
    "smoke:package": "node scripts/smoke-package.mjs",
    "verify:package": "node scripts/verify-package.mjs"
  },
  "keywords": ["pomodoro", "timer", "cli", "terminal"],
  "publishConfig": { "access": "public" },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "22.20.1",
    "tsdown": "0.22.14",
    "typescript": "7.0.2"
  }
}
```

パッケージ名と`bin`名を`pomotty`に統一する。これにより`npx pomotty`でパッケージを取得して起動でき、グローバルインストール時も`pomotty`コマンドとして実行できる。`dependencies`は空のままとし、ビルドとテストに必要なものだけを`devDependencies`へ置く。`postinstall`は定義しない。

`devDependencies`は`package-lock.json`で間接依存も固定し、CIとリリースで`npm ci`を使用する。上記バージョンは仕様確定時の固定値であり、更新は個別の依存更新としてCIを通して行う。

Node.jsの要件は、公開後のCLI実行、ビルド、型チェック、テストのすべてで`^22.18.0 || >=24.11.0`に統一する。Node.js 22系では22.18.0以上、Node.js 24系では24.11.0以上を必要とし、23.xおよび24.0〜24.10はサポート対象外とする。

22.18.0を下限とする理由は、テストで使うTypeScript型削除実行と引用符付きglobによる対象限定を利用でき、実行・開発・CIの下限を1つに揃えられるためである。`package.json`の`engines`、README、CI、tarballスモークテストはすべて同じ範囲を記載し、22.0系を対象とする説明やジョブを残さない。バンドル出力のターゲットは`node22`のままとするが、公開物の動作保証下限は22.18.0である。

`license`、`repository`、`author`は所有者が正式な値を決定して公開前に追加する。特に`license`と`repository`が未設定の状態では公開しない。`pomotty`名の空きは予約できないため、公開直前にnpm registryで再確認する。

`files`にREADMEとLICENSEを書いていないのは意図的である。npmは`package.json`、`README`、`LICENSE`を`files`の指定に関わらず常に同梱するため、重複して書く必要がない。公開物の受け入れ条件でこの3点の存在を確認する。

READMEには`npx pomotty`の起動例、主要オプション、統一したNode.js要件、OS別機能表、「デスクトップ通知はmacOS / Linuxのみ、Windowsは音のみ」の制約、`--volume`が`afplay`と`paplay`でのみ有効であること、`--sound-*`が非圧縮PCMのwavを要求すること（Windows）、macOS通知はbest effortであり最初の試行後に通知設定で関連する通知元を確認すること、サマリの「タイマー完了換算時間」の意味、ライセンスを記載する。選択したSPDXライセンスと一致する`LICENSE`ファイルを同梱する。

### テストとpack検証の分離

`node --test`を引数なしで実行すると`test/`以下の`.test.ts`を再帰的に発見する。このため、`npm pack`を起動するパッケージ検証テストを通常の単体テストと同じ探索対象に置いたまま、`prepack → check → node --test`と呼び出してはならない。

- `test/unit/**/*.test.ts`は、時計、TTY、子プロセス等をフェイク化した単体・コンポーネントテストだけを含む
- `test/package/**/*.test.ts`は、生成済みtarballのファイル構成、metadata、インストール結果、wav、ランタイム依存だけを検証し、実時間を使うCLI起動スモークは実行しない
- `test:unit`と`test:package`は引用符付きglobで探索対象を明示し、互いのディレクトリを実行しない
- `prepack`は`check`だけを呼び、`verify:package`、`test:package`、`smoke:package`、`npm pack`、`npm publish`を直接・間接に呼ばない
- `verify:package`だけがトップレベルから`npm pack`を1回起動し、生成後に`test:package`と`smoke:package`を実行する
- `prepare`と`prepublishOnly`は定義しない

許可する呼び出し関係は次だけとする。

```text
verify:package
  └─ npm pack
       └─ prepack
            └─ check
                 ├─ typecheck
                 ├─ build
                 ├─ test:unit
                 └─ verify:wav
  ├─ test:package [POMOTTY_TARBALL=<生成済みtgz>]
  └─ smoke:package <生成済みtgz>
```

`npm pack`は`prepack`を起動するため、`prepack`から`verify:package`へ戻る経路が1つでもあれば再帰する。スクリプト呼び出しグラフをテストで固定する。

Windowsを含む全OSで、検証スクリプトからnpm CLIを起動するときに裸の`npm`や`npm.cmd`を`spawn()`してはならない。`npm run`が設定した`process.env.npm_execpath`が絶対パスかつ読み取り可能な通常ファイルであることを確認し、`spawn(process.execPath, [npmExecPath, ...args], { shell: false })`で起動する。`npm_execpath`がない場合は、検証スクリプトを直接実行せず`npm run`経由で起動するよう診断して失敗する。

### ビルド

tsdownで実行コードを`dist/cli.js`の1ファイルにバンドルし、先頭にシェバンを付与する。ファイル名を`bin`と一致させるため、ハッシュと固定拡張子への変更を無効にする。

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  platform: 'node',
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  fixedExtension: false,
  hash: false,
  dts: false,
  sourcemap: false,
  banner: '#!/usr/bin/env node',
});
```

シェバンは`banner`だけで付与する。`src/cli.ts`の先頭には**シェバンを書かない**。両方にあるとバンドル出力の1行目と2行目に二重に現れ、2行目がJavaScriptの構文エラーになる。

TypeScriptはNode.js ESMとNode.jsの型削除実行の両方で同じimportを解決できるようにする。相対importは`.ts`拡張子を明記し、`enum`、パラメータプロパティ、namespaceなど型削除だけで実行できないTypeScript構文は使用しない。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "tsdown.config.ts"]
}
```

実行権限はnpmが`bin`登録時に付与するため、ビルド側での対応は不要とする。`--version`はハードコードせず、`dist/cli.js`から`new URL('../package.json', import.meta.url)`で同梱の`package.json`を解決し、`version`を読み取る。読み取り失敗は内部エラーとしてstderrへ出力し、終了コード`1`とする。

同梱音源は実行時のcwdやnpmキャッシュの位置に依存させず、常にバンドルからの相対URLで解決する。

```ts
import { fileURLToPath } from 'node:url';

const workSound = fileURLToPath(new URL('../assets/work-end.wav', import.meta.url));
const breakSound = fileURLToPath(new URL('../assets/break-end.wav', import.meta.url));
```

### npm公開物の受け入れ条件

リリース候補では作業ツリーからの直接実行を合格根拠にせず、`scripts/verify-package.mjs`が作成した**1個の実tarball**を以後の検証単位とする。

1. clean checkoutで`npm ci`を実行する
2. `npm run verify:package -- --output-dir <release-dir> --tag <dist-tag>`を実行する。`<release-dir>`は開始時に存在しないか空でなければならず、既存のtgzまたはmanifestがあれば失敗する。同スクリプトは`npm pack --json --pack-destination <release-dir>`をちょうど1回起動し、JSON結果が1パッケージ・1個のtgzを示すことを確認する
3. tgzのtarヘッダを読み、PAX / GNU long-name情報を解決した後の正規化済みパスで、次の厳密な6ファイルだけを含むことを確認する。6エントリは一意な通常ファイルでなければならない。絶対パス、空要素、`.`、`..`、バックスラッシュ、NUL、重複パス、symlink、hardlink、device、FIFOを拒否する。ディレクトリエントリは`package/`配下だけを許可し、通常ファイル数には含めない
   - `package/package.json`
   - `package/README.md`
   - `package/LICENSE`
   - `package/dist/cli.js`
   - `package/assets/work-end.wav`
   - `package/assets/break-end.wav`
4. tgzをリポジトリ外の空の一時ディレクトリへ`npm install --ignore-scripts --offline --no-audit --no-fund <tgz>`で通常インストールする
5. インストール済み`package.json`の`name`、`version`、`bin`、`engines`、`license`、`repository`、`author`、`publishConfig.access === "public"`、空の`dependencies`がリリース予定値と一致することを確認する。LICENSE本文も選択したSPDXライセンスの正規テンプレートと一致しなければならない
6. `dist/cli.js`の1行目が厳密に`#!/usr/bin/env node`で、2行目がシェバンでないことを確認する。バンドル内の実行時importは`node:`組み込みだけを許可し、外部パッケージimportを拒否する
7. インストール後の2個のwavへ§8の完全なRIFF / PCM検証を適用し、別cwdからも同梱ファイルの解決に成功することを確認する
8. 一時プロジェクトで`npm ls --omit=dev --json`を実行し、pomotty以外のランタイムパッケージがないことを確認する
9. インストール済みbinをリポジトリ外のcwdから実行し、後述のtarballスモークテストを完了する
10. `npm publish --dry-run --ignore-scripts --access public --tag <dist-tag> <tgz>`が成功し、公開予定のファイル一覧、metadata、dist-tagが前項までの結果と一致することを確認する
11. tgzのSHA-256を計算し、`artifactFile`（tgzのbasename）、package名、version、SHA-256、`gitCommit`、`distTag`、Node.jsバージョン、npmバージョンを含むJSON manifestを出力する。生成ジョブ内の絶対パスは診断ログだけに使い、manifestへ保存しない

生成したtgzとmanifestは検証後に削除・再生成せず、CI artifactとしてOS別スモークジョブとpublishジョブへ渡す。artifactへ保存するのは`npm pack --json`が返した厳密な1ファイルと対応manifestだけとし、releaseディレクトリ全体をwildcardでアップロードしない。後続ジョブはartifact展開ディレクトリと`artifactFile`からローカル絶対パスを再構成してSHA-256を照合する。

`test:package`には環境変数`POMOTTY_TARBALL`、`smoke:package`には第1引数として、各ジョブで再構成した絶対tgzパスを渡す。Node.jsテストランナーのglob引数とtgzパスが混ざらないよう、`npm run test:package -- <tgz>`という呼び方は禁止する。途中の検証に失敗した場合はmanifestを成功物として出力しない。

### tarballスモークテスト

`scripts/smoke-package.mjs <tarball>`は、リポジトリ外に作成した空の一時ディレクトリで次を実行する。ローカルtgzのnpm installは60秒、npm execによる各短命CLIは15秒、タイマー起動ログ待ちは5秒、起動後の生存確認は1秒、スモーク全体は90秒を上限とする。timeoutまたは失敗時も対象プロセスの終了と`close`を確認してから一時ディレクトリを削除する。

1. 最小の`package.json`を作り、ローカルtgzを`--ignore-scripts --offline --no-audit --no-fund`付きでインストールする
2. npm CLIを`exec --offline --prefix <temp> -- pomotty --version`の引数で起動してbin shimを検証し、終了コード`0`、厳密な期待文字列、stderr空、ANSIなしを確認する
3. 同じ経路で`pomotty --help`を実行し、終了コード`0`、§2の厳密なhelp文字列、stderr空、ANSIなしを確認する
4. 同じ経路で`pomotty --work 0`を実行し、終了コード`2`、エスケープ済み診断、タイマー未起動を確認する
5. 継続実行するタイマーだけはnpm / cmd wrapperを介さず、インストール済み`dist/cli.js`の絶対パスを`spawn(process.execPath, [cliPath, ...args], { shell: false })`で、`--work 1 --break 1 --long-break 1 --cycles 1 --no-sound --no-notify`を付けて非TTY起動する
6. 5秒以内に`[HH:mm:ss] WORK 開始 (1:00)`形式の1行がstdoutへ出ること、ANSIを含まないこと、出力後1秒間は予期せず終了しないことを確認する
7. POSIXではSIGTERMを送り、終了コード`143`とサマリ1回を確認する
8. Windowsではpackaging smokeの目的を起動確認に限定し、確認後に前項で直接起動したNode子を終了し、`close`を待ってから一時ディレクトリを削除する。Windowsの正常shutdown、サマリ、端末復元は注入可能な単体テストで別途検証する

公開オプションの最短時間が1分であるため、スモークテストで自然なフェーズ終了を待ってはならない。自然終了と遷移は偽時計を使う単体テストの責務とする。

### 公開手順

公開する対象は、`verify:package`と全OSのtarballスモークテストに合格した**同一SHA-256のtgz**だけとする。公開ジョブで作業ツリーから再度`npm pack`してはならず、引数なしの`npm publish`も使用しない。

1. packジョブが保存したtgzと検証manifestを取得し、artifact展開先と`artifactFile`からtgzの絶対パスを再構成する
2. tgzのSHA-256を再計算し、manifestと一致すること、およびmanifestの`gitCommit`がリリース対象commitと一致することを確認する
3. tgz内のpackage名とversionがリリースタグおよび公開予定値と一致することを確認する
4. パッケージ名、ライセンス、repository URL、公開タグを最終確認する
5. manifestの`distTag`を明示して、`npm publish --ignore-scripts --access public --tag <distTag> <verified-tarball.tgz>`を実行する

`--ignore-scripts`により公開時に`prepack`等を再実行せず、検証後の作業ツリーから別成果物を生成する余地をなくす。公開直前の変更が必要になった場合はtgzを直接編集せず、ソースを修正して`verify:package`から全検証をやり直す。

---

## 10. ディレクトリ構成（案）

```
.
├── src/
│   ├── cli.ts          # エントリポイント、引数パース
│   ├── timer.ts        # 状態機械、タイマーループ
│   ├── render.ts       # ANSI 描画、非TTYフォールバック
│   ├── unicode.ts      # Unicode 15.1固定の書記素分割・セル幅
│   ├── input.ts        # raw mode、復号済みキー入力
│   ├── notify.ts       # 音・デスクトップ通知
│   ├── platform.ts     # OS 判定、安全なコマンド解決
│   └── shutdown.ts     # 終了処理と端末復元
├── test/
│   ├── unit/
│   │   ├── cli.test.ts
│   │   ├── timer.test.ts
│   │   ├── render.test.ts
│   │   ├── input.test.ts
│   │   ├── notify.test.ts
│   │   └── shutdown.test.ts
│   └── package/
│       ├── tarball.test.ts
│       ├── installed-package.test.ts
│       └── bundled-wav.test.ts
├── assets/
│   ├── work-end.wav
│   └── break-end.wav
├── scripts/
│   ├── generate-sounds.mjs   # 同梱wavの生成（パッケージには含めない）
│   ├── verify-wav.mjs
│   ├── verify-package.mjs
│   └── smoke-package.mjs
├── tsdown.config.ts
├── tsconfig.json
├── package.json
├── package-lock.json
├── README.md
└── LICENSE
```

`test/package/`は`test:package`または`verify:package`から`POMOTTY_TARBALL`で生成済みtgzを渡された場合だけ実行し、`prepack`の探索対象へ含めない。環境変数が未設定、相対パス、存在しないファイル、`.tgz`以外の場合はテストをskipせず失敗させる。

---

## 11. テスト方針

テストランナーはNode.js標準の`node:test`を使用し、テストランナー自体の追加依存は持たない。消去可能なTypeScript構文だけを使う`.test.ts`を直接実行し、`tsc --noEmit`による型チェックも別途必須とする。

単体テストと、`npm pack`を起動するパッケージテストは探索対象を分離する。`node --test`を引数なしで実行してはならず、単体テストは`node --test "test/unit/**/*.test.ts"`、パッケージテストは`node --test "test/package/**/*.test.ts"`として明示する。globはシェル展開へ依存させず、引用符を付けてNode.jsテストランナーへ渡す。`prepack`から実行されるのは単体テストだけであり、パッケージテストは生成済みtgzを渡された場合だけ実行する。

単体テストでは待ち時間を実際に消費しない。壁時計、単調時計、timer、子プロセス生成、`process.exit`、TTY属性、端末幅、stdin / stdout / stderrを注入可能にし、擬似時計とフェイクで決定的に検証する。実時間を使うのは§9のtarballスモークに設けた短い起動確認だけとする。

| 分類               | 必須の検証                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 引数パーサ         | 既定値、境界値、`--key=value`、ハイフン開始値は`=`形式だけで受理、`--task=-h`と`--task -h`の区別、単独`--`の拒否、重複、未知、値不足、位置引数、help / versionの完全トークン優先順位、音源パス検証、厳密なhelp・version文字列                                                                                                                                                                     |
| 引数の受理形式     | `+25` / `025` / `" 25"` / `1e0` / `.5` / `1.` / `0x19` / 全角数字の拒否、`--volume`の`0` / `1` / `0.6` / `1.0`の受理と`1.1`の拒否、絶対パスの`path.resolve()`適用                                                                                                                                                                                                                                 |
| 診断               | C0 / C1、ANSI、改行、双方向制御、引用符、バックスラッシュ、対応しないサロゲートのエスケープ、160コードポイント上限、ユーザー入力を含む例外メッセージ                                                                                                                                                                                                                                              |
| タスク名の正規化   | well-formed化と対応しないサロゲート、`置換 → trim → 書記素境界を守った120コードポイント上限 → trim`、ASCII 121文字、119文字後のZWJ絵文字、上限境界の結合文字、bidi制御文字とZWSP / BOMの除去、ZWNJ / ZWJの保持、Unicode 15.1固定                                                                                                                                                                  |
| 状態機械           | 全自然終了・skip遷移、`cycles = 1`、長い休憩後のリセット、一時停止中のskip、カウンター不変条件                                                                                                                                                                                                                                                                                                    |
| 時間               | 通常終了、tick遅延、スリープ相当、未来・過去への壁時計変更、`now === endsAt`でのspace / skip / quit、tickとキーの配送順反転、多重遷移防止、catch-upしないこと、`transitioning`の例外解除                                                                                                                                                                                                          |
| 時間の書式         | 実行中と一時停止中の`visibleRemainingMs`算出、`displaySeconds`が3599 / 3600での形式切り替え、`visibleRemainingMs = 3599500`が`59:59`ではなく`1:00:00`になること、残り1msの`0:01`表示、サマリの各時間書式                                                                                                                                                                                          |
| 描画               | 3レイアウトの規範テンプレート、`LONG_BREAK 24:00:00 100/100` = 27セル、時計巻き戻しによる長い時表記、Unicode 15.1固定幅、CJK・結合文字・RGI絵文字・VS15 / VS16・Ambiguous文字、書記素単位省略、最終行を含む末尾改行、`renderedRows`、resize時に上移動せず旧フレームを保持して新フレームだけを追跡すること、通常再描画時の旧行消去、`NO_COLOR`、`TERM=dumb`                                        |
| キー入力           | `S` / `Q`、`Ctrl+C`、`Ctrl+S`の無視、F2 / F4、`Alt+q`、CSI / SS3を各バイト位置で分割した入力、同一チャンクの`ss`が2回作用すること、`sq`と`qs`、shutdown後のイベント無視、stdinの`end`                                                                                                                                                                                                             |
| 非TTY              | 起動と遷移時だけの行ログ、ANSI・ベル・raw modeなし、パイプ入力の`q`と`\x03`を消費しないこと、シグナル終了、通常時とshutdown中の`EPIPE`                                                                                                                                                                                                                                                            |
| コマンド解決       | macOS / Windowsの固定絶対パス、Windows候補のrealpath、Linuxの絶対PATH探索、空・相対・cwd配下・`node_modules/.bin`・symlink迂回の拒否、起動後に再解決しないこと、`shell`を上書きできないこと、信頼する環境変数とTOCTOUの非保証                                                                                                                                                                     |
| 音・通知           | OS別の引数配列、`spawnTracked`判別共用体とstdioプロファイル、厳密なtitle / body、`osascript`本体とstdinのエラー、`error` / `close`競合、非ゼロ終了、5秒 / 10秒timeoutと1秒後の強制終了要求、Linuxの試行順、volume換算、DISPLAY / WAYLAND_DISPLAYの未定義・空文字列、1バイトのTTYベル、Windows通知なし、macOS表示のbest effort、再生の並行、shutdown時cancel Promiseの即時完了とフォールバック禁止 |
| 終了処理           | 全終了コードとSIGQUIT / SIGBREAK方針、サマリ有無とタイマー完了換算時間、cleanupと同一Promiseの冪等性、単調時計による500 / 1500 / 2000ms絶対期限、変更した端末状態だけの同期復元、shutdown専用stdout / stderrリスナー、後続signal、子の段階終了、kill不能な子の切り離し、2000ms強制終了、shutdown後のspawn禁止                                                                                     |
| 同梱wav            | RIFF / WAVE、little-endianサイズ、chunk境界とpadding、PCM format 1、mono、44100Hz、16bit、blockAlign 2、byteRate 88200、data非空、0.5〜1.5秒、非無音、2音源差、再生成とのバイト一致。RIFFサイズ不一致、8バイト未満header、宣言サイズ超過、奇数chunkのpadding欠落、重複`fmt `、空`data`、audioFormat 3を拒否                                                                                       |
| packライフサイクル | `prepack`が`check`だけを呼び、packageテスト・`npm pack`を呼ばないこと。`verify:package`からのpackが再帰せず1回で完了すること                                                                                                                                                                                                                                                                      |
| tarball            | `npm pack --json`の一覧が厳密に6通常ファイルであること、PAX解決後のpath traversal・重複・link・特殊file拒否、シェバン、外部runtime importなし、metadata / LICENSE、通常インストール、runtime依存ゼロ、インストール後wav検証、異なるcwd                                                                                                                                                            |
| tarballスモーク    | npm execによるbin shimのhelp / version / 不正引数、異なるcwd、直接Nodeでの非TTY起動ログ、ANSIなし、起動後1秒の生存、POSIXのSIGTERM終了、Windowsの直接子cleanup、処理別timeout                                                                                                                                                                                                                     |
| 公開artifact       | pack、各OSスモーク、publishが同一SHA-256のtgzを使うこと。publishが`npm pack`を実行せず、明示したtgzへ`npm publish --ignore-scripts`を実行すること                                                                                                                                                                                                                                                 |

CIはソース品質、tgz生成、tgzスモーク、公開を別ジョブに分ける。

| ジョブ             | ランナー                 | Node.js          | 実行内容                                                                                                                                                                           |
| ------------------ | ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quality-boundary   | macOS / Ubuntu / Windows | `22.18.x`        | `npm ci` → `npm run check`                                                                                                                                                         |
| quality-boundary   | macOS / Ubuntu / Windows | 厳密な`24.11.x`  | `npm ci` → `npm run check`                                                                                                                                                         |
| quality-latest24   | Ubuntu                   | 最新24系         | `npm ci` → `npm run check`                                                                                                                                                         |
| quality-current    | Ubuntu                   | 現行の最新安定版 | `npm ci` → `npm run check`                                                                                                                                                         |
| pack               | Ubuntu                   | `22.18.x`        | `npm ci` → `npm run verify:package -- --output-dir release --tag <dist-tag>` → tgz・manifestをartifactとして保存                                                                   |
| smoke-tgz-boundary | macOS / Ubuntu / Windows | `22.18.x`        | 同一commitをcheckout → artifact取得 → commit / SHA-256照合 → `npm run smoke:package -- <tgz>`                                                                                      |
| smoke-tgz-boundary | macOS / Ubuntu / Windows | 厳密な`24.11.x`  | 同上                                                                                                                                                                               |
| smoke-latest24     | Ubuntu                   | 最新24系         | 同上                                                                                                                                                                               |
| smoke-current      | Ubuntu                   | 現行の最新安定版 | 同上                                                                                                                                                                               |
| publish            | Ubuntu                   | `22.18.x`        | リリースタグ時のみ。全quality / smoke完了後、artifactとSHA-256を照合し、検証済みtgzを明示して`npm publish --ignore-scripts --access public --tag <distTag> <verified-tarball.tgz>` |

Node.js 22.0系のジョブは設けず、実行・開発要件の下限である22.18.xへ統一する。23.xと24.0〜24.10は`engines`の範囲外なのでCIへ含めない。

packジョブだけがtgzを生成する。smokeジョブとpublishジョブはpackジョブと同じcommitをcheckoutして同じCI artifactを取得し、manifestの`gitCommit`とSHA-256が一致することを確認する。smoke用ハーネスはcheckoutした`scripts/smoke-package.mjs`を使うが、後続ジョブでは`npm ci`、ビルド、`npm pack`を実行せず、検証済みtgzを再生成しない。publishジョブはすべてのquality・smokeジョブに依存させ、リリースタグとtgz内のversionが一致しない場合、commitまたはSHA-256が異なる場合は公開しない。

`@types/node`は`22.20.1`に固定するため、Node.js 24以上のランナーでは実行環境より古い型定義でテストする。新しいAPIを使う場合は型が追いつかないことがあるので、その場合は型定義の更新を個別のPRで行う。実行環境と型定義のこのズレは意図的に許容する。

音とデスクトップ通知の実機出力はCIではモックし、リリース候補ごとにmacOS / Linux / Windowsで手動スモークテストする。Windowsでは音のみ、macOS / Linuxでは音と通知を確認する。macOSは対応対象の各OS版で最初の通知試行後にシステム設定の関連する通知元を確認し、`osascript`の終了コードだけでなく通知が実際に表示されたことを目視確認する。

---

## 12. 今後の拡張候補

現バージョンのスコープ外。必要になった時点で検討する。

- 設定ファイル（`~/.config/pomotty/config.json`）による既定値のカスタマイズ
- 作業ログの記録と統計表示
- `npm i -g` 利用者向けのステータスライン連携
- UI言語の切り替え（`--lang` または `LANG` の参照）。バージョン1は日本語固定だが、npmの利用者層を考えると英語が必要になる可能性が高い
- Windowsのデスクトップ通知（WinRTトースト、または`BurntToast`相当の自前実装）
