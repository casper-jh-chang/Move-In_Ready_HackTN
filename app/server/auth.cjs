const crypto = require('crypto');

const SESSION_DAYS = 7;

const hashPassword = (password) => new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`scrypt$${salt}$${key.toString('hex')}`));
});

const verifyPassword = (password, stored) => new Promise((resolve) => {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, key) => {
        if (err) return resolve(false);
        const expected = Buffer.from(hash, 'hex');
        resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
    });
});

const newToken = () => crypto.randomBytes(32).toString('hex');
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Express middleware factory. `db` is passed in to avoid a circular require with db.cjs.
function authenticate(db) {
    return async (req, res, next) => {
        try {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            if (token) {
                req.user = await db.one(`SELECT u.id, u.name, u.email, u.role, u.phone, u.area, u.lat, u.lng
                    FROM sessions s JOIN users u ON u.id = s.user_id
                    WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1`, [tokenHash(token)]);
                req.tokenHash = tokenHash(token);
            }
            next();
        } catch (e) {
            next(e);
        }
    };
}

// requireRole() = any signed-in user; requireRole('admin', 'volunteer') = only those roles.
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({error: 'Please sign in'});
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({error: 'Your role does not have access to this action'});
    next();
};

module.exports = {SESSION_DAYS, hashPassword, verifyPassword, newToken, tokenHash, authenticate, requireRole};
