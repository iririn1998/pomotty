# pomotty

`pnpm start`で作業開始の選択メニューを表示します。上下キーで`OK`を選んで
Enterを押すと15分の作業と5分の休憩を3セット実行し、`NG`を選ぶとタイマーを
開始せず終了します。

```shell
pnpm start
```

作業時間と休憩時間は、1〜1440の整数（分）で指定できます。片方だけを指定した
場合、もう片方には既定値が使われます。

```shell
pnpm start --work 30 --break 10
pnpm start --work=45 --break=15
```

`--roop`で作業・休憩の繰り返し回数を指定できます。既定値は3で、1以上の整数
（最大9007199254740991）を受け付けます。開始確認は最初の1回だけで、最後の休憩が
完了すると終了します。

```shell
pnpm start --roop 5
pnpm start --work=25 --break=5 --roop=2
```

利用可能なオプションは、次のコマンドで確認できます。

```shell
pnpm start --help
```

作業と休憩の完了時には、それぞれ異なる通知音を再生します。macOSでは
`afplay`、Linuxでは`paplay`または`aplay`、WindowsではPowerShellを利用し、
再生できない環境では異なる回数のターミナルベルに切り替わります。
