import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../utils/api';
import { mentionToken } from '../utils/commentTokens';

// "@" + up to 32 non-space chars right before the caret, at the start or after whitespace.
const TRIGGER_RE = /(^|\s)@([^\s@[\]()]{0,32})$/u;

// Textarea with an @-mention picker. Typing "@ka" lists people who can see this video (the API
// filters by access); picking one inserts @[Name](id). The picker's keys (↑ ↓ Enter Tab Esc) are
// consumed only while it's open — otherwise onKeyDown goes to the caller untouched, so the
// comment box's Enter-to-send keeps working.
//
// The dropdown is absolutely positioned: the parent element must be `relative`.
const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, videoId, onKeyDown, ...props }, ref) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current);

  const [trigger, setTrigger] = useState(null); // { start, query } | null
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const requestSeq = useRef(0);

  const detect = (text, caret) => {
    const m = text.slice(0, caret).match(TRIGGER_RE);
    setTrigger(m ? { start: caret - m[2].length - 1, query: m[2] } : null);
  };

  useEffect(() => {
    if (!trigger || !videoId) { setResults([]); return; }
    const seq = ++requestSeq.current;
    const t = setTimeout(() => {
      api.getMentionable(videoId, trigger.query)
        .then(list => { if (seq === requestSeq.current) { setResults(list); setActive(0); } })
        .catch(() => { if (seq === requestSeq.current) setResults([]); });
    }, 150);
    return () => clearTimeout(t);
  }, [trigger?.query, trigger?.start, videoId]);

  const open = !!trigger && results.length > 0;

  const pick = (u) => {
    const el = innerRef.current;
    const caret = el ? el.selectionStart : value.length;
    const insert = `${mentionToken(u.display_name, u.id)} `;
    const next = value.slice(0, trigger.start) + insert + value.slice(caret);
    onChange(next);
    setTrigger(null);
    setResults([]);
    requestAnimationFrame(() => {
      if (!innerRef.current) return;
      const pos = trigger.start + insert.length;
      innerRef.current.focus();
      innerRef.current.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(results[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setTrigger(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <>
      <textarea
        {...props}
        ref={innerRef}
        value={value}
        onChange={e => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={handleKeyDown}
        onClick={e => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setTrigger(null), 120)}
      />
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-20 w-full max-w-xs py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg animate-scale-in origin-top-left"
        >
          {results.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(u); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${i === active ? 'bg-violet-50 dark:bg-violet-500/10' : ''}`}
            >
              <img
                src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name || 'U')}&background=8b5cf6&color=fff&size=48`}
                alt=""
                className="w-6 h-6 rounded-lg object-cover shrink-0"
              />
              <span className="font-semibold text-zinc-900 dark:text-white truncate">{u.display_name}</span>
              {u.username && u.username !== u.display_name && <span className="text-xs text-zinc-400 truncate">{u.username}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
});

export default MentionTextarea;
