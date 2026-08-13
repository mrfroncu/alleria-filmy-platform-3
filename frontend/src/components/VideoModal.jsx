import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Upload, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { extractYoutubeId, buildCategoryTreeOptions } from '../utils/helpers';
import DateTimePicker from './DateTimePicker';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

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

export default function VideoModal({ isOpen, onClose, video, users = [], onSaved, defaultCategoryId = '' }) {
  const isEdit = !!video;
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [promotingSlot, setPromotingSlot] = useState(null);
  const [title, setTitle] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [mainSource, setMainSource] = useState('');
  const [mainSourceTitle, setMainSourceTitle] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [mirror1Name, setMirror1Name] = useState('');
  const [mirror1Url, setMirror1Url] = useState('');
  const [mirror1Type, setMirror1Type] = useState('link');
  const [mirror1VideoFile, setMirror1VideoFile] = useState(null);
  const [mirror1StreamVideoId, setMirror1StreamVideoId] = useState('');
  const [mirror2Name, setMirror2Name] = useState('');
  const [mirror2Url, setMirror2Url] = useState('');
  const [mirror2Type, setMirror2Type] = useState('link');
  const [mirror2VideoFile, setMirror2VideoFile] = useState(null);
  const [mirror2StreamVideoId, setMirror2StreamVideoId] = useState('');
  const [mirror3Name, setMirror3Name] = useState('');
  const [mirror3Url, setMirror3Url] = useState('');
  const [mirror3Type, setMirror3Type] = useState('link');
  const [mirror3VideoFile, setMirror3VideoFile] = useState(null);
  const [mirror3StreamVideoId, setMirror3StreamVideoId] = useState('');
  const [mirror4Name, setMirror4Name] = useState('');
  const [mirror4Url, setMirror4Url] = useState('');
  const [mirror4Type, setMirror4Type] = useState('link');
  const [mirror4VideoFile, setMirror4VideoFile] = useState(null);
  const [mirror4StreamVideoId, setMirror4StreamVideoId] = useState('');
  const [mirror5Name, setMirror5Name] = useState('');
  const [mirror5Url, setMirror5Url] = useState('');
  const [mirror5Type, setMirror5Type] = useState('link');
  const [mirror5VideoFile, setMirror5VideoFile] = useState(null);
  const [mirror5StreamVideoId, setMirror5StreamVideoId] = useState('');
  const [description, setDescription] = useState('');
  const [publishDate, setPublishDate] = useState(new Date().toISOString());
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showMirror1, setShowMirror1] = useState(false);
  const [showMirror2, setShowMirror2] = useState(false);
  const [showMirror3, setShowMirror3] = useState(false);
  const [showMirror4, setShowMirror4] = useState(false);
  const [showMirror5, setShowMirror5] = useState(false);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [drmEnhanced, setDrmEnhanced] = useState(false);
  const [transcribe, setTranscribe] = useState(false);
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
  const mirror1VideoRef = useRef(null);
  const mirror2VideoRef = useRef(null);
  const mirror3VideoRef = useRef(null);
  const mirror4VideoRef = useRef(null);
  const mirror5VideoRef = useRef(null);
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
        setMirror1Type(video.mirror1_type || (video.mirror1_is_embed ? 'embed' : 'link'));
        setMirror2Name(video.mirror2_name || '');
        setMirror2Url(video.mirror2_url || '');
        setMirror2Type(video.mirror2_type || (video.mirror2_is_embed ? 'embed' : 'link'));
        setMirror3Name(video.mirror3_name || '');
        setMirror3Url(video.mirror3_url || '');
        setMirror3Type(video.mirror3_type || 'link');
        setMirror4Name(video.mirror4_name || '');
        setMirror4Url(video.mirror4_url || '');
        setMirror4Type(video.mirror4_type || 'link');
        setMirror5Name(video.mirror5_name || '');
        setMirror5Url(video.mirror5_url || '');
        setMirror5Type(video.mirror5_type || 'link');
        setDescription(video.description || '');
        setPublishDate(video.publish_date || new Date().toISOString());
        setSelectedTags(video.tags || []);
        setShowMirror1(!!video.mirror1_url);
        setShowMirror2(!!video.mirror2_url);
        setShowMirror3(!!video.mirror3_url);
        setShowMirror4(!!video.mirror4_url);
        setShowMirror5(!!video.mirror5_url);
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

  // Dirty check for the "close without saving?" guard — compares against the video prop (or
  // the empty/default shape for a new video), not against re-read state, so it's unaffected by
  // React's setState batching timing inside the load effect above.
  const baselineShape = useMemo(() => ({
    title: video?.title || '',
    authorId: video ? String(video.author_id || '') : (currentUser ? String(currentUser.id) : ''),
    categoryId: video ? String(video.category_id || '') : (defaultCategoryId ? String(defaultCategoryId) : ''),
    mainSource: video?.main_source || '',
    mainSourceTitle: video?.main_source_title || '',
    mirror1: { name: video?.mirror1_name || '', url: video?.mirror1_url || '', type: video?.mirror1_type || (video?.mirror1_is_embed ? 'embed' : 'link') },
    mirror2: { name: video?.mirror2_name || '', url: video?.mirror2_url || '', type: video?.mirror2_type || (video?.mirror2_is_embed ? 'embed' : 'link') },
    mirror3: { name: video?.mirror3_name || '', url: video?.mirror3_url || '', type: video?.mirror3_type || 'link' },
    mirror4: { name: video?.mirror4_name || '', url: video?.mirror4_url || '', type: video?.mirror4_type || 'link' },
    mirror5: { name: video?.mirror5_name || '', url: video?.mirror5_url || '', type: video?.mirror5_type || 'link' },
    description: video?.description || '',
    tags: (video?.tags || []).map(t => t.id ?? t.name).slice().sort(),
    isSelfHosted: !!video?.stream_video_id,
    drmEnhanced: !!video?.drm_enhanced,
    accessMode: video?.access_mode || 'category',
    hasThumbnailFile: false,
    hasVideoFile: false,
  }), [isOpen, video, currentUser, defaultCategoryId]);

  const currentShape = {
    title, authorId, categoryId,
    mainSource, mainSourceTitle,
    mirror1: { name: mirror1Name, url: mirror1Url, type: mirror1Type },
    mirror2: { name: mirror2Name, url: mirror2Url, type: mirror2Type },
    mirror3: { name: mirror3Name, url: mirror3Url, type: mirror3Type },
    mirror4: { name: mirror4Name, url: mirror4Url, type: mirror4Type },
    mirror5: { name: mirror5Name, url: mirror5Url, type: mirror5Type },
    description,
    tags: selectedTags.map(t => t.id ?? t.name).slice().sort(),
    isSelfHosted, drmEnhanced, accessMode,
    hasThumbnailFile: !!thumbnailFile,
    hasVideoFile: !!videoFile,
  };
  const videoDirty = isOpen && JSON.stringify(currentShape) !== JSON.stringify(baselineShape);
  const videoDirtyRef = useRef(videoDirty);
  videoDirtyRef.current = videoDirty;

  const guardedClose = async () => {
    if (videoDirtyRef.current && !(await confirm('Masz niezapisane zmiany w tym filmie. Zamknąć bez zapisywania?', { danger: true, confirmLabel: 'Odrzuć zmiany' }))) return;
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) guardedClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const ytId = (!thumbnail && !thumbnailFile) ? extractYoutubeId(mainSource) : null;
  const showMainSourceTitle = showMirror1 || showMirror2 || showMirror3 || showMirror4 || showMirror5;

  const resetForm = () => {
    setTitle(''); setAuthorId(currentUser ? String(currentUser.id) : ''); setMainSource(''); setMainSourceTitle('');
    setThumbnail(''); setThumbnailFile(null); setThumbnailPreview('');
    setMirror1Name(''); setMirror1Url(''); setMirror1Type('link'); setMirror1VideoFile(null); setMirror1StreamVideoId('');
    setMirror2Name(''); setMirror2Url(''); setMirror2Type('link'); setMirror2VideoFile(null); setMirror2StreamVideoId('');
    setMirror3Name(''); setMirror3Url(''); setMirror3Type('link'); setMirror3VideoFile(null); setMirror3StreamVideoId('');
    setMirror4Name(''); setMirror4Url(''); setMirror4Type('link'); setMirror4VideoFile(null); setMirror4StreamVideoId('');
    setMirror5Name(''); setMirror5Url(''); setMirror5Type('link'); setMirror5VideoFile(null); setMirror5StreamVideoId('');
    setDescription(''); setPublishDate(new Date().toISOString());
    setSelectedTags([]); setTagInput(''); setShowMirror1(false); setShowMirror2(false); setShowMirror3(false); setShowMirror4(false); setShowMirror5(false);
    setIsSelfHosted(false); setVideoFile(null); setDrmEnhanced(false); setTranscribe(false); setUploadProgress(''); setUploadPercent(0); setChunkPercent(0); setStreamVideoId(''); setCategoryId(defaultCategoryId ? String(defaultCategoryId) : ''); setAccessMode('category'); setAllowedUsers([]);
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

  // Reusable chunked upload helper
  const uploadVideoFile = async (file, label) => {
    const CHUNK_SIZE = 50 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const totalMb = (file.size / 1024 / 1024).toFixed(1);

    setUploadProgress(`${label}: inicjalizacja (${totalMb} MB, ${totalChunks} części)...`);
    setUploadPercent(0);

    const initRes = await api.streamUploadInit({
      filename: file.name,
      filesize: file.size,
      total_chunks: totalChunks,
      drm_enhanced: false,
    });
    if (!initRes.success) throw new Error(initRes.error || 'Init failed');
    const uploadId = initRes.upload_id;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkMb = ((end - start) / 1024 / 1024).toFixed(1);

      const chunkForm = new FormData();
      chunkForm.append('chunk', chunk, `chunk_${i}`);
      chunkForm.append('upload_id', uploadId);
      chunkForm.append('chunk_index', String(i));

      setUploadPercent(Math.round((i / totalChunks) * 90));
      setChunkPercent(0);
      setUploadProgress(`${label}: część ${i + 1}/${totalChunks} (${chunkMb} MB)...`);

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setChunkPercent(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.success) { setChunkPercent(100); resolve(data); }
            else reject(new Error(data.error || `Chunk ${i} HTTP ${xhr.status}`));
          } catch (e) { reject(new Error('Invalid chunk response')); }
        });
        xhr.addEventListener('error', () => reject(new Error(`Chunk ${i} network error`)));
        xhr.addEventListener('timeout', () => reject(new Error(`Chunk ${i} timeout`)));
        xhr.timeout = 5 * 60 * 1000;
        xhr.open('POST', '/api/stream/upload/chunk');
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.send(chunkForm);
      });

      setUploadPercent(Math.round(((i + 1) / totalChunks) * 90));
    }

    setUploadProgress(`${label}: składanie pliku...`);
    setUploadPercent(95);
    const completeRes = await api.streamUploadComplete(uploadId);
    if (!completeRes.success) throw new Error(completeRes.error || 'Complete failed');
    setUploadPercent(100);
    return completeRes.video_id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !authorId) return;
    if (!isSelfHosted && !mainSource.trim()) return;
    setSubmitting(true);
    try {
      let finalStreamId = streamVideoId;

      // Step 1: Chunked upload for self-hosted main source
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
          transcribe,
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
          setUploadProgress(`Część ${i + 1}/${totalChunks} (${chunkMb} MB) - przesyłanie...`);

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
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
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

      // Step 1b: Upload streamer-type mirrors
      let finalMirror1Url = mirror1Url;
      let finalMirror2Url = mirror2Url;
      let finalMirror3Url = mirror3Url;
      let finalMirror4Url = mirror4Url;
      let finalMirror5Url = mirror5Url;

      const mirrorUploads = [
        { show: showMirror1, type: mirror1Type, file: mirror1VideoFile, existingId: mirror1StreamVideoId, setUrl: v => { finalMirror1Url = v; }, setId: setMirror1StreamVideoId, label: 'Mirror 1' },
        { show: showMirror2, type: mirror2Type, file: mirror2VideoFile, existingId: mirror2StreamVideoId, setUrl: v => { finalMirror2Url = v; }, setId: setMirror2StreamVideoId, label: 'Mirror 2' },
        { show: showMirror3, type: mirror3Type, file: mirror3VideoFile, existingId: mirror3StreamVideoId, setUrl: v => { finalMirror3Url = v; }, setId: setMirror3StreamVideoId, label: 'Mirror 3' },
        { show: showMirror4, type: mirror4Type, file: mirror4VideoFile, existingId: mirror4StreamVideoId, setUrl: v => { finalMirror4Url = v; }, setId: setMirror4StreamVideoId, label: 'Mirror 4' },
        { show: showMirror5, type: mirror5Type, file: mirror5VideoFile, existingId: mirror5StreamVideoId, setUrl: v => { finalMirror5Url = v; }, setId: setMirror5StreamVideoId, label: 'Mirror 5' },
      ];

      for (const m of mirrorUploads) {
        if (m.show && m.type === 'streamer' && m.file && !m.existingId) {
          const vid = await uploadVideoFile(m.file, m.label);
          m.setUrl(`self-hosted:${vid}`);
          m.setId(vid);
        }
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
      formData.append('transcribe', transcribe ? 'true' : 'false');
      formData.append('category_id', categoryId || '');
      formData.append('access_mode', accessMode);
      formData.append('allowed_users', JSON.stringify(allowedUsers));

      if (thumbnailFile) formData.append('thumbnail_file', thumbnailFile);
      else if (thumbnail) formData.append('thumbnail', thumbnail);
      if (showMirror1) { formData.append('mirror1_name', mirror1Name); formData.append('mirror1_url', finalMirror1Url); formData.append('mirror1_type', mirror1Type); }
      if (showMirror2) { formData.append('mirror2_name', mirror2Name); formData.append('mirror2_url', finalMirror2Url); formData.append('mirror2_type', mirror2Type); }
      if (showMirror3) { formData.append('mirror3_name', mirror3Name); formData.append('mirror3_url', finalMirror3Url); formData.append('mirror3_type', mirror3Type); }
      if (showMirror4) { formData.append('mirror4_name', mirror4Name); formData.append('mirror4_url', finalMirror4Url); formData.append('mirror4_type', mirror4Type); }
      if (showMirror5) { formData.append('mirror5_name', mirror5Name); formData.append('mirror5_url', finalMirror5Url); formData.append('mirror5_type', mirror5Type); }

      if (isEdit) await api.updateVideo(video.id, formData);
      else await api.createVideo(formData);
      onSaved();
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Wystąpił błąd: ' + err.message);
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  // Swap main source with a mirror slot in place, no re-upload — only "link"/"streamer" mirrors
  // have a main-source equivalent (embed/plex don't, see the backend endpoint's own comment).
  // Reads from the persisted `video` prop, not the form's local draft state, since the backend
  // operates on the saved row: any unsaved edits in this form aren't included in the swap.
  const mirrorPromoteEligible = (slot) => {
    if (!video) return false;
    const url = video[`mirror${slot}_url`];
    const type = video[`mirror${slot}_type`] || (video[`mirror${slot}_is_embed`] ? 'embed' : 'link');
    return !!url && (type === 'link' || type === 'streamer');
  };
  const handlePromoteMirror = async (slot) => {
    const mirrorLabel = video[`mirror${slot}_name`] || `Mirror ${slot}`;
    const mainLabel = video.main_source_title || (video.main_source_type === 'selfhosted' ? 'Self-hosted' : 'YouTube');
    if (!(await confirm(
      `Ustawić „${mirrorLabel}" jako główne źródło? Obecne główne źródło ("${mainLabel}") stanie się mirrorem ${slot}. Działa na już zapisanej wersji filmu — niezapisane zmiany w tym formularzu nie zostaną uwzględnione.`,
      { confirmLabel: 'Zamień' }
    ))) return;
    setPromotingSlot(slot);
    try {
      await api.promoteMirrorSource(video.id, slot);
      toast.success('Źródła zamienione.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setPromotingSlot(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={guardedClose} />
      <div className="modal-content max-w-2xl" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
              {isEdit ? 'Edytuj film' : 'Dodaj film'}
            </h2>
            <button onClick={guardedClose} className="btn-icon-zinc">
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
                  className={`p-3 rounded-2xl border-2 font-bold text-sm transition-all ${accessMode === 'category' ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-300' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
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
                          className="w-4 h-4 rounded border-zinc-300 text-violet-500 focus:ring-violet-500"
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
                <button type="button" onClick={() => { setIsSelfHosted(false); setIsShort(false); }} className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all flex items-center gap-2 ${!isSelfHosted ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-500 text-violet-600 dark:text-violet-300 shadow-lg shadow-violet-500/10' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
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
                          : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/30 dark:hover:bg-violet-500/5'
                      }`}
                      onClick={() => videoFileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-violet-500', 'bg-violet-50/50', 'dark:bg-violet-500/10'); }}
                      onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-violet-500', 'bg-violet-50/50', 'dark:bg-violet-500/10'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-violet-500', 'bg-violet-50/50', 'dark:bg-violet-500/10');
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
                          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij, aby wybrać</span></p>
                          <p className="text-[10px] text-zinc-400 mt-1">MP4, MKV, AVI, MOV, WebM - max 20 GB</p>
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

                {!streamVideoId && (
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <input type="checkbox" checked={transcribe} onChange={e => setTranscribe(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" />
                    <div>
                      <span className="text-sm text-zinc-900 dark:text-white font-bold">Transkrybuj film (PL/EN)</span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Rozpoznawanie mowy offline, bez żadnego API — pozwoli wyszukiwać ten film po wypowiedzianych frazach i przeskakiwać do dokładnego momentu</p>
                    </div>
                  </label>
                )}

                {uploadProgress && (
                  <div className="space-y-3 p-4 bg-violet-50/50 dark:bg-violet-500/5 rounded-xl border border-violet-100 dark:border-violet-500/10">
                    <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-300 font-medium">
                      {uploadPercent < 100 && <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                      {uploadPercent >= 100 && <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                      <span className="flex-1">{uploadProgress}</span>
                      <span className="text-xs font-mono text-violet-500">{uploadPercent}%</span>
                    </div>
                    {/* Overall progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Całość</span>
                        <span className="text-[10px] font-mono text-zinc-500">{uploadPercent}%</span>
                      </div>
                      <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadPercent}%` }} />
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
                <input type="text" value={mainSourceTitle} onChange={e => setMainSourceTitle(e.target.value)} className="input-field" placeholder="np. YouTube" maxLength={80} />
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
                <button type="button" onClick={() => setShowMirror1(true)} className="btn-link-violet flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Dodaj mirror 1
                </button>
              )}
              {showMirror1 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 1</span>
                    <div className="flex items-center gap-3">
                      {mirrorPromoteEligible(1) && <button type="button" onClick={() => handlePromoteMirror(1)} disabled={promotingSlot === 1} className="btn-link-violet text-xs disabled:opacity-50">{promotingSlot === 1 ? 'Zamienianie...' : 'Ustaw jako główne źródło'}</button>}
                      <button type="button" onClick={() => { setShowMirror1(false); setMirror1Name(''); setMirror1Url(''); setMirror1Type('link'); setMirror1VideoFile(null); setMirror1StreamVideoId(''); }} className="btn-link-red">Usuń</button>
                    </div>
                  </div>
                  <input type="text" value={mirror1Name} onChange={e => setMirror1Name(e.target.value)} className="input-field" placeholder="Nazwa (np. CDA, Mega, Plex)" maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {[{v:'link',l:'Link/YouTube'},{v:'embed',l:'Kod HTML'},{v:'plex',l:'Plex'},{v:'streamer',l:'Upload'}].map(o => (
                      <button key={o.v} type="button" onClick={() => { setMirror1Type(o.v); setMirror1VideoFile(null); setMirror1StreamVideoId(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mirror1Type === o.v ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>{o.l}</button>
                    ))}
                  </div>
                  {mirror1Type === 'streamer' ? (
                    mirror1StreamVideoId ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{mirror1StreamVideoId}</code></span>
                      </div>
                    ) : (
                      <div className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${mirror1VideoFile ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400'}`} onClick={() => mirror1VideoRef.current?.click()}>
                        <Upload className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                        {mirror1VideoFile ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{mirror1VideoFile.name} ({(mirror1VideoFile.size/1024/1024).toFixed(1)} MB)</p>
                          : <p className="text-sm text-zinc-500">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij</span> - max 20 GB</p>}
                        <input ref={mirror1VideoRef} type="file" accept="video/*" onChange={e => setMirror1VideoFile(e.target.files?.[0] || null)} className="hidden" />
                      </div>
                    )
                  ) : (
                    <input type="text" value={mirror1Url} onChange={e => setMirror1Url(e.target.value)} className="input-field" placeholder={mirror1Type === 'plex' ? 'Link do filmu w Plex (app.plex.tv/...)' : mirror1Type === 'embed' ? 'Kod HTML embed' : 'URL filmu'} />
                  )}
                </div>
              )}
              {showMirror1 && !showMirror2 && (
                <button type="button" onClick={() => setShowMirror2(true)} className="btn-link-violet flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Dodaj mirror 2
                </button>
              )}
              {showMirror2 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 2</span>
                    <div className="flex items-center gap-3">
                      {mirrorPromoteEligible(2) && <button type="button" onClick={() => handlePromoteMirror(2)} disabled={promotingSlot === 2} className="btn-link-violet text-xs disabled:opacity-50">{promotingSlot === 2 ? 'Zamienianie...' : 'Ustaw jako główne źródło'}</button>}
                      <button type="button" onClick={() => { setShowMirror2(false); setMirror2Name(''); setMirror2Url(''); setMirror2Type('link'); setMirror2VideoFile(null); setMirror2StreamVideoId(''); }} className="btn-link-red">Usuń</button>
                    </div>
                  </div>
                  <input type="text" value={mirror2Name} onChange={e => setMirror2Name(e.target.value)} className="input-field" placeholder="Nazwa (np. Streamable, Plex)" maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {[{v:'link',l:'Link/YouTube'},{v:'embed',l:'Kod HTML'},{v:'plex',l:'Plex'},{v:'streamer',l:'Upload'}].map(o => (
                      <button key={o.v} type="button" onClick={() => { setMirror2Type(o.v); setMirror2VideoFile(null); setMirror2StreamVideoId(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mirror2Type === o.v ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>{o.l}</button>
                    ))}
                  </div>
                  {mirror2Type === 'streamer' ? (
                    mirror2StreamVideoId ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{mirror2StreamVideoId}</code></span>
                      </div>
                    ) : (
                      <div className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${mirror2VideoFile ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400'}`} onClick={() => mirror2VideoRef.current?.click()}>
                        <Upload className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                        {mirror2VideoFile ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{mirror2VideoFile.name} ({(mirror2VideoFile.size/1024/1024).toFixed(1)} MB)</p>
                          : <p className="text-sm text-zinc-500">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij</span> - max 20 GB</p>}
                        <input ref={mirror2VideoRef} type="file" accept="video/*" onChange={e => setMirror2VideoFile(e.target.files?.[0] || null)} className="hidden" />
                      </div>
                    )
                  ) : (
                    <input type="text" value={mirror2Url} onChange={e => setMirror2Url(e.target.value)} className="input-field" placeholder={mirror2Type === 'plex' ? 'Link do filmu w Plex (app.plex.tv/...)' : mirror2Type === 'embed' ? 'Kod HTML embed' : 'URL filmu'} />
                  )}
                </div>
              )}
              {showMirror2 && !showMirror3 && (
                <button type="button" onClick={() => setShowMirror3(true)} className="btn-link-violet flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Dodaj mirror 3
                </button>
              )}
              {showMirror3 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 3</span>
                    <div className="flex items-center gap-3">
                      {mirrorPromoteEligible(3) && <button type="button" onClick={() => handlePromoteMirror(3)} disabled={promotingSlot === 3} className="btn-link-violet text-xs disabled:opacity-50">{promotingSlot === 3 ? 'Zamienianie...' : 'Ustaw jako główne źródło'}</button>}
                      <button type="button" onClick={() => { setShowMirror3(false); setMirror3Name(''); setMirror3Url(''); setMirror3Type('link'); setMirror3VideoFile(null); setMirror3StreamVideoId(''); }} className="btn-link-red">Usuń</button>
                    </div>
                  </div>
                  <input type="text" value={mirror3Name} onChange={e => setMirror3Name(e.target.value)} className="input-field" placeholder="Nazwa" maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {[{v:'link',l:'Link/YouTube'},{v:'embed',l:'Kod HTML'},{v:'plex',l:'Plex'},{v:'streamer',l:'Upload'}].map(o => (
                      <button key={o.v} type="button" onClick={() => { setMirror3Type(o.v); setMirror3VideoFile(null); setMirror3StreamVideoId(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mirror3Type === o.v ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>{o.l}</button>
                    ))}
                  </div>
                  {mirror3Type === 'streamer' ? (
                    mirror3StreamVideoId ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{mirror3StreamVideoId}</code></span>
                      </div>
                    ) : (
                      <div className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${mirror3VideoFile ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400'}`} onClick={() => mirror3VideoRef.current?.click()}>
                        <Upload className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                        {mirror3VideoFile ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{mirror3VideoFile.name} ({(mirror3VideoFile.size/1024/1024).toFixed(1)} MB)</p>
                          : <p className="text-sm text-zinc-500">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij</span> - max 20 GB</p>}
                        <input ref={mirror3VideoRef} type="file" accept="video/*" onChange={e => setMirror3VideoFile(e.target.files?.[0] || null)} className="hidden" />
                      </div>
                    )
                  ) : (
                    <input type="text" value={mirror3Url} onChange={e => setMirror3Url(e.target.value)} className="input-field" placeholder={mirror3Type === 'plex' ? 'Link do filmu w Plex (app.plex.tv/...)' : mirror3Type === 'embed' ? 'Kod HTML embed' : 'URL filmu'} />
                  )}
                </div>
              )}
              {showMirror3 && !showMirror4 && (
                <button type="button" onClick={() => setShowMirror4(true)} className="btn-link-violet flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Dodaj mirror 4
                </button>
              )}
              {showMirror4 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 4</span>
                    <div className="flex items-center gap-3">
                      {mirrorPromoteEligible(4) && <button type="button" onClick={() => handlePromoteMirror(4)} disabled={promotingSlot === 4} className="btn-link-violet text-xs disabled:opacity-50">{promotingSlot === 4 ? 'Zamienianie...' : 'Ustaw jako główne źródło'}</button>}
                      <button type="button" onClick={() => { setShowMirror4(false); setMirror4Name(''); setMirror4Url(''); setMirror4Type('link'); setMirror4VideoFile(null); setMirror4StreamVideoId(''); }} className="btn-link-red">Usuń</button>
                    </div>
                  </div>
                  <input type="text" value={mirror4Name} onChange={e => setMirror4Name(e.target.value)} className="input-field" placeholder="Nazwa" maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {[{v:'link',l:'Link/YouTube'},{v:'embed',l:'Kod HTML'},{v:'plex',l:'Plex'},{v:'streamer',l:'Upload'}].map(o => (
                      <button key={o.v} type="button" onClick={() => { setMirror4Type(o.v); setMirror4VideoFile(null); setMirror4StreamVideoId(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mirror4Type === o.v ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>{o.l}</button>
                    ))}
                  </div>
                  {mirror4Type === 'streamer' ? (
                    mirror4StreamVideoId ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{mirror4StreamVideoId}</code></span>
                      </div>
                    ) : (
                      <div className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${mirror4VideoFile ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400'}`} onClick={() => mirror4VideoRef.current?.click()}>
                        <Upload className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                        {mirror4VideoFile ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{mirror4VideoFile.name} ({(mirror4VideoFile.size/1024/1024).toFixed(1)} MB)</p>
                          : <p className="text-sm text-zinc-500">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij</span> - max 20 GB</p>}
                        <input ref={mirror4VideoRef} type="file" accept="video/*" onChange={e => setMirror4VideoFile(e.target.files?.[0] || null)} className="hidden" />
                      </div>
                    )
                  ) : (
                    <input type="text" value={mirror4Url} onChange={e => setMirror4Url(e.target.value)} className="input-field" placeholder={mirror4Type === 'plex' ? 'Link do filmu w Plex (app.plex.tv/...)' : mirror4Type === 'embed' ? 'Kod HTML embed' : 'URL filmu'} />
                  )}
                </div>
              )}
              {showMirror4 && !showMirror5 && (
                <button type="button" onClick={() => setShowMirror5(true)} className="btn-link-violet flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Dodaj mirror 5
                </button>
              )}
              {showMirror5 && (
                <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-field mb-0">Mirror 5</span>
                    <div className="flex items-center gap-3">
                      {mirrorPromoteEligible(5) && <button type="button" onClick={() => handlePromoteMirror(5)} disabled={promotingSlot === 5} className="btn-link-violet text-xs disabled:opacity-50">{promotingSlot === 5 ? 'Zamienianie...' : 'Ustaw jako główne źródło'}</button>}
                      <button type="button" onClick={() => { setShowMirror5(false); setMirror5Name(''); setMirror5Url(''); setMirror5Type('link'); setMirror5VideoFile(null); setMirror5StreamVideoId(''); }} className="btn-link-red">Usuń</button>
                    </div>
                  </div>
                  <input type="text" value={mirror5Name} onChange={e => setMirror5Name(e.target.value)} className="input-field" placeholder="Nazwa" maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {[{v:'link',l:'Link/YouTube'},{v:'embed',l:'Kod HTML'},{v:'plex',l:'Plex'},{v:'streamer',l:'Upload'}].map(o => (
                      <button key={o.v} type="button" onClick={() => { setMirror5Type(o.v); setMirror5VideoFile(null); setMirror5StreamVideoId(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${mirror5Type === o.v ? 'bg-violet-500 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>{o.l}</button>
                    ))}
                  </div>
                  {mirror5Type === 'streamer' ? (
                    mirror5StreamVideoId ? (
                      <div className="flex items-center gap-2 p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Wideo przesłane: <code className="text-xs font-mono">{mirror5StreamVideoId}</code></span>
                      </div>
                    ) : (
                      <div className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${mirror5VideoFile ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-300 dark:border-zinc-700 hover:border-violet-400'}`} onClick={() => mirror5VideoRef.current?.click()}>
                        <Upload className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                        {mirror5VideoFile ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">{mirror5VideoFile.name} ({(mirror5VideoFile.size/1024/1024).toFixed(1)} MB)</p>
                          : <p className="text-sm text-zinc-500">Przeciągnij plik lub <span className="text-violet-500 font-bold">kliknij</span> - max 20 GB</p>}
                        <input ref={mirror5VideoRef} type="file" accept="video/*" onChange={e => setMirror5VideoFile(e.target.files?.[0] || null)} className="hidden" />
                      </div>
                    )
                  ) : (
                    <input type="text" value={mirror5Url} onChange={e => setMirror5Url(e.target.value)} className="input-field" placeholder={mirror5Type === 'plex' ? 'Link do filmu w Plex (app.plex.tv/...)' : mirror5Type === 'embed' ? 'Kod HTML embed' : 'URL filmu'} />
                  )}
                </div>
              )}
            </div>

            {/* Date picker */}
            <DateTimePicker label="Data publikacji" value={publishDate} onChange={setPublishDate} />

            <div>
              <label className="label-field">Tagi</label>
              <div className="input-field flex flex-wrap gap-2 min-h-[56px] !p-3 cursor-text" onClick={() => tagInputRef.current?.focus()}>
                {selectedTags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-500 text-white rounded-xl text-xs font-bold animate-fade-in">
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

            {!isSelfHosted && uploadProgress && (
              <div className="space-y-3 p-4 bg-violet-50/50 dark:bg-violet-500/5 rounded-xl border border-violet-100 dark:border-violet-500/10">
                <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-300 font-medium">
                  {uploadPercent < 100 && <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                  {uploadPercent >= 100 && <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                  <span className="flex-1">{uploadProgress}</span>
                  <span className="text-xs font-mono text-violet-500">{uploadPercent}%</span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Całość</span>
                    <span className="text-[10px] font-mono text-zinc-500">{uploadPercent}%</span>
                  </div>
                  <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadPercent}%` }} />
                  </div>
                </div>
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

            <button type="submit" disabled={submitting} className="w-full py-5 bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-2xl font-bold hover:from-violet-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-xl shadow-violet-500/20 active:scale-[0.98]">
              {submitting ? 'Zapisywanie...' : isEdit ? 'Zapisz zmiany' : 'Dodaj film'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
