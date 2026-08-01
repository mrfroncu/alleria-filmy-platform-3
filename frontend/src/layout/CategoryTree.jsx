import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';

function CategoryNode({ cat, depth }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = cat.children?.length > 0;

  if (cat.locked) {
    return (
      <div>
        <div
          title="Brak dostępu do tej kategorii"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-400 dark:text-slate-600 cursor-not-allowed select-none"
          style={{ paddingLeft: `${12 + depth * 14}px` }}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span className="text-sm truncate flex-1">{cat.name}</span>
        </div>
        {hasChildren && (
          <div>{cat.children.map((c) => <CategoryNode key={c.id} cat={c} depth={depth + 1} />)}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: `${depth * 14}px` }}>
        {hasChildren ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <NavLink
          to={`/category/${cat.slug}`}
          className={({ isActive }) =>
            `flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-sm truncate transition-colors ${
              isActive
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300 font-semibold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`
          }
        >
          <span className="truncate">{cat.name}</span>
          {typeof cat.videoCount === 'number' && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{cat.videoCount}</span>
          )}
        </NavLink>
      </div>
      {hasChildren && expanded && (
        <div>{cat.children.map((c) => <CategoryNode key={c.id} cat={c} depth={depth + 1} />)}</div>
      )}
    </div>
  );
}

export default function CategoryTree({ tree }) {
  if (!tree.length) return null;
  return <div className="space-y-0.5">{tree.map((c) => <CategoryNode key={c.id} cat={c} depth={0} />)}</div>;
}
