// Default Regulamin content — seeds app_settings.tos_content the first time it's read, before
// any dev has edited it from Dev Tools. Migrated verbatim from the old frontend/src/data/regulamin.jsx.
const DEFAULT_TOS_MD = `## §1. Postanowienia ogólne

Alleria Filmy to prywatna platforma wideo dostępna wyłącznie dla członków społeczności Alleria. Administratorem platformy jest Alleria.pl. Korzystanie z platformy jest równoznaczne z akceptacją niniejszego Regulaminu.

## §2. Dostęp do platformy

- Dostęp mają wyłącznie osoby posiadające wymaganą rolę na serwerze Discord Alleria lub wymaganą grupę serwerową na serwerze TeamSpeak.
- Z platformy mogą korzystać wyłącznie osoby pełnoletnie (które ukończyły 18 lat), posiadające pełną zdolność do czynności prawnych.
- Konto jest ściśle osobiste i nie może być udostępniane innym osobom.
- Administrator zastrzega sobie prawo do odmowy lub cofnięcia dostępu bez podania przyczyny.

## §3. Zasady korzystania z treści

- Materiały dostępne na platformie są przeznaczone wyłącznie do wewnętrznego użytku społeczności Alleria.
- Zabronione jest pobieranie, retransmisja, udostępnianie lub kopiowanie treści poza platformę bez zgody administratora.
- Zabronione jest nagrywanie materiałów wideo dostępnych na platformie.
- Platforma udostępnia funkcję wspólnego oglądania (Watch Party) — podczas wspólnej sesji Twoja nazwa użytkownika i awatar są widoczne dla pozostałych uczestników tej samej sesji, podobnie jak w przypadku komentarzy publikowanych pod filmami.
- Dla poszczególnych filmów zbierane są zbiorcze statystyki oglądalności (m.in. czas obejrzenia, punkty przerwania), dostępne dla autora danego materiału oraz administracji, wykorzystywane w celach analitycznych i poprawy jakości treści.

## §4. Odpowiedzialność

- Użytkownik odpowiada za wszelkie działania wykonane na swoim koncie.
- Platforma jest udostępniana w stanie „tak jak jest" (as-is), bez gwarancji ciągłości działania.

## §5. Ochrona danych osobowych (RODO)

Zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO) informujemy:

**Przetwarzane dane i cel**

- **Discord:** ID konta, nazwa użytkownika, awatar oraz adres e-mail powiązany z kontem Discord - pobierane przez protokół OAuth2 (platforma nie przechowuje hasła do konta Discord).
- **TeamSpeak:** adres IP klienta w momencie logowania, unikalny identyfikator UID, nazwa użytkownika (nickname) - wykorzystywane wyłącznie do dopasowania łączącego się klienta TeamSpeak do logującej się osoby oraz weryfikacji tożsamości.
- **Logowanie:** adres IP jest zapisywany przy każdej próbie logowania, niezależnie od metody logowania i tego, czy zakończyła się powodzeniem - w celach bezpieczeństwa i wykrywania nadużyć.
- **Aktywność:** historia obejrzanych filmów, ulubione oraz inna aktywność związana z korzystaniem z platformy - wyłącznie do celów statystycznych, analitycznych oraz bezpieczeństwa platformy.

**Podstawa prawna przetwarzania**

Art. 6 ust. 1 lit. b RODO (realizacja usługi) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes administratora - bezpieczeństwo i integralność platformy).

**Odbiorcy danych i przekazywanie poza Europejski Obszar Gospodarczy (EOG)**

Do prawidłowego działania platformy korzystamy z poniższych dostawców, którym mogą być przekazywane niektóre dane (w tym adres IP):

- **Discord** (Discord Inc. / Discord Netherlands B.V., USA) - logowanie odbywa się przez autoryzację OAuth2 bezpośrednio na stronie Discorda, który jest jednocześnie niezależnym administratorem Twoich danych na własnej platformie; my jedynie pobieramy od Discorda dane potrzebne do założenia i obsługi konta (ID, nazwa, rola, e-mail). Twój awatar jest ładowany bezpośrednio z serwerów Discorda przy każdym wyświetleniu profilu, co wiąże się z przekazaniem adresu IP osoby przeglądającej.
- **Cloudflare, Inc.** (USA) - infrastruktura sieciowa zapewniająca dostępność i bezpieczeństwo platformy.
- **Google LLC (Google Fonts)** - czcionki wyświetlane na stronie; przeglądarka użytkownika łączy się bezpośrednio z serwerami Google, co wiąże się z przekazaniem adresu IP.

Przekazanie danych do tych dostawców odbywa się w oparciu o mechanizmy prawne przewidziane w RODO (art. 44-49), stosowane przez poszczególnych dostawców zgodnie z ich politykami prywatności (m.in. standardowe klauzule umowne). Poza wskazanymi wyżej dostawcami dane nie są udostępniane innym podmiotom trzecim.

**Okres przechowywania danych**

Dane przechowywane są przez czas korzystania z platformy. Konto, w związku z którym zgłoszono usunięcie (patrz niżej), jest anonimizowane w ciągu 30 dni, o ile przepisy prawa nie wymagają dłuższego przechowywania niektórych danych.

**Usunięcie konta a usunięcie danych aktywności**

Zgłoszenie usunięcia konta (dostępne w ustawieniach profilu) powoduje usunięcie wszystkich informacji powiązanych z Twoim kontem, poza dodanymi materiałami wideo w przypadku redaktorów. Procedura ta trwa do 30 dni - dane identyfikujące (nazwa, awatar, ID Discord/TeamSpeak, e-mail), historia oglądania, ulubione, powiadomienia oraz logi (jeśli prawo nie wymaga ich dłuższego przechowywania) zostają usunięte. Ze względów technicznych (integralność bazy danych, treści powiązane z innymi użytkownikami) sam wpis konta oznaczony jako „Usunięty użytkownik" oraz dodane przez nie filmy pozostają w systemie, ale bez możliwości powiązania z Twoją tożsamością.

**Twoje prawa**

Masz prawo do:

- **dostępu** do swoich danych osobowych (art. 15 RODO)
- **sprostowania** nieprawidłowych danych (art. 16 RODO)
- **usunięcia** danych - „prawo do bycia zapomnianym" (art. 17 RODO)
- **ograniczenia przetwarzania** (art. 18 RODO)
- **przenoszenia danych** (art. 20 RODO)
- **sprzeciwu** wobec przetwarzania danych (art. 21 RODO)
- **wniesienia skargi** do Prezesa Urzędu Ochrony Danych Osobowych (UODO), jeśli uznasz, że przetwarzanie Twoich danych narusza przepisy o ochronie danych osobowych

Aby skorzystać z powyższych praw, skontaktuj się z nami: [kontakt@alleria.pl](mailto:kontakt@alleria.pl)

**Zautomatyzowane podejmowanie decyzji**

Dane nie są wykorzystywane do profilowania ani zautomatyzowanego podejmowania decyzji w rozumieniu art. 22 RODO.

## §6. Pliki cookie i podobne technologie

Platforma używa jednego pliku cookie, niezbędnego do utrzymania Twojej sesji. Cookie ten jest ważny maksymalnie 7 dni lub do momentu wylogowania.

Platforma zapisuje też lokalnie w Twojej przeglądarce (localStorage/sessionStorage) drobne ustawienia, takie jak preferowana jakość odtwarzania wideo czy kod trwającej sesji wspólnego oglądania (Watch Party) - wyłącznie po to, by zapamiętać te ustawienia między odwiedzinami. Dane te nie są wysyłane na zewnętrzne serwery ani wykorzystywane do śledzenia.

## §7. Zmiany regulaminu

Administrator zastrzega sobie prawo do zmiany niniejszego Regulaminu. O istotnych zmianach użytkownicy będą informowani z odpowiednim wyprzedzeniem. Dalsze korzystanie z platformy po wejściu w życie zmian jest równoznaczne z ich akceptacją.

## §8. Kontakt

W sprawach dotyczących platformy, treści oraz danych osobowych (w tym żądań usunięcia danych) prosimy o kontakt: [kontakt@alleria.pl](mailto:kontakt@alleria.pl)`;

const DEFAULT_TOS_UPDATED_AT = '2026-08-20T00:00:00.000Z';

module.exports = { DEFAULT_TOS_MD, DEFAULT_TOS_UPDATED_AT };
