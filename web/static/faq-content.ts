import type { Lang } from "../src/i18n/types";

export interface FaqPage {
  title: string;
  description: string;
  heading: string;
  intro: string;
  back: string;
  updated: string;
  items: { q: string; a: string[] }[];
}

const REPO = '<a href="https://github.com/Tuhaj/traffic-watch-2026">github.com/Tuhaj/traffic-watch-2026</a>';
const AUTHOR = '<a href="https://piotrzientara.pl/">Piotr Zientara</a>';

export const FAQ: Record<Lang, FaqPage> = {
  pl: {
    title: "FAQ i prywatność · Traffic Watch Warszawa",
    description:
      "Jak działa Traffic Watch: skąd są dane o czasie dojazdu do centrum Warszawy, jak liczymy prognozy dla samochodu, komunikacji i roweru, i jak dbamy o prywatność bez ciasteczek.",
    heading: "Najczęstsze pytania",
    intro: "Wszystko o tym, skąd biorą się dane, jak je liczymy i co dzieje się z Twoimi danymi.",
    back: "Wróć do mapy",
    updated: "Ostatnia aktualizacja: listopad 2026",
    items: [
      {
        q: "Czym jest Traffic Watch?",
        a: [
          "To darmowa, otwarta aplikacja, która pokazuje, ile w tej chwili jedzie się do centrum Warszawy z 12 wlotów do miasta: od Łomianek i Jabłonny po Piaseczno, Raszyn i Pruszków. Widać przebieg całego dnia, porównanie z typowym dniem tygodnia oraz różnicę między dniem a nocą.",
          "Zakładka „Mój dojazd” liczy podróż między Twoim domem a pracą samochodem, komunikacją miejską albo rowerem i podpowiada, o której najlepiej wyjechać.",
        ],
      },
      {
        q: "Skąd pochodzą dane?",
        a: [
          "Czasy przejazdu samochodem i prognozy pochodzą z Amazon Location Service (silnik HERE z danymi o ruchu). Komunikacja miejska to ten sam serwis w trybie transportu publicznego, oparty na rozkładach ZTM. Trasy rowerowe liczy Valhalla na danych OpenStreetMap. Mapa to OpenFreeMap.",
          "Sprawdziliśmy otwarte dane miasta. ZDM publikuje natężenie ruchu (liczbę pojazdów), ale nie czasy przejazdu, a API miasta nie ma wyszukiwarki połączeń. Dlatego czasy mierzymy sami.",
        ],
      },
      {
        q: "Jak często są pomiary?",
        a: ["Co 15 minut między 5:00 a 23:00 i co godzinę w nocy. Każdy pomiar to 12 tras z wlotów do Ronda Dmowskiego."],
      },
      {
        q: "Co oznacza „średni czas dojazdu” i „vs. pusta droga”?",
        a: [
          "Średni czas dojazdu to średnia z 12 tras, w której dłuższe trasy mają większą wagę. „Pusta droga” to czas przejazdu bez ruchu, więc „+30%” znaczy, że jedzie się o 30% dłużej niż w nocy przy pustych ulicach.",
          "Kolory: zielony to ruch płynny, żółty umiarkowany, pomarańczowy korki, czerwony paraliż.",
        ],
      },
      {
        q: "Skąd się bierze linia „zwykle”?",
        a: ["To średnia ze wszystkich dotychczasowych pomiarów o tej samej porze w ten sam dzień tygodnia. Im dłużej działa aplikacja, tym jest dokładniejsza."],
      },
      {
        q: "Jak działa „Mój dojazd”?",
        a: [
          "Wpisz adres domu i pracy albo wskaż je na mapie. Dla samochodu i komunikacji liczymy podróż dla 26 godzin wyjazdu: rano od 5:30 do 10:30, po południu od 14:00 do 20:00 i w nocy o 3:00. Kliknięcie słupka pokazuje szczegóły i trasę na mapie.",
          "Samochód korzysta z prognozy ruchu na podstawie historii. Komunikacja liczy czas od drzwi do drzwi, razem z dojściem i czekaniem na przystanku. Rower zakłada spokojną jazdę miejską, ok. 18 km/h.",
        ],
      },
      {
        q: "Czy prognoza jest dokładna?",
        a: [
          "Prognoza opiera się na typowym ruchu w danym dniu tygodnia i porze. Nie przewidzi wypadku, remontu ani nagłego zamknięcia ulicy, więc traktuj ją jako wskazówkę, kiedy zwykle jedzie się najlepiej.",
        ],
      },
      {
        q: "Dlaczego punkty muszą leżeć do 60 km od centrum?",
        a: ["Aplikacja dotyczy dojazdów w aglomeracji warszawskiej, a limit chroni przed nadużyciami płatnych usług wyznaczania tras."],
      },
      {
        q: "Czy strona używa ciasteczek?",
        a: [
          "Nie. Nie używamy ciasteczek ani identyfikatorów zapisywanych w przeglądarce, więc nie ma banera zgody.",
          "W pamięci przeglądarki (localStorage) zapisujemy tylko Twoje ustawienia: wybrany język, środek transportu oraz punkty dom i praca. Nie opuszczają one Twojego urządzenia inaczej niż w zapytaniu o trasę.",
        ],
      },
      {
        q: "Jak liczycie odwiedziny?",
        a: [
          "Liczymy tylko zbiorcze statystyki: odsłony stron, domenę, z której ktoś przyszedł, język, typ urządzenia i kraj. Unikalnych odwiedzających liczymy przez skrót z adresu IP i przeglądarki, który zmienia się co dzień i jest usuwany po dwóch dniach. Samego adresu IP nie zapisujemy.",
          "Jeśli masz włączone „Do Not Track” albo Global Privacy Control, nic nie jest wysyłane.",
        ],
      },
      {
        q: "Co dzieje się z adresem domu i pracy?",
        a: [
          "Do obliczeń zaokrąglamy punkty do ok. 100 m. Wynik trzymamy przez 7 dni w pamięci podręcznej, żeby nie liczyć tego samego dwa razy, a kluczem jest skrót, nie współrzędne. Podpowiedzi adresów nie są zapisywane.",
        ],
      },
      {
        q: "Czy mogę dodać miasto, wlot albo poprawkę?",
        a: [
          `Tak, kod jest otwarty na licencji MIT: ${REPO}. Zgłoś pomysł albo błąd w Issues, a jeśli chcesz, otwórz pull request. Nowy wlot do miasta to jedna linijka w pliku shared/cities.ts.`,
        ],
      },
      {
        q: "Kto to zrobił?",
        a: [
          `${AUTHOR}. Pierwsza wersja powstała w 2014 roku jako projekt open source przy wsparciu mentorów z Rebased: Bernarda Potockiego, Krzysztofa Modrasa i Tomasza Stachewicza. W 2026 roku aplikacja została przepisana od nowa.`,
        ],
      },
    ],
  },
  en: {
    title: "FAQ and privacy · Traffic Watch Warsaw",
    description:
      "How Traffic Watch works: where the Warsaw travel time data comes from, how we forecast trips by car, public transport and bike, and how we respect privacy without cookies.",
    heading: "Frequently asked questions",
    intro: "Where the data comes from, how we calculate it and what happens to your data.",
    back: "Back to the map",
    updated: "Last updated: November 2026",
    items: [
      {
        q: "What is Traffic Watch?",
        a: [
          "A free, open source app that shows how long it currently takes to drive into central Warsaw from 12 city entry points, from Łomianki and Jabłonna to Piaseczno, Raszyn and Pruszków. You can see the whole day, compare it with a typical day of the week, and compare day with night.",
          "The “My commute” tab calculates the trip between your home and work by car, public transport or bike and tells you when it is best to leave.",
        ],
      },
      {
        q: "Where does the data come from?",
        a: [
          "Car travel times and forecasts come from Amazon Location Service (the HERE engine with traffic data). Public transport uses the same service in transit mode, based on ZTM timetables. Bike routes are calculated by Valhalla on OpenStreetMap data. The map is OpenFreeMap.",
          "We checked the city's open data. The roads authority (ZDM) publishes traffic volumes, not travel times, and the city API has no journey planner, so we measure travel times ourselves.",
        ],
      },
      {
        q: "How often are measurements taken?",
        a: ["Every 15 minutes between 5:00 and 23:00 and hourly at night. Each measurement covers 12 routes from the entry points to Rondo Dmowskiego."],
      },
      {
        q: "What do “average travel time” and “vs. empty road” mean?",
        a: [
          "The average travel time is the mean of the 12 routes, with longer routes weighted more. “Empty road” is the travel time without traffic, so “+30%” means the trip takes 30% longer than on empty streets at night.",
          "Colours: green is free flow, yellow moderate, orange heavy traffic, red gridlock.",
        ],
      },
      {
        q: "Where does the “usual” line come from?",
        a: ["It is the average of all previous measurements at the same time on the same day of the week. The longer the app runs, the more accurate it gets."],
      },
      {
        q: "How does “My commute” work?",
        a: [
          "Type your home and work addresses or pick them on the map. For car and public transport we calculate 26 departure times: mornings from 5:30 to 10:30, afternoons from 14:00 to 20:00 and at night at 3:00. Clicking a bar shows the details and the route on the map.",
          "Car uses a traffic forecast based on history. Public transport is door to door, including walking and waiting at the stop. Bike assumes relaxed city riding at about 18 km/h.",
        ],
      },
      {
        q: "How accurate is the forecast?",
        a: [
          "It is based on typical traffic for that day of the week and time. It cannot predict an accident, roadworks or a sudden closure, so treat it as a guide to when the trip is usually fastest.",
        ],
      },
      {
        q: "Why must both points be within 60 km of the centre?",
        a: ["The app is about commuting in the Warsaw metropolitan area, and the limit protects the paid routing services from abuse."],
      },
      {
        q: "Does the site use cookies?",
        a: [
          "No. We use no cookies and no identifiers stored in your browser, so there is no consent banner.",
          "Browser storage (localStorage) only keeps your settings: language, mode of transport and your home and work points. They only leave your device as part of a route request.",
        ],
      },
      {
        q: "How do you count visits?",
        a: [
          "We only keep aggregate statistics: page views, the referring domain, language, device type and country. Daily unique visitors are counted with a hash of the IP address and browser that changes every day and is deleted after two days. The IP address itself is never stored.",
          "If Do Not Track or Global Privacy Control is enabled, nothing is sent.",
        ],
      },
      {
        q: "What happens to my home and work addresses?",
        a: [
          "For the calculation we round the points to about 100 m. The result is cached for 7 days so we do not calculate the same trip twice, keyed by a hash rather than the coordinates. Address suggestions are never stored.",
        ],
      },
      {
        q: "Can I add a city, an entry point or a fix?",
        a: [
          `Yes, the code is open source under the MIT licence: ${REPO}. Report an idea or a bug in Issues, or open a pull request. A new entry point is a single line in shared/cities.ts.`,
        ],
      },
      {
        q: "Who made this?",
        a: [
          `${AUTHOR}. The first version was built in 2014 as an open source project with the support of mentors at Rebased: Bernard Potocki, Krzysztof Modras and Tomasz Stachewicz. In 2026 the app was rewritten from scratch.`,
        ],
      },
    ],
  },
  uk: {
    title: "Питання та приватність · Traffic Watch Варшава",
    description:
      "Як працює Traffic Watch: звідки дані про час дороги до центру Варшави, як ми прогнозуємо поїздки автомобілем, громадським транспортом і велосипедом та як дбаємо про приватність без cookie.",
    heading: "Поширені запитання",
    intro: "Звідки беруться дані, як ми їх рахуємо і що відбувається з вашими даними.",
    back: "Повернутися до мапи",
    updated: "Останнє оновлення: листопад 2026",
    items: [
      {
        q: "Що таке Traffic Watch?",
        a: [
          "Це безкоштовний відкритий застосунок, який показує, скільки зараз триває дорога до центру Варшави з 12 в'їздів до міста: від Ломянок і Яблонни до Пясечна, Рашина і Прушкова. Видно перебіг усього дня, порівняння з типовим днем тижня та різницю між днем і ніччю.",
          "Вкладка «Моя дорога» розраховує поїздку між вашим домом і роботою автомобілем, громадським транспортом або велосипедом і підказує, коли краще виїжджати.",
        ],
      },
      {
        q: "Звідки беруться дані?",
        a: [
          "Час поїздки автомобілем і прогнози надає Amazon Location Service (рушій HERE з даними про рух). Громадський транспорт рахує той самий сервіс у режимі транзиту на основі розкладів ZTM. Велосипедні маршрути будує Valhalla на даних OpenStreetMap. Мапа: OpenFreeMap.",
          "Ми перевірили відкриті дані міста. Управління доріг (ZDM) публікує інтенсивність руху, а не час поїздки, а API міста не має планувальника маршрутів, тож час у дорозі ми вимірюємо самі.",
        ],
      },
      {
        q: "Як часто проводяться вимірювання?",
        a: ["Кожні 15 хвилин з 5:00 до 23:00 і щогодини вночі. Кожне вимірювання охоплює 12 маршрутів від в'їздів до Rondo Dmowskiego."],
      },
      {
        q: "Що означають «середній час у дорозі» та «порівняно з порожньою дорогою»?",
        a: [
          "Середній час у дорозі це середнє значення 12 маршрутів, де довші маршрути мають більшу вагу. «Порожня дорога» означає час без руху, тож «+30%» означає, що поїздка триває на 30% довше, ніж уночі на порожніх вулицях.",
          "Кольори: зелений означає вільний рух, жовтий помірний, помаранчевий затори, червоний колапс.",
        ],
      },
      {
        q: "Звідки береться лінія «зазвичай»?",
        a: ["Це середнє значення всіх попередніх вимірювань у той самий час того самого дня тижня. Що довше працює застосунок, то точніша ця лінія."],
      },
      {
        q: "Як працює «Моя дорога»?",
        a: [
          "Введіть адресу дому та роботи або вкажіть їх на мапі. Для автомобіля і громадського транспорту ми розраховуємо 26 варіантів часу виїзду: зранку з 5:30 до 10:30, після обіду з 14:00 до 20:00 і вночі о 3:00. Натискання на стовпчик показує деталі та маршрут на мапі.",
          "Для автомобіля використовується прогноз руху на основі історії. Громадський транспорт рахується від дверей до дверей, разом із пішою частиною та очікуванням на зупинці. Для велосипеда ми припускаємо спокійну їзду містом близько 18 км/год.",
        ],
      },
      {
        q: "Наскільки точний прогноз?",
        a: [
          "Прогноз базується на типовому русі в цей день тижня і в цей час. Він не передбачить аварії, ремонту чи раптового перекриття вулиці, тож сприймайте його як підказку, коли зазвичай їхати найкраще.",
        ],
      },
      {
        q: "Чому точки мають бути в межах 60 км від центру?",
        a: ["Застосунок стосується поїздок у Варшавській агломерації, а обмеження захищає платні сервіси побудови маршрутів від зловживань."],
      },
      {
        q: "Чи використовує сайт cookie?",
        a: [
          "Ні. Ми не використовуємо cookie та ідентифікаторів, що зберігаються у браузері, тож банера згоди немає.",
          "У пам'яті браузера (localStorage) зберігаються лише ваші налаштування: мова, вид транспорту та точки дому й роботи. Вони залишають ваш пристрій лише як частина запиту маршруту.",
        ],
      },
      {
        q: "Як ви рахуєте відвідування?",
        a: [
          "Ми зберігаємо лише зведену статистику: перегляди сторінок, домен, з якого прийшов відвідувач, мову, тип пристрою та країну. Унікальних відвідувачів за день рахуємо за хешем IP-адреси та браузера, який змінюється щодня і видаляється через два дні. Саму IP-адресу ми не зберігаємо.",
          "Якщо увімкнено Do Not Track або Global Privacy Control, нічого не надсилається.",
        ],
      },
      {
        q: "Що відбувається з адресою дому та роботи?",
        a: [
          "Для розрахунку ми округлюємо точки приблизно до 100 м. Результат зберігається в кеші 7 днів, щоб не рахувати ту саму поїздку двічі, а ключем є хеш, а не координати. Підказки адрес не зберігаються.",
        ],
      },
      {
        q: "Чи можу я додати місто, в'їзд або виправлення?",
        a: [
          `Так, код відкритий за ліцензією MIT: ${REPO}. Повідомте ідею чи помилку в Issues або відкрийте pull request. Новий в'їзд до міста це один рядок у файлі shared/cities.ts.`,
        ],
      },
      {
        q: "Хто це зробив?",
        a: [
          `${AUTHOR}. Перша версія з'явилася у 2014 році як проєкт з відкритим кодом за підтримки менторів з Rebased: Бернарда Потоцького, Кшиштофа Модраса і Томаша Стахевича. У 2026 році застосунок переписано з нуля.`,
        ],
      },
    ],
  },
};
