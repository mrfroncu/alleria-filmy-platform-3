import React from 'react';

// Deliberately tiny subset: ## headings, blank-line paragraphs, "- " bullet lists, **bold**,
// [label](url) links. Builds React elements directly — never touches dangerouslySetInnerHTML,
// so admin-edited content (Regulamin) can never carry a stored-XSS payload.
function renderInline(text, keyPrefix) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(t => t !== '');
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) return <strong key={key}>{boldMatch[1]}</strong>;
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={key} href={linkMatch[2]} className="text-violet-500 hover:text-violet-400 underline">
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

export function renderMarkdown(text) {
  if (!text) return null;
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map((block, bi) => {
    if (block.startsWith('## ')) {
      return (
        <h3 key={bi} className="font-semibold text-zinc-900 dark:text-white mb-2 mt-5 first:mt-0">
          {renderInline(block.slice(3).trim(), `h${bi}`)}
        </h3>
      );
    }
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every(l => l.startsWith('- '))) {
      return (
        <ul key={bi} className="space-y-1.5 list-disc list-inside marker:text-violet-500 mb-3">
          {lines.map((l, li) => <li key={li}>{renderInline(l.slice(2).trim(), `l${bi}-${li}`)}</li>)}
        </ul>
      );
    }
    return <p key={bi} className="mb-3 last:mb-0">{renderInline(lines.join(' '), `p${bi}`)}</p>;
  });
}
