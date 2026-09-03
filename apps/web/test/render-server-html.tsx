import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

/**
 * Renders a Server Component tree to its *finished* HTML.
 *
 * `renderToStaticMarkup` cannot do this: it has no way to wait, so every
 * `<Suspense>` resolves to its fallback and a test would assert the skeleton it
 * was written to prove has gone. Since ADR-0023 every workspace page is a shell
 * plus streamed sections, so the suite has to read the stream to the end —
 * which is also what a browser does on a hard load, and therefore what the
 * assertions should be about.
 *
 * A section that throws still rejects here rather than hanging, so a test that
 * expects a rendered failure fails loudly if the page starts throwing again.
 */
export async function renderServerHtml(node: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(node, {
    onError() {
      // The page under test is expected to render failures, not throw them.
      // Swallowing the console noise keeps a deliberate failure case readable;
      // a genuinely thrown error still surfaces as missing HTML.
    },
  });
  await stream.allReady;

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  // React marks Suspense boundaries and adjacent text nodes with HTML comments
  // (`<!--$-->`, `<!-- -->`). A browser never shows them and no assertion should
  // have to spell them, so the returned markup is the text a reader would see.
  return (html + decoder.decode()).replaceAll(/<!--[\s\S]*?-->/g, "");
}
