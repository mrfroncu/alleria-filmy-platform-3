const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { gdprDir, uploadsDir } = require('./config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Dozwolone są tylko pliki graficzne (JPG, PNG, GIF, WebP).'), false);
    }
  },
});

// ============ GDPR / RODO (admin review) ============
const gdprUpload = multer({ dest: gdprDir, limits: { fileSize: 20 * 1024 * 1024 } });

module.exports = { storage, upload, gdprUpload };
