# 営業ロープレツール - GitHub Pages デプロイ手順

他の人に試してもらうための公開手順です。

---

## 前提条件

- GitHub アカウント
- Git がインストールされていること（未インストールの場合は [Git for Windows](https://git-scm.com/download/win) をダウンロード）

---

## 手順1: GitHub にリポジトリを作成

1. [GitHub](https://github.com) にログイン
2. 右上の **「+」** → **「New repository」** をクリック
3. 以下を入力：
   - **Repository name**: `sales-roleplay-tool`（任意の名前でOK）
   - **Description**: 営業ロープレツール（任意）
   - **Public** を選択
   - **「Add a README file」** はチェックしない（既存フォルダを使うため）
4. **「Create repository」** をクリック

---

## 手順2: プロジェクトを Git で管理し、GitHub にプッシュ

### 2-1. ターミナルを開く

1. **エクスプローラー**で「開発」フォルダを開く  
   （`c:\Users\gsp77\OneDrive\デスクトップ\仕事\4_ライフ\OM-ARCHIS\開発`）

2. 次のいずれかの方法でターミナルを開く：
   - フォルダ内の**空白部分を右クリック** → **「ターミナルで開く」** を選択
   - または、アドレスバーに `powershell` と入力して Enter
   - または、PowerShell を別途起動し、`cd "c:\Users\gsp77\OneDrive\デスクトップ\仕事\4_ライフ\OM-ARCHIS\開発"` を実行

3. PowerShell が開き、現在のフォルダが「開発」になっていることを確認する  
   （プロンプトに `開発` やパスが表示されていればOK）

---

### 2-2. リポジトリの URL を確認する

1. GitHub で作成したリポジトリのページを開く
2. 緑色の **「Code」** ボタンをクリック
3. **HTTPS** が選択されていることを確認
4. 表示されている URL をコピー（例: `https://github.com/ユーザー名/リポジトリ名.git`）  
   ※この URL を後で使います

---

### 2-3. コマンドを順番に実行する

PowerShell に、以下のコマンドを**1行ずつ**入力して Enter を押します。

#### ① Git リポジトリを初期化

```
git init
```

→ 「Initialized empty Git repository in ...」と表示されればOK

---

#### ② 全ファイルをステージング（追加）

```
git add .
```

→ 何も表示されなくてもOK（正常です）

---

#### ③ 初回コミット（変更を記録）

```
git commit -m "Initial commit: 営業ロープレツール"
```

→ 「X files changed」「create mode ...」などと表示されればOK

> **エラー**: `Author identity unknown` と出た場合  
> 初回は Git に名前とメールを登録する必要があります。以下を実行してください：
> ```
> git config --global user.name "あなたの名前"
> git config --global user.email "GitHubに登録したメールアドレス"
> ```
> その後、もう一度 `git add .` と `git commit` を実行

---

#### ④ ブランチ名を main に設定

```
git branch -M main
```

→ 何も表示されなくてもOK

---

#### ⑤ GitHub のリポジトリを紐づける

**ここで 2-2 でコピーした URL を使います。**

```
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git
```

例：リポジトリ名が `sales-roleplay-tool` で、ユーザー名が `tanaka` の場合：
```
git remote add origin https://github.com/tanaka/sales-roleplay-tool.git
```

→ 何も表示されなくてもOK

> **エラー**: `remote origin already exists` と出た場合  
> 既に紐づけ済みです。次のステップに進んでください。

---

#### ⑥ GitHub にプッシュ（アップロード）

```
git push -u origin main
```

→ **認証が求められる場合**があります。

**認証が求められた場合：**
- **ブラウザが開く場合**：GitHub にログインして「Authorize」を許可すればOK
- **ユーザー名・パスワードを入力する場合**：GitHub のパスワードは使えません。**Personal Access Token** を代わりに入力（作成方法は文書末尾を参照）

→ 「Enumerating objects...」「Writing objects: 100%」と表示され、最後に `branch 'main' -> 'main'` と出れば成功です。

---

## 手順3: GitHub Pages を有効化

1. **GitHub のリポジトリページ**を開く（プッシュしたリポジトリ）

2. 上部タブの **「Settings」** をクリック

3. 左側メニューで **「Pages」** をクリック  
   （「Code and automation」の下にあります）

4. **「Build and deployment」** の項目で：
   - **Source**：`Deploy from a branch` を選択（ドロップダウンから）
   - **Branch**：`main` を選択
   - **Folder**：`/ (root)` を選択

5. **「Save」** ボタンをクリック

6. 画面上部にオレンジ色のメッセージ「GitHub Pages source saved.」と表示されればOK

---

## 手順4: 公開 URL を確認

1. **1〜2分ほど待つ**（初回デプロイに時間がかかります）

2. 手順3の **Pages** 画面を再読み込み（F5）する

3. 上部に緑色のメッセージが表示されます：
   ```
   Your site is live at https://あなたのユーザー名.github.io/リポジトリ名/
   ```

4. その URL をクリックして、営業ロープレツールが表示されるか確認する

5. この URL を他の人に共有すれば、誰でもアクセスできます

---

## 更新したときの再デプロイ

コードを変更したら、以下で再プッシュすると自動的に反映されます。

```powershell
git add .
git commit -m "更新内容の説明"
git push
```

---

## 共有する人への案内文（コピー用）

```
営業ロープレツールを試してみてください。

URL: https://あなたのユーザー名.github.io/sales-roleplay-tool/

【使い方】
1. シナリオを選んで「開始」をクリック
2. 音声モードONのまま、相手の話の後にマイクに向かって話す
3. 終了後、履歴タブで録音を再生できます

※ シナリオ生成機能を使う場合は、各自の OpenAI API キーを入力してください。
※ マイクの使用許可を求められたら「許可」を選択してください。
```

---

## 認証エラーが出た場合（Personal Access Token の作成）

`git push` でパスワードを求められ、GitHub のパスワードを入力しても「認証に失敗しました」となる場合、**Personal Access Token（PAT）** を使います。

### トークンの作成手順

1. GitHub にログインした状態で、右上の**プロフィールアイコン**をクリック
2. **「Settings」** をクリック
3. 左メニュー最下部の **「Developer settings」** をクリック
4. **「Personal access tokens」** → **「Tokens (classic)」** をクリック
5. **「Generate new token」** → **「Generate new token (classic)」** をクリック
6. **Note** に「ロープレツール用」など任意の名前を入力
7. **Expiration** で有効期限を選択（90日や1年など）
8. **Select scopes** で **`repo`** にチェックを入れる
9. **「Generate token」** をクリック
10. 表示されたトークン（`ghp_` で始まる文字列）を**必ずコピーして安全な場所に保存**
    - この画面を閉じると二度と表示されません

### トークンの使い方

`git push` を実行し、パスワードを求められたら：
- **ユーザー名**：GitHub のユーザー名を入力
- **パスワード**：先ほどコピーしたトークンを貼り付け

---

## トラブルシューティング

| 現象 | 対処 |
|------|------|
| 404 が表示される | 数分待つ。Settings → Pages で Source が `main` / `/ (root)` になっているか確認 |
| マイクが使えない | HTTPS でアクセスしているか確認（GitHub Pages は自動で HTTPS） |
| プッシュ時に認証エラー | 上記「認証エラーが出た場合」を参照し、Personal Access Token を使用 |
| `git` コマンドが認識されない | [Git for Windows](https://git-scm.com/download/win) をインストールし、PC を再起動 |
