const jwt = require('jsonwebtoken');

// =========================
// 🍪 COOKIE CONFIG HELPER
// =========================
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
};

const clearAllAuthCookies = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookiesToClear = ['orbit_token', 'refreshToken', 'adminToken', 'token'];
  
  // We clear with multiple option permutations to guarantee we hit the exact 
  // signature of any legacy cookies that might be stuck in the browser.
  const optionSets = [
    { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' },
    { httpOnly: true, secure: true, sameSite: 'none', path: '/' },
    { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
    { path: '/' }
  ];

  cookiesToClear.forEach(cookieName => {
    optionSets.forEach(options => {
      res.clearCookie(cookieName, options);
    });
  });
};

// =========================
// 🔐 AUTH MIDDLEWARE
// Reads JWT from httpOnly cookie. Automatically DESTROYS invalid/stale cookies.
// =========================
const auth = (req, res, next) => {
  const token = req.cookies?.orbit_token;

  if (!token) {
    // If no valid access token, forcefully scrub any legacy cookies that might exist
    clearAllAuthCookies(res);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    // Token is invalid or expired -> DESTROY ALL AUTH COOKIES
    clearAllAuthCookies(res);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// =========================
// 🛡️ ROLE GUARD
// Must be used AFTER auth middleware so req.user is populated.
// =========================
const managerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
};

module.exports = { auth, managerOnly, clearAllAuthCookies };
