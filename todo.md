# pomotty TODO

`spec.md` のバージョン1を実装・検証・公開するためのTODO。上から依存関係順に進める。各機能は `test/unit/` に失敗するテストを先に追加してから実装する。

## 現状

- [x] CLI仕様が `spec.md` に定義されている
- [ ] 実装、テスト、音源、ビルド、パッケージ検証、CI、公開用メタデータを整備する
- [ ] npm公開に必要な所有者情報とライセンスを決定する

## 0. 公開前に決める事項

- [ ] SPDXライセンスを選び、`package.json` の `license` と正規テンプレートの `LICENSE` を一致させる
- [ ] `repository` URLと`author`の正式な値を決める
- [ ] 公開直前にnpm registryで `pomotty` というパッケージ名が利用可能か再確認する
- [ ] Unicode 15.1.0固定の書記素分割・East Asian Width・Emojiデータの実装方法を決め、ランタイム依存ゼロとライセンス条件を満たす

## 1. プロジェクト基盤

- [ ] パッケージ管理を仕様どおりnpmへ統一する
  - [ ] `pnpm-lock.yaml` から `package-lock.json` へ移行し、CIとリリースで `npm ci` を使う
  - [ ] 既存のlint・format・Probity設定を、npmスクリプトから実行できる状態にする
- [ ] `package.json` を公開仕様へ更新する
  - [ ] `description`、`keywords`、`bin`、`files`、`engines`、`publishConfig`を設定する
  - [ ] Node.js要件を `^22.18.0 || >=24.11.0` に統一する
  - [ ] `dependencies`を空に保ち、`postinstall`、`prepare`、`prepublishOnly`を定義しない
  - [ ] `@types/node@22.20.1`、`tsdown@0.22.14`、`typescript@7.0.2`を固定する
  - [ ] `build`、`typecheck`、`test:unit`、`test:package`、`verify:wav`、`check`、`prepack`、`verify:package`、`smoke:package`を定義する
- [ ] `tsconfig.json` をNodeNext・strict・noEmit・`.ts` import対応で追加する
- [ ] `tsdown.config.ts` を追加し、`src/cli.ts` をNode 22向けESMの `dist/cli.js` 1ファイルへバンドルする
  - [ ] シェバンはtsdownのbannerだけで付与する
  - [ ] hash、型定義、source mapを無効にする
  - [ ] Node.jsの型削除実行に非対応のTypeScript構文を使わない
- [ ] `src/`、`test/unit/`、`test/package/`、`assets/`、`scripts/` の構成を作る

## 2. Unicodeと入力値の安全性

- [ ] `src/unicode.ts` にUnicode 15.1.0固定の拡張書記素クラスタ分割を実装する
- [ ] クラスタ単位の表示セル幅を実装する
  - [ ] Default Ignorableのみは0、VS15は1、RGI絵文字・VS16・keycapは2、EAW W/Fは2、残りは1セルとする
  - [ ] EAW Ambiguousはロケールによらず1セルとする
  - [ ] ANSI列を幅計算へ混ぜない
- [ ] セル幅上限に合わせた書記素単位の省略を実装する
  - [ ] `…` の1セルを先に確保し、クラスタ途中で切らない
  - [ ] 上限1セルでは `…` だけを返す
- [ ] `sanitizeTask()` を規定順序で実装する
  - [ ] well-formed化 → 制御・bidi・不可視文字を空白へ置換 → trim → 完全な書記素のまま120コードポイント以下へ切詰め → trim
  - [ ] NFC等のUnicode正規化を行わず、ZWNJとZWJを保持する
  - [ ] 正規化後の空文字を「タスク指定なし」として扱う
- [ ] `escapeDiagnostic()` を実装する
  - [ ] 入力を160コードポイントで制限し、超過時は `…` を付ける
  - [ ] バックスラッシュ、引用符、C0/C1、bidi・不可視文字、未対応サロゲートを規定形式でエスケープする
  - [ ] ユーザー由来のargv、パス、例外文字列を未加工で診断へ出さない
