import React, { useState, useEffect } from 'react';
import { AlertTriangle, Info, X, ChevronDown } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear } from '../utils/helpers';

export default function LoginPage() {
  const [tsLoading, setTsLoading] = useState(false);
  const [ts3Loading, setTs3Loading] = useState(false);
  const [configOk, setConfigOk] = useState(true);
  const [regulaminOpen, setRegulaminOpen] = useState(false);
  const [tsInfoOpen, setTsInfoOpen] = useState(false);

  const returnTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('returnTo');
    if (r && r.startsWith('/') && !r.startsWith('//') && r !== '/login') return r;
    return '';
  })();

  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'not_member') return 'Nie jesteś członkiem serwera Discord.';
    if (err === 'no_role') return 'Nie posiadasz wymaganej roli na serwerze Discord.';
    if (err === 'auth_failed') return 'Logowanie nie powiodło się. Spróbuj ponownie.';
    if (err === 'no_code') return 'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.';
    if (err === 'config_missing') return 'Serwer nie jest poprawnie skonfigurowany. Sprawdź plik .env.';
    return null;
  });

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => { if (!data.discord_configured) setConfigOk(false); })
      .catch(() => setConfigOk(false));
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'discord_auth_success') {
        const dest = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) ? returnTo : '/';
        window.location.href = dest;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [returnTo]);

  const handleDiscordLogin = (e) => {
    const inIframe = window.self !== window.top;
    if (inIframe) {
      e.preventDefault();
      const authUrl = '/auth/discord?popup=true';
      const width = 600, height = 800;
      const left = Math.round(window.screen.width / 2 - width / 2);
      const top = Math.round(window.screen.height / 2 - height / 2);
      const popup = window.open(authUrl, 'discord_oauth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,status=no`);
      if (!popup) window.top.location.href = authUrl;
    }
  };

  const handleTeamspeakLogin = async () => {
    setTsLoading(true);
    setError(null);
    try {
      await api.loginTeamspeak();
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Logowanie przez TeamSpeak 6 nie powiodło się.');
    } finally {
      setTsLoading(false);
    }
  };

  const handleTeamspeak3Login = async () => {
    setTs3Loading(true);
    setError(null);
    try {
      await api.loginTeamspeak3();
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Logowanie przez TeamSpeak 3 nie powiodło się.');
    } finally {
      setTs3Loading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 w-[70%] h-[70%] bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[70%] h-[70%] bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-sm w-full relative z-10 animate-slide-up">
        {/* Card */}
        <div className="bg-zinc-50/70 dark:bg-white/5 backdrop-blur-2xl rounded-3xl border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">

          {/* Header strip */}
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/10 overflow-hidden">
                <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-9 h-9 object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display leading-none">ALLERIA</h1>
                <p className="text-xs font-bold tracking-[0.3em] text-violet-500 font-display mt-0.5">FILMY</p>
              </div>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              Prywatna platforma wideo społeczności Alleria. Zaloguj się, aby uzyskać dostęp.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-zinc-200 dark:bg-white/10" />

          {/* Buttons section */}
          <div className="px-8 py-6 space-y-3">

            {/* Warnings */}
            {!configOk && (
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Serwer nie skonfigurowany</p>
                  <p className="opacity-75 mt-0.5">Brak danych Discord w .env. Sprawdź konfigurację i uruchom ponownie.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-700 dark:text-red-300 text-xs mb-1">
                {error}
              </div>
            )}

            {/* Discord */}
            <a
              href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
              onClick={handleDiscordLogin}
              className="w-full py-3.5 bg-[#5865F2] text-white rounded-2xl font-bold hover:bg-[#4752C4] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#5865F2]/25 text-sm no-underline"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
              </svg>
              Zaloguj przez Discord
            </a>

            {/* Separator */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-zinc-50/70 dark:bg-zinc-950 text-zinc-400 text-xs font-medium">lub przez TeamSpeak</span>
              </div>
            </div>

            {/* TeamSpeak buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleTeamspeakLogin}
                disabled={tsLoading || ts3Loading}
                className="py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-xs disabled:opacity-50 shadow-lg shadow-zinc-900/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span>{tsLoading ? 'Łączenie…' : 'TEAMSPEAK 6'}</span>
              </button>
              <button
                onClick={handleTeamspeak3Login}
                disabled={tsLoading || ts3Loading}
                className="py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-xs disabled:opacity-50 shadow-lg shadow-zinc-900/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span>{ts3Loading ? 'Łączenie…' : 'TEAMSPEAK 3'}</span>
              </button>
            </div>

            {/* TS requirements — collapsible */}
            <button
              onClick={() => setTsInfoOpen(v => !v)}
              className="w-full flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Jak działa logowanie przez TeamSpeak?</span>
              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${tsInfoOpen ? 'rotate-180' : ''}`} />
            </button>

            {tsInfoOpen && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5 pl-3 border-l-2 border-violet-500/30 animate-slide-up">
                <p>• Musisz być <strong className="text-zinc-700 dark:text-zinc-300">aktywnie połączony</strong> z serwerem TS w momencie logowania.</p>
                <p>• Weryfikacja odbywa się przez <strong className="text-zinc-700 dark:text-zinc-300">dopasowanie adresu IP</strong> — nie używaj VPN, który zmienia Twoje IP.</p>
                <p>• Wymagana jest <strong className="text-zinc-700 dark:text-zinc-300">odpowiednia grupa serwerowa</strong> na TS.</p>
              </div>
            )}
          </div>

          {/* Footer strip */}
          <div className="px-8 py-4 bg-zinc-100/50 dark:bg-black/20 border-t border-zinc-200 dark:border-white/10">
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
              Logując się akceptujesz{' '}
              <button
                onClick={() => setRegulaminOpen(true)}
                className="text-violet-500 hover:text-violet-400 underline underline-offset-2 transition-colors"
              >
                Regulamin
              </button>
              {' '}platformy Alleria Filmy.
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-zinc-400 dark:text-zinc-600">
          © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
          <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 transition-colors">Matthew</a>
        </p>
      </div>

      {/* ===== Regulamin Modal ===== */}
      {regulaminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRegulaminOpen(false); }}
        >
          <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 max-h-[90vh] flex flex-col animate-slide-up">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Regulamin platformy Alleria Filmy</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Ostatnia aktualizacja: 1 maja 2025 r.</p>
              </div>
              <button
                onClick={() => setRegulaminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors shrink-0 ml-4"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">

              <section>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§1. Postanowienia ogólne</h3>
                <p>Alleria Filmy to prywatna platforma wideo dostępna wyłącznie dla członków społeczności Alleria. Administratorem platformy i danych osobowych jest Alleria.pl. Korzystanie z platformy jest równoznaczne z akceptacją niniejszego Regulaminu.</p>
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
                <p className="mb-3">Zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO) informujemy:</p>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Administrator danych</p>
                    <p>Alleria.pl. Kontakt w sprawach danych osobowych: <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">kontakt@alleria.pl</a></p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Przetwarzane dane</p>
                    <ul className="list-disc list-inside space-y-1 mt-1 marker:text-violet-500">
                      <li>Discord: ID konta, nazwa użytkownika, awatar (przez protokół OAuth2 — platforma nie przechowuje hasła)</li>
                      <li>TeamSpeak: adres IP klienta, unikalny identyfikator UID, nazwa użytkownika (nickname)</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Cel i podstawa prawna przetwarzania</p>
                    <p>Dane są przetwarzane wyłącznie w celu uwierzytelniania użytkowników. Podstawa prawna: art. 6 ust. 1 lit. b RODO (wykonanie umowy / realizacja usługi) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes administratora w zakresie bezpieczeństwa platformy).</p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Okres przechowywania danych</p>
                    <p>Dane są przechowywane przez czas korzystania z platformy. Po usunięciu konta dane są usuwane w ciągu 30 dni, o ile przepisy prawa nie wymagają dłuższego przechowywania.</p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Odbiorcy danych</p>
                    <p>Dane nie są udostępniane podmiotom trzecim ani przekazywane poza Europejski Obszar Gospodarczy.</p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Twoje prawa</p>
                    <p className="mb-1">Masz prawo do:</p>
                    <ul className="list-disc list-inside space-y-1 marker:text-violet-500">
                      <li><strong>dostępu</strong> do swoich danych (art. 15 RODO)</li>
                      <li><strong>sprostowania</strong> danych (art. 16 RODO)</li>
                      <li><strong>usunięcia</strong> danych („prawo do bycia zapomnianym", art. 17 RODO)</li>
                      <li><strong>ograniczenia przetwarzania</strong> (art. 18 RODO)</li>
                      <li><strong>przenoszenia danych</strong> (art. 20 RODO)</li>
                      <li><strong>sprzeciwu</strong> wobec przetwarzania (art. 21 RODO)</li>
                    </ul>
                    <p className="mt-2">Aby skorzystać z powyższych praw, skontaktuj się z nami pod adresem: <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">kontakt@alleria.pl</a></p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Prawo do skargi</p>
                    <p>Masz prawo wniesienia skargi do organu nadzorczego — Prezesa Urzędu Ochrony Danych Osobowych (UODO), ul. Stawki 2, 00-193 Warszawa, <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 underline">uodo.gov.pl</a>.</p>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">Zautomatyzowane podejmowanie decyzji</p>
                    <p>Dane nie są wykorzystywane do profilowania ani zautomatyzowanego podejmowania decyzji, o którym mowa w art. 22 RODO.</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§6. Zmiany regulaminu</h3>
                <p>Administrator zastrzega sobie prawo do zmiany niniejszego Regulaminu. O istotnych zmianach użytkownicy będą informowani z odpowiednim wyprzedzeniem. Dalsze korzystanie z platformy po wejściu w życie zmian jest równoznaczne z ich akceptacją.</p>
              </section>

              <section>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">§7. Kontakt</h3>
                <p>W sprawach dotyczących platformy, treści oraz danych osobowych prosimy o kontakt pod adresem: <a href="mailto:kontakt@alleria.pl" className="text-violet-500 hover:text-violet-400 underline">kontakt@alleria.pl</a></p>
              </section>

              <p className="text-xs text-zinc-400 dark:text-zinc-600 pt-3 border-t border-zinc-100 dark:border-white/10">
                Korzystanie z platformy Alleria Filmy jest równoznaczne z akceptacją niniejszego Regulaminu oraz Polityki Prywatności.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
