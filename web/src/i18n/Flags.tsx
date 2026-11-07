import type { Lang } from "./types";

/** Tiny inline SVG flags (emoji flags do not render on Windows). */
export function Flag({ lang }: { lang: Lang }) {
  switch (lang) {
    case "pl":
      return (
        <svg viewBox="0 0 16 10" aria-hidden>
          <rect width="16" height="5" fill="#fff" />
          <rect y="5" width="16" height="5" fill="#dc143c" />
        </svg>
      );
    case "uk":
      return (
        <svg viewBox="0 0 16 10" aria-hidden>
          <rect width="16" height="5" fill="#0057b7" />
          <rect y="5" width="16" height="5" fill="#ffd700" />
        </svg>
      );
    case "en":
      return (
        <svg viewBox="0 0 60 30" aria-hidden>
          <clipPath id="flag-uk-t">
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
          </clipPath>
          <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-uk-t)" stroke="#C8102E" strokeWidth="4" />
          <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
          <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      );
  }
}
