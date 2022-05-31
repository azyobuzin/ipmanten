// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { debounce, Observable, map, distinctUntilChanged } from "rxjs";
import ExceptionTerminalLinkProvider from "./ExceptionTerminalLinkProvider";

const LOGGING_DIR = "_ipmanten";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const outputChan =
    vscode.window.createOutputChannel("インターネットプログラミング");
  outputChan.appendLine("[info] プラグイン起動");

  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(
      new ExceptionTerminalLinkProvider()
    )
  );

  // ファイルが保存されたらバックアップを取る
  context.subscriptions.push(
    subscribe(
      vscodeEventToObservable(vscode.workspace.onDidSaveTextDocument).pipe(
        debounce(async () => {
          const workspacePath = getWorkspacePath(outputChan);
          if (workspacePath == null) {
            return;
          }

          // *.java を探して tar に固める
          await new Promise<void>((resolve) => {
            exec(
              `mkdir -p ${LOGGING_DIR}; find . -name '*.java' -print0 | xargs -0 tar -cf "${LOGGING_DIR}/backup-$(date '+%Y%m%d-%H%M%S').tar"`,
              {
                cwd: workspacePath,
              },
              (error, _stdout, stderr) => {
                if (error) {
                  outputChan.appendLine(
                    `[error] Failed to backup (${error}): ${stderr}`
                  );
                } else {
                  outputChan.appendLine("[info] Succeeded to backup");
                }
                resolve();
              }
            );
          });

          // 1秒間は次の保存をさせない
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        })
      )
    )
  );

  // 問題が変更されたら
  context.subscriptions.push(
    subscribe(
      vscodeEventToObservable(vscode.languages.onDidChangeDiagnostics).pipe(
        map(() => {
          // 問題リストをJSON化
          // 問題のないファイルについては除外する
          const diagnostics = vscode.languages
            .getDiagnostics()
            .filter((x) => x[1].length > 0);
          return JSON.stringify(diagnostics);
        }),
        // 大量にイベントが発生するので、本当に変更があったときだけ保存
        distinctUntilChanged(),
        debounce(async (payload) => {
          const workspacePath = getWorkspacePath(outputChan);
          if (workspacePath == null) {
            return;
          }

          const now = new Date();
          let timestamp =
            now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, "0") +
            now.getDate().toString().padStart(2, "0") +
            "-" +
            now.getHours().toString().padStart(2, "0") +
            now.getMinutes().toString().padStart(2, "0") +
            now.getSeconds().toString().padStart(2, "0");

          try {
            await fs.mkdir(path.join(workspacePath, LOGGING_DIR), {
              recursive: true,
            });
            await fs.writeFile(
              path.join(
                workspacePath,
                LOGGING_DIR,
                `diagnostics-${timestamp}.json`
              ),
              payload
            );
            outputChan.appendLine("[info] Wrote diagnostics");
          } catch (e) {
            outputChan.appendLine(`[error] Failed to write diagnostics: ${e}`);
          } finally {
            // 5秒間は次の保存をさせない
            await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          }
        })
      )
    )
  );

  let disposable = vscode.commands.registerCommand(
    "extension-practice.csv-preview",
    async () => {
      // ドキュメントのCSV形式をHTMLのテーブルに変換する
      // const activeDocument = vscode.window.activeTextEditor?.document;
      // if (!activeDocument) return;
      // const table = convertCsvToHtmlTable(CSV);

      const workspacePath = getWorkspacePath(outputChan);
      if (workspacePath == null) {
        return;
      }

      const scoreFilePath = path.join(workspacePath, "ip_score.csv");
      let CSV: string;
      try {
        CSV = await fs.readFile(path.join(workspacePath, "ip_score.csv"), {
          encoding: "utf8",
        });
      } catch (err) {
        console.log(err);
        // ip_score.csvにアクセスできないので何もしない
        return;
      }

      // webviewを生成する
      const panel = vscode.window.createWebviewPanel(
        "csvPreview",
        "CSV Preview",
        vscode.ViewColumn.Two
      );

      // cssのパスを生成する。
      // 拡張機能からローカルリソースのアクセスは直接できないため、一手間かかる。
      // 下記参照のこと。
      // https://code.visualstudio.com/api/extension-guides/webview#loading-local-content
      const onDiskPath = vscode.Uri.file(
        path.join(context.extensionPath, "media", "csv-preview.css")
      );
      const cssUri = panel.webview.asWebviewUri(onDiskPath);

      // 画像のパスを生成する。
      const onDiskPathG = vscode.Uri.file(
        path.join(context.extensionPath, "media", "medal_medal.png")
      );
      const picG = panel.webview.asWebviewUri(onDiskPathG);

      const onDiskPathS = vscode.Uri.file(
        path.join(context.extensionPath, "media", "medal_silver.png")
      );
      const picS = panel.webview.asWebviewUri(onDiskPathS);

      const onDiskPathB = vscode.Uri.file(
        path.join(context.extensionPath, "media", "medal_bronze.png")
      );
      const picB = panel.webview.asWebviewUri(onDiskPathB);

      const medalImages: Record<string, string> = {
        G: "medal_medal.png",
        S: "medal_silver.png",
        B: "medal_bronze.png",
      };
      const medalUris: Record<string, vscode.Uri> = {};
      for (let color in medalImages) {
        medalUris[color] = panel.webview.asWebviewUri(
          vscode.Uri.file(
            path.join(context.extensionPath, "media", medalImages[color])
          )
        );
      }

      panel.webview.html = getWebviewContent(
        cssUri,
        convertCsvToHtmlTable(CSV, medalUris)
      );
    }
  );

  context.subscriptions.push(disposable);

  // 起動時に csv-preview を実行する
  vscode.commands.executeCommand("extension-practice.csv-preview");
}

