// Shared role → color mapping used by the profile menu, profile page, and admin user table
export const ROLE_BADGE_CLASSES = {
  dev: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20',
  admin: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
  member: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
};

export const ROLE_DOT_CLASSES = {
  dev: 'bg-red-400',
  admin: 'bg-amber-400',
  member: 'bg-emerald-400',
};

export function roleBadgeClass(role) {
  return ROLE_BADGE_CLASSES[role] || ROLE_BADGE_CLASSES.member;
}

export function roleDotClass(role) {
  return ROLE_DOT_CLASSES[role] || ROLE_DOT_CLASSES.member;
}
