// Background loops started once the HTTP server is listening (never in the test suite, which
// only imports `app`): transcoding status polling and scheduled-publish notifications.
const fetch = require('node-fetch');
const db = require('./db');
const { STREAM_SECRET } = require('./lib/config');
const { STREAM_URL, pullThumbnailLocally } = require('./lib/stream');
const { announceVideo } = require('./lib/notify');

// One-time migration flag for the backfill batch in the poll loop below — flips true the first
// time a sweep finds nothing left to migrate, so that loop stops querying for it on every future
// tick forever. Videos created after that point never need backfill anyway (their thumbnail gets
// pulled locally directly on the transcoding→ready transition), so this is safe to leave off.
let thumbnailBackfillDone = false;

function startBackgroundJobs() {
  // Auto-check transcoding status every 30 seconds
  setInterval(async () => {
    try {
      const transcoding = db.prepare("SELECT * FROM videos WHERE stream_status = 'transcoding' AND stream_video_id IS NOT NULL").all();
      for (const video of transcoding) {
        try {
          const r = await fetch(`${STREAM_URL}/status/${video.stream_video_id}`, {
            headers: { 'X-Stream-Token': STREAM_SECRET }
          });
          const data = await r.json();
          if (data.status === 'ready') {
            db.prepare("UPDATE videos SET stream_status = 'ready' WHERE id = ?").run(video.id);
            console.log(`[TRANSCODE] ✅ Video ${video.id} "${video.title}" → ready`);
            if (!video.custom_thumbnail) pullThumbnailLocally(video);
          } else if (data.status === 'error') {
            db.prepare("UPDATE videos SET stream_status = 'error' WHERE id = ?").run(video.id);
            console.log(`[TRANSCODE] ❌ Video ${video.id} "${video.title}" → error`);
          }
        } catch (e) { /* streaming service unreachable — skip */ }
      }

      // Gradually backfill existing videos whose thumbnail is still a live proxy URL to the
      // streaming server (predates this feature, or was created while it was unreachable) — a
      // small batch per tick rather than all at once, so a big library doesn't thunder the
      // streaming server with requests right after a deploy. One-time migration: stops querying
      // for this at all once a sweep comes up empty (see thumbnailBackfillDone above).
      if (!thumbnailBackfillDone) {
        const stale = db.prepare(`
          SELECT * FROM videos
          WHERE stream_video_id IS NOT NULL AND stream_status = 'ready'
            AND custom_thumbnail = 0 AND thumbnail LIKE '/stream/media/%'
          LIMIT 3
        `).all();
        if (stale.length === 0) {
          thumbnailBackfillDone = true;
        } else {
          for (const video of stale) await pullThumbnailLocally(video);
        }
      }
    } catch (e) { /* DB error — skip */ }
  }, 30000);

  // Scheduled publishing + webhook check — every 60 seconds
  setInterval(() => { runPublicationAnnouncements().catch(e => console.error('[WEBHOOK] Interval error:', e.message)); }, 60000);
}

// Announces every video that just became public: date passed, not hidden (drafts wait until
// published by hand), ready (not transcoding), not announced yet (webhook_sent). Exported so the
// test suite can run one tick without waiting on the interval.
async function runPublicationAnnouncements() {
  const due = db.prepare(`
    SELECT id FROM videos
    WHERE datetime(publish_date) <= datetime('now')
    AND is_hidden = 0
    AND (webhook_sent IS NULL OR webhook_sent = 0)
    AND (stream_status IS NULL OR stream_status = 'ready')
  `).all();
  for (const { id } of due) {
    // Mark as announced first so an overlapping tick can't send twice — the per-channel
    // outcome (including failures, for a manual resend) lands in video_notification_log.
    db.prepare('UPDATE videos SET webhook_sent = 1 WHERE id = ?').run(id);
    await announceVideo(id, { trigger: 'auto' });
  }
}

module.exports = { startBackgroundJobs, runPublicationAnnouncements };
