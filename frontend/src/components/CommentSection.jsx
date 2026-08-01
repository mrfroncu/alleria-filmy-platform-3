import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Reply, Pencil, Trash2, Check, X, Clock, ShieldAlert } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ui/Toast';
import { formatDate, buildCommentTree } from '../utils/helpers';
import Avatar from './ui/Avatar';
import Button from './ui/Button';
import Modal from './ui/Modal';

function CommentNode({ comment, depth, user, onReply, onEdit, onSaveEdit, onCancelEdit, onDelete, onHardDelete, editingId, editContent, setEditContent, silentEdit, setSilentEdit, replyingId, onSubmitReply, replyContent, setReplyContent, historyOpenId, setHistoryOpenId }) {
  const isDev = user?.role === 'dev';
  const isOwner = comment.user_id === user?.id;
  const canMod = isOwner || user?.role === 'admin' || isDev;
  const isDeleted = !!comment.deleted;
  const isEditing = editingId === comment.id;
  const isReplying = replyingId === comment.id;
  let history = [];
  try { history = JSON.parse(comment.edit_history || '[]'); } catch (_) {}

  return (
    <div className={depth > 0 ? 'ml-6 sm:ml-10 border-l-2 border-slate-200 dark:border-white/10 pl-4' : ''}>
      <div className="flex gap-3 py-2.5 group">
        <Avatar src={comment.avatar} name={comment.display_name || comment.username} size="sm" className={isDeleted ? 'opacity-40 grayscale' : ''} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${isDeleted ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>{comment.display_name || comment.username}</span>
            <span className="text-[10px] text-slate-400 font-mono">{formatDate(comment.created_at)}</span>
            {!!comment.edited && !isDeleted && (
              <button onClick={() => setHistoryOpenId(historyOpenId === comment.id ? null : comment.id)} className="text-[10px] text-slate-400 hover:text-brand-500">(edytowano)</button>
            )}
          </div>

          {isDeleted ? (
            <p className="text-sm text-slate-400 italic mt-0.5">(komentarz usunięty)</p>
          ) : isEditing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={2}
                autoFocus
                className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-2 text-sm outline-none focus:border-brand-400"
              />
              <div className="flex items-center gap-2">
                <button onClick={() => onSaveEdit(comment.id)} className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-500/10"><Check className="w-4 h-4" /></button>
                <button onClick={onCancelEdit} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
                {isDev && (
                  <label className="flex items-center gap-1.5 text-[11px] text-amber-500 cursor-pointer select-none ml-1">
                    <input type="checkbox" checked={silentEdit} onChange={(e) => setSilentEdit(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" /> Ciche (bez śladu)
                  </label>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words mt-0.5">{comment.content}</p>
          )}

          {historyOpenId === comment.id && history.length > 0 && (
            <div className="mt-2 p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Historia edycji</p>
              {history.map((h, i) => (
                <div key={i} className="text-xs text-slate-500 mb-1"><span className="font-mono text-[10px]">{formatDate(h.date)}</span>: {h.content}</div>
              ))}
            </div>
          )}

          {!isEditing && !isDeleted && (
            <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onReply(comment.id)} className="text-[11px] font-semibold text-slate-400 hover:text-brand-500 flex items-center gap-1"><Reply className="w-3 h-3" /> Odpowiedz</button>
              {(isOwner || isDev) && (
                <button onClick={() => onEdit(comment)} className="text-[11px] font-semibold text-slate-400 hover:text-brand-500 flex items-center gap-1"><Pencil className="w-3 h-3" /> Edytuj</button>
              )}
              {canMod && (
                <button onClick={() => onDelete(comment.id)} className="text-[11px] font-semibold text-slate-400 hover:text-rose-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Usuń</button>
              )}
              {isDev && (
                <button onClick={() => onHardDelete(comment.id)} className="text-[11px] font-semibold text-slate-400 hover:text-rose-500 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Hard delete</button>
              )}
            </div>
          )}

          {isReplying && (
            <div className="mt-2 flex gap-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={1}
                autoFocus
                placeholder="Napisz odpowiedź..."
                className="flex-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-2 text-sm outline-none focus:border-brand-400"
              />
              <Button size="sm" onClick={() => onSubmitReply(comment.id)} disabled={!replyContent.trim()}><Send className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </div>
      </div>

      {comment.replies?.length > 0 && (
        <div>
          {comment.replies.map((r) => (
            <CommentNode
              key={r.id} comment={r} depth={depth + 1} user={user}
              onReply={onReply} onEdit={onEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
              onDelete={onDelete} onHardDelete={onHardDelete}
              editingId={editingId} editContent={editContent} setEditContent={setEditContent}
              silentEdit={silentEdit} setSilentEdit={setSilentEdit}
              replyingId={replyingId} onSubmitReply={onSubmitReply} replyContent={replyContent} setReplyContent={setReplyContent}
              historyOpenId={historyOpenId} setHistoryOpenId={setHistoryOpenId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentSection({ videoId }) {
  const { user } = useAuth();
  const { config } = useSettings();
  const notify = useToast();
  const isDev = user?.role === 'dev';

  const [comments, setComments] = useState(null);
  const [newContent, setNewContent] = useState('');
  const [posting, setPosting] = useState(false);

  const [replyingId, setReplyingId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [silentEdit, setSilentEdit] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, hard }

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminForm, setAdminForm] = useState({ user_id: '', content: '', created_at: '' });

  const load = useCallback(() => {
    api.getComments(videoId).then(setComments).catch(() => setComments([]));
  }, [videoId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isDev && showAdminPanel && adminUsers.length === 0) api.getAllUsers().then(setAdminUsers).catch(() => {}); }, [isDev, showAdminPanel, adminUsers.length]);

  const tree = comments ? buildCommentTree(comments) : [];
  const activeCount = comments ? comments.filter((c) => !c.deleted).length : 0;

  const submitTop = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setPosting(true);
    try {
      await api.addComment(videoId, newContent.trim());
      setNewContent('');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
    setPosting(false);
  };

  const submitReply = async (parentId) => {
    try {
      await api.addComment(videoId, replyContent.trim(), parentId);
      setReplyingId(null);
      setReplyContent('');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditContent(c.content); setSilentEdit(false); };
  const saveEdit = async (id) => {
    try {
      await api.updateComment(id, editContent.trim(), isDev && silentEdit);
      setEditingId(null);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.hard) await api.hardDeleteComment(confirmDelete.id);
      else await api.deleteComment(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const submitAdminComment = async () => {
    if (!adminForm.user_id || !adminForm.content.trim()) return;
    try {
      await api.addAdminComment({
        video_id: videoId,
        user_id: Number(adminForm.user_id),
        content: adminForm.content.trim(),
        created_at: adminForm.created_at || undefined,
      });
      setAdminForm({ user_id: '', content: '', created_at: '' });
      load();
      notify('Komentarz dodany.', 'success');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-5">
        <MessageCircle className="w-4.5 h-4.5 text-brand-500" />
        <h2 className="font-bold text-slate-900 dark:text-white font-display">Komentarze {comments && `(${activeCount})`}</h2>
      </div>

      <form onSubmit={submitTop} className="flex gap-2 mb-6">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          maxLength={config.limitComment}
          rows={1}
          placeholder="Dodaj komentarz..."
          className="flex-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
        />
        <Button type="submit" disabled={posting || !newContent.trim()}><Send className="w-4 h-4" /></Button>
      </form>

      {isDev && (
        <div className="mb-6">
          <button onClick={() => setShowAdminPanel((s) => !s)} className="text-xs font-semibold text-amber-500 hover:text-amber-600 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Dodaj komentarz jako...
          </button>
          <AnimatePresence>
            {showAdminPanel && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 p-4 rounded-3xl bg-amber-500/5 border border-amber-500/20 space-y-2.5">
                  <select
                    value={adminForm.user_id}
                    onChange={(e) => setAdminForm((f) => ({ ...f, user_id: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="">Wybierz użytkownika...</option>
                    {adminUsers.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
                  </select>
                  <textarea
                    value={adminForm.content}
                    onChange={(e) => setAdminForm((f) => ({ ...f, content: e.target.value }))}
                    rows={2}
                    placeholder="Treść komentarza..."
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={adminForm.created_at}
                    onChange={(e) => setAdminForm((f) => ({ ...f, created_at: e.target.value }))}
                    className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  <Button size="sm" onClick={submitAdminComment}>Dodaj</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {comments === null ? (
        <p className="text-sm text-slate-400">Ładowanie komentarzy...</p>
      ) : tree.length === 0 ? (
        <p className="text-sm text-slate-400">Brak komentarzy. Bądź pierwszy!</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {tree.map((c) => (
            <CommentNode
              key={c.id} comment={c} depth={0} user={user}
              onReply={(id) => { setReplyingId(id); setReplyContent(''); }}
              onEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              onDelete={(id) => setConfirmDelete({ id, hard: false })}
              onHardDelete={(id) => setConfirmDelete({ id, hard: true })}
              editingId={editingId} editContent={editContent} setEditContent={setEditContent}
              silentEdit={silentEdit} setSilentEdit={setSilentEdit}
              replyingId={replyingId} onSubmitReply={submitReply} replyContent={replyContent} setReplyContent={setReplyContent}
              historyOpenId={historyOpenId} setHistoryOpenId={setHistoryOpenId}
            />
          ))}
        </div>
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={confirmDelete?.hard ? 'Trwałe usunięcie' : 'Usuń komentarz'} maxWidth="max-w-sm">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {confirmDelete?.hard
            ? 'To usunie komentarz i wszystkie odpowiedzi na stałe. Tej operacji nie można cofnąć.'
            : 'Komentarz zostanie ukryty, ale wątek pozostanie zachowany.'}
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={confirmDeleteAction}>Usuń</Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Anuluj</Button>
        </div>
      </Modal>
    </div>
  );
}
