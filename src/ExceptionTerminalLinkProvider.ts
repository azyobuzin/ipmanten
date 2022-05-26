import {
  CancellationToken,
  ProviderResult,
  TerminalLink,
  TerminalLinkContext,
  TerminalLinkProvider,
  window,
} from "vscode";

export default class ExceptionTerminalLinkProvider
  implements TerminalLinkProvider
{
  provideTerminalLinks(
    context: TerminalLinkContext,
    token: CancellationToken
  ): ProviderResult<TerminalLink[]> {
    const targetExceptions = [
      {
        exception: "java.lang.NullPointerException",
        message:
          "値がnullである変数を操作してしまったようです。以下に表示されている行番号付近を調べて、値がnullになるケースがないか良く調べてみましょう。",
      },
    ] as const;

    const results: TerminalLink[] = [];

    for (let target of targetExceptions) {
      const idx = context.line.indexOf(target.exception);
      if (idx < 0) {
        continue;
      }

      results.push(
        new TerminalLink(idx, target.exception.length, target.message)
      );
    }

    return results;
  }

  handleTerminalLink(link: TerminalLink): ProviderResult<void> {
    // クリックしたらメッセージを表示する（雑）
    window.showInformationMessage(link.tooltip!);
  }
}
