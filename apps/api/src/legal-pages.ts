import { ACCOUNT_DELETION, PRIVACY_NOTICE, TERMS, type LegalDocument } from "@brokely/contracts";

/**
 * Brokely's public legal pages (D-92, D-93): the same texts as the app (packages/contracts), as
 * plain pages in English and Bahasa Malaysia. Google Play and the Google sign-in consent screen
 * link here. No scripts, no tracking, no external resources.
 */

type Bilingual = Readonly<Record<"en" | "ms", LegalDocument>>;

export const LEGAL_PAGES: Readonly<Record<string, { title: string; doc: Bilingual }>> = {
  "/privacy": { title: "Privacy notice / Notis privasi", doc: PRIVACY_NOTICE },
  "/terms": { title: "Terms of use / Terma penggunaan", doc: TERMS },
  "/delete-account": {
    title: "Delete your account / Padam akaun anda",
    doc: ACCOUNT_DELETION,
  },
};

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function section(doc: LegalDocument, lang: string): string {
  return `<section lang="${lang}" id="${lang}">
<h1>${escape(doc.title)}</h1>
<p class="updated">${escape(doc.updated)}</p>
${doc.sections
  .map(
    (s) =>
      `<h2>${escape(s.title)}</h2>\n${s.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n")}`,
  )
  .join("\n")}
</section>`;
}

export function legalPage(path: string): string {
  const page = LEGAL_PAGES[path]!;
  const links = Object.entries(LEGAL_PAGES)
    .map(([href, p]) => `<a href="${href}">${escape(p.title.split(" / ")[0]!)}</a>`)
    .join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brokely · ${escape(page.title)}</title>
<style>
  :root { color-scheme: light dark; --ink: #1A1D17; --muted: #474F42; --bg: #EEF2E2; --card: #FAFBF4; --green: #5E7330; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ECEEE8; --muted: #B4BAB1; --bg: #141614; --card: #1E211E; --green: #9DBF5E; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  nav { display: flex; gap: 12px; margin-bottom: 8px; }
  a { color: var(--green); font-weight: 700; }
  section { background: var(--card); border: 2px solid var(--ink); border-radius: 16px; padding: 8px 20px 16px; margin-top: 16px; }
  h1 { font-size: 1.6rem; margin: 12px 0 0; }
  h2 { font-size: 1.1rem; margin: 20px 0 4px; }
  p { margin: 6px 0; }
  .updated, footer { color: var(--muted); font-size: 0.9rem; }
  footer { margin-top: 24px; text-align: center; }
</style>
</head>
<body>
<main>
<nav><a href="#en">English</a><a href="#ms">Bahasa Malaysia</a></nav>
${section(page.doc.en, "en")}
${section(page.doc.ms, "ms")}
<footer>Brokely · ${links}</footer>
</main>
</body>
</html>`;
}
