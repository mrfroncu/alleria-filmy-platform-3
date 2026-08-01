import React, { useState, useEffect } from 'react';

// Blob URL iframe — the only reliable way to render arbitrary HTML with inline JS handlers:
// doc.write() fails behind Cloudflare, srcDoc gets escaped by React, dangerouslySetInnerHTML strips JS.
export default function HtmlEmbed({ html }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!html) return;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);
  if (!blobUrl) return null;
  return <iframe src={blobUrl} className="w-full h-full border-0" sandbox="allow-forms allow-scripts" allowFullScreen />;
}
