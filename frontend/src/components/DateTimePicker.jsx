import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_PL = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday=0
}

function pad(n) { return String(n).padStart(2, '0'); }

export default function DateTimePicker({ value, onChange, label }) {
  // value/onChange work with ISO string
  const parsed = value ? new Date(value) : new Date();
  const validDate = isNaN(parsed.getTime()) ? new Date() : parsed;

  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('days'); // 'days' | 'months' | 'years'
  const [yearsBase, setYearsBase] = useState(validDate.getFullYear() - 5);
  const [viewYear, setViewYear] = useState(validDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(validDate.getMonth());
  const [selDay, setSelDay] = useState(validDate.getDate());
  const [selMonth, setSelMonth] = useState(validDate.getMonth());
  const [selYear, setSelYear] = useState(validDate.getFullYear());
  const [hour, setHour] = useState(pad(validDate.getHours()));
  const [minute, setMinute] = useState(pad(validDate.getMinutes()));

  const containerRef = useRef(null);

  // Sync from external value changes
  useEffect(() => {
    const d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) return;
    setSelDay(d.getDate());
    setSelMonth(d.getMonth());
    setSelYear(d.getFullYear());
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setHour(pad(d.getHours()));
    setMinute(pad(d.getMinutes()));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setPickerMode('days'); }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const emitChange = (day, month, year, h, m) => {
    const d = new Date(year, month, day, parseInt(h) || 0, parseInt(m) || 0);
    onChange(d.toISOString());
  };

  const selectDay = (day) => {
    setSelDay(day);
    setSelMonth(viewMonth);
    setSelYear(viewYear);
    emitChange(day, viewMonth, viewYear, hour, minute);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const prevYearsPage = () => setYearsBase(b => b - 12);
  const nextYearsPage = () => setYearsBase(b => b + 12);

  const openMonthsPicker = () => setPickerMode(m => m === 'months' ? 'days' : 'months');
  const openYearsPicker = () => {
    setYearsBase(viewYear - 5);
    setPickerMode(m => m === 'years' ? 'days' : 'years');
  };

  const handleHour = (v) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setHour(clean);
    if (clean.length === 2) emitChange(selDay, selMonth, selYear, clean, minute);
  };

  const handleMinute = (v) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setMinute(clean);
    if (clean.length === 2) emitChange(selDay, selMonth, selYear, hour, clean);
  };

  const handleTimeBlur = () => {
    const h = pad(Math.min(23, Math.max(0, parseInt(hour) || 0)));
    const m = pad(Math.min(59, Math.max(0, parseInt(minute) || 0)));
    setHour(h);
    setMinute(m);
    emitChange(selDay, selMonth, selYear, h, m);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const isToday = (day) => {
    const now = new Date();
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
  };

  const isSelected = (day) => {
    return day === selDay && viewMonth === selMonth && viewYear === selYear;
  };

  const displayStr = `${pad(selDay)}/${pad(selMonth + 1)}/${selYear}  ${hour}:${minute}`;

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="label-field">{label}</label>}
      <button
        type="button"
        onClick={() => { setOpen(!open); setPickerMode('days'); }}
        className="input-field text-left flex items-center gap-3 cursor-pointer"
      >
        <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="font-mono text-sm">{displayStr}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[320px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl shadow-zinc-900/20 dark:shadow-black/40 overflow-hidden" style={{ animation: 'slideUp 0.2s ease-out' }}>
          {/* Month/Year nav */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <button
              type="button"
              onClick={pickerMode === 'years' ? prevYearsPage : prevMonth}
              className="btn-icon-zinc"
              style={{ visibility: pickerMode === 'months' ? 'hidden' : 'visible' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openMonthsPicker}
                className={`text-sm font-bold font-display px-1.5 py-0.5 rounded-lg transition-colors ${pickerMode === 'months' ? 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' : 'text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
              >
                {MONTHS_PL[viewMonth]}
              </button>
              <button
                type="button"
                onClick={openYearsPicker}
                className={`text-sm font-bold font-display px-1.5 py-0.5 rounded-lg transition-colors ${pickerMode === 'years' ? 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' : 'text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
              >
                {viewYear}
              </button>
            </div>
            <button
              type="button"
              onClick={pickerMode === 'years' ? nextYearsPage : nextMonth}
              className="btn-icon-zinc"
              style={{ visibility: pickerMode === 'months' ? 'hidden' : 'visible' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {pickerMode === 'months' && (
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              {MONTHS_PL.map((m, idx) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setViewMonth(idx); setPickerMode('days'); }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                    idx === viewMonth
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {pickerMode === 'years' && (
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              {Array.from({ length: 12 }, (_, i) => yearsBase + i).map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => { setViewYear(y); setPickerMode('days'); }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                    y === viewYear
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {pickerMode === 'days' && (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 px-3">
                {DAYS_PL.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-zinc-400 uppercase py-1">{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 px-3 pb-3">
                {Array(firstDay).fill(null).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`w-9 h-9 mx-auto rounded-xl text-sm font-medium transition-all flex items-center justify-center ${
                      isSelected(day)
                        ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20 font-bold'
                        : isToday(day)
                          ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-500 dark:text-violet-400 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Time */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Czas:</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={hour}
              onChange={e => handleHour(e.target.value)}
              onBlur={handleTimeBlur}
              className="w-12 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-center font-mono text-sm font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              placeholder="GG"
            />
            <span className="text-zinc-400 font-bold">:</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={minute}
              onChange={e => handleMinute(e.target.value)}
              onBlur={handleTimeBlur}
              className="w-12 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-center font-mono text-sm font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              placeholder="MM"
            />
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setSelDay(now.getDate());
                setSelMonth(now.getMonth());
                setSelYear(now.getFullYear());
                setViewMonth(now.getMonth());
                setViewYear(now.getFullYear());
                const h = pad(now.getHours());
                const m = pad(now.getMinutes());
                setHour(h);
                setMinute(m);
                emitChange(now.getDate(), now.getMonth(), now.getFullYear(), h, m);
              }}
              className="btn-link-violet ml-auto text-[11px]"
            >
              Teraz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
