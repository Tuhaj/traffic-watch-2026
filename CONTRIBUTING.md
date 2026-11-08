# Jak pomóc

Traffic Watch jest otwarty: korzystaj, kopiuj i proponuj zmiany.

- **Pomysł albo błąd:** załóż [Issue](https://github.com/Tuhaj/traffic-watch-2026/issues). Napisz, co widzisz, czego się spodziewasz i na jakim urządzeniu.
- **Nowy wlot do miasta:** dodaj trasę w `shared/cities.ts` (nazwa, punkt startowy `[lng, lat]`). Collector podejmie ją przy następnym pomiarze.
- **Tłumaczenia:** słowniki są w `web/src/i18n/`, treść FAQ w `web/static/faq-content.ts`.
- **Kod:** forkuj repo, zrób zmianę na osobnej gałęzi i otwórz pull request. Przed wysłaniem uruchom `pnpm typecheck` i `pnpm test`.

Lokalnie: `pnpm install`, potem `pnpm --filter @traffic-watch/web dev` (UI korzysta z API na traffic.isy.sh).

Licencja: wysyłając zmiany, zgadzasz się, że będą dostępne na licencji GNU AGPL-3.0 (lub późniejszej), tak jak cały projekt.

Zasady: bez ciasteczek i bez śledzenia użytkowników, teksty bez długich myślników, UI w trzech językach (PL, EN, UA).
