// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { debounce, Observable, map, distinctUntilChanged } from "rxjs";

const LOGGING_DIR = "_ipmanten";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const outputChan =
    vscode.window.createOutputChannel("インターネットプログラミング");

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
