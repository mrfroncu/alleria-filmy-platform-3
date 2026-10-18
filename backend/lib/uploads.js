const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { gdprDir, uploadsDir } = require('./config');

// ============ IMAGE UPLOADS (avatars, thumbnails) ============
// Both the original filename and the multipart Content-Type come from the client, so neither may
// decide what ends up in /api/uploads (served from our own origin): "x.html" sent as image/png
// used to be stored and served back as text/html. The file is written under a bare random name,
// its first bytes are checked against the image formats we accept, and only then does it get the
// extension of the format it really is.
const IMAGE_SIGNATURES = [
  { ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: '.webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const IMAGE_ERROR = 'Dozwolone są tylko pliki graficzne (JPG, PNG, GIF, WebP).';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, uuidv4()),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  // Cheap early reject only — the real check is detectImageExt below, on the stored bytes.
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(IMAGE_ERROR), false);
  },
});

function detectImageExt(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(12);
    const n = fs.readSync(fd, head, 0, 12, 0);
    const match = IMAGE_SIGNATURES.find(s => s.test(head.subarray(0, n)));
    return match ? match.ext : null;
  } finally {
    fs.closeSync(fd);
  }
}

// upload.single(field) for images: multer errors become a JSON 400 (instead of Express's HTML
// 500 page), and a stored file that isn't really a JPG/PNG/GIF/WebP is deleted and rejected.
// On success req.file.filename/path carry the verified extension.
function imageUpload(field) {
  const single = upload.single(field);
  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) {
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        return res.status(400).json({ error: tooBig ? 'Plik jest za duży (maks. 10 MB).' : (err.message || IMAGE_ERROR) });
      }
      if (!req.file) return next();
      let ext = null;
      try { ext = detectImageExt(req.file.path); } catch (e) {}
      if (!ext) {
        try { fs.rmSync(req.file.path, { force: true }); } catch (e) {}
        return res.status(400).json({ error: IMAGE_ERROR });
      }
      const finalPath = req.file.path + ext;
      try {
        fs.renameSync(req.file.path, finalPath);
      } catch (e) {
        try { fs.rmSync(req.file.path, { force: true }); } catch (_) {}
        return res.status(500).json({ error: 'Nie udało się zapisać pliku.' });
      }
      req.file.path = finalPath;
      req.file.filename += ext;
      next();
    });
  };
}

// Headers for everything served from /api/uploads: no MIME sniffing, and a sandboxing CSP so that
// even a file that slipped in before the checks above (e.g. an .html/.svg uploaded by an older
// version) can never run script on our origin when opened directly. <img> embedding is unaffected.
function setUploadHeaders(res) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'");
}

// ============ GDPR / RODO (admin review) ============
const gdprUpload = multer({ dest: gdprDir, limits: { fileSize: 20 * 1024 * 1024 } });

module.exports = { imageUpload, detectImageExt, setUploadHeaders, gdprUpload };
