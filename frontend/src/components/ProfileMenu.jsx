import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { roleBadgeClass, roleDotClass } from '../utils/roleColors';
import { tapScale } from '../utils/motion';

const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.92, y: -8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 28 } },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } },
};

export default function ProfileMenu({ compact = false }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!user) return null;

  const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${user.display_name || 'U'}&background=6366f1&color=fff&size=80`;

  return (
    <div className="relative" ref={rootRef}>
      <motion.button
        whileTap={tapScale}
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2.5 rounded-xl transition-colors hover:bg-zinc-100 dark:hover:bg-white/5 ${compact ? 'p-1' : 'py-1.5 pl-1.5 pr-3'}`}
      >
        <img src={avatarUrl} alt="" className="w-8 h-8 rounded-lg shadow-sm border border-zinc-200 dark:border-white/10 object-cover shrink-0" />
        {!compact && (
          <>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-[13px] font-bold text-zinc-900 dark:text-white truncate max-w-[140px]">{user.display_name || user.username}</span>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider">
                <span className={`w-1.5 h-1.5 rounded-full ${roleDotClass(user.role)}`} />
                <span className="text-zinc-500 dark:text-zinc-400">{user.role}</span>
              </span>
            </div>
            <motion.div animate={{ rotate: open ? 180 : 0 }} className="hidden sm:block">
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </motion.div>
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800">
              <img src={avatarUrl} alt="" className="w-11 h-11 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10 object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user.display_name || user.username}</p>
                <span className={`inline-flex mt-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${roleBadgeClass(user.role)}`}>
                  {user.role?.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="p-1.5">
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <User className="w-4 h-4" /> Mój profil
              </Link>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Wyloguj
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
