# Bodymakers 作業ルール

- 作業対象は、作業開始時に確認した正しいBodymakers working copyだけに限定する。固定のOSパスを永続ルールにしない。
- 必要なファイルだけを読み、無意味なリポジトリ全体再解析をしない。既存機能・URL・localStorage互換を壊さない。
- Windows、OS、PATH、レジストリ、グローバル環境、既存の認証・Cloudflare構成を勝手に変更しない。
- 実装後は `git diff --check`、`npm test`、`npm run build`、`npm run check:links` を実行し、実際のexit codeを確認する。コード問題は最大3回まで自己修正する。
- 検証成功後はmainへpushする。pushだけで完了扱いにせず、既存Cloudflare Worker `bodymakers` への本番deployと公開URL確認まで行う。
- 新しいWorkerやPages projectを作らず、完了後に勝手に次の機能を開始しない。
