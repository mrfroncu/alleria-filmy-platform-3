// Shared Framer Motion presets — reused across the app so motion feels consistent
// instead of being redefined ad hoc per component.

export const spring = { type: 'spring', stiffness: 400, damping: 28 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 24 };

export const fadeSlideUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: softSpring },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: softSpring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const staggerContainer = (staggerChildren = 0.06, delayChildren = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren, delayChildren },
  },
});

export const modalBackdrop = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalPanel = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } },
};

// Tab content cross-fade — direction-aware horizontal drift
export const tabPanel = {
  hidden: { opacity: 0, x: 10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.15 } },
};

export const popIn = {
  hidden: { opacity: 0, scale: 0.5 },
  show: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.5, transition: { duration: 0.12 } },
};

export const tapScale = { scale: 0.96 };
export const hoverLift = { y: -2, transition: { duration: 0.15 } };
