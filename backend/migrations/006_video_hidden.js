// Manual visibility switch for videos, independent of publish_date scheduling: a hidden video is
// invisible to regular viewers no matter its date (same bypass as scheduled videos — admin/dev and
// editors of its category still see it). Covers both "upload as unpublished draft, publish by hand
// later" and "take an already-published video down without deleting it, restore it later".
module.exports = {
  version: 6,
  name: 'video_hidden',
  description: 'Ręczne ukrywanie filmów (szkic / zdjęty z widoczności) — videos.is_hidden',
  up(db) {
    db.exec(`ALTER TABLE videos ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;`);
  },
};
