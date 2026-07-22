import { describe, expect, it } from "vitest";

import { renderPublicLifecycleDocument } from "./public-lifecycle-document";

describe("raw public lifecycle document", () => {
  it("renders Ukraine lifecycle UI in Ukrainian with no language-control artifact", () => {
    const html = renderPublicLifecycleDocument({
      locale: "uk",
      pathname: "/journal/missing-entry",
      title: "Запис не знайдено",
      description: "Цей запис недоступний.",
      actionHref: "/journals",
      actionLabel: "До журналів",
    });

    expect(html).toContain('<html lang="uk">');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain("Запис не знайдено");
    expect(html).not.toContain("data-interface-language-control");
    expect(html).not.toContain("Български");
    expect(html).not.toContain("Русский");
  });

  it("renders exactly one Bulgaria control with two localized document links and safe view state", () => {
    const html = renderPublicLifecycleDocument({
      locale: "bg",
      pathname: "/bg/journal/missing-entry",
      search:
        "?engagement=commented&authIntent=comment&token=private&authIntent=follow",
      title: "Записът не е намерен",
      description: "Този запис не е достъпен.",
      actionHref: "/bg/journals",
      actionLabel: "Към дневниците",
    });

    expect(html.match(/data-interface-language-control="true"/g)).toHaveLength(
      1,
    );
    expect(
      html.match(/data-interface-language-option data-interface-locale=/g),
    ).toHaveLength(2);
    expect(html).toContain("Български");
    expect(html).toContain("Русский");
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(
      'href="/bg/journal/missing-entry?engagement=commented&amp;authIntent=comment"',
    );
    expect(html).toContain(
      'href="/ru/journal/missing-entry?engagement=commented&amp;authIntent=comment"',
    );
    expect(html.match(/rel="noreferrer"/g)).toHaveLength(3);
    expect(html.match(/referrerpolicy="no-referrer"/g)).toHaveLength(3);
    expect(html).toContain(
      '<a href="/bg/journals" rel="noreferrer" referrerpolicy="no-referrer">',
    );
    expect(html).not.toContain("private");
    expect(html).toContain("new URL(document.URL).hash");
    expect(html).toContain("document.getElementById(v)");
    expect(html).toContain("interfaceLocaleFragmentSafe==='true'");
    expect(html).not.toContain("._~:%-");
    expect(html).toContain("e.key==='Escape'");
    expect(html).toContain(
      "[data-interface-language-status]:empty { position: absolute",
    );
    expect(html).toContain(
      "[data-interface-language-status] { flex: 1 0 100%; max-width: 24rem; color: inherit;",
    );
    expect(html).toContain(
      "[data-interface-language-option]:focus-visible, [data-interface-language-recovery]:focus-visible { outline: 3px solid currentColor;",
    );
    expect(html).not.toContain(
      "[data-interface-language-option]:focus-visible { outline: 2px solid transparent;",
    );
  });

  it("uses the locale-only POST for canonical unprefixed Bulgaria lifecycle UI", () => {
    const privateObjectId = "18700007-0000-4000-8000-000000000099";
    const html = renderPublicLifecycleDocument({
      locale: "ru",
      pathname: `/lineage/objects/${privateObjectId}`,
      search: "?token=never-copy-this",
      title: "Паспорт недоступен",
      description: "Публичный паспорт удалён.",
      actionHref: "/ru/objects",
      actionLabel: "К объектам",
    });

    expect(html.match(/data-interface-language-control="true"/g)).toHaveLength(
      1,
    );
    expect(
      html.match(/data-interface-language-option data-interface-locale=/g),
    ).toHaveLength(2);
    expect(html).toContain('data-interface-locale="bg" lang="bg"');
    expect(html).toContain('data-interface-locale="ru" lang="ru"');
    expect(html).toContain("/api/interface/locale");
    expect(html).toContain("JSON.stringify({locale})");
    expect(html).toContain("referrerPolicy:'no-referrer'");
    expect(html).toContain("q['redi'+'rect']='error'");
    expect(html).toContain("m.name='referrer'");
    expect(html).toContain("m.content='no-referrer'");
    expect(html).toContain("window['loca'+'tion'].reload()");
    expect(html).toContain('"currentLocale":"ru"');
    expect(html).toContain("const a=new AbortController()");
    expect(html).toContain("setTimeout(()=>a.abort(),10000)");
    expect(html).toContain("signal:a.signal");
    expect(html).toContain("finally{clearTimeout(t);}");
    expect(html).toContain(
      "return e.status===204&&!e['redi'+'rected']?'committed':'rejected'",
    );
    expect(html).toContain("catch{return'unknown';}");
    expect(html).toContain(
      "const b=async()=>await p(c.currentLocale)==='committed'",
    );
    expect(html).toContain("const q=async()=>{if(await b())f();else u();}");
    expect(html).toContain("if(n!=='committed')");
    expect(html).toContain("if(n==='rejected')f()");
    expect(html).toContain("else await q()");
    expect(html).toContain("data-interface-language-recovery hidden");
    expect(html).toContain("for(const x of o)x.disabled=true");
    expect(html).toContain("s.setAttribute('aria-disabled','true')");
    expect(html).toContain("z.textContent=c.failureMessage;\n      d.open=false;");
    expect(html).toContain("s.removeAttribute('aria-disabled')");
    expect(html).toContain("if(!A())return;e.preventDefault();d.open=false");
    expect(html).toContain("if(!A()||(e.key!=='Enter'&&e.key!==' '))return");
    expect(html).toContain("if(A()&&d.open){d.open=false");
    expect(html).toContain('summary[aria-disabled="true"]');
    expect(html).toContain("window.stop()");
    expect(html).toContain("addEventListener('pagehide'");
    expect(html).toContain("addEventListener('pageshow'");
    expect(html).not.toContain("history.go(0)");
    expect(html).not.toContain("n.href=document.URL");
    expect(html).not.toContain(privateObjectId);
    expect(html).not.toContain("never-copy-this");
    expect(html).not.toContain("returnUrl");
  });

  it("escapes authored lifecycle copy", () => {
    const html = renderPublicLifecycleDocument({
      locale: "uk",
      pathname: "/journal/missing",
      title: '<script>alert("x")</script>',
      description: "A & B",
      actionHref: "/journals",
      actionLabel: "Back",
    });

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("A &amp; B");
  });
});
