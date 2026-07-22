import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
  INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
  type InterfaceRouteSearchInput,
} from "@/lib/interface-route-policy";
import {
  BULGARIA_PUBLIC_LOCALES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";

export interface PublicLifecycleRequestLocation {
  pathname: string;
  search?: InterfaceRouteSearchInput;
}

export interface PublicLifecycleDocumentInput extends PublicLifecycleRequestLocation {
  locale: InterfaceLocale;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}

/**
 * Render the application-owned raw 404/410 document used by Proxy lifecycle
 * lookups. These responses bypass React and therefore own their complete
 * market-aware language control here rather than delegating to SiteShell.
 */
export function renderPublicLifecycleDocument(
  input: PublicLifecycleDocumentInput,
) {
  const languageControl = renderRawInterfaceLanguageControl(input);
  const languageControlStyles =
    input.locale === "uk" ? "" : renderRawInterfaceLanguageControlStyles();

  return `<!doctype html>
<html lang="${escapeAttribute(input.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(input.title)} | OverGarden</title>
    <style>
      :root { --fg: rgb(23 23 23); --bg: rgb(255 255 255); --brand: rgb(47 125 50); --muted: rgb(102 102 102); --line: rgb(212 212 212); color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      header { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 20px; color: var(--bg); background: var(--fg); font-weight: 700; }
      header > span { display: inline-flex; min-height: 56px; align-items: center; padding: 0 18px; background: var(--brand); }
      main { width: min(760px, 100%); margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
      p { max-width: 42rem; margin: 16px 0 0; color: var(--muted); line-height: 1.65; }
      main > a { display: inline-flex; margin-top: 24px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; color: inherit; font-weight: 650; text-decoration: none; }
      main > a:hover { border-color: var(--brand); color: var(--brand); }
      ${languageControlStyles}
    </style>
  </head>
  <body>
    <header><span>OverGarden</span>${languageControl}</header>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.description)}</p>
      <a href="${escapeAttribute(input.actionHref)}" rel="noreferrer" referrerpolicy="no-referrer">${escapeHtml(input.actionLabel)}</a>
    </main>
  </body>
</html>`;
}

function renderRawInterfaceLanguageControl(
  input: Pick<PublicLifecycleDocumentInput, "locale" | "pathname" | "search">,
) {
  if (input.locale === "uk") return "";

  const copy = getInterfaceCopy(input.locale).shell;
  const routePolicy = getInterfaceRoutePolicy(input.pathname);
  const options = BULGARIA_PUBLIC_LOCALES.map((locale) =>
    renderRawLanguageOption({
      currentLocale: input.locale,
      locale,
      pathname: input.pathname,
      search: input.search,
      localizedLink: routePolicy.mode === "localized-link",
    }),
  ).join("");
  const script = rawLanguageControlScript(
    routePolicy.mode === "localized-link" ? "localized-link" : "preference",
    input.locale,
    copy.languageFlushFailure,
    copy.languageSwitchingPending,
  );
  const recoveryControl =
    routePolicy.mode === "localized-link"
      ? ""
      : `<button type="button" data-interface-language-recovery hidden>${escapeHtml(copy.retry)}</button>`;

  return `<nav aria-label="${escapeAttribute(copy.languageControlLabel)}" data-interface-language-control-host="raw-lifecycle-interface-language-control">
      <details data-interface-language-control="true">
        <summary aria-label="${escapeAttribute(copy.languageControlTrigger)}">${escapeHtml(PUBLIC_LOCALE_CONFIG[input.locale].label)}</summary>
        <div role="menu" data-interface-language-menu>${options}</div>
      </details>
      <span role="status" aria-live="polite" data-interface-language-status></span>
      ${recoveryControl}
    </nav>${script}`;
}

function renderRawLanguageOption(input: {
  currentLocale: InterfaceLocale;
  locale: PublicLocale;
  pathname: string;
  search?: InterfaceRouteSearchInput;
  localizedLink: boolean;
}) {
  const config = PUBLIC_LOCALE_CONFIG[input.locale];
  const selected = input.locale === input.currentLocale;
  const commonAttributes = `data-interface-language-option data-interface-locale="${input.locale}" lang="${escapeAttribute(config.htmlLang)}" role="menuitemradio" aria-checked="${selected ? "true" : "false"}"`;

  if (input.localizedLink) {
    const target = buildLocalizedInterfaceTarget({
      locale: input.locale,
      pathname: input.pathname,
      search: input.search,
    });
    if (!target) return "";
    return `<a ${commonAttributes} href="${escapeAttribute(target)}" hreflang="${config.htmlLang}" rel="noreferrer" referrerpolicy="no-referrer">${escapeHtml(config.label)}</a>`;
  }

  return `<button ${commonAttributes} type="button">${escapeHtml(config.label)}</button>`;
}

function rawLanguageControlScript(
  mode: "localized-link" | "preference",
  currentLocale: InterfaceLocale,
  failureMessage: string,
  pendingMessage: string,
) {
  const configuration = JSON.stringify({
    currentLocale,
    endpoint: INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
    failureMessage,
    mode,
    pendingMessage,
  }).replaceAll("<", "\\u003c");

  return `<script>(()=>{
    const c=${configuration};
    const d=document.querySelector('[data-interface-language-control]');
    if(!d)return;
    const s=d.querySelector('summary');
    const o=[...d.querySelectorAll('[data-interface-language-option]')];
    const z=document.querySelector('[data-interface-language-status]');
    const y=document.querySelector('[data-interface-language-recovery]');
    const h=new URL(document.URL).hash;
    const v=h.startsWith('#')?h.slice(1):'';
    const j=document.getElementById(v);
    const A=()=>s.getAttribute('aria-disabled')==='true';
    const f=()=>{
      for(const x of o)x.disabled=false;
      if(y){y.hidden=true;y.disabled=false;}
      s.removeAttribute('aria-disabled');
      z.textContent=c.failureMessage;
      d.open=true;
      s.focus();
    };
    const u=()=>{
      for(const x of o)x.disabled=true;
      if(y){y.hidden=false;y.disabled=false;}
      s.setAttribute('aria-disabled','true');
      z.textContent=c.failureMessage;
      d.open=false;
      if(y)y.focus();
    };
    const p=async locale=>{
      const a=new AbortController();
      const t=setTimeout(()=>a.abort(),10000);
      try{
        const q={method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'content-type':'application/json'},body:JSON.stringify({locale}),signal:a.signal};
        q['redi'+'rect']='error';
        const e=await fetch(c.endpoint,q);
        return e.status===204&&!e['redi'+'rected']?'committed':'rejected';
      }catch{return'unknown';}
      finally{clearTimeout(t);}
    };
    const b=async()=>await p(c.currentLocale)==='committed';
    const q=async()=>{if(await b())f();else u();};
    const w=m=>{
      let l=false;
      let t;
      const k=()=>{removeEventListener('pagehide',n);removeEventListener('pageshow',g);if(t!==undefined)clearTimeout(t);};
      const r=x=>{if(l)return;l=true;k();if(x)window.stop();m.remove();void q();};
      const n=e=>{if(e.persisted)return;l=true;k();};
      const g=()=>r(false);
      addEventListener('pagehide',n);
      addEventListener('pageshow',g);
      t=setTimeout(()=>r(true),10000);
      return()=>r(true);
    };
    if(y)y.addEventListener('click',async()=>{y.disabled=true;await q();});
    s.addEventListener('click',e=>{if(!A())return;e.preventDefault();d.open=false;if(y&&!y.hidden)y.focus();});
    s.addEventListener('keydown',e=>{if(!A()||(e.key!=='Enter'&&e.key!==' '))return;e.preventDefault();d.open=false;if(y&&!y.hidden)y.focus();});
    d.addEventListener('toggle',()=>{if(A()&&d.open){d.open=false;if(y&&!y.hidden)y.focus();}});
    if(c.mode==='localized-link'&&/^[A-Za-z][A-Za-z0-9._~-]{0,127}$/.test(v)&&j?.dataset.interfaceLocaleFragmentSafe==='true'){
      for(const a of o){if(a instanceof HTMLAnchorElement&&!a.href.endsWith(h))a.href+=h;}
    }
    d.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&d.open){e.preventDefault();d.open=false;s.focus();return;}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&d.open){
        e.preventDefault();
        const i=o.indexOf(document.activeElement);
        const n=e.key==='ArrowDown'?(i+1)%o.length:(i<0?o.length-1:(i-1+o.length)%o.length);
        o[n].focus();
      }
    });
    for(const x of o){
      x.addEventListener('click',async e=>{
        if(x.getAttribute('aria-checked')==='true'){e.preventDefault();d.open=false;s.focus();return;}
        if(c.mode==='localized-link')return;
        e.preventDefault();
        for(const a of o)a.disabled=true;
        z.textContent=c.pendingMessage;
        let r;
        try{
          const n=await p(x.dataset.interfaceLocale);
          if(n!=='committed'){
            if(n==='rejected')f();
            else await q();
            return;
          }
          const m=document.createElement('meta');
          m.name='referrer';
          m.content='no-referrer';
          document.head.append(m);
          r=w(m);
          window['loca'+'tion'].reload();
        }catch{
          if(r)r();
          else await q();
        }
      });
    }
  })();</script>`;
}

function renderRawInterfaceLanguageControlStyles() {
  return `[data-interface-language-control-host] { display: flex; max-width: min(24rem, calc(100vw - 10rem)); align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding-block: 8px; }
      [data-interface-language-control] { position: relative; font-weight: 500; }
      [data-interface-language-control] summary { display: inline-flex; min-height: 40px; max-width: min(138px, 40vw); cursor: pointer; list-style: none; align-items: center; gap: 6px; overflow: hidden; border: 1px solid rgb(255 255 255 / 35%); border-radius: 6px; padding: 7px 10px; white-space: nowrap; text-overflow: ellipsis; }
      [data-interface-language-control] summary::-webkit-details-marker { display: none; }
      [data-interface-language-control] summary::after { content: "▾"; font-size: 0.75rem; }
      [data-interface-language-control][open] summary::after { transform: rotate(180deg); }
      [data-interface-language-control] summary[aria-disabled="true"] { cursor: not-allowed; opacity: 0.72; }
      [data-interface-language-menu] { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; display: grid; min-width: 168px; gap: 2px; border: 1px solid var(--line); border-radius: 7px; padding: 4px; color: var(--fg); background: var(--bg); box-shadow: 0 12px 32px rgb(0 0 0 / 18%); }
      [data-interface-language-option] { display: flex; min-height: 42px; width: 100%; cursor: pointer; align-items: center; justify-content: space-between; border: 0; border-radius: 5px; padding: 9px 10px; color: inherit; background: transparent; font: inherit; text-align: left; text-decoration: none; }
      [data-interface-language-option]:hover { background: rgb(0 0 0 / 7%); }
      [data-interface-language-control] summary:focus-visible, [data-interface-language-option]:focus-visible, [data-interface-language-recovery]:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
      [data-interface-language-option]:focus-visible { background: rgb(0 0 0 / 7%); }
      [data-interface-language-option][aria-checked="true"]::after { content: "✓"; font-weight: 800; }
      [data-interface-language-recovery] { min-height: 40px; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; color: var(--fg); background: var(--bg); font: inherit; }
      [data-interface-language-status] { flex: 1 0 100%; max-width: 24rem; color: inherit; font-size: 0.8125rem; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; text-align: right; }
      [data-interface-language-status]:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
