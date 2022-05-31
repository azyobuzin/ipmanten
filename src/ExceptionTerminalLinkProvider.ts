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
          "値がnullである変数を操作してしまったようです。以下に表示されている行番号付近で、値がnullになるケースがないかよく調べてみましょう。【参考】教科書270ページ",
      },

      {
        exception: "java.lang.ArrayIndexOutOfBoundsException",
        message:
          "範囲外の配列インデックスを操作してしまったようです。以下に表示されている行番号付近で、要素数nの配列のインデックスが0からn-1までであることを踏まえて、範囲外のインデックスを操作していないかよく調べてみましょう。【参考】教科書173ページ",
      },

      {
        exception: "java.lang.ArithmeticException",
        message:
          "ゼロでの除算をしてしまったようです。以下に表示されている行番号付近を調べて、値を0で割る（分母が0である）ケースがないかよく調べてみましょう。【参考】教科書425ページ",
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
