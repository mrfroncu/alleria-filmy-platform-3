// Default Regulamin content — seeds app_settings.tos_content the first time it's read, before
// any dev has edited it from Dev Tools. Migrated verbatim from the old frontend/src/data/regulamin.jsx.
const DEFAULT_TOS_MD = `## §1. Postanowienia ogólne

Alleria Filmy to prywatna platforma wideo dostępna wyłącznie dla członków społeczności Alleria. Administratorem platformy jest Alleria.pl. Korzystanie z platformy jest równoznaczne z akceptacją niniejszego Regulaminu.

## §2. Dostęp do platformy

- Dostęp mają wyłącznie osoby posiadające wymaganą rolę na serwerze Discord Alleria lub wymaganą grupę serwerową na serwerze TeamSpeak.
- Konto jest ściśle osobiste i nie może być udostępniane innym osobom.
- Administrator zastrzega sobie prawo do odmowy lub cofnięcia dostępu bez podania przyczyny.

## §3. Zasady korzystania z treści

- Materiały dostępne na platformie są przeznaczone wyłącznie do wewnętrznego użytku społeczności Alleria.
- Zabronione jest pobieranie, retransmisja, udostępnianie lub kopiowanie treści poza platformę bez zgody administratora.
- Zabronione jest nagrywanie materiałów wideo dostępnych na platformie.

## §4. Odpowiedzialność

- Użytkownik odpowiada za wszelkie działania wykonane na swoim koncie.
- Platforma jest udostępniana w stanie „tak jak jest" (as-is), bez gwarancji ciągłości działania.

## §5. Ochrona danych osobowych (RODO)

Zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO) informujemy:

**Przetwarzane dane i cel**

- **Discord:** ID konta, nazwa użytkownika, awatar - pobierane przez protokół OAuth2 (platforma nie przechowuje hasła do konta Discord).
- **TeamSpeak:** adres IP klienta w momencie logowania, unikalny identyfikator UID, nazwa użytkownika (nickname) - wyłącznie w celu weryfikacji tożsamości.
- **Aktywność:** historia obejrzanych filmów i logi logowania - wyłącznie do celów statystycznych i bezpieczeństwa platformy.

**Podstawa prawna przetwarzania**

Art. 6 ust. 1 lit. b RODO (realizacja usługi) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes administratora - bezpieczeństwo i integralność platformy).

**Okres przechowywania danych**

Dane przechowywane są przez czas korzystania z platformy. Po usunięciu konta lub cofnięciu dostępu dane są usuwane w ciągu 30 dni, o ile przepisy prawa nie wymagają ich dłuższego przechowywania.

**Odbiorcy danych**

Dane nie są udostępniane podmiotom trzecim ani przekazywane poza Europejski Obszar Gospodarczy (EOG).

**Twoje prawa (art. 15–21 RODO)**

Masz prawo do:

- **dostępu** do swoich danych osobowych (art. 15)
- **sprostowania** nieprawidłowych danych (art. 16)
- **usunięcia** danych - „prawo do bycia zapomnianym" (art. 17)
- **ograniczenia przetwarzania** (art. 18)
- **przenoszenia danych** (art. 20)
- **sprzeciwu** wobec przetwarzania danych (art. 21)

Aby skorzystać z powyższych praw lub wycofać zgodę, skontaktuj się z nami: [kontakt@alleria.pl](mailto:kontakt@alleria.pl)

**Zautomatyzowane podejmowanie decyzji**

Dane nie są wykorzystywane do profilowania ani zautomatyzowanego podejmowania decyzji w rozumieniu art. 22 RODO.

## §6. Pliki cookie i dane sesji

Platforma używa plików cookie wyłącznie w celu utrzymania sesji zalogowanego użytkownika (cookies sesyjne). Pliki te są niezbędne do prawidłowego działania serwisu i nie są wykorzystywane do śledzenia ani reklamy. Zamknięcie przeglądarki lub wylogowanie powoduje usunięcie sesji.

## §7. Zmiany regulaminu

Administrator zastrzega sobie prawo do zmiany niniejszego Regulaminu. O istotnych zmianach użytkownicy będą informowani z odpowiednim wyprzedzeniem. Dalsze korzystanie z platformy po wejściu w życie zmian jest równoznaczne z ich akceptacją.

## §8. Kontakt

W sprawach dotyczących platformy, treści oraz danych osobowych (w tym żądań usunięcia danych) prosimy o kontakt: [kontakt@alleria.pl](mailto:kontakt@alleria.pl)`;

const DEFAULT_TOS_UPDATED_AT = '2026-07-29T00:00:00.000Z';

module.exports = { DEFAULT_TOS_MD, DEFAULT_TOS_UPDATED_AT };
