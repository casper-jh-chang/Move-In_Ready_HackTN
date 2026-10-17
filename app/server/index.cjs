require('dotenv').config();
const express = require('express'), cors = require('cors'), fs = require('fs'), path = require('path');
const db = require('./db.cjs');
const {
    SESSION_DAYS,
    hashPassword,
    verifyPassword,
    newToken,
    tokenHash,
    authenticate,
    requireRole
} = require('./auth.cjs');
const {categories, areas, depot, coordsFor, screening} = require('./meta.cjs');
const vision = require('./vision.cjs'); // video intake (../vision-service)
const photoScan = require('./photo-scan.cjs'); // single-photo scan on OCI
const geo = require('./geo.cjs');

const app = express();
app.use(cors());
app.use(express.json({limit: '7mb'}));
app.use(authenticate(db));

// Wraps async handlers so rejected promises reach the error handler (Express 4).
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const fail = (res, status, error) => res.status(status).json({error});
const str = (v, max, fallback = '') => String(v ?? fallback).trim().slice(0, max);
const log = (actorId, text) => db.query('INSERT INTO activity_log (actor_id, text) VALUES (?, ?)', [actorId || null, text.slice(0, 255)]);
const ROLES = ['admin', 'volunteer', 'donor', 'user'];
const PUBLIC_ROLES = ['donor', 'user'];

// ---------- Serializers ----------
const publicUser = (u) => u && ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    area: u.area,
    address: u.address,
    geoPrecise: !!u.geo_precise,
    active: u.active === undefined ? true : !!u.active,
    createdAt: u.created_at
});
const parseJson = (s, fallback) => {
    try {
        return s ? JSON.parse(s) : fallback
    } catch {
        return fallback
    }
};
// withDonor = false (recipients): hide the donor's identity, street address and exact location.
const toFurniture = (r, {withDonor = true} = {}) => ({
    id: r.id,
    donorId: r.donor_id,
    ...(withDonor ? {donorName: r.donor_name, donorEmail: r.donor_email, address: r.pickup_address} : {}),
    name: r.name,
    category: r.category,
    condition: r.item_condition,
    dimensions: r.dimensions,
    weight: r.weight_kg,
    location: r.pickup_area,
    ...(withDonor ? {lat: r.lat, lng: r.lng, geoPrecise: !!r.geo_precise} : coordsFor(r.pickup_area)),
    notes: r.notes,
    photo: r.photo,
    status: r.status,
    inventoryStatus: r.inventory_status,
    screening: {flags: parseJson(r.screening_flags, [])},
    visionResult: parseJson(r.vision_result, null),
    reviewReason: r.review_reason,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at
});
const toRequest = (r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userArea: r.user_area,
    furnitureId: r.furniture_id,
    furnitureName: r.furniture_name,
    category: r.category,
    furnitureStatus: r.inventory_status,
    message: r.message,
    status: r.status,
    decisionNote: r.decision_note,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
    deliveryTask: r.task_id ? {id: r.task_id, volunteerName: r.task_volunteer, status: r.task_status} : null
});
const toTask = (r) => {
    const pickup = r.type === 'pickup';
    return {
        id: r.id,
        type: r.type,
        status: r.status,
        furnitureId: r.furniture_id,
        furnitureName: r.furniture_name,
        category: r.category,
        weight: r.weight_kg,
        requestId: r.request_id,
        volunteerId: r.volunteer_id,
        volunteerName: r.volunteer_name,
        scheduledFor: r.scheduled_for,
        notes: r.notes,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        // Pickups happen at the donor; deliveries go to the requesting user.
        contactName: pickup ? r.donor_name : r.recipient_name,
        contactPhone: pickup ? r.donor_phone : r.recipient_phone,
        area: pickup ? r.pickup_area : r.recipient_area,
        address: pickup ? r.pickup_address : r.recipient_address,
        geoPrecise: !!(pickup ? r.f_precise : r.r_precise),
        lat: pickup ? r.f_lat : r.r_lat,
        lng: pickup ? r.f_lng : r.r_lng
    };
};

const FURNITURE_SQL = 'SELECT f.*, d.name AS donor_name, d.email AS donor_email FROM furniture f JOIN users d ON d.id = f.donor_id';
const AVAILABLE_SQL = `f.status = 'approved' AND f.inventory_status IN ('pledged', 'in_stock')
    AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.furniture_id = f.id AND r.status IN ('approved', 'fulfilled'))`;
const REQUEST_SQL = `SELECT r.*,
                            u.name   AS user_name,
                            u.area   AS user_area,
                            f.name   AS furniture_name,
                            f.category,
                            f.inventory_status,
                            t.id     AS task_id,
                            t.status AS task_status,
                            v.name   AS task_volunteer
                     FROM requests r
                              JOIN users u ON u.id = r.user_id
                              JOIN furniture f ON f.id = r.furniture_id
                              LEFT JOIN tasks t ON t.request_id = r.id AND t.status <> 'cancelled'
                              LEFT JOIN users v ON v.id = t.volunteer_id`;
