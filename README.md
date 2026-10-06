# claude-code-bars

Claude Code の mod（function hooks のプラグイン）を集めた marketplace。

```bash
claude plugin marketplace add kesuuyof/claude-code-bars
claude plugin install context-bar@claude-code-bars
claude plugin install usage-bar@claude-code-bars
```

両方を有効にすると、プロンプト上部の帯に context-bar が上、usage-bar が下の順で並ぶ。この順はプラグインの読み込み順によらない。

```
Context 45k / 200k (23%) · auto-compact at 167k
█████████░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒
█ System prompt 3k  █ System tools 12k  █ Messages 30k  ░ Free space 122k  ▒ Autocompact buffer 33k
5h ████████████████████████░░░░░░░░░░░░░░░░ 60% · resets in 3h30m
   ⚠ ahead of pace: 60% used, 30% of the window elapsed
7d ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 18% · resets in 6d0h
```

### バーの長さ

バーの長さは既定で最大 40 セルで、帯が狭いときは帯に収まる長さに縮む。バーが2行に折り返す場合（フォントによっては、ブロック文字 `█░▒` が1セルより広く描かれる）は、各プラグインの `barWidth` 設定を小さくする。`/config` の一覧から変えるか、次のように設定する。

```bash
echo '{"barWidth":"30"}' | claude plugin configure context-bar@claude-code-bars --values-stdin
```

## context-bar

コンテキストウィンドウの使用状況を、`/context` と同じカテゴリと色で1本の積み上げバーにする。

- ヘッダーに「使用トークン / ウィンドウ（使用率）」と auto-compact が走るトークン数
- 使用率が 50% 以上で黄、80% 以上で赤
- `/context-bar` で表示・非表示を切り替える。選択はセッションをまたいで保持される

値は `$.session.usage({ breakdown: 'summary' })` をそのまま使う。`summary` はエンジンがローカルで推定した値で、通信は発生しない。そのため、token-count API で数える `/context` の値とは一致しないことがある。

## usage-bar

プランの使用制限の枠（`$.session.usage().rateLimits` が返すもの。現状は 5 時間枠と週次枠）を、1枠1本のバーにする。

- 各バーに使用率と、枠のリセットまでの残り時間（1分ごとに更新）
- 使用率が 50% 以上で黄、80% 以上で赤
- 使用率が枠の経過率を 20 ポイント以上上回ると、行の下に警告を出す
- `/usage-bar` で表示・非表示を切り替える。選択はセッションをまたいで保持される

- **経過率の求め方**: 枠の長さは API にないため、名前（`five_hour` → 5時間、`seven_day` → 7日）から決める。長さが名前から分からない枠（`spend_limit` など）は、警告の対象外。
- **表示されないとき**: 枠の値は API の応答と一緒に届くため、セッションの最初の応答までは何も表示しない。サブスクリプション以外（API キー）では枠がないので、何も表示しない。

## 開発

各 mod は `plugins/<name>/` に独立して置く。新しい mod は同じ構成で作り、`.claude-plugin/marketplace.json` の `plugins` に1行足す。

```bash
claude plugin validate plugins/usage-bar
claude plugin test plugins/usage-bar
claude --plugin-dir plugins/context-bar --plugin-dir plugins/usage-bar
```

型定義（`.claude-plugin/types/`）は、エンジンが mod を読み込むたびに生成する。一度 `--plugin-dir` で起動した後なら、`tsc -p plugins/<name>` で型チェックできる。

### 共通コード

`hooks/shared.ts`（色の閾値、バーの区画配分）とそのテスト `tests/shared.test.ts` は、各プラグインに同じ内容で置く。プラグインはそれぞれ単独でインストールされ、プラグインのフォルダだけがコピーされるので、ほかのプラグインのファイルを import できないため。片方を直したら、もう片方にもコピーする。

```bash
diff plugins/context-bar/hooks/shared.ts plugins/usage-bar/hooks/shared.ts
```

### 帯の積み重ね

`AbovePrompt` の帯に描けるツリーは1つだけ。各 mod は `next(e)` で下の mod が描いたものを受け取り、自分の行と一緒に返す。context-bar は自分を上に、usage-bar は自分を下に置く。新しい mod を足すときは、どちらに並べたいかで置く側を決める。