- [ ] Unicode幅、書記素省略、タスク正規化、診断エスケープの境界・攻撃文字列テストを追加する

## 3. CLI引数と起動前検証

- [ ] `src/cli.ts` にサブコマンドなしの引数パーサを実装する
  - [ ] `--work`、`--break`、`--long-break`、`--cycles`、`--task`、`--no-sound`、`--no-notify`、`--sound-work`、`--sound-break`、`--volume`を実装する
  - [ ] 値付きlong optionで分離形式と `--key=value` を受理する
  - [ ] `-` 始まりの値は `=` 形式だけで値として扱う
  - [ ] `-h` / `--help` と `-v` / `--version` だけを短縮形として認める
  - [ ] 位置引数、結合短縮形、未知option、単独の `--`、値不足、重複optionを終了コード2で拒否する
- [ ] helpを完全トークンの先行走査で最優先し、helpがなければversionを優先する
  - [ ] `--task=-h` の値部分は先行判定しない
  - [ ] `-- --help` と `-- --version` は情報表示を優先する
  - [ ] 優先経路では他の引数や重複を検証せず、タイマーを初期化しない
- [ ] 数値を仕様の正規表現と範囲で厳密に検証する
  - [ ] 時間は1〜1440、cyclesは1〜100、volumeは0〜1かつ小数6桁以下とする
  - [ ] trim、先行符号・ゼロ、指数表記、16進、全角数字、規定外小数を受理しない
- [ ] 音源pathを起動時cwd基準で一度だけ絶対pathへ解決・検証する
  - [ ] 読み取り可能な通常ファイルかつ大文字小文字を問わず `.wav` であることを確認する
  - [ ] `--no-sound` 時も指定された音源とvolumeを検証する
  - [ ] 同梱音源は `import.meta.url` 基準で解決する
- [ ] 規範どおりのhelp文字列と `pomotty <version>\n` をstdoutへ厳密に出力する
  - [ ] versionは同梱 `package.json` から読み、失敗時は内部エラーにする
  - [ ] 最初のstdout書込み前にerror listenerを登録し、EPIPEは0、それ以外は1で終了する
  - [ ] help / versionではANSI、サマリ、診断を出さない
- [ ] 不正入力を `escapeDiagnostic()` 済みの2行診断1回と終了コード2へ集約する
  - [ ] stderrの同期throw・errorでも終了コード2を維持する
  - [ ] 引数検証完了前にraw mode、timer、音、通知を初期化しない
- [ ] 既定値、全境界、不正表記、重複、優先順位、path検証、stdout/stderr失敗を単体テストする

## 4. 状態機械と絶対時刻タイマー

- [ ] `src/timer.ts` に `work` / `break` / `long_break` の状態と不変条件を実装する
- [ ] 自然終了とskipを別の遷移として実装する
  - [ ] WORK自然終了だけ `completedPomodoros` と `completedInBlock` を増やす
  - [ ] `completedInBlock === cycles` でLONG_BREAKへ入る
  - [ ] LONG_BREAK終了・skip時にblock進捗を0へ戻す
  - [ ] skipでは音・通知を発生させず、遷移先を全時間・実行状態で開始する
- [ ] `endsAt` を真実の情報源にし、250ms intervalは更新契機としてだけ使う
- [ ] `settleExpiredPhase(now)` を期限到達確定の唯一の入口として実装する
  - [ ] `now >= endsAt` で現在フェーズを1回だけ精算する
  - [ ] 遷移先の期限を渡された `now + duration` とし、処理中に時刻を再取得しない
  - [ ] 長時間遅延後もcatch-upせず、1フェーズだけ進める
- [ ] 同期区間だけを守る `transitioning` guardを実装し、例外時も `finally` で解除する
- [ ] 一時停止・再開を `remainingMs` と同一キーイベントの `now` で実装する
- [ ] 手動操作ごとに時刻を1回取得し、期限精算後に同じ操作を新フェーズへ適用する
  - [ ] `now === endsAt` ではspace / skip / quitより自然終了を優先する
  - [ ] OS signal、出力・stdin error、内部エラーでは期限精算しない
