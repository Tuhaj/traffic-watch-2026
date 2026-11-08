# Traffic Watch 2026

Ile dziś jedzie się do centrum Warszawy? Traffic Watch mierzy co 15 minut czas dojazdu z 12 wlotów do miasta do Ronda Dmowskiego, pokazuje przebieg dnia na tle typowego dnia tygodnia i porównuje dzień z nocą. Zakładka „Mój dojazd” pozwala zaznaczyć dom i pracę, a potem wskazuje najlepsze godziny wyjazdu do pracy i powrotu.

**Na żywo:** https://traffic.isy.sh

To przepisana wersja projektu z 2015 roku (Ember 1.8 + Rails 4.1 + Bing Maps).

## Funkcje

- **Miasto, teraz:** mapa 12 korytarzy pokolorowanych wg korków, średni czas dojazdu, odchylenie od pustej drogi i od typowego dnia.
- **Przebieg dnia:** wykres całego dnia na tle średniej dla tego dnia tygodnia; przeciągnięcie po wykresie „przewija” mapę w czasie. Ostatnie 7 dni do wyboru.
- **Dzień vs noc:** najgorszy moment dnia (06:00-20:00) zestawiony z najspokojniejszym pomiarem nocnym, dla miasta i dla każdego wlotu.
- **Mój dojazd:** dom i praca wpisane jako adres lub nazwa miejsca (z podpowiedziami) albo zaznaczone na mapie (można przeciągać). Do wyboru samochód, komunikacja miejska i rower. Dla samochodu i komunikacji backend liczy podróż dla 26 godzin wyjazdu (rano 05:30-10:30, popołudnie 14:00-20:00, noc 03:00) na wybrany dzień tygodnia. Przełącznik „Do pracy / Powrót” pokazuje najlepszą godzinę, klikalne słupki dla każdej godziny i różnicę dzień/noc. Po kliknięciu słupka widać szczegóły (dla komunikacji linie, przystanki i godziny), a mapa rysuje tę trasę.

## Języki

Interfejs jest po polsku, angielsku i ukraińsku (małe flagi PL / EN / UA w nagłówku). Język wybiera się z `?lang=pl|en|uk` (link do udostępnienia), potem z zapamiętanego wyboru, potem z języka przeglądarki.

- Słowniki: `web/src/i18n/{pl,en,uk}.ts`. Polski jest źródłem; TypeScript nie przepuści słownika bez któregoś klucza, a testy pilnują pustych tłumaczeń, zgodności placeholderów i braku długich myślników.
- Liczba mnoga przez `Intl.PluralRules` (formy one/few/many/other), daty, dni tygodnia i liczby przez `Intl` w locale `pl-PL`, `en-GB`, `uk-UA`.
- Backend zwraca kody błędów (`{code, message, params}`, `shared/errors.ts`) i surowe typy pojazdów (`LightRail`, `Bus`), a tłumaczy je front.
- Nazwy na mapie bazowej są w wybranym języku (`name:en`, `name:uk` z OpenStreetMap), z nazwą lokalną jako zapasową. Adresy i nazwy przystanków zostają po polsku, tak jak na tablicach.

Nowy język: skopiuj `en.ts`, przetłumacz, dodaj go do `LANGS` w `web/src/i18n/index.tsx` i flagę w `Flags.tsx`.

## Prywatność i statystyki (bez ciasteczek)

Strona nie używa ciasteczek ani identyfikatorów w przeglądarce, więc nie ma banera zgody. `localStorage` trzyma tylko ustawienia (język, środek transportu, punkty dom/praca).

Ruch liczy własny beacon `GET /api/hit` (`backend/src/stats.ts`, `web/src/track.ts`):

- zbiorcze dzienne liczniki w DynamoDB: odsłony stron, zdarzenia (wyszukanie dojazdu wg trybu, zmiana języka), domena odsyłająca, język, mobile/desktop, kraj;
- unikalni odwiedzający dziennie: `sha256(sekret, dzień, IP, user agent)`, który zmienia się co dzień i wygasa po 2 dniach; surowe IP nie jest zapisywane;
- boty są pomijane, a Do Not Track i Global Privacy Control wyłączają wysyłkę.