const TASK_SQL = `SELECT t.*,
                         v.name   AS volunteer_name,
                         f.name   AS furniture_name,
                         f.category,
                         f.weight_kg,
                         f.pickup_area,
                         f.pickup_address,
                         f.lat    AS f_lat,
                         f.lng    AS f_lng,
                         f.geo_precise AS f_precise,
                         d.name   AS donor_name,
                         d.phone  AS donor_phone,
                         ru.name  AS recipient_name,
                         ru.phone AS recipient_phone,
                         ru.area  AS recipient_area,
                         ru.address AS recipient_address,
                         ru.lat   AS r_lat,
                         ru.lng   AS r_lng,
                         ru.geo_precise AS r_precise
                  FROM tasks t
                           JOIN users v ON v.id = t.volunteer_id
                           JOIN furniture f ON f.id = t.furniture_id
                           JOIN users d ON d.id = f.donor_id
                           LEFT JOIN requests r ON r.id = t.request_id
                           LEFT JOIN users ru ON ru.id = r.user_id`;

// ---------- Public ----------
app.get('/api/health', h(async (req, res) => {
    await db.query('SELECT 1');
    res.json({ok: true, storage: 'MySQL', visionConfigured: photoScan.isConfigured(), visionModel: photoScan.isConfigured() ? photoScan.MODEL : null, routing: geo.OSRM_URL});
}));
app.get('/api/meta', (req, res) => res.json({categories, areas: Object.keys(areas), visionConfigured: photoScan.isConfigured()}));

// ---------- Auth ----------
async function startSession(res, user, status = 200) {
    const token = newToken();
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))', [tokenHash(token), user.id, SESSION_DAYS]);
    res.status(status).json({token, user: publicUser(user)});
}

function validateAccount(b) {
    const name = str(b.name, 80), email = str(b.email, 160).toLowerCase(), password = String(b.password || '');
    if (!name) return {error: 'Name is required'};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {error: 'A valid email is required'};
    if (password.length < 8) return {error: 'Password must be at least 8 characters'};
    return {name, email, password, area: str(b.area, 120) || null, address: str(b.address, 200) || null, phone: str(b.phone, 40) || null};
}

async function createUser(b, role) {
    const v = validateAccount(b);
    if (v.error) return v;
    if (await db.one('SELECT id FROM users WHERE email = ?', [v.email])) return {
        error: 'An account with this email already exists',
        status: 409
    };
    const c = await geo.locate(v.address, v.area);
    const {insertId} = await db.query('INSERT INTO users (name, email, password_hash, role, phone, area, address, lat, lng, geo_precise) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [v.name, v.email, await hashPassword(v.password), role, v.phone, v.area, v.address, c.lat, c.lng, c.precise ? 1 : 0]);
    return {user: await db.one('SELECT * FROM users WHERE id = ?', [insertId])};
}

app.post('/api/auth/register', h(async (req, res) => {
    const role = req.body?.role;
    if (!PUBLIC_ROLES.includes(role)) return fail(res, 400, 'You can sign up as a donor or a user. Volunteer and admin accounts are created by an admin.');
    const r = await createUser(req.body, role);
    if (r.error) return fail(res, r.status || 400, r.error);
    await log(r.user.id, `New ${role} account: ${r.user.name}`);
    await startSession(res, r.user, 201);
}));
app.post('/api/auth/login', h(async (req, res) => {
    const u = await db.one('SELECT * FROM users WHERE email = ?', [str(req.body?.email, 160).toLowerCase()]);
    if (!u || !(await verifyPassword(String(req.body?.password || ''), u.password_hash))) return fail(res, 401, 'Incorrect email or password');
    if (!u.active) return fail(res, 403, 'This account has been deactivated');
    await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
    await startSession(res, u);
}));
app.post('/api/auth/logout', requireRole(), h(async (req, res) => {
    await db.query('DELETE FROM sessions WHERE token_hash = ?', [req.tokenHash]);
    res.json({ok: true});
}));
app.get('/api/auth/me', requireRole(), (req, res) => res.json(publicUser(req.user)));
app.patch('/api/auth/me', requireRole(), h(async (req, res) => {
    const b = req.body || {}, name = str(b.name, 80) || req.user.name, area = str(b.area, 120) || null,
        address = str(b.address, 200) || null, c = await geo.locate(address, area);
    await db.query('UPDATE users SET name = ?, phone = ?, area = ?, address = ?, lat = ?, lng = ?, geo_precise = ? WHERE id = ?',
        [name, str(b.phone, 40) || null, area, address, c.lat, c.lng, c.precise ? 1 : 0, req.user.id]);
    res.json(publicUser(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])));
}));

