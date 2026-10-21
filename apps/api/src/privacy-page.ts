import { PRIVACY_NOTICE, type PrivacyNotice } from "@brokely/contracts";

/**
 * The public privacy notice (GET /privacy): the same text as the app (packages/contracts), as a
 * plain page in English and Bahasa Malaysia. Google Play and the Google sign-in consent screen
 * link here. No scripts, no tracking, no external resources.
 */

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function section(notice: PrivacyNotice, lang: string): string {
  return `<section lang="${lang}" id="${lang}">
<h1>${escape(notice.title)}</h1>
<p class="updated">${escape(notice.updated)}</p>
${notice.sections
  .map(
    (s) =>
      `<h2>${escape(s.title)}</h2>\n${s.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n")}`,
  )
  .join("\n")}
</section>`;
}

export function privacyPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brokely · Privacy notice / Notis privasi</title>
<style>
  :root { color-scheme: light dark; --ink: #1A1D17; --muted: #474F42; --bg: #EEF2E2; --card: #FAFBF4; --green: #5E7330; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ECEEE8; --muted: #B4BAB1; --bg: #141614; --card: #1E211E; --green: #9DBF5E; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  nav { display: flex; gap: 12px; margin-bottom: 8px; }
  nav a { color: var(--green); font-weight: 700; }
  section { background: var(--card); border: 2px solid var(--ink); border-radius: 16px; padding: 8px 20px 16px; margin-top: 16px; }
  h1 { font-size: 1.6rem; margin: 12px 0 0; }
  h2 { font-size: 1.1rem; margin: 20px 0 4px; }
  p { margin: 6px 0; }
  .updated { color: var(--muted); font-size: 0.9rem; }
</style>
</head>
<body>
<main>
<nav><a href="#en">English</a><a href="#ms">Bahasa Malaysia</a></nav>
${section(PRIVACY_NOTICE.en, "en")}
${section(PRIVACY_NOTICE.ms, "ms")}
</main>
</body>
</html>`;
}
