import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';

// Fixed CSS viewport size for the crop circle — output is always exported at OUTPUT_SIZE
// regardless of this, so the on-screen size only affects drag/zoom feel, not final quality.
const VIEWPORT = 288;
const OUTPUT_SIZE = 512;

export default function AvatarCropModal({ file, onCancel, onSave, saving }) {
  const [imgUrl, setImgUrl] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!file) { setImgUrl(''); return; }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    setNatural({ w: 0, h: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // "Cover" scale — smallest scale at which the image fills the whole viewport with no gaps.
  const baseScale = natural.w && natural.h ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural.w * scale;
  const dispH = natural.h * scale;
  const maxOffsetX = Math.max(0, (dispW - VIEWPORT) / 2);
  const maxOffsetY = Math.max(0, (dispH - VIEWPORT) / 2);

  const clampPos = (p, mx, my) => ({
    x: Math.min(mx, Math.max(-mx, p.x)),
    y: Math.min(my, Math.max(-my, p.y)),
  });

  // Re-clamp whenever zoom or the image's own dimensions change, so panning to an edge and then
  // zooming out never leaves the viewport partially uncovered.
  useEffect(() => {
    setPos(p => clampPos(p, maxOffsetX, maxOffsetY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural.w, natural.h]);

  const startDrag = (clientX, clientY) => {
    dragRef.current = { startX: clientX, startY: clientY, origX: pos.x, origY: pos.y };
  };
  const moveDrag = (clientX, clientY) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setPos(clampPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }, maxOffsetX, maxOffsetY));
  };
  const endDrag = () => { dragRef.current = null; };

  const handleSave = () => {
    if (!imgRef.current || !natural.w) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    // Image top-left in viewport space: centered, then shifted by the user's pan.
    const centerOffsetX = (VIEWPORT - dispW) / 2;
    const centerOffsetY = (VIEWPORT - dispH) / 2;
    // Invert to find which region of the *natural* image the viewport is showing.
    const srcX = -(centerOffsetX + pos.x) / scale;
    const srcY = -(centerOffsetY + pos.y) / scale;
    const srcSize = VIEWPORT / scale;
    ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob(blob => { if (blob) onSave(blob); }, 'image/jpeg', 0.92);
  };

  if (!file) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 70 }}>
      <div className="modal-backdrop" onClick={saving ? undefined : onCancel} />
      <div className="modal-content max-w-md" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">Kadruj avatar</h2>
            <button onClick={onCancel} disabled={saving} className="btn-icon-zinc disabled:opacity-50"><X className="w-5 h-5" /></button>
          </div>

          <div
            className="relative mx-auto overflow-hidden rounded-full bg-zinc-900 cursor-grab active:cursor-grabbing select-none"
            style={{ width: VIEWPORT, height: VIEWPORT, touchAction: 'none' }}
            onMouseDown={e => startDrag(e.clientX, e.clientY)}
            onMouseMove={e => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={e => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={endDrag}
          >
            {imgUrl && (
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                draggable={false}
                onLoad={() => setNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })}
                className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
                style={{
                  width: dispW || 'auto',
                  height: dispH || 'auto',
                  transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
                }}
              />
            )}
          </div>
          <p className="text-center text-[11px] text-zinc-400 mt-3">Przeciągnij, aby przesunąć — użyj suwaka, aby przybliżyć.</p>

          <div className="flex items-center gap-3 mt-4">
            <ZoomIn className="w-4 h-4 text-zinc-400 shrink-0" />
            <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="w-full accent-violet-500" />
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1" disabled={saving}>Anuluj</button>
            <button type="button" onClick={handleSave} className="btn-primary flex-1" disabled={saving || !natural.w}>{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