- [ ] 起動時刻を初回表示直前に1回取得し、初期WORKを音・通知なしで開始する
- [ ] 偽時計で全遷移、cycles=1、pause、skip、tick遅延、sleep、時計変更、配送順、再入、例外解除を単体テストする

## 5. 表示と非TTYログ

- [ ] 起動時にinteractive判定を1回行う
  - [ ] stdin/stdoutがTTYかつ `TERM !== 'dumb'` の場合だけinteractiveにする
  - [ ] 空でない `NO_COLOR` では色だけを無効にする
- [ ] 残り時間を `ceil(ms / 1000)` で `M:SS` / `H:MM:SS` に整形する
- [ ] 経過率、30セルbar、サイクル進捗、pause表示を実装する
  - [ ] 60列以上は標準、30〜59列はcompact、29列以下はminimalにする
  - [ ] 標準かつcycles≤12だけ `●○`、それ以外は数値形式にする
  - [ ] タスクと全物理行を `max(1, columns - 1)` セル以内へ省略する
  - [ ] 色は規定部分だけSGR 31/32で着色し、各部分直後にSGR 39で戻す
- [ ] `node:readline` でインライン描画を実装する
  - [ ] 初回はそのまま描画し、以後は旧フレームの各行だけを移動・消去する
  - [ ] 最終行を含む全行へ改行を1個付け、カーソルを次行の列0に置く
  - [ ] 論理フレームと色状態が同一ならstdoutへ書かない
  - [ ] resize時は旧フレームを上移動・消去せず、新フレームを追記して以後それだけを追跡する
  - [ ] 代替画面と画面末尾全消去を使わない
- [ ] raw modeとcursorの変更状態を個別に追跡し、同期的な `restoreTerminalSync()` を実装する
  - [ ] interactive初期化時だけ `process.on('exit', ...)` を1回登録する
  - [ ] 同期復元にはstdout fdへの同期writerを使い、冪等かつbest effortにする
  - [ ] 非TTYではANSIを一切出さない
- [ ] 非TTYでは起動時とフェーズ遷移時だけ行単位ログを出す
  - [ ] ローカル時刻、フェーズ、時間、正規化済みtaskのJSON suffixを規定形式にする
  - [ ] stdinを監視せず、ANSI・色・cursor操作・bell・raw modeを無効にする
  - [ ] stdout EPIPEはサマリなしの0、それ以外のstdout errorは1とする
- [ ] 3レイアウト、境界幅、時間境界、Unicode幅、省略、差分描画、resize、色、非TTYログを単体テストする

## 6. キー入力

- [ ] `src/input.ts` に64バイト・500ms上限を持つincremental key decoderを実装する
  - [ ] UTF-8、CSI、SS3、Meta keyをchunk境界越しに復号する
  - [ ] 未完sequenceは上限・timeout・stdin endで全体を破棄し、内部byteを通常keyとして再解釈しない
  - [ ] cleanup可能な `dispose()` とtimer解除を実装する
- [ ] 規定の順序でinteractive stdinを初期化する
  - [ ] 元のraw / flowing状態を記録後、同期終了保険、raw mode、decoder接続、必要時resumeの順にする
  - [ ] アプリが変更したraw / flowing状態だけをcleanupで戻す