Podgląd: `AWS_PROFILE=private pnpm stats [dni]`.

## SEO i udostępnianie

- Meta tagi Open Graph i Twitter, canonical, `hreflang` (PL/EN/UA), JSON-LD `WebApplication` w `web/index.html`.
- FAQ jako statyczne strony w trzech językach (`/faq/`, `/faq/en/`, `/faq/uk/`) z JSON-LD `FAQPage`, generowane przez `web/static/build.ts` razem z `sitemap.xml`, `robots.txt` i `manifest.webmanifest`.
- Obrazek OG (`web/public/og.png`, 1200×630) to zrzut aplikacji. Odświeżenie: `UDD=$(mktemp -d) node web/scripts/screenshot.mjs "https://traffic.isy.sh/?lang=pl" web/public/og.png 1200 630 light 10000`.

## Skąd dane

Sprawdziliśmy publiczne źródła Warszawy. ZDM publikuje natężenie ruchu z systemu APR (liczba pojazdów, raport w przeglądarce, bez API i bez dróg ekspresowych), a api.um.warszawa.pl / dane.um.warszawa.pl udostępniają głównie dane komunikacji miejskiej. Nie ma publicznych czasów przejazdu, więc zostały crony.

Czasy przejazdu pochodzą z **Amazon Location Service Routes** (silnik HERE, `Traffic: UseTrafficData`): `Duration` to czas z bieżącym ruchem, `BestCaseDuration` to czas przy pustej drodze. Dla przyszłych godzin wyjazdu (Mój dojazd) HERE zwraca prognozę na podstawie historycznych wzorców ruchu. Bing Maps, z którego korzystała stara wersja, został wygaszony.

**Komunikacja miejska:** Amazon Location `TravelMode: Transit` (HERE, rozkłady ZTM, przesiadki, numery i kolory linii). API miasta (api.um.warszawa.pl) wymaga klucza i daje pozycje pojazdów, przystanki oraz rozkłady per przystanek, ale nie ma planera podróży; HERE korzysta z tych samych rozkładów, więc nie trzeba pisać własnego routera.

