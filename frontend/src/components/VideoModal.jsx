import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { extractYoutubeId } from '../utils/helpers';

function nowParts() {
  const d = new Date();
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    year: String(d.getFullYear()),
    hour: String(d.getHours()).padStart(2, '0'),
    minute: String(d.getMinutes()).padStart(2, '0'),
  };
}

function isoParts(iso) {
  if (!iso) return nowParts();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return nowParts();
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    year: String(d.getFullYear()),
    hour: String(d.getHours()).padStart(2, '0'),
    minute: String(d.getMinutes()).padStart(2, '0'),
  };
}

function partsToISO(p) {
  const d = new Date(parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day), parseInt(p.hour), parseInt(p.minute));
  return d.toISOString();
}

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

export default function VideoModal({ isOpen, onClose, video, users, onSaved }) {
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
  const [dp, setDp] = useState(nowParts());
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showMirror1, setShowMirror1] = useState(false);
  const [showMirror2, setShowMirror2] = useState(false);
  const fileInputRef = useRef(null);
  const tagInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      api.getTags().then(setAllTags).catch(console.error);
      if (video) {
        setTitle(video.title || '');
        setAuthorId(String(video.author_id || ''));
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
        setDp(isoParts(video.publish_date));
        setSelectedTags(video.tags || []);
        setShowMirror1(!!video.mirror1_url);
        setShowMirror2(!!video.mirror2_url);
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
    setDescription(''); setDp(nowParts());
    setSelectedTags([]); setTagInput(''); setShowMirror1(false); setShowMirror2(false);
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

  const upd = (key, val) => setDp(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !authorId || !mainSource.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('author_id', authorId);
      formData.append('main_source', mainSource.trim());
      formData.append('main_source_type', 'youtube');
      formData.append('main_source_title', mainSourceTitle.trim());
      formData.append('description', description);
      formData.append('publish_date', partsToISO(dp));
      formData.append('tags', JSON.stringify(selectedTags));
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
    }
  };

  if (!isOpen) return null;

  const dateInput = (val, key, ph, w) => (
    <input type="text" inputMode="numeric" maxLength={key === 'year' ? 4 : 2} value={val} onChange={e => upd(key, e.target.value.replace(/\D/g, '').slice(0, key === 'year' ? 4 : 2))} placeholder={ph} className={`input-field text-center font-mono ${w}`} />
  );

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

            <div>
              <label className="label-field">Główne źródło (YouTube link)</label>
              <input type="text" value={mainSource} onChange={e => setMainSource(e.target.value)} className="input-field" placeholder="https://youtube.com/watch?v=..." required />
            </div>

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

            {/* Date: DD/MM/YYYY — HH:mm */}
            <div>
              <label className="label-field">Data publikacji (DD/MM/RRRR GG:MM)</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {dateInput(dp.day, 'day', 'DD', '!w-[60px]')}
                <span className="text-zinc-400 font-bold text-lg">/</span>
                {dateInput(dp.month, 'month', 'MM', '!w-[60px]')}
                <span className="text-zinc-400 font-bold text-lg">/</span>
                {dateInput(dp.year, 'year', 'RRRR', '!w-[80px]')}
                <span className="text-zinc-400 font-bold text-lg mx-1">—</span>
                {dateInput(dp.hour, 'hour', 'GG', '!w-[60px]')}
                <span className="text-zinc-400 font-bold text-lg">:</span>
                {dateInput(dp.minute, 'minute', 'MM', '!w-[60px]')}
              </div>
            </div>

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