// ---------- Dashboard ----------
app.get('/api/stats', requireRole(), h(async (req, res) => {
    const u = req.user, n = async (sql, p = []) => Number((await db.one(sql, p)).n) || 0;
    const result = {role: u.role};
    if (u.role === 'admin') Object.assign(result, {
        pendingDonations: await n("SELECT COUNT(*) n FROM furniture WHERE status = 'pending'"),
        availableItems: await n(`SELECT COUNT(*) n
                                 FROM furniture f
                                 WHERE ${AVAILABLE_SQL}`),
        pendingRequests: await n("SELECT COUNT(*) n FROM requests WHERE status = 'pending'"),
        openTasks: await n("SELECT COUNT(*) n FROM tasks WHERE status = 'assigned'"),
        awaitingPickup: await n("SELECT COUNT(*) n FROM furniture f WHERE status = 'approved' AND inventory_status = 'pledged' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.furniture_id = f.id AND t.type = 'pickup' AND t.status = 'assigned')"),
        awaitingDelivery: await n("SELECT COUNT(*) n FROM requests r WHERE status = 'approved' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.request_id = r.id AND t.status = 'assigned')")
    });
    if (u.role === 'donor') Object.assign(result, {
        myItems: await n('SELECT COUNT(*) n FROM furniture WHERE donor_id = ?', [u.id]),
        pending: await n("SELECT COUNT(*) n FROM furniture WHERE donor_id = ? AND status = 'pending'", [u.id]),
        approved: await n("SELECT COUNT(*) n FROM furniture WHERE donor_id = ? AND status = 'approved'", [u.id]),
        delivered: await n("SELECT COUNT(*) n FROM furniture WHERE donor_id = ? AND inventory_status = 'delivered'", [u.id])
    });
    if (u.role === 'user') Object.assign(result, {
        available: await n(`SELECT COUNT(*) n
                            FROM furniture f
                            WHERE ${AVAILABLE_SQL}`),
        pending: await n("SELECT COUNT(*) n FROM requests WHERE user_id = ? AND status = 'pending'", [u.id]),
        approved: await n("SELECT COUNT(*) n FROM requests WHERE user_id = ? AND status = 'approved'", [u.id]),
        fulfilled: await n("SELECT COUNT(*) n FROM requests WHERE user_id = ? AND status = 'fulfilled'", [u.id])
    });
    if (u.role === 'volunteer') Object.assign(result, {
        openTasks: await n("SELECT COUNT(*) n FROM tasks WHERE volunteer_id = ? AND status = 'assigned'", [u.id]),
        pickups: await n("SELECT COUNT(*) n FROM tasks WHERE volunteer_id = ? AND status = 'assigned' AND type = 'pickup'", [u.id]),
        deliveries: await n("SELECT COUNT(*) n FROM tasks WHERE volunteer_id = ? AND status = 'assigned' AND type = 'delivery'", [u.id]),
        completed: await n("SELECT COUNT(*) n FROM tasks WHERE volunteer_id = ? AND status = 'completed'", [u.id])
    });
    res.json(result);
}));
app.get('/api/activity', requireRole('admin', 'volunteer'), h(async (req, res) => {
    const rows = await db.query('SELECT a.id, a.text, a.created_at, u.name AS actor FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 20');
    res.json(rows.map(r => ({id: r.id, text: r.text, actor: r.actor, date: r.created_at})));
}));
app.get('/api/impact', requireRole(), h(async (req, res) => {
    const r = await db.one(`SELECT (SELECT COUNT(*) FROM furniture WHERE inventory_status = 'delivered') AS delivered,
                                   (SELECT COALESCE(SUM(weight_kg), 0)
                                    FROM furniture
                                    WHERE inventory_status = 'delivered')                                AS kgDelivered,
                                   (SELECT COALESCE(SUM(weight_kg), 0)
                                    FROM furniture
                                    WHERE status = 'approved'
                                      AND inventory_status IN ('pledged', 'in_stock'))                   AS kgInPipeline,
                                   (SELECT COUNT(DISTINCT user_id)
                                    FROM requests
                                    WHERE status = 'fulfilled')                                          AS householdsServed,
                                   (SELECT COUNT(*) FROM users WHERE role = 'donor' AND active = 1)      AS donors,
                                   (SELECT COUNT(*) FROM users WHERE role = 'volunteer' AND active = 1)  AS volunteers,
                                   (SELECT COUNT(*) FROM tasks WHERE status = 'completed')               AS tripsCompleted`);
    res.json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])));
}));