- [ ] 復号済みkeyの `name` / `ctrl` / `meta` / `shift` だけで操作を判定する
  - [ ] space、s/S、q/Q、Ctrl+Cを受理する
  - [ ] Ctrl+S、Alt+q、function key、矢印、mouse、`Ctrl+D` / `Ctrl+Z` / `Ctrl+\` を無視する
  - [ ] key repeatや同一chunk内の複数操作を間引かず、shutdown後だけ無視する
- [ ] stdin error / endを規定のshutdown理由へ集約する
- [ ] split sequence、timeout、64バイト、複数key、順序、修飾key、stdin end/errorを単体テストする

## 7. 安全なOSコマンド解決

- [ ] `src/platform.ts` に起動時1回だけの実行file解決を実装する
  - [ ] macOSは `/usr/bin/afplay` と `/usr/bin/osascript` だけを検証する
  - [ ] Windowsは絶対 `SystemRoot` と固定PowerShell候補をrealpathし、cwd・`node_modules/.bin`配下を拒否する
  - [ ] Linuxは絶対PATH要素だけをNode.js内で探索し、空・相対・cwd配下・`node_modules/.bin`・symlink迂回を拒否する
  - [ ] LinuxのPATH未設定時だけ `/usr/local/bin`、`/usr/bin`、`/bin` を探索する
  - [ ] 実行可能な通常fileのrealpathだけを保持し、起動後に再解決しない
- [ ] Linuxのdesktop session有無を起動時に1回判定する
  - [ ] `DISPLAY` と `WAYLAND_DISPLAY` が両方undefinedまたは空なら通知を成功扱いでskipする
- [ ] 解決規則、悪意あるPATH、symlink、cwd変更、Windows候補を単体テストする

## 8. 音・デスクトップ通知

- [ ] `src/notify.ts` に `Operation` と `activeOperations` / `activeChildren` の追跡を実装する
  - [ ] 結果を `success` / `failure` / `cancelled` に分け、cancelをfailure fallbackへ流さない
  - [ ] cancel callbackでPromiseを子のclose待ちなしに確定する
- [ ] 絶対command pathと固定stdio profileだけを受ける `spawnTracked()` を実装する
  - [ ] `shell: false`、`windowsHide: true`を内部固定し、生のshell・stdio optionを公開しない
  - [ ] spawn直後のcancel競合では子を追跡・killし、呼出元へ公開しない
  - [ ] childのerror / closeを安全に一度だけ処理する
- [ ] OS別の非同期音再生を実装する
  - [ ] macOS: `afplay -v <volume> <absolute-file>`
  - [ ] Linux: `paplay --volume=<0..65536> <file>` → `aplay <file>`
  - [ ] Windows: 固定PowerShell scriptへ音源pathを環境変数で渡す
  - [ ] 各試行を10秒でtimeoutし、1秒後に強制終了を1回試す
  - [ ] 同時再生要求は前の再生を止めず並行させる
  - [ ] 全候補失敗時だけinteractiveかつstderr TTYへ1byteのbellを出す
  - [ ] `--no-sound` とshutdown中は再生もbellも行わない
- [ ] 自然終了時だけmacOS / Linuxの通知を音と並行して開始する
  - [ ] titleを `pomotty` または `pomotty — <sanitized task>` とする
  - [ ] WORK終了bodyへ実際の次休憩分数、休憩終了bodyへ固定文言を使う
  - [ ] taskをbodyへ入れず、skip・Windows・`--no-notify`・shutdown中は起動しない
  - [ ] Linuxは `notify-send -- <title> <body>` を使う
  - [ ] macOSは固定AppleScriptを `osascript - <title> <body>` のstdinへ渡し、stdin errorも追跡する
  - [ ] 通知を5秒でtimeoutし、1秒後に強制終了を1回試す。通知のfallbackは設けない
- [ ] error/close競合、timeout、fallback順、volume、引数注入防止、通知文、並行再生、cancel競合を単体テストする

## 9. 終了処理

- [ ] `src/shutdown.ts` に全終了経路を集約する同期開始型 `requestShutdown()` を実装する
  - [ ] 最初の呼出しで理由・code・summary・diagnosticと同一 `shutdownPromise` を固定する
  - [ ] 2回目以降は同一Promiseを返し、cleanupを重複実行しない
  - [ ] Promiseはrejectせず、cleanupと段階timer登録完了時にresolveする
- [ ] shutdownを仕様の順序で実行する
  - [ ] `shuttingDown` と単調時計基準の2000ms期限を最初に固定する
  - [ ] operation cancel → 通常timer/listener解除 → frame消去・端末復元 → summary → diagnostic → stdin復元 → exitCode → child終了要求の順にする
  - [ ] 各同期cleanupを個別にbest effortで実行する
- [ ] 子プロセスをshutdown開始から0ms kill、500ms SIGKILL、1500ms pipe破棄・unref、2000ms親強制終了の絶対期限で処理する
  - [ ] cleanup時間で期限を後ろ倒しにしない
  - [ ] close時だけ追跡集合から除き、全child終了時は段階timerを解除する
- [ ] stdout / stderr error処理を通常時とshutdown時で安全に切り替える
  - [ ] shutdown専用listenerを通常listener解除前に登録し、再帰shutdownとcode変更を防ぐ
  - [ ] `drain` やwrite callbackを待たない
- [ ] q、Ctrl+C、各OS signal、stdin end/error、stdout EPIPE/error、fatal errorを規定のcodeとsummary有無へ対応させる
  - [ ] 対応OSに存在するsignal handlerだけを登録する
  - [ ] `uncaughtException` / `unhandledRejection` は安全に文字列化・escapeし、端末復元後に1行だけ診断する
  - [ ] 捕捉不能なSIGKILL / SIGSTOPは保証対象外とする
- [ ] 終了サマリと「タイマー完了換算時間」の0分・分・時間・時間分形式を実装する
- [ ] 全終了code、冪等性、cleanup順、出力error、signal、fatal、段階期限、kill不能child、同期端末復元を偽clockで単体テストする

## 10. CLI統合

- [ ] 引数検証 → platform解決 → 表示mode決定 → interactive初期化 → 初期state → 初回表示の順で組み立てる
- [ ] tick、手動操作、phase遷移、音・通知、描画、shutdownを依存注入可能な境界で接続する
- [ ] stdout / stderr / stdin、clock、timer、spawn、TTY、columns、process exitをテストで差し替え可能にする
- [ ] タイマーを終了操作まで無期限に繰り返し、cyclesを総実行回数として扱わない
- [ ] 起動失敗時も、変更済みの端末状態とlistenerを確実にcleanupする

## 11. 同梱wav

- [ ] `scripts/generate-sounds.mjs --output-dir <dir>` を `node:fs` だけで実装する
  - [ ] 44.1kHz・16bit・mono・PCM RIFF WAVEを決定的に生成する
  - [ ] work終了音は低め、break終了音は高めの異なる2音とし、両端にfadeを付ける
  - [ ] 各音を0.5〜1.5秒にする
- [ ] `assets/work-end.wav` と `assets/break-end.wav` を生成してcommit対象にする
- [ ] `scripts/verify-wav.mjs` にRIFF chunk parserと完全検証を実装する
  - [ ] RIFF/WAVE size、chunk境界・padding、一意な `fmt ` / `data`、PCM formatを検証する
  - [ ] mono、44100Hz、16bit、blockAlign 2、byteRate 88200、長さ、非無音、2音の差を検証する
  - [ ] temp出力への再生成とcommit済みfileのbyte一致を検証する
  - [ ] 壊れたsize/chunk、重複fmt、空data、float format等の拒否testを追加する
- [ ] 生成scriptをnpm公開物から除外し、生成済みwavだけを含める

## 12. 単体・コンポーネントテスト完備

- [ ] Node.js標準 `node:test` だけをtest runnerに使う
- [ ] `test/unit/**/*.test.ts` と `test/package/**/*.test.ts` の探索を厳密に分離する
- [ ] 単体テストでは実時間を待たず、偽時計・偽timer・偽stream・偽child processを使う
- [ ] `spec.md` §2〜§9の受け入れ条件と§11の必須検証を、対応するtest名から追跡できるようにする
- [ ] `prepack → check` が単体テストだけを実行し、package testや `npm pack` へ再帰しないことを固定testにする
- [ ] `npm run typecheck`、`npm run build`、`npm run test:unit`、`npm run verify:wav` を通す
- [ ] lintとformat checkを通す

## 13. tarball検証とスモーク

- [ ] `scripts/verify-package.mjs` を実装する
  - [ ] 空の出力dirに `npm pack --json` をちょうど1回実行する
  - [ ] `npm_execpath` の絶対fileを `process.execPath` 経由で起動し、裸のnpm commandをspawnしない
  - [ ] PAX / GNU long-name解決後のtar entryを検査し、path traversal、重複、link、特殊fileを拒否する
  - [ ] tarballの通常fileを package.json、README、LICENSE、dist/cli.js、2 wavの厳密な6個に限定する
  - [ ] metadata、LICENSE、シェバン、runtime import、runtime依存ゼロ、install後wav、別cwdでのasset解決を検証する
  - [ ] `npm publish --dry-run --ignore-scripts` を明示tgzに対して検証する
  - [ ] tgzのSHA-256、artifactFile、package/version、git commit、dist tag、Node/npm versionのmanifestを出力する
  - [ ] 途中失敗時は成功manifestを残さない
- [ ] `test/package/` にtarball構成、installed package、同梱wavのtestを追加する
  - [ ] `POMOTTY_TARBALL` が未設定・相対・不存在・非tgzならskipせず失敗する
- [ ] `scripts/smoke-package.mjs <absolute-tgz>` を実装する
  - [ ] repository外のtemp projectへoffline・ignore-scriptsでinstallする
  - [ ] npm execのbin shim経由でversion、help、不正引数を厳密に検証する
  - [ ] 直接Node起動で非TTY開始log、ANSIなし、1秒生存を検証する
  - [ ] POSIXではSIGTERM・code 143・summary 1回、Windowsでは直接childのcleanupを検証する
  - [ ] install 60秒、短命CLI 15秒、log待ち5秒、生存1秒、全体90秒の上限を設け、失敗時もchild close後にcleanupする
- [ ] `verify:package` が生成した同一tgzへ `test:package` と `smoke:package` を実行し、再packしない

## 14. READMEと利用者向け文書

- [ ] READMEへ概要、`npx pomotty`、全主要optionと使用例を記載する
- [ ] Node.js要件 `^22.18.0 || >=24.11.0` とOS別機能表を記載する
- [ ] Windowsは音のみ、Linux通知は環境依存、macOS通知はbest effortであることを記載する
- [ ] volumeがafplay/paplayだけで有効で、aplay/Windowsでは無視されることを記載する
- [ ] Windowsの差替え音源は非圧縮PCM RIFF WAVEが必要で、内容検証は起動時に行わないことを記載する
- [ ] 「タイマー完了換算時間」が自然終了WORKの設定時間合計であり、実作業時間や日次統計ではないことを記載する
- [ ] 選択したライセンスを記載する

## 15. CI・リリース

- [ ] quality、pack、tgz smoke、publishを別jobにしたCI workflowを追加する
- [ ] quality matrixをmacOS / Ubuntu / WindowsのNode 22.18.x・24.11.x境界で実行する
- [ ] Ubuntuでlatest 24系とcurrent stableのquality jobを実行する
- [ ] pack jobだけがNode 22.18.xでtgzとmanifestを生成・保存する
- [ ] 全smoke jobが同一commit・同一SHA-256のartifactを再生成せず検証する
- [ ] publish jobを全quality / smoke成功後のrelease tag時だけ実行する
  - [ ] tag、tgz内version、git commit、SHA-256、package名、license、repository、dist tagを照合する
  - [ ] `npm publish --ignore-scripts --access public --tag <distTag> <verified-tarball.tgz>` だけを使う
  - [ ] publish jobで `npm pack` や引数なし `npm publish` を実行しない
- [ ] release candidateごとにmacOS / Linux / Windowsで実機音声を確認する
  - [ ] macOS / Linuxは通知も目視確認し、macOSは通知設定上の関連通知元も確認する
  - [ ] Windowsは音のみで通知processが起動しないことを確認する

## スコープ外（バージョン1では実装しない）

- 設定fileによる既定値のcustomize
- 作業logの永続化と統計
- global install向けstatus line連携
- UI言語切替
- Windows desktop通知
