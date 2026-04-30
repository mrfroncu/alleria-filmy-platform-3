// ============================================================
//  REGULAMIN PLATFORMY ALLERIA FILMY
//  Edytuj ten plik aby zmienić treść regulaminu lub datę.
// ============================================================

export const REGULAMIN_LAST_MODIFIED = '1 maja 2025 r.';

export function RegulaminContent() {
  return (
    <>
      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§1. Postanowienia ogólne</h3>
        <p>
          Alleria Filmy to prywatna platforma wideo dostępna wyłącznie dla członków społeczności Alleria.
          Administratorem platformy i danych osobowych jest Alleria.pl.
          Korzystanie z platformy jest równoznaczne z akceptacją niniejszego Regulaminu.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§2. Dostęp do platformy</h3>
        <ul className="space-y-1.5 list-disc list-inside marker:text-violet-500">
          <li>Dostęp mają wyłącznie osoby posiadające wymaganą rolę na serwerze Discord Alleria lub wymaganą grupę serwerową na TeamSpeak.</li>
          <li>Konto jest ściśle osobiste i nie może być udostępniane innym osobom.</li>
          <li>Administrator zastrzega sobie prawo do odmowy lub cofnięcia dostępu bez podania przyczyny.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§3. Zasady korzystania z treści</h3>
        <ul className="space-y-1.5 list-disc list-inside marker:text-violet-500">
          <li>Materiały dostępne na platformie są przeznaczone wyłącznie do wewnętrznego użytku społeczności Alleria.</li>
          <li>Zabronione jest pobieranie, retransmisja, udostępnianie lub kopiowanie treści poza platformę bez zgody administratora.</li>
          <li>Zabronione jest nagrywanie materiałów wideo dostępnych na platformie.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§4. Odpowiedzialność</h3>
        <ul className="space-y-1.5 list-disc list-inside marker:text-violet-500">
          <li>Użytkownik odpowiada za wszelkie działania wykonane na swoim koncie.</li>
          <li>Administrator nie ponosi odpowiedzialności za przerwy w działaniu platformy, utratę danych ani szkody wynikające z korzystania z serwisu.</li>
          <li>Platforma jest udostępniana w stanie „tak jak jest" (as-is), bez gwarancji ciągłości działania.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§5. Ochrona danych osobowych (RODO)</h3>
        <p className="mb-3">
          Zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO) informujemy:
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Administrator danych</p>
            <p>
              Alleria.pl. Kontakt w sprawach danych osobowych:{' '}
              <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">
                kontakt@alleria.pl
              </a>
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Przetwarzane dane i cel</p>
            <ul className="list-disc list-inside space-y-1 mt-1 marker:text-violet-500">
              <li>
                <strong>Discord:</strong> ID konta, nazwa użytkownika, awatar — pobierane przez protokół OAuth2
                (platforma nie przechowuje hasła do konta Discord).
              </li>
              <li>
                <strong>TeamSpeak:</strong> adres IP klienta w momencie logowania, unikalny identyfikator UID,
                nazwa użytkownika (nickname) — wyłącznie w celu weryfikacji tożsamości.
              </li>
              <li>
                <strong>Aktywność:</strong> historia obejrzanych filmów i logi logowania — wyłącznie do celów
                statystycznych i bezpieczeństwa platformy.
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Podstawa prawna przetwarzania</p>
            <p>
              Art. 6 ust. 1 lit. b RODO (realizacja usługi) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony
              interes administratora — bezpieczeństwo i integralność platformy).
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Okres przechowywania danych</p>
            <p>
              Dane przechowywane są przez czas korzystania z platformy. Po usunięciu konta lub cofnięciu dostępu
              dane są usuwane w ciągu 30 dni, o ile przepisy prawa nie wymagają ich dłuższego przechowywania.
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Odbiorcy danych</p>
            <p>
              Dane nie są udostępniane podmiotom trzecim ani przekazywane poza Europejski Obszar Gospodarczy (EOG).
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Twoje prawa (art. 15–21 RODO)</p>
            <p className="mb-1">Masz prawo do:</p>
            <ul className="list-disc list-inside space-y-1 marker:text-violet-500">
              <li><strong>dostępu</strong> do swoich danych osobowych (art. 15)</li>
              <li><strong>sprostowania</strong> nieprawidłowych danych (art. 16)</li>
              <li><strong>usunięcia</strong> danych — „prawo do bycia zapomnianym" (art. 17)</li>
              <li><strong>ograniczenia przetwarzania</strong> (art. 18)</li>
              <li><strong>przenoszenia danych</strong> (art. 20)</li>
              <li><strong>sprzeciwu</strong> wobec przetwarzania danych (art. 21)</li>
            </ul>
            <p className="mt-2">
              Aby skorzystać z powyższych praw lub wycofać zgodę, skontaktuj się z nami:{' '}
              <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">
                kontakt@alleria.pl
              </a>
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Prawo do skargi</p>
            <p>
              Masz prawo wniesienia skargi do organu nadzorczego — Prezesa Urzędu Ochrony Danych Osobowych
              (UODO), ul. Stawki 2, 00-193 Warszawa,{' '}
              <a
                href="https://uodo.gov.pl"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:text-violet-400 underline"
              >
                uodo.gov.pl
              </a>
              .
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Zautomatyzowane podejmowanie decyzji</p>
            <p>
              Dane nie są wykorzystywane do profilowania ani zautomatyzowanego podejmowania decyzji
              w rozumieniu art. 22 RODO.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§6. Pliki cookie i dane sesji</h3>
        <p>
          Platforma używa plików cookie wyłącznie w celu utrzymania sesji zalogowanego użytkownika (cookies sesyjne).
          Pliki te są niezbędne do prawidłowego działania serwisu i nie są wykorzystywane do śledzenia ani reklamy.
          Zamknięcie przeglądarki lub wylogowanie powoduje usunięcie sesji.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§7. Zmiany regulaminu</h3>
        <p>
          Administrator zastrzega sobie prawo do zmiany niniejszego Regulaminu. O istotnych zmianach użytkownicy
          będą informowani z odpowiednim wyprzedzeniem. Dalsze korzystanie z platformy po wejściu w życie zmian
          jest równoznaczne z ich akceptacją.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§8. Kontakt</h3>
        <p>
          W sprawach dotyczących platformy, treści oraz danych osobowych (w tym żądań usunięcia danych) prosimy
          o kontakt:{' '}
          <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">
            kontakt@alleria.pl
          </a>
        </p>
      </section>

      <p className="text-xs text-zinc-400 dark:text-zinc-600 pt-3 border-t border-zinc-100 dark:border-white/10">
        Korzystanie z platformy Alleria Filmy jest równoznaczne z akceptacją niniejszego Regulaminu i Polityki
        Prywatności.
      </p>
    </>
  );
}
