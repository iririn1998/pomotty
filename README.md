# pomotty

`pnpm start`で作業開始の選択メニューを表示します。上下キーで`OK`を選んで
Enterを押すと25分の作業と5分の休憩を1セット実行し、`NG`を選ぶとタイマーを
開始せず終了します。

```shell
pnpm start
```

作業と休憩の完了時には、それぞれ異なる通知音を再生します。macOSでは
`afplay`、Linuxでは`paplay`または`aplay`、WindowsではPowerShellを利用し、
再生できない環境では異なる回数のターミナルベルに切り替わります。
