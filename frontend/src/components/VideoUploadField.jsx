import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../utils/apiClient';
import ProgressBar from './ui/ProgressBar';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB, matches the streaming service's expected chunk size

// Chunked upload → transcoding. Sets `streamVideoId` once the streaming service has accepted the
// assembled file and started transcoding; the video record itself is created/updated separately
// with main_source_type:'streamer' and stream_video_id pointing at this upload.
export default function VideoUploadField({ streamVideoId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(streamVideoId ? 'ready' : 'idle'); // idle | uploading | processing | ready | error
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  const pollStatus = (videoId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getUploadStatus(videoId);
        if (s.status === 'ready') { setStatus('ready'); clearInterval(pollRef.current); }
        else if (s.status === 'error' || s.status === 'failed') { setStatus('error'); setError('Transkodowanie nie powiodło się.'); clearInterval(pollRef.current); }
      } catch (_) {}
    }, 4000);
  };

  const startUpload = async (f) => {
    setFile(f);
    setStatus('uploading');
    setProgress(0);
    setError(null);
    try {
      const { upload_id } = await api.initUpload({ filename: f.name, total_size: f.size });
      const chunkCount = Math.ceil(f.size / CHUNK_SIZE);
      for (let i = 0; i < chunkCount; i++) {
        const chunk = f.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const fd = new FormData();
        fd.append('chunk', chunk);
        fd.append('upload_id', upload_id);
        fd.append('chunk_index', i);
        await api.uploadChunk(fd);
        setProgress(Math.round(((i + 1) / chunkCount) * 100));
      }
      setStatus('processing');
      const { video_id } = await api.completeUpload({ upload_id, filename: f.name });
      onUploaded(video_id);
      pollStatus(video_id);
    } catch (e) {
      setStatus('error');
      setError(e.message);
    }
  };

  return (
    <div>
      {status === 'idle' && (
        <label className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-8 text-sm text-slate-400 cursor-pointer hover:border-brand-400">
          <Upload className="w-6 h-6" /> Wybierz plik wideo do przesłania
          <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && startUpload(e.target.files[0])} />
        </label>
      )}
      {status === 'uploading' && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 truncate">Przesyłanie: {file?.name}</p>
          <ProgressBar value={progress} />
          <p className="text-[11px] text-slate-400 mt-1">{progress}%</p>
        </div>
      )}
      {status === 'processing' && (
        <div className="flex items-center gap-2 rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300 text-xs p-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Transkodowanie w toku — możesz zapisać film, doda się automatycznie po zakończeniu.
        </div>
      )}
      {status === 'ready' && (
        <div className="flex items-center gap-2 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-300 text-xs p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Wideo gotowe do odtwarzania.
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error || 'Błąd przesyłania.'}
          </div>
          <button type="button" onClick={() => setStatus('idle')} className="text-xs font-semibold text-brand-500">Spróbuj ponownie</button>
        </div>
      )}
    </div>
  );
}
