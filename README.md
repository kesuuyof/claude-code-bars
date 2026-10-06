# claude-code-bars

Claude Code の mod（function hooks のプラグイン）を集めた marketplace。

```bash
claude plugin marketplace add kesuuyof/claude-code-bars
claude plugin install context-bar@claude-code-bars
```

## context-bar

プロンプト上部の帯に、コンテキストウィンドウの使用状況を1本の積み上げバーで表示する。

```
Context 45k / 200k (23%) · auto-compact at 167k
██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒
█ System prompt 3k  █ System tools 12k  █ Messages 30k  ░ Free space 122k  ▒ Autocompact buffer 33k
```

- カテゴリと色は `/context` と同じ（`$.session.usage({ breakdown: 'summary' })` の値をそのまま使う）
- 使用率が 50% 以上で黄、80% 以上で赤
- `/context-bar` で表示・非表示を切り替える。選択はセッションをまたいで保持される
- 他の mod が同じ帯に描いたものは、このバーの下に縦に並ぶ

`summary` はエンジンがローカルで推定した値で、通信は発生しない。そのため、token-count API で数える `/context` の値とは一致しないことがある。

## 開発

各 mod は `plugins/<name>/` に独立して置く。新しい mod は同じ構成で作り、`.claude-plugin/marketplace.json` の `plugins` に1行足す。

```bash
claude plugin validate plugins/context-bar
claude plugin test plugins/context-bar
claude --plugin-dir plugins/context-bar
```

型定義（`.claude-plugin/types/`）は、エンジンが mod を読み込むたびに生成する。一度 `--plugin-dir` で起動した後なら、`tsc -p plugins/context-bar` で型チェックできる。
