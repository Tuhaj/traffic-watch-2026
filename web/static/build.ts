/**
 * Post-build step: writes crawlable static pages next to the SPA in dist/.
 *   dist/faq/index.html, dist/faq/en/index.html, dist/faq/uk/index.html
 *   dist/sitemap.xml, dist/robots.txt, dist/manifest.webmanifest
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Lang } from "../src/i18n/types";
import { FAQ } from "./faq-content";

export const SITE = "https://traffic.isy.sh";
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const LANGS: { code: Lang; label: string; locale: string; og: string }[] = [
  { code: "pl", label: "PL", locale: "pl", og: "pl_PL" },
  { code: "en", label: "EN", locale: "en", og: "en_GB" },
  { code: "uk", label: "UA", locale: "uk", og: "uk_UA" },
];
const faqPath = (l: Lang) => (l === "pl" ? "/faq/" : `/faq/${l}/`);
const appPath = (l: Lang) => (l === "pl" ? "/" : `/?lang=${l}`);
const FLAGS: Record<Lang, string> = {
  pl: '<svg viewBox="0 0 16 10" aria-hidden="true"><rect width="16" height="5" fill="#fff"/><rect y="5" width="16" height="5" fill="#dc143c"/></svg>',
  uk: '<svg viewBox="0 0 16 10" aria-hidden="true"><rect width="16" height="5" fill="#0057b7"/><rect y="5" width="16" height="5" fill="#ffd700"/></svg>',
  en: '<svg viewBox="0 0 60 30" aria-hidden="true"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>',
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

/** Same cookieless beacon as the app (see src/track.ts). */
const BEACON = `<script>(function(){try{var n=navigator;if(n.globalPrivacyControl===true||n.doNotTrack==="1")return;var q=new URLSearchParams({e:"pageview",p:location.pathname,l:document.documentElement.lang,d:matchMedia("(max-width: 899px)").matches?"mobile":"desktop"});if(document.referrer)q.set("r",document.referrer);fetch("/api/hit?"+q,{keepalive:true,credentials:"omit"}).catch(function(){})}catch(e){}})();</script>`;

function faqHtml(lang: Lang): string {
  const page = FAQ[lang];
  const url = `${SITE}${faqPath(lang)}`;
  const og = LANGS.find((l) => l.code === lang)!.og;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang,
    url,
    mainEntity: page.items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a.map(stripTags).join(" ") },
    })),
  };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}" />
<link rel="canonical" href="${url}" />
${LANGS.map((l) => `<link rel="alternate" hreflang="${l.locale}" href="${SITE}${faqPath(l.code)}" />`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${SITE}/faq/" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Traffic Watch" />
<meta property="og:title" content="${esc(page.title)}" />
<meta property="og:description" content="${esc(page.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="${og}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#121826;--muted:#5d6678;--line:#e6e9ef;--accent:#2f6fed;color-scheme:light;
font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#181d25;--text:#e8eaef;--muted:#9aa3b2;--line:#262c36;--accent:#6b9bff;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:28px}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:700}
.brand img{width:28px;height:28px}
.langs{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--line)}
.langs a{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:6px;font-size:11px;font-weight:700;color:var(--muted);text-decoration:none}
.langs a[aria-current]{background:var(--card);color:var(--text)}
.langs svg{width:16px;height:10px;border-radius:2px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.02em;margin:0 0 8px}
.intro{color:var(--muted);margin:0 0 28px;font-size:17px}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:12px}
h2{font-size:17px;margin:0 0 6px;line-height:1.35}
p{margin:0 0 8px}p:last-child{margin:0}
a{color:var(--accent)}
.cta{display:inline-block;margin:8px 0 28px;padding:10px 16px;border-radius:12px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
footer{margin-top:28px;color:var(--muted);font-size:13px}
</style>
</head>
<body>
<div class="wrap">
<header>
<a class="brand" href="${appPath(lang)}"><img src="/favicon.svg" alt="" />Traffic Watch</a>
<nav class="langs" aria-label="Language">${LANGS.map(
    (l) => `<a href="${faqPath(l.code)}" hreflang="${l.locale}" lang="${l.locale}"${l.code === lang ? ' aria-current="page"' : ""}>${FLAGS[l.code]}${l.label}</a>`,
  ).join("")}</nav>
</header>
<main>
<h1>${esc(page.heading)}</h1>
<p class="intro">${esc(page.intro)}</p>
<a class="cta" href="${appPath(lang)}">← ${esc(page.back)}</a>
${page.items.map((it) => `<section><h2>${esc(it.q)}</h2>${it.a.map((p) => `<p>${p}</p>`).join("")}</section>`).join("\n")}
</main>
<footer>${page.dedication}<br />${esc(page.updated)} · <a href="https://piotrzientara.pl/">Piotr Zientara</a> · <a href="https://github.com/Tuhaj/traffic-watch-2026">GitHub</a></footer>
</div>
${BEACON}
</body>
</html>
`;
}

function sitemap(): string {
  const today = new Date().toISOString().slice(0, 10);
  const group = (paths: (l: Lang) => string, freq: string, prio: string) =>
    LANGS.map(
      (l) => `  <url>
    <loc>${SITE}${esc(paths(l.code))}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
${LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a.locale}" href="${SITE}${esc(paths(a.code))}" />`).join("\n")}
  </url>`,
    ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${group(appPath, "hourly", "1.0")}
${group(faqPath, "monthly", "0.6")}
</urlset>
`;
}

const robots = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`;

const manifest = {
  name: "Traffic Watch · Warszawa",
  short_name: "Traffic Watch",
  description: "Czas dojazdu do centrum Warszawy z 12 wlotów do miasta, co 15 minut.",
  lang: "pl",
  start_url: "/",
  display: "standalone",
  background_color: "#f6f7f9",
  theme_color: "#111827",
  icons: [
    { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

function write(rel: string, content: string) {
  const file = join(dist, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

for (const l of LANGS) write(`${faqPath(l.code).slice(1)}index.html`, faqHtml(l.code));
write("sitemap.xml", sitemap());
write("robots.txt", robots);
write("manifest.webmanifest", JSON.stringify(manifest, null, 2));
console.log("static pages: faq (pl, en, uk), sitemap.xml, robots.txt, manifest.webmanifest");