**Rower:** Amazon Location nie ma trybu rowerowego, więc trasę liczy [Valhalla](https://github.com/valhalla/valhalla) na OpenStreetMap (publiczny serwer FOSSGIS, profil `bicycle`, ok. 18 km/h). Czas nie zależy od godziny, więc to tylko 2 zapytania na parę punktów, cache'owane 7 dni, z identyfikującym User-Agentem i limitami. Przy większym ruchu warto postawić własną instancję (`VALHALLA_URL`).

Koszt: 0,50 USD za 1000 tras. 12 tras × 78 pomiarów dziennie (co 15 min w 05:00-22:45, co godzinę w nocy) to około 14 USD miesięcznie. Pierwsze 3 miesiące obejmuje free tier (10 tys. tras miesięcznie). Wyszukiwanie adresów: podpowiedzi przy pisaniu przez Places `Suggest` (0,20 USD / 1000, tryb `SingleUse`, więc odpowiedzi nie są cache'owane), a współrzędne wybranej pozycji przez `GetPlace` w trybie `Storage` (4 USD / 1000), bo przeglądarka zapamiętuje punkt. Oba mają dzienne limity na IP i globalne. Jedno nowe wyszukiwanie dojazdu to 26 tras (ok. 0,013 USD); wyniki są cache'owane 7 dni, a dzienne limity (na IP i globalny) ograniczają najgorszy przypadek do ok. 2 USD dziennie.

## Architektura

```
EventBridge Scheduler ──▶ Lambda collector ──▶ Amazon Location (HERE)
   (Europe/Warsaw)              │
                                ▼
CloudFront ── /api/* ──▶ Lambda API (Function URL, OAC) ──▶ DynamoDB
     │                          └──▶ Amazon Location (prognozy dojazdu)
     └── /* ──▶ S3 (React SPA)
```

| Warstwa | Technologia |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, MapLibre GL, OpenFreeMap |
| Backend | Node.js 22 (arm64) Lambda, TypeScript, AWS SDK v3 |
| Dane | DynamoDB (on-demand, PITR, TTL) |
| Infrastruktura | AWS CDK (TypeScript), CloudFront, S3, Route 53, ACM |

### Model danych (jedna tabela DynamoDB)

| pk | sk | zawartość |
| --- | --- | --- |
| `CITY#warszawa` | `ROUTE#<id>` | uproszczona geometria trasy |
| `CITY#warszawa` | `LATEST` | ostatni pomiar |
| `DAY#warszawa#2026-11-07` | ISO czasu slotu | pomiar wszystkich tras (TTL 2 lata) |
| `PROFILE#warszawa#<1-7>` | `HH:MM` | sumy narastające do średniej dla dnia tygodnia i slotu |
| `COMMUTE#<sha256>` | `v1` | cache prognozy dojazdu (TTL 7 dni, współrzędne tylko w hashu) |
| `QUOTA#<data>` | `<rodzaj>#ALL` / `<rodzaj>#IP#<sha256>` | dzienne limity (commute, suggest, place) |

Zapis pomiaru jest warunkowy (`attribute_not_exists`), więc ponowienie tego samego slotu nie liczy się podwójnie do profili.

### API

- `GET /api/cities`
- `GET /api/cities/warszawa`: trasy z geometrią i ostatni pomiar
- `GET /api/cities/warszawa/day?date=YYYY-MM-DD`
- `GET /api/cities/warszawa/profile?dow=1..7`
- `GET /api/commute?home=lng,lat&work=lng,lat&dow=1..7&mode=car|transit|bike`
- `GET /api/places/suggest?q=tekst`: podpowiedzi adresów i miejsc w promieniu 60 km
- `GET /api/places/detail?id=<placeId>`: nazwa i współrzędne wybranej podpowiedzi

## Co naprawiliśmy względem wersji z 2015

- Bing Maps API przestało działać; zastąpione Amazon Location (bez zewnętrznych kluczy).
- `Marker#count_load` miał odwrócony warunek (`if time_without_traffic.zero?`), przez co obciążenie zawsze wynosiło 0 albo dzieliło przez zero.
- Brak seedów: punkty pomiarowe istniały tylko w produkcyjnej bazie. Teraz są w kodzie (`shared/cities.ts`).
- Geometria tras (polylines) nigdy nie była zapisywana przez żaden task; teraz odświeża ją collector.
- Rake task `set_traffic_load_for_samples` odwoływał się do nieistniejącej klasy `SamplesDataManager`.
- Liczby trzymane jako stringi, dopasowanie próbek oknem ±8 minut i zapytania N+1; teraz sloty 15-minutowe w strefie Europe/Warsaw (z obsługą zmiany czasu).
- „Typowy dzień” liczony był z ostatnich 7 dni po nazwie dnia tygodnia; teraz są narastające średnie z całej historii.
- Frontend używał globalnego `TrafficWatch.defaultcity`, mutowalnego cache na prototypie komponentu i porównywał godzinę-string z liczbą.
- CSRF `protect_from_forgery` na JSON-owym API, HTTP zamiast HTTPS, Google Maps bez klucza.

## Praca lokalna

Wymagane: Node 22, pnpm.

```bash
pnpm install
pnpm test        # testy backendu i i18n (vitest)
pnpm typecheck
pnpm --filter @traffic-watch/web dev   # UI z proxy /api do https://traffic.isy.sh
```

## Wdrożenie

```bash
AWS_PROFILE=private pnpm run deploy
```

Stack `TrafficWatchEdge` (us-east-1) tworzy strefę `traffic.isy.sh` i certyfikat; strefa `isy.sh` deleguje do niej rekordem NS. Stack `TrafficWatch` (eu-central-1) zawiera resztę. Pierwszy raz: `cdk bootstrap` w obu regionach.

Nowy wlot do miasta dodaje się w `shared/cities.ts`; collector podejmie go przy następnym uruchomieniu.

## Licencja i współpraca

MIT, zobacz `LICENSE`. Propozycje zmian mile widziane, zobacz `CONTRIBUTING.md`.

Pierwsza wersja (2014) powstała przy wsparciu mentorów z Rebased: Bernarda Potockiego, Krzysztofa Modrasa i Tomasza Stachewicza.

## Autor

[Piotr Zientara](https://piotrzientara.pl/)
