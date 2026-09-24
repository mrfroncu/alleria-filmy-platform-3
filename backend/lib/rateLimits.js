const rateLimit = require('express-rate-limit');
const { IS_TEST } = require('./config');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' },
  skip: () => IS_TEST,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 2400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele żądań. Zwolnij.' },
  skip: (req) => IS_TEST || req.path.startsWith('/api/watch-party') || req.path.startsWith('/api/logs/watch-party'),
});

module.exports = { authLimiter, apiLimiter };
