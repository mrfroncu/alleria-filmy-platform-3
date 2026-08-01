import React, { useState, useEffect } from 'react';
import { Search, Plus, Link2 } from 'lucide-react';
import { api } from '../utils/apiClient';
import { extractYoutubeId, buildSourcesFromVideo } from '../utils/helpers';
import Input from './ui/Input';
import Button from './ui/Button';

export default function AddToQueuePanel({ onAdd }) {
  const [search, setSearch] = useState('');
  const [videos, setVideos] = useState([]);
  const [picking, setPicking] = useState(null);
  const [ytUrl, setYtUrl] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { api.getVideos({ search, limit: 20 }).then(setVideos).catch(() => setVideos([])); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addFromVideo = (video, source) => {
    onAdd({
      title: video.title,
      sourceKey: source.key,
      videoId: video.id,
      thumbnail: video.thumbnail,
      stream_video_id: source.type === 'streamer' ? source.url?.replace('self-hosted:', '') : null,
      stream_status: video.stream_status,
      drm_enhanced: video.drm_enhanced,
      sources: buildSourcesFromVideo(video),
    });
    setPicking(null);
  };

  const addFromYoutubeUrl = () => {
    const id = extractYoutubeId(ytUrl);
    if (!id) return;
    onAdd({
      title: 'Film z YouTube',
      sourceKey: 'main',
      videoId: null,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      sources: [{ key: 'main', label: 'YouTube', url: ytUrl, type: 'link' }],
    });
    setYtUrl('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="Wklej link YouTube..." className="text-xs" />
        <Button size="sm" variant="secondary" onClick={addFromYoutubeUrl} disabled={!extractYoutubeId(ytUrl)}><Link2 className="w-3.5 h-3.5" /></Button>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj filmów..." className="pl-8 text-xs" />
      </div>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {videos.map((v) => {
          const sources = buildSourcesFromVideo(v);
          return (
            <div key={v.id} className="rounded-2xl bg-slate-50 dark:bg-white/5 p-2">
              <div className="flex items-center gap-2">
                <div className="w-12 aspect-video rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                  {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{v.title}</span>
                <button onClick={() => setPicking(picking === v.id ? null : v.id)} className="p-1.5 rounded-lg text-brand-500 hover:bg-brand-500/10 shrink-0"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {picking === v.id && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {sources.filter((s) => s.url).map((s) => (
                    <button key={s.key} onClick={() => addFromVideo(v, s)} className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-brand-500 text-white">{s.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
