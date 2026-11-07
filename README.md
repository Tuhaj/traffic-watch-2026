# Traffic Watch 2026

Ile dziś jedzie się do centrum Warszawy? Traffic Watch mierzy co 15 minut czas dojazdu z 12 wlotów do miasta do Ronda Dmowskiego, pokazuje przebieg dnia na tle typowego dnia tygodnia i porównuje dzień z nocą. Zakładka „Mój dojazd” pozwala zaznaczyć dom i pracę, a potem wskazuje najlepsze godziny wyjazdu do pracy i powrotu.

**Na żywo:** https://traffic.isy.sh

To przepisana wersja projektu z 2015 roku (Ember 1.8 + Rails 4.1 + Bing Maps).

## Funkcje

- **Miasto, teraz:** mapa 12 korytarzy pokolorowanych wg korków, średni czas dojazdu, odchylenie od pustej drogi i od typowego dnia.
- **Przebieg dnia:** wykres całego dnia na tle średniej dla tego dnia tygodnia; przeciągnięcie po wykresie „przewija” mapę w czasie. Ostatnie 7 dni do wyboru.
- **Dzień vs noc:** najgorszy moment dnia (06:00-20:00) zestawiony z najspokojniejszym pomiarem nocnym, dla miasta i dla każdego wlotu.
- **Mój dojazd:** dom i praca zaznaczone na mapie (można przeciągać). Backend liczy prognozę dla 26 godzin wyjazdu (rano 05:30-10:30, popołudnie 14:00-20:00, noc 03:00) na wybrany dzień tygodnia i wskazuje najlepszą godzinę oraz różnicę dzień/noc.

## Skąd dane

Sprawdziliśmy publiczne źródła Warszawy. ZDM publikuje natężenie ruchu z systemu APR (liczba pojazdów, raport w przeglądarce, bez API i bez dróg ekspresowych), a api.um.warszawa.pl / dane.um.warszawa.pl udostępniają głównie dane komunikacji miejskiej. Nie ma publicznych czasów przejazdu, więc zostały crony.

Czasy przejazdu pochodzą z **Amazon Location Service Routes** (silnik HERE, `Traffic: UseTrafficData`): `Duration` to czas z bieżącym ruchem, `BestCaseDuration` to czas przy pustej drodze. Dla przyszłych godzin wyjazdu (Mój dojazd) HERE zwraca prognozę na podstawie historycznych wzorców ruchu. Bing Maps, z którego korzystała stara wersja, został wygaszony.

Koszt: 0,50 USD za 1000 tras. 12 tras × 78 pomiarów dziennie (co 15 min w 05:00-22:45, co godzinę w nocy) to około 14 USD miesięcznie. Pierwsze 3 miesiące obejmuje free tier (10 tys. tras miesięcznie). Jedno nowe wyszukiwanie dojazdu to 26 tras (ok. 0,013 USD); wyniki są cache'owane 7 dni, a dzienne limity (na IP i globalny) ograniczają najgorszy przypadek do ok. 2 USD dziennie.

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
| `QUOTA#<data>` | `ALL` / `IP#<sha256>` | dzienne limity wyszukiwań |

Zapis pomiaru jest warunkowy (`attribute_not_exists`), więc ponowienie tego samego slotu nie liczy się podwójnie do profili.

### API

- `GET /api/cities`
- `GET /api/cities/warszawa`: trasy z geometrią i ostatni pomiar
- `GET /api/cities/warszawa/day?date=YYYY-MM-DD`
- `GET /api/cities/warszawa/profile?dow=1..7`
- `GET /api/commute?home=lng,lat&work=lng,lat&dow=1..7`

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
pnpm test        # testy backendu (vitest)
pnpm typecheck
pnpm --filter @traffic-watch/web dev   # UI z proxy /api do https://traffic.isy.sh
```

## Wdrożenie

```bash
AWS_PROFILE=private pnpm run deploy
```

Stack `TrafficWatchEdge` (us-east-1) tworzy strefę `traffic.isy.sh` i certyfikat; strefa `isy.sh` deleguje do niej rekordem NS. Stack `TrafficWatch` (eu-central-1) zawiera resztę. Pierwszy raz: `cdk bootstrap` w obu regionach.

Nowy wlot do miasta dodaje się w `shared/cities.ts`; collector podejmie go przy następnym uruchomieniu.

## Autor

[Piotr Zientara](https://piotrzientara.pl/)
