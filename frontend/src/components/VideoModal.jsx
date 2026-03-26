import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { extractYoutubeId, buildCategoryTreeOptions } from '../utils/helpers';
import DateTimePicker from './DateTimePicker';

function SmartThumbnail({ ytId, customSrc, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (customSrc) { setSrc(customSrc); return; }
    if (!ytId) { setSrc(''); return; }
    const maxres = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
    const img = new Image();
    img.onload = () => {
      setSrc(img.naturalWidth <= 120 ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : maxres);
    };
    img.onerror = () => setSrc(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
    img.src = maxres;
  }, [ytId, customSrc]);
  if (!src) return null;
  return (
    <div className="mt-3 relative w-48 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
      <img src={src} alt={alt || 'Preview'} className="w-full h-full object-cover" />
    </div>
  );
}

export default function VideoModal({ isOpen, onClose, video, users = [], onSaved }) {
  const isEdit = !!video;
  const [title, setTitle] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [mainSource, setMainSource] = useState('');
  const [mainSourceTitle, setMainSourceTitle] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [mirror1Name, setMirror1Name] = useState('');
  const [mirror1Url, setMirror1Url] = useState('');
  const [mirror1IsEmbed, setMirror1IsEmbed] = useState(false);
  const [mirror2Name, setMirror2Name] = useState('');
  const [mirror2Url, setMirror2Url] = useState('');
  const [mirror2IsEmbed, setMirror2IsEmbed] = useState(false);
  const [description, setDescription] = useState('');
  const [publishDate, setPublishDate] = useState(new Date().toISOString());
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showMirror1, setShowMirror1] = useState(false);
  const [showMirror2, setShowMirror2] = useState(false);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [drmEnhanced, setDrmEnhanced] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [chunkPercent, setChunkPercent] = useState(0);
  const [streamVideoId, setStreamVideoId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [accessMode, setAccessMode] = useState('category');
  const [allowedUsers, setAllowedUsers] = useState([]);
  const fileInputRef = useRef(null);
  const videoFileRef = useRef(null);
  const tagInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      api.getTags().then(setAllTags).catch(console.error);
      api.getCategories().then(setCategories).catch(console.error);
      if (video) {
        setTitle(video.title || '');
        setAuthorId(String(video.author_id || ''));
        setCategoryId(String(video.category_id || ''));
        setMainSource(video.main_source || '');
        setMainSourceTitle(video.main_source_title || '');
        setThumbnail(video.custom_thumbnail ? video.thumbnail : '');
        setThumbnailPreview(video.thumbnail || '');
        setMirror1Name(video.mirror1_name || '');
        setMirror1Url(video.mirror1_url || '');
        setMirror1IsEmbed(!!video.mirror1_is_embed);
        setMirror2Name(video.mirror2_name || '');
        setMirror2Url(video.mirror2_url || '');
        setMirror2IsEmbed(!!video.mirror2_is_embed);
        setDescription(video.description || '');
        setPublishDate(video.publish_date || new Date().toISOString());
        setSelectedTags(video.tags || []);
        setShowMirror1(!!video.mirror1_url);
        setShowMirror2(!!video.mirror2_url);
        setIsSelfHosted(!!video.stream_video_id);
        setStreamVideoId(video.stream_video_id || '');
        setDrmEnhanced(!!video.drm_enhanced);
        setAccessMode(video.access_mode || 'category');
        // Load per-video access list if custom
        if (video.access_mode === 'custom') {
          api.getVideoAccess(video.id).then(data => {
            setAllowedUsers(data.users ? data.users.map(u => u.id) : []);
          }).catch(() => {});
        } else {
          setAllowedUsers([]);
        }
      } else {
        resetForm();
      }
    }
  }, [isOpen, video]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const ytId = (!thumbnail && !thumbnailFile) ? extractYoutubeId(mainSource) : null;
  const showMainSourceTitle = showMirror1 || showMirror2;

  const resetForm = () => {
    setTitle(''); setAuthorId(''); setMainSource(''); setMainSourceTitle('');
    setThumbnail(''); setThumbnailFile(null); setThumbnailPreview('');
    setMirror1Name(''); setMirror1Url(''); setMirror1IsEmbed(false);
    setMirror2Name(''); setMirror2Url(''); setMirror2IsEmbed(false);
    setDescription(''); setPublishDate(new Date().toISOString());
    setSelectedTags([]); setTagInput(''); setShowMirror1(false); setShowMirror2(false);
    setIsSelfHosted(false); setVideoFile(null); setDrmEnhanced(false); setUploadProgress(''); setUploadPercent(0); setChunkPercent(0); setStreamVideoId(''); setCategoryId(''); setAccessMode('category'); setAllowedUsers([]);
  };

  useEffect(() => {
    if (tagInput.length > 0) {
      setTagSuggestions(allTags.filter(t =>
        t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
        !selectedTags.find(st => st.id === t.id)
      ));
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, allTags, selectedTags]);

  const addTag = (tag) => {
    if (!selectedTags.find(t => (t.id && t.id === tag.id) || t.name === tag.name)) {
      setSelectedTags(prev => [...prev, tag]);
    }
    setTagInput('');
    tagInputRef.current?.focus();
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const existing = allTags.find(t => t.name.toLowerCase() === tagInput.trim().toLowerCase());
      addTag(existing || { name: tagInput.trim() });
    } else if (e.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
      setSelectedTags(prev => prev.slice(0, -1));
    }
  };

  const removeTag = (idx) => setSelectedTags(prev => prev.filter((_, i) => i !== idx));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) { setThumbnailFile(file); setThumbnailPreview(URL.createObjectURL(file)); setThumbnail(''); }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !authorId) return;
    if (!isSelfHosted && !mainSource.trim()) return;
    setSubmitting(true);
    try {
      let finalStreamId = streamVideoId;

      // Step 1: Chunked upload for self-hosted videos
      if (isSelfHosted && videoFile && !streamVideoId) {
        const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks — safe under Cloudflare 100MB limit
        const totalChunks = Math.ceil(videoFile.size / CHUNK_SIZE);
        const totalMb = (videoFile.size / 1024 / 1024).toFixed(1);

        setUploadProgress(`Inicjalizacja uploadu (${totalMb} MB, ${totalChunks} części)...`);
        setUploadPercent(0);

        // 1a: Init
        const initRes = await api.streamUploadInit({
          filename: videoFile.name,
          filesize: videoFile.size,
          total_chunks: totalChunks,
          drm_enhanced: drmEnhanced,
        });
        if (!initRes.success) throw new Error(initRes.error || 'Init failed');
        const uploadId = initRes.upload_id;

        // 1b: Send chunks with per-chunk progress
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, videoFile.size);
          const chunk = videoFile.slice(start, end);
          const chunkMb = ((end - start) / 1024 / 1024).toFixed(1);

          const chunkForm = new FormData();
          chunkForm.append('chunk', chunk, `chunk_${i}`);
          chunkForm.append('upload_id', uploadId);
          chunkForm.append('chunk_index', String(i));

          const overallPct = Math.round(((i) / totalChunks) * 90);
          setUploadPercent(overallPct);
          setChunkPercent(0);
          setUploadProgress(`Część ${i + 1}/${totalChunks} (${chunkMb} MB) — przesyłanie...`);

          // XHR for per-chunk progress
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                setChunkPercent(Math.round((e.loaded / e.total) * 100));
              }
            });
            xhr.addEventListener('load', () => {
              try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                  setChunkPercent(100);
                  resolve(data);
                } else reject(new Error(data.error || `Chunk ${i} HTTP ${xhr.status}`));
              } catch (e) { reject(new Error('Invalid chunk response')); }
            });
            xhr.addEventListener('error', () => reject(new Error(`Chunk ${i} network error`)));
            xhr.addEventListener('timeout', () => reject(new Error(`Chunk ${i} timeout`)));
            xhr.timeout = 5 * 60 * 1000; // 5 min per chunk
            xhr.open('POST', '/api/stream/upload/chunk');
            xhr.withCredentials = true;
            xhr.send(chunkForm);
          });

          const sentMb = (end / 1024 / 1024).toFixed(1);
          setUploadPercent(Math.round(((i + 1) / totalChunks) * 90));
        }

        // 1c: Complete — assemble and forward to streaming service
        setUploadProgress('Składanie pliku i przesyłanie do serwera transkodowania...');
        setUploadPercent(95);
        const completeRes = await api.streamUploadComplete(uploadId);
        if (!completeRes.success) throw new Error(completeRes.error || 'Complete failed');

        finalStreamId = completeRes.video_id;
        setStreamVideoId(finalStreamId);
        setUploadProgress('Plik przesłany. Transkodowanie w tle...');
        setUploadPercent(100);
      }

      // Step 2: Save video record
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('author_id', authorId);
      formData.append('main_source', isSelfHosted ? `self-hosted:${finalStreamId}` : mainSource.trim());
      formData.append('main_source_type', isSelfHosted ? 'selfhosted' : 'youtube');
      formData.append('main_source_title', mainSourceTitle.trim());
      formData.append('description', description);
      formData.append('publish_date', publishDate);
      formData.append('tags', JSON.stringify(selectedTags));
      formData.append('stream_video_id', finalStreamId || '');
      formData.append('drm_enhanced', drmEnhanced ? 'true' : 'false');
      formData.append('category_id', categoryId || '');
      formData.append('access_mode', accessMode);
      formData.append('allowed_users', JSON.stringify(allowedUsers));

      if (thumbnailFile) formData.append('thumbnail_file', thumbnailFile);
      else if (thumbnail) formData.append('thumbnail', thumbnail);
      if (showMirror1) { formData.append('mirror1_name', mirror1Name); formData.append('mirror1_url', mirror1Url); formData.append('mirror1_is_embed', mirror1IsEmbed ? 'true' : 'false'); }
      if (showMirror2) { formData.append('mirror2_name', mirror2Name); formData.append('mirror2_url', mirror2Url); formData.append('mirror2_is_embed', mirror2IsEmbed ? 'true' : 'false'); }

      if (isEdit) await api.updateVideo(video.id, formData);
      else await api.createVideo(formData);
      onSaved();
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      alert('Wystąpił błąd: ' + err.message);
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content max-w-2xl" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
              {isEdit ? 'Edytuj film' : 'Dodaj film'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="label-field">Tytuł</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="Nazwa filmu" required />
            </div>

            <div>
              <label className="label-field">Autor</label>
              <select value={authorId} onChange={e => setAuthorId(e.target.value)} className="input-field appearance-none cursor-pointer" required>
                <option value="">Wybierz autora...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
              </select>
            </div>

            {/* Category */}
            {categories.length > 0 && (
              <div>
                <label className="label-field">Kategoria</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input-field appearance-none cursor-pointer">
                  <option value="">Bez kategorii</option>
                  {buildCategoryTreeOptions(categories).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}

            {/* Access mode */}
            <div>
              <label className="label-field">Uprawnienia dostępu</label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button type="button" onClick={() => { setAccessMode('category'); setAllowedUsers([]); }}
                  className={`p-3 rounded-2xl border-2 font-bold text-sm transition-all ${accessMode === 'category' ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                  Z kategorii
                </button>
                <button type="button" onClick={() => setAccessMode('custom')}
                  className={`p-3 rounded-2xl border-2 font-bold text-sm transition-all ${accessMode === 'custom' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                  Niestandardowe
                </button>
              </div>
              {accessMode === 'category' && (
                <p className="text-[11px] text-zinc-500">Dostęp wynika z uprawnień kategorii. Bez kategorii = widoczny dla wszystkich.</p>
              )}
              {accessMode === 'custom' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 mb-2">Zaznacz użytkowników, którzy mają mieć dostęp do tego filmu:</p>
                  <div className="max-h-[200px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 space-y-1">
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={allowedUsers.includes(u.id)}
                          onChange={() => setAllowedUsers(prev =>
                            prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]
                          )}
                          className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-zinc-900 dark:text-white font-medium">{u.display_name || u.username}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">ID:{u.id}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-400">{allowedUsers.length} użytkowników zaznaczonych</p>
                </div>
              )}
            </div>

            {/* Source type toggle */}
            <div>
              <label className="label-field">Typ źródła</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setIsSelfHosted(false)} className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all flex items-center gap-2 ${!isSelfHosted ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-lg shadow-indigo-500/10' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z"/></svg>
                  YouTube / Embed
                </button>
                <button type="button" onClick={() => setIsSelfHosted(true)} className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all flex items-center gap-2 ${isSelfHosted ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-lg shadow-emerald-500/10' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>
                  Własny hosting (DRM)
                </button>
              </div>
            </div>

            {/* YouTube / Embed source */}
            {!isSelfHosted && (
              <div>
                <label className="label-field">Główne źródło (YouTube link)</label>
                <input type="text" value={mainSource} onChange={e => setMainSource(e.target.value)} className="input-field" placeholder="https://youtube.com/watch?v=..." required={!isSelfHosted} />
              </div>
            )}

            {/* Self-hosted upload */}
            {isSelfHosted && (
              <div className="p-5 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Szyfrowany streaming z ochroną DRM</span>
                </div>

                {!streamVideoId && (
                  <div>
                    <label className="label-field">Plik wideo</label>
                    <div
                      className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                        videoFile
                          ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5'
                          : 'border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5'
                      }`}
                      onClick={() => videoFileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-50/50', 'dark:bg-indigo-500/10'); }}
                      onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50/50', 'dark:bg-indigo-500/10'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50/50', 'dark:bg-indigo-500/10');
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('video/')) setVideoFile(file);
                      }}
                    >
                      <Upload className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                      {videoFile ? (
                        <>
                          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{videoFile.name}</p>
                          <p className="text-xs text-zinc-500 mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Przeciągnij plik lub <span className="text-indigo-500 font-bold">kliknij, aby wybrać</span></p>
                          <p className="text-[10px] text-zinc-400 mt-1">MP4, MKV, AVI, MOV, WebM — max 20 GB</p>
                        </>
                      )}
                    </div>
                    <input ref={videoFileRef} type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
                  </div>
                )}

                {streamVideoId && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{streamVideoId}</code></span>
                  </div>
                )}

                <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <input type="checkbox" checked={drmEnhanced} onChange={e => setDrmEnhanced(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                  <div>
                    <span className="text-sm text-zinc-900 dark:text-white font-bold">Wzmocniona ochrona DRM</span>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Blokada nagrywania ekranu, watermark z nazwą użytkownika, blokada devtools</p>
                  </div>
                </label>

                {uploadProgress && (
                  <div className="space-y-3 p-4 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl border border-indigo-100 dark:border-indigo-500/10">
                    <div className="flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                      {uploadPercent < 100 && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                      {uploadPercent >= 100 && <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                      <span className="flex-1">{uploadProgress}</span>
                      <span className="text-xs font-mono text-indigo-500">{uploadPercent}%</span>
                    </div>
                    {/* Overall progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Całość</span>
                        <span className="text-[10px] font-mono text-zinc-500">{uploadPercent}%</span>
                      </div>
                      <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadPercent}%` }} />
                      </div>
                    </div>
                    {/* Per-chunk progress */}
                    {chunkPercent > 0 && uploadPercent < 95 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Bieżąca część</span>
                          <span className="text-[10px] font-mono text-zinc-500">{chunkPercent}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-150 ease-out" style={{ width: `${chunkPercent}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showMainSourceTitle && (
              <div>
                <label className="label-field">Tytuł głównego źródła</label>
                <input type="text" value={mainSourceTitle} onChange={e => setMainSourceTitle(e.target.value)} className="input-field" placeholder="np. YouTube" />
              </div>
            )}

            <div>
              <label className="label-field">Miniatura (opcjonalnie)</label>
              <div className="flex gap-3">
                <input type="text" value={thumbnail} onChange={e => { setThumbnail(e.target.value); setThumbnailFile(null); if (e.target.value) setThumbnailPreview(e.target.value); }} className="input-field flex-1" placeholder="URL miniatury lub wybierz plik" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="px-5 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  <Upload className="w-5 h-5 text-zinc-500" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>
              {thumbnailFile ? (
                <div className="mt-3 relative w-48 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <img src={thumbnailPreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : thumbnail ? (
                <div className="mt-3 relative w-48 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <img src={thumbnail} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <SmartThumbnail ytId={ytId} alt={title} />
              )}
            </div>

            <div className="space-y-4">
              {!showMirror1 && (
                <button type="button" onClick={() => setShowMirror1(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-500 hover:text-indigo-400 transition-colors">
                  <Plus className="w-4 h-4" /> Dodaj mirror 1
                </button>
              )}
              {showMirror1 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 1</span>
                    <button type="button" onClick={() => { setShowMirror1(false); setMirror1Name(''); setMirror1Url(''); setMirror1IsEmbed(false); }} className="text-red-500 hover:text-red-400 text-xs font-bold">Usuń</button>
                  </div>
                  <input type="text" value={mirror1Name} onChange={e => setMirror1Name(e.target.value)} className="input-field" placeholder="Nazwa (np. CDA, Mega)" />
                  <input type="text" value={mirror1Url} onChange={e => setMirror1Url(e.target.value)} className="input-field" placeholder="URL lub kod embed" />
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={mirror1IsEmbed} onChange={e => setMirror1IsEmbed(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">To jest kod HTML embed (iframe)</span>
                  </label>
                </div>
              )}
              {showMirror1 && !showMirror2 && (
                <button type="button" onClick={() => setShowMirror2(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-500 hover:text-indigo-400 transition-colors">
                  <Plus className="w-4 h-4" /> Dodaj mirror 2
                </button>
              )}
              {showMirror2 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 2</span>
                    <button type="button" onClick={() => { setShowMirror2(false); setMirror2Name(''); setMirror2Url(''); setMirror2IsEmbed(false); }} className="text-red-500 hover:text-red-400 text-xs font-bold">Usuń</button>
                  </div>
                  <input type="text" value={mirror2Name} onChange={e => setMirror2Name(e.target.value)} className="input-field" placeholder="Nazwa (np. Streamable)" />
                  <input type="text" value={mirror2Url} onChange={e => setMirror2Url(e.target.value)} className="input-field" placeholder="URL lub kod embed" />
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={mirror2IsEmbed} onChange={e => setMirror2IsEmbed(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">To jest kod HTML embed (iframe)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Date picker */}
            <DateTimePicker label="Data publikacji" value={publishDate} onChange={setPublishDate} />

            <div>
              <label className="label-field">Tagi</label>
              <div className="input-field flex flex-wrap gap-2 min-h-[56px] !p-3 cursor-text" onClick={() => tagInputRef.current?.focus()}>
                {selectedTags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold animate-fade-in">
                    {tag.name}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(idx); }} className="hover:bg-white/20 rounded p-0.5 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input ref={tagInputRef} type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600" placeholder={selectedTags.length === 0 ? "Wpisz tag i naciśnij Enter..." : ""} />
              </div>
              {tagSuggestions.length > 0 && (
                <div className="mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg max-h-40 overflow-y-auto">
                  {tagSuggestions.map(tag => (
                    <button key={tag.id} type="button" onClick={() => addTag(tag)} className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label-field">Opis</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field resize-none h-32" placeholder="Opis filmu..." />
            </div>

            <button type="submit" disabled={submitting} className="w-full py-5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl font-bold hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-xl shadow-indigo-500/20 active:scale-[0.98]">
              {submitting ? 'Zapisywanie...' : isEdit ? 'Zapisz zmiany' : 'Dodaj film'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
