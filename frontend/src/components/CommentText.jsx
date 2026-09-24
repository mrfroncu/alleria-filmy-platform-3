import React, { useMemo } from 'react';
import { Play } from 'lucide-react';
import { tokenizeComment } from '../utils/commentTokens';
import { resolveSourceRef } from '../utils/videoSources';

// Renders comment/description text with clickable timestamps and highlighted @mentions. Plain
// React text nodes only — nothing from the content is ever injected as HTML.
//
// onTimestamp(seconds, sourceKey | null) — sourceKey is null for a bare "12:34" (= seek whatever
// is playing now). A token naming a source that no longer exists falls back to that too.
export default function CommentText({ text, sources = [], currentUserId, onTimestamp, className }) {
  const parts = useMemo(() => tokenizeComment(text), [text]);

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <React.Fragment key={i}>{p.value}</React.Fragment>;

        if (p.type === 'mention') {
          const isMe = p.userId === currentUserId;
          return (
            <span
              key={i}
              className={`font-semibold rounded px-0.5 ${isMe ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'text-violet-600 dark:text-violet-400'}`}
            >
              @{p.name}
            </span>
          );
        }

        const source = p.sourceRef ? resolveSourceRef(sources, p.sourceRef) : null;
        const label = source && sources.length > 1 ? source.label : (p.sourceRef && !source ? p.sourceRef : null);
        const alt = source?.isAlt;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onTimestamp?.(p.seconds, source?.key || null)}
            disabled={!onTimestamp}
            title={source ? `Odtwórz od ${p.clock} (${source.label})` : `Odtwórz od ${p.clock}`}
            className={`inline-flex items-baseline gap-1 px-1.5 rounded-md font-semibold tabular-nums align-baseline transition-colors ${alt
              ? 'bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-400 hover:bg-lime-100 dark:hover:bg-lime-500/20'
              : 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20'} disabled:cursor-default`}
          >
            <Play className="w-2.5 h-2.5 self-center fill-current" />
            {p.clock}
            {label && <span className="font-medium opacity-80">· {label}</span>}
          </button>
        );
      })}
    </span>
  );
}
