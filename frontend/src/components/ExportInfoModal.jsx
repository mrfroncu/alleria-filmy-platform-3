import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileKey, Image, ShieldCheck, Film, HardDrive, AlertTriangle, X } from 'lucide-react';
import { api } from '../utils/api';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

const BACKUP_CMD = `docker volume ls | grep alleria-data
docker stop alleria-filmy
docker run --rm -v <wolumen>:/data -v "$PWD":/backup alpine tar czf /backup/alleria-data.tgz -C /data .
docker start alleria-filmy`;

function Item({ icon: Icon, title, children, tone = 'zinc' }) {
  const tones = {
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// Shown right after "Eksportuj JSON" in Dev Tools → Debug — the export is the database only, and
// moving the panel to another server also needs everything listed here.
export default function ExportInfoModal({ open, onClose }) {
  const [extras, setExtras] = useState(null);

  useEffect(() => {
    if (!open) return;
    setExtras(null);
    api.getExportExtras().then(setExtras).catch(() => {});
  }, [open]);

  if (!open) return null;
  const uploads = extras?.uploads;
  const gdpr = extras?.gdpr;

  // Portaled to <body>: DebugPage's animate-fade-in wrapper is its own stacking context, which
  // would otherwise trap this overlay underneath the app's top bar.
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content max-w-lg p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Eksport się pobiera</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Plik JSON to cała baza. Przy przenosinach na inny serwer skopiuj jeszcze:</p>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Zamknij"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4 mb-5">
          <Item icon={FileKey} title=".env" tone="amber">
            Klucze Discorda, <code className="font-mono">SESSION_SECRET</code>, <code className="font-mono">STREAM_URL</code> i{' '}
            <code className="font-mono">STREAM_SECRET</code> - nie ma ich w bazie. Bez tego samego <code className="font-mono">STREAM_SECRET</code> panel nie dogada się ze streamerem.
          </Item>
          <Item icon={Image} title="data/uploads/" tone="amber">
            Miniatury (wgrane ręcznie i skopiowane ze streamera) oraz wgrane awatary - w bazie są tylko ścieżki do nich.
            {uploads && <span className="block mt-0.5 font-semibold text-zinc-700 dark:text-zinc-300">Teraz: {uploads.files} plików, {formatBytes(uploads.bytes)}</span>}
          </Item>
          <Item icon={ShieldCheck} title="data/gdpr/" tone={gdpr?.withFile ? 'amber' : 'zinc'}>
            Wygenerowane pliki eksportu RODO. Potrzebne tylko, jeśli ktoś jeszcze nie pobrał swoich danych.
            {gdpr && <span className="block mt-0.5 font-semibold text-zinc-700 dark:text-zinc-300">Teraz: {gdpr.files} plików, {formatBytes(gdpr.bytes)}</span>}
          </Item>
          <Item icon={Film} title="Filmy - nie trzeba" tone="emerald">
            Leżą na serwerze streamingu, nie w panelu. Wystarczy, że nowy panel wskazuje ten sam streamer.
          </Item>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-zinc-400" /> Prościej: cały wolumen data/
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            Baza, uploads i gdpr w jednym archiwum (1:1, bez importu). Na hoście, z nazwą wolumenu z pierwszej komendy:
          </p>
          <pre className="text-[11px] font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 overflow-x-auto select-all whitespace-pre">{BACKUP_CMD}</pre>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            Na nowym serwerze rozpakuj to samo archiwum do wolumenu nowej instalacji (<code className="font-mono">tar xzf</code>) przy zatrzymanym kontenerze.
          </p>
        </div>

        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Plik eksportu zawiera ustawienia panelu razem z kluczem prywatnym powiadomień push - trzymaj go prywatnie.
        </p>

        <button onClick={onClose} className="btn-primary text-sm w-full">Rozumiem</button>
      </div>
    </div>,
    document.body
  );
}
