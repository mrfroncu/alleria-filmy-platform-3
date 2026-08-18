import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';

export default function RankModal({ isOpen, onClose, rank, onSaved }) {
  const isEdit = !!rank;
  const confirm = useConfirm();
  const toast = useToast();

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [baseline, setBaseline] = useState({ name: '', desc: '', color: '#6366f1' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (rank) {
      setName(rank.name);
      setDesc(rank.description || '');
      setColor(rank.color || '#6366f1');
      setBaseline({ name: rank.name, desc: rank.description || '', color: rank.color || '#6366f1' });
    } else {
      setName(''); setDesc(''); setColor('#6366f1');
      setBaseline({ name: '', desc: '', color: '#6366f1' });
    }
  }, [isOpen, rank]);

  const dirty = isOpen && JSON.stringify({ name, desc, color }) !== JSON.stringify(baseline);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const guardedClose = async () => {
    if (dirtyRef.current && !(await confirm('Masz niezapisane zmiany w tej randze. Zamknąć bez zapisywania?', { danger: true, confirmLabel: 'Odrzuć zmiany' }))) return;
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) guardedClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.updateRank(rank.id, { name, description: desc, color });
        toast.success(`Ranga "${name}" zaktualizowana.`);
      } else {
        await api.createRank({ name, description: desc, color });
        toast.success(`Ranga "${name}" utworzona.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={guardedClose} />
      <div className="modal-content max-w-md" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">{isEdit ? 'Edytuj rangę' : 'Nowa ranga'}</h2>
            <button onClick={guardedClose} className="btn-icon-zinc"><X className="w-5 h-5" /></button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2"><label className="label-field">Nazwa rangi</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="np. Redaktor" required /></div>
              <div><label className="label-field">Kolor</label><div className="flex gap-2 items-center"><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer p-0.5 bg-transparent" /><span className="text-sm font-mono text-zinc-500">{color}</span></div></div>
            </div>
            <div><label className="label-field">Opis (opcjonalnie)</label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="input-field" placeholder="Opis rangi" /></div>
            <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-2xl font-bold hover:from-violet-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-xl shadow-violet-500/20 active:scale-[0.98]">
              {submitting ? 'Zapisywanie...' : isEdit ? 'Zapisz rangę' : 'Dodaj rangę'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