// this method is called when your extension is deactivated
export function deactivate() {}

function vscodeEventToObservable<T>(event: vscode.Event<T>): Observable<T> {
  return new Observable((subscriber) => {
    const disposable = event((ev) => subscriber.next(ev));
    return () => disposable.dispose();
  });
}

function subscribe(observable: Observable<unknown>): vscode.Disposable {
  const subscription = observable.subscribe();
  return {
    dispose() {
      subscription.unsubscribe();
    },
  };
}

function getWorkspacePath(outputChan: vscode.OutputChannel): string | null {
  const workspaces = vscode.workspace.workspaceFolders;
  if (!workspaces || workspaces.length === 0) {
    return null;
  }
  if (workspaces.length > 1) {
    outputChan.appendLine("[warn] ワークスペースが複数開いています。");
  }

  const workspaceUri = workspaces[0].uri;

  if (workspaceUri.scheme !== "file") {
    outputChan.appendLine(
      `[warn] 不明なスキーマなので無視: ${workspaceUri.toString()}`
    );
    return null;
  }

  return workspaceUri.fsPath;
}

function convertCsvToHtmlTable(
  document: string,
  medalUris: Record<string, vscode.Uri>
): string {
  // ドキュメントのテキストを1行ずつ読み取り、コンマ区切りで配列に変換する
  const content: string[][] = document
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.trim()));

  // HTML形式に変換する
  const [header, ...body] = content;
  for (let row of body) {
    row[2] = `<img src="${medalUris[row[2]]}" width="50">`;
    row[4] = `<img src="${medalUris[row[4]]}" width="50">`;
  }
  // テキストの1行目はヘッダーにする
  const thead = `<thead><tr>${header.reduce(
    (pre, cur) => `${pre}<th class="header">${cur}</th>`,
    ""
  )}</tr></thead>`;
  // 2行目以降はボディー（表の本体）にする
  const tbody = `<tbody>${body.reduce(
    (pre, cur) =>
      `${pre}<tr>${cur.reduce((pre, cur) => `${pre}<td>${cur}</td>`, "")}</tr>`,
    ""
  )}</tbody>`;

  return `<table border="1">${thead}${tbody}</table>`;
}

function getWebviewContent(cssUri: vscode.Uri, contents: string): string {
  return `<!DOCTYPE html>
          <html lang="ja">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link rel="stylesheet" type="text/css" href="${cssUri}">
              <title>CSV Preview</title>
          </head>
          <body>
              ${contents}
          </body>
          </html>`;
}