// ---------- Donor: furniture stored under the donor ----------
app.post('/api/furniture', requireRole('donor'), h(async (req, res) => {
    const d = req.body || {};
    if (!categories.includes(d.category) || !str(d.name, 100) || !str(d.location, 120)) return fail(res, 400, 'Name, supported category and pickup area are required');
    if (d.photo && !/^data:image\/(png|jpeg|webp);base64,/.test(d.photo)) return fail(res, 400, 'Photo must be a JPEG, PNG or WebP image');
    const location = str(d.location, 120), address = str(d.address, 200) || null, notes = str(d.notes, 400);
    const c = await geo.locate(address, location);
    // A video-intake item: the AI verdict is re-read from the vision service, never taken from the browser.
    let visionResult = null, photo = d.photo || null;
    if (d.vision) {
        const v = await vision.resultForItem(d.vision.intakeId, d.vision.itemIndex, req.user.id);
        visionResult = v.stored;
        photo = photo || v.photo;
    }
    const flags = screening({category: d.category, notes, photo}).flags;
    // Photo-only donations get the OCI photo scan; video donations already carry their analysis.
    const scanning = !visionResult && !!photo && photoScan.isConfigured();
    const {insertId} = await db.query(`INSERT INTO furniture (donor_id, name, category, dimensions, weight_kg, pickup_area, pickup_address,
                                                              lat, lng, geo_precise, notes, photo, screening_flags, vision_result)
                                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, str(d.name, 100), d.category, str(d.dimensions, 100) || 'Not supplied', Math.min(9999, Math.max(0, Number(d.weight) || 0)), location, address,
            c.lat, c.lng, c.precise ? 1 : 0, notes, photo, JSON.stringify(flags),
            visionResult ? JSON.stringify(visionResult) : scanning ? JSON.stringify({status: 'scanning'}) : null]);
    await log(req.user.id, `Donation submitted${visionResult ? ' via video' : ''}: ${str(d.name, 100)} by ${req.user.name}`);
    // The photo scan takes a few seconds, so it runs after the response; the item shows "scanning" until it finishes.
    if (scanning) scanFurniture(insertId).catch(e => console.error('Photo scan failed:', e));
    res.status(201).json(toFurniture(await db.one(FURNITURE_SQL + ' WHERE f.id = ?', [insertId])));
}));
app.get('/api/furniture/mine', requireRole('donor'), h(async (req, res) => {
    const rows = await db.query(FURNITURE_SQL + ' WHERE f.donor_id = ? ORDER BY f.id DESC', [req.user.id]);
    res.json(rows.map(r => toFurniture(r)));
}));
app.delete('/api/furniture/:id', requireRole('donor'), h(async (req, res) => {
    const f = await db.one('SELECT * FROM furniture WHERE id = ? AND donor_id = ?', [req.params.id, req.user.id]);
    if (!f) return fail(res, 404, 'Donation not found');
    if (f.status !== 'pending') return fail(res, 400, 'Only donations still awaiting review can be withdrawn');
    await db.query('DELETE FROM furniture WHERE id = ?', [f.id]);
    await log(req.user.id, `Donation withdrawn: ${f.name}`);
    res.json({ok: true});
}));

// ---------- User (recipient): browse and request ----------
app.get('/api/furniture/available', requireRole('user', 'admin'), h(async (req, res) => {
    const rows = await db.query(`SELECT f.*,
                                        (SELECT r.status
                                         FROM requests r
                                         WHERE r.furniture_id = f.id
                                           AND r.user_id = ?
                                           AND r.status = 'pending' LIMIT 1) AS my_request
                                 FROM furniture f
                                 WHERE ${AVAILABLE_SQL}
                                 ORDER BY f.id DESC`, [req.user.id]);
    // Donor identity is hidden from recipients.
    res.json(rows.map(r => ({...toFurniture(r, {withDonor: false}), myRequest: r.my_request})));
}));
app.post('/api/requests', requireRole('user'), h(async (req, res) => {
    const furnitureId = Number(req.body?.furnitureId);
    const f = await db.one(`SELECT f.*
                            FROM furniture f
                            WHERE f.id = ?
                              AND ${AVAILABLE_SQL}`, [furnitureId]);
    if (!f) return fail(res, 400, 'This item is no longer available');
    if (await db.one("SELECT id FROM requests WHERE user_id = ? AND furniture_id = ? AND status = 'pending'", [req.user.id, f.id])) return fail(res, 409, 'You already requested this item');
    const {insertId} = await db.query('INSERT INTO requests (user_id, furniture_id, message) VALUES (?,?,?)', [req.user.id, f.id, str(req.body?.message, 400)]);
    await log(req.user.id, `Request: ${req.user.name} asked for ${f.name}`);
    res.status(201).json(toRequest(await db.one(REQUEST_SQL + ' WHERE r.id = ?', [insertId])));
}));
app.get('/api/requests/mine', requireRole('user'), h(async (req, res) => {
    res.json((await db.query(REQUEST_SQL + ' WHERE r.user_id = ? ORDER BY r.id DESC', [req.user.id])).map(toRequest));
}));
app.post('/api/requests/:id/cancel', requireRole('user'), h(async (req, res) => {
    const r = await db.one('SELECT * FROM requests WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r) return fail(res, 404, 'Request not found');
    if (!['pending', 'approved'].includes(r.status)) return fail(res, 400, 'This request can no longer be cancelled');
    await db.transaction(async q => {
        await q("UPDATE requests SET status = 'cancelled' WHERE id = ?", [r.id]);
        await q("UPDATE tasks SET status = 'cancelled' WHERE request_id = ? AND status = 'assigned'", [r.id]);
    });
    await log(req.user.id, `Request #${r.id} cancelled by ${req.user.name}`);
    res.json({ok: true});
}));

// ---------- Admin: review donations ----------
app.get('/api/furniture', requireRole('admin'), h(async (req, res) => {
    const rows = await db.query(FURNITURE_SQL + ' ORDER BY f.id DESC');
    const tasks = await db.query("SELECT t.furniture_id, t.type, t.id, v.name FROM tasks t JOIN users v ON v.id = t.volunteer_id WHERE t.status = 'assigned'");
    const counts = await db.query("SELECT furniture_id, COUNT(*) AS n FROM requests WHERE status = 'pending' GROUP BY furniture_id");
    res.json(rows.map(r => ({
        ...toFurniture(r),
        pickupTask: (t => t ? {
            id: t.id,
            volunteerName: t.name
        } : null)(tasks.find(t => t.furniture_id === r.id && t.type === 'pickup')),
        pendingRequests: Number(counts.find(c => c.furniture_id === r.id)?.n || 0)
    })));
}));
app.get('/api/donors/:id/furniture', requireRole('admin'), h(async (req, res) => {
    const donor = await db.one("SELECT * FROM users WHERE id = ? AND role = 'donor'", [req.params.id]);
    if (!donor) return fail(res, 404, 'Donor not found');
    res.json({
        donor: publicUser(donor),
        furniture: (await db.query(FURNITURE_SQL + ' WHERE f.donor_id = ? ORDER BY f.id DESC', [donor.id])).map(r => toFurniture(r))
    });
}));
app.post('/api/furniture/:id/scan', requireRole('admin'), h(async (req, res) => {
    const f = await db.one('SELECT id, photo, vision_result FROM furniture WHERE id = ?', [req.params.id]);
    if (!f) return fail(res, 404, 'Donation not found');
    if (!f.photo) return fail(res, 400, 'This donation has no photo');
    if (parseJson(f.vision_result, {}).source === 'video') return fail(res, 400, 'This donation was analyzed from its video');
    if (!photoScan.isConfigured()) return fail(res, 503, 'Photo scanning is not configured (OCI credentials missing)');
    await scanFurniture(f.id);
    res.json(toFurniture(await db.one(FURNITURE_SQL + ' WHERE f.id = ?', [f.id])));
}));
app.post('/api/furniture/:id/review', requireRole('admin'), h(async (req, res) => {
    const {status} = req.body || {};
    if (!['approved', 'rejected'].includes(status)) return fail(res, 400, 'Status must be approved or rejected');
    const f = await db.one('SELECT * FROM furniture WHERE id = ?', [req.params.id]);
    if (!f) return fail(res, 404, 'Donation not found');
    if (f.status !== 'pending') return fail(res, 400, 'This donation was already reviewed');
    await db.query("UPDATE furniture SET status = ?, inventory_status = ?, item_condition = ?, review_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
        [status, status === 'approved' ? 'pledged' : 'rejected', str(req.body.condition, 40) || (status === 'approved' ? 'Good' : f.item_condition), str(req.body.reason, 300) || null, req.user.id, f.id]);
    await log(req.user.id, `${f.name} ${status} by ${req.user.name}`);
    res.json({ok: true});
}));

// ---------- Admin: requests ----------
app.get('/api/requests', requireRole('admin'), h(async (req, res) => {
    res.json((await db.query(REQUEST_SQL + " ORDER BY FIELD(r.status, 'pending', 'approved', 'fulfilled', 'rejected', 'cancelled'), r.id DESC")).map(toRequest));
}));
app.post('/api/requests/:id/decide', requireRole('admin'), h(async (req, res) => {
    const {status} = req.body || {}, note = str(req.body?.note, 300) || null;
    if (!['approved', 'rejected'].includes(status)) return fail(res, 400, 'Status must be approved or rejected');
    const r = await db.one('SELECT r.*, f.name AS furniture_name FROM requests r JOIN furniture f ON f.id = r.furniture_id WHERE r.id = ?', [req.params.id]);
    if (!r) return fail(res, 404, 'Request not found');
    if (r.status !== 'pending') return fail(res, 400, 'This request was already decided');
    const error = await db.transaction(async q => {
        if (status === 'approved') {
            const [f] = await q(`SELECT f.id
                                 FROM furniture f
                                 WHERE f.id = ?
                                   AND ${AVAILABLE_SQL} FOR UPDATE`, [r.furniture_id]);
            if (!f) return 'Item is no longer available';
            await q("UPDATE requests SET status = 'rejected', decision_note = 'Item went to another household', decided_by = ?, decided_at = NOW() WHERE furniture_id = ? AND status = 'pending' AND id <> ?", [req.user.id, r.furniture_id, r.id]);
        }
        await q('UPDATE requests SET status = ?, decision_note = ?, decided_by = ?, decided_at = NOW() WHERE id = ?', [status, note, req.user.id, r.id]);
        return null;
    });
    if (error) return fail(res, 400, error);
    await log(req.user.id, `Request for ${r.furniture_name} ${status} by ${req.user.name}`);
    res.json({ok: true});
}));

// ---------- Admin: assign volunteers / Volunteer: do the work ----------
app.get('/api/tasks', requireRole('admin'), h(async (req, res) => {
    res.json((await db.query(TASK_SQL + " ORDER BY t.status = 'assigned' DESC, t.id DESC")).map(toTask));
}));
app.get('/api/tasks/mine', requireRole('volunteer'), h(async (req, res) => {
    res.json((await db.query(TASK_SQL + " WHERE t.volunteer_id = ? ORDER BY t.status = 'assigned' DESC, t.scheduled_for, t.id DESC", [req.user.id])).map(toTask));
}));
app.post('/api/tasks', requireRole('admin'), h(async (req, res) => {
    const b = req.body || {}, type = b.type;
    const volunteer = await db.one("SELECT * FROM users WHERE id = ? AND role = 'volunteer' AND active = 1", [Number(b.volunteerId)]);
    if (!volunteer) return fail(res, 400, 'Choose an active volunteer');
    const scheduled = /^\d{4}-\d{2}-\d{2}$/.test(b.scheduledFor || '') ? b.scheduledFor : null;
    let furnitureId, requestId = null, label;
    if (type === 'pickup') {
        const f = await db.one("SELECT * FROM furniture WHERE id = ? AND status = 'approved' AND inventory_status = 'pledged'", [Number(b.furnitureId)]);
        if (!f) return fail(res, 400, 'Only approved items still at the donor can be picked up');
        if (await db.one("SELECT id FROM tasks WHERE furniture_id = ? AND type = 'pickup' AND status = 'assigned'", [f.id])) return fail(res, 409, 'A volunteer is already assigned to this pickup');
        furnitureId = f.id;
        label = f.name;
    } else if (type === 'delivery') {
        const r = await db.one("SELECT r.*, f.inventory_status, f.name FROM requests r JOIN furniture f ON f.id = r.furniture_id WHERE r.id = ? AND r.status = 'approved'", [Number(b.requestId)]);
        if (!r) return fail(res, 400, 'Only approved requests can be delivered');
        if (r.inventory_status !== 'in_stock') return fail(res, 400, 'The item must be picked up (in stock) before it can be delivered');
        if (await db.one("SELECT id FROM tasks WHERE request_id = ? AND status = 'assigned'", [r.id])) return fail(res, 409, 'A volunteer is already assigned to this delivery');
        furnitureId = r.furniture_id;
        requestId = r.id;
        label = r.name;
    } else return fail(res, 400, 'Task type must be pickup or delivery');
    await db.query('INSERT INTO tasks (furniture_id, request_id, volunteer_id, type, scheduled_for, notes, assigned_by) VALUES (?,?,?,?,?,?,?)',
        [furnitureId, requestId, volunteer.id, type, scheduled, str(b.notes, 300), req.user.id]);
    await log(req.user.id, `${volunteer.name} assigned to ${type} of ${label}`);
    res.status(201).json({ok: true});
}));
app.post('/api/tasks/:id/cancel', requireRole('admin'), h(async (req, res) => {
    const {affectedRows} = await db.query("UPDATE tasks SET status = 'cancelled' WHERE id = ? AND status = 'assigned'", [req.params.id]);
    if (!affectedRows) return fail(res, 404, 'Open task not found');
    await log(req.user.id, `Task #${req.params.id} unassigned by ${req.user.name}`);
    res.json({ok: true});
}));
app.post('/api/tasks/:id/complete', requireRole('volunteer', 'admin'), h(async (req, res) => {
    const t = await db.one("SELECT t.*, f.name, f.inventory_status FROM tasks t JOIN furniture f ON f.id = t.furniture_id WHERE t.id = ? AND t.status = 'assigned'", [req.params.id]);
    if (!t) return fail(res, 404, 'Open task not found');
    if (req.user.role === 'volunteer' && t.volunteer_id !== req.user.id) return fail(res, 403, 'This task is assigned to another volunteer');
    if (t.type === 'delivery' && t.inventory_status !== 'in_stock') return fail(res, 400, 'Item is not in stock yet');
    await db.transaction(async q => {
        await q("UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?", [t.id]);
        if (t.type === 'pickup') await q("UPDATE furniture SET inventory_status = 'in_stock' WHERE id = ?", [t.furniture_id]);
        else {
            await q("UPDATE furniture SET inventory_status = 'delivered' WHERE id = ?", [t.furniture_id]);
            await q("UPDATE requests SET status = 'fulfilled' WHERE id = ?", [t.request_id]);
        }
    });
    await log(req.user.id, `${t.name} ${t.type === 'pickup' ? 'picked up' : 'delivered'} by ${req.user.name}`);
    res.json({ok: true});
}));

// ---------- Routes (road routing via OSRM, straight-line fallback) ----------
function km(a, b) {
    const r = Math.PI / 180, dx = (b.lat - a.lat) * r, dy = (b.lng - a.lng) * r;
    const q = Math.sin(dx / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dy / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
}

const round = (x) => Math.round(x * 10) / 10;

// Used only when the routing service is unreachable: nearest neighbor on straight lines, 35 km/h average.
function straightLinePlan(depot, stops) {
    const order = [], remaining = stops.map((_, i) => i), legs = [];
    let at = depot;
    while (remaining.length) {
        let best = 0;
        remaining.forEach((i, j) => {
            if (km(at, stops[i]) < km(at, stops[remaining[best]])) best = j
        });
        const i = remaining.splice(best, 1)[0];
        legs.push(km(at, stops[i]));
        order.push(i);
        at = stops[i];
    }
    legs.push(km(at, depot));
    const total = legs.reduce((a, b) => a + b, 0);
    return {
        order,
        legs: legs.map(k => ({km: k, min: k / 35 * 60})),
        km: total,
        min: total / 35 * 60,
        geometry: [depot, ...order.map(i => stops[i]), depot].map(p => [p.lat, p.lng]),
        baselineKm: stops.reduce((s, p) => s + 2 * km(depot, p), 0)
    };
}

app.get('/api/routes', requireRole('admin', 'volunteer'), h(async (req, res) => {
    const mine = req.user.role === 'volunteer';
    const tasks = (await db.query(TASK_SQL + " WHERE t.status = 'assigned'" + (mine ? ' AND t.volunteer_id = ?' : '') + ' ORDER BY t.id', mine ? [req.user.id] : [])).map(toTask);
    const byVolunteer = new Map();
    tasks.forEach(t => byVolunteer.set(t.volunteerId, [...(byVolunteer.get(t.volunteerId) || []), t]));
    let optimized = 0, baseline = 0, roads = true;
    const trucks = [];
    // Sequential on purpose: the public OSRM server asks for light use.
    for (const list of byVolunteer.values()) {
        let plan;
        try {
            plan = await geo.planTrip(depot, list);
        } catch (e) {
            console.warn('Road routing unavailable, using straight lines:', e.message);
            plan = straightLinePlan(depot, list);
            roads = false;
        }
        const ordered = plan.order.map(i => list[i]);
        optimized += plan.km;
        baseline += plan.baselineKm;
        trucks.push({
            name: list[0].volunteerName,
            stops: ordered.map((p, i) => ({
                id: p.id,
                label: (p.type === 'pickup' ? 'Pickup: ' : 'Delivery: ') + p.furnitureName,
                kind: p.type,
                area: p.area,
                address: p.address,
                precise: p.geoPrecise,
                contact: p.contactName,
                lat: p.lat,
                lng: p.lng,
                legKm: round(plan.legs[i].km),
                legMin: Math.round(plan.legs[i].min)
            })),
            returnKm: round(plan.legs[plan.legs.length - 1].km),
            distanceKm: round(plan.km),
            durationMin: Math.round(plan.min),
            geometry: plan.geometry,
            navigationUrl: geo.googleMapsUrl(depot, ordered)
        });
    }
    res.json({
        depot,
        trucks,
        optimizedKm: round(optimized),
        baselineKm: round(baseline),
        savingsPct: baseline ? Math.round((1 - optimized / baseline) * 100) : 0,
        totalMin: trucks.reduce((s, t) => s + t.durationMin, 0),
        provider: roads ? 'osrm' : 'straight-line',
        method: roads
            ? 'Road routes from OpenStreetMap data (OSRM): each volunteer\'s stops are put in the shortest driving order, starting and ending at the depot. Drive times exclude loading and traffic.'
            : 'The road routing service is unreachable, so these are straight-line estimates (nearest neighbor). Try again shortly.'
    });
}));

// ---------- Admin: user management ----------
app.get('/api/users', requireRole('admin'), h(async (req, res) => {
    const rows = await db.query(`SELECT u.*,
                                        (SELECT COUNT(*) FROM furniture f WHERE f.donor_id = u.id) AS donations,
                                        (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id)   AS requests,
                                        (SELECT COUNT(*)
                                         FROM tasks t
                                         WHERE t.volunteer_id = u.id
                                           AND t.status = 'assigned')                              AS open_tasks
                                 FROM users u
                                 ORDER BY FIELD(u.role, 'admin', 'volunteer', 'donor', 'user'), u.name`);
    res.json(rows.map(u => ({
        ...publicUser(u),
        donations: Number(u.donations),
        requests: Number(u.requests),
        openTasks: Number(u.open_tasks)
    })));
}));
app.post('/api/users', requireRole('admin'), h(async (req, res) => {
    const role = req.body?.role;
    if (!ROLES.includes(role)) return fail(res, 400, 'Invalid role');
    const r = await createUser(req.body, role);
    if (r.error) return fail(res, r.status || 400, r.error);
    await log(req.user.id, `${req.user.name} created ${role} account for ${r.user.name}`);
    res.status(201).json(publicUser(r.user));
}));
app.patch('/api/users/:id', requireRole('admin'), h(async (req, res) => {
    const target = await db.one('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) return fail(res, 404, 'User not found');
    const b = req.body || {}, role = b.role ?? target.role,
        active = b.active === undefined ? !!target.active : !!b.active;
    if (!ROLES.includes(role)) return fail(res, 400, 'Invalid role');
    if (target.id === req.user.id && (role !== 'admin' || !active)) return fail(res, 400, 'You cannot remove your own admin access');
    if (target.role === 'volunteer' && (role !== 'volunteer' || !active) && await db.one("SELECT id FROM tasks WHERE volunteer_id = ? AND status = 'assigned' LIMIT 1", [target.id]))
        return fail(res, 400, 'Reassign or cancel this volunteer\'s open tasks first');
    await db.query('UPDATE users SET role = ?, active = ? WHERE id = ?', [role, active ? 1 : 0, target.id]);
    if (!active || role !== target.role) await db.query('DELETE FROM sessions WHERE user_id = ?', [target.id]);
    await log(req.user.id, `${target.name}: role ${role}, ${active ? 'active' : 'deactivated'}`);
    res.json({ok: true});
}));
app.post('/api/admin/reset', requireRole('admin'), h(async (req, res) => {
    await db.init({reset: true});
    res.json({ok: true});
}));

// ---------- Screening ----------
app.post('/api/screen', requireRole('donor', 'admin'), (req, res) => res.json(screening(req.body || {})));
// ---------- Photo scan (OCI AI Vision + OCI Generative AI, see server/photo-scan.cjs) ----------
async function scanFurniture(id) {
    const f = await db.one('SELECT * FROM furniture WHERE id = ?', [id]);
    if (!f?.photo || !photoScan.isConfigured() || parseJson(f.vision_result, {}).source === 'video') return null;
    await db.query('UPDATE furniture SET vision_result = ? WHERE id = ?', [JSON.stringify({status: 'scanning'}), id]);
    let result;
    try {
        result = await photoScan.analyzePhoto({photo: f.photo, category: f.category, name: f.name, notes: f.notes});
    } catch (e) {
        console.error('Photo scan error:', e.message);
        result = {status: 'error', error: String(e.message).slice(0, 200), scannedAt: new Date().toISOString()};
    }
    const flags = parseJson(f.screening_flags, []).filter(x => !x.startsWith('Photo scan')).concat(photoScan.flagsFor(result));
    await db.query('UPDATE furniture SET vision_result = ?, screening_flags = ? WHERE id = ?', [JSON.stringify(result), JSON.stringify(flags), id]);
    return result;
}

// Preview scan from the donation form (nothing is stored). Limited per user because each scan calls OCI.
const scanTimes = new Map();
app.post('/api/vision/photo', requireRole('donor', 'admin'), h(async (req, res) => {
    if (!photoScan.isConfigured()) return fail(res, 503, 'Photo scanning is not configured (OCI credentials missing)');
    const recent = (scanTimes.get(req.user.id) || []).filter(t => Date.now() - t < 60000);
    if (recent.length >= 6) return fail(res, 429, 'Too many photo scans. Please wait a minute.');
    scanTimes.set(req.user.id, [...recent, Date.now()]);
    const b = req.body || {};
    try {
        res.json(await photoScan.analyzePhoto({photo: b.photo, category: str(b.category, 40), name: str(b.name, 100), notes: str(b.notes, 400)}));
    } catch (e) {
        if (e.status === 400) return fail(res, 400, e.message);
        console.error('Photo scan error:', e.message);
        fail(res, 502, 'The photo scan service did not respond. You can still submit; an admin will review the photo.');
    }
}));

// Video intake (see server/vision.cjs and ../vision-service).
app.get('/api/vision/status', requireRole(), h(async (req, res) => res.json(await vision.status())));
app.post('/api/vision/video', requireRole('donor'), h(async (req, res) => res.json(await vision.analyzeVideo(req, req.user.id))));
// Unauthenticated so <img>/<video> tags work; paths contain an unguessable 128-bit id.
app.get('/api/vision/media/*', (req, res) => vision.pipeMedia(req.params[0], req, res));

app.use('/api', (req, res) => fail(res, 404, 'Not found'));

// Production: serve the built frontend (npm run build) from the same process.
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') return fail(res, 413, 'Upload is too large');
    if (err instanceof vision.VisionError) return fail(res, err.status, err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') return fail(res, 503, 'Database unavailable: check the MYSQL_* settings in .env');
    fail(res, 500, 'Server error');
});

const port = Number(process.env.PORT) || 3001;
db.init()
    // A scan interrupted by a restart would stay "scanning" forever; clear it so an admin can re-scan.
    .then(() => db.query(`UPDATE furniture SET vision_result = NULL WHERE vision_result LIKE '{"status":"scanning"%'`))
    .then(() => app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Move-In Ready API listening on http://localhost:${port} (MySQL ${db.config.host}:${db.config.port}/${db.config.database})`)))
    .catch(e => {
        console.error('Could not initialise MySQL:', e.message);
        console.error('Create the database first (npm run db:init) and check MYSQL_* in .env');
        process.exit(1);
    });
