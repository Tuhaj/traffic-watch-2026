/**
 * Cookieless analytics beacon. Sends only: event name, page path, optional short value,
 * referring URL (reduced to its host on the server), UI language and mobile/desktop.
 * No cookies, no stored identifier. Honours Do Not Track and Global Privacy Control.
 */
type Event = "pageview" | "commute" | "lang" | "tab" | "faq";

function optedOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return n.globalPrivacyControl === true || n.doNotTrack === "1" || n.msDoNotTrack === "1";
}

export function track(event: Event, value?: string, lang?: string) {
  try {
    if (optedOut() || location.hostname === "localhost") return;
    const q = new URLSearchParams({ e: event, p: location.pathname });
    if (value) q.set("v", value);
    if (event === "pageview") {
      if (document.referrer) q.set("r", document.referrer);
      q.set("l", lang ?? document.documentElement.lang);
      q.set("d", window.matchMedia("(max-width: 899px)").matches ? "mobile" : "desktop");
    }
    void fetch(`/api/hit?${q}`, { keepalive: true, credentials: "omit" }).catch(() => undefined);
  } catch {
    /* analytics must never break the page */
  }
}
