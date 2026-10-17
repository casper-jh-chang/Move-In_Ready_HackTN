require('dotenv').config();
const mysql = require('mysql2/promise'), fs = require('fs'), path = require('path');
const {hashPassword} = require('./auth.cjs');
const {coordsFor} = require('./meta.cjs');
const seed = require('./seed.cjs');

const config = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'furnishflow'
};

const pool = mysql.createPool({...config, connectionLimit: 10, decimalNumbers: true, dateStrings: true});
const query = async (sql, params = []) => (await pool.query(sql, params))[0];
const one = async (sql, params = []) => (await query(sql, params))[0] || null;

async function transaction(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const q = async (sql, params = []) => (await conn.query(sql, params))[0];
        const result = await fn(q);
        await conn.commit();
        return result;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

const TABLES = ['activity_log', 'tasks', 'requests', 'furniture', 'sessions', 'users'];

// Creates the database (if allowed), applies schema.sql, and seeds demo data when the users table is empty.
async function init({reset = false, createDatabase = false} = {}) {
    if (createDatabase) {
        const {database, ...server} = config;
        const conn = await mysql.createConnection(server);
        await conn.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4', [database]);
        await conn.end();
    }
    const conn = await mysql.createConnection({...config, multipleStatements: true});
    try {
        if (reset) {
            await conn.query('DROP VIEW IF EXISTS donor_furniture');
            for (const t of TABLES) await conn.query('DROP TABLE IF EXISTS ??', [t]);
        }
        await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    } finally {
        await conn.end();
    }
    const {n} = await one('SELECT COUNT(*) AS n FROM users');
    if (!n) await seedDemo();
}

async function seedDemo() {
    await transaction(async q => {
        const ids = {}, items = {}, reqs = {};
        const password = await hashPassword(seed.DEMO_PASSWORD);
        for (const u of seed.users) {
            const c = coordsFor(u.area);
            ids[u.key] = (await q('INSERT INTO users (name, email, password_hash, role, area, lat, lng) VALUES (?,?,?,?,?,?,?)', [u.name, u.email, password, u.role, u.area, c.lat, c.lng])).insertId;
        }
        for (const f of seed.furniture) {
            const c = coordsFor(f.area), reviewed = f.status !== 'pending';
            items[f.key] = (await q(`INSERT INTO furniture (donor_id, name, category, item_condition, dimensions, weight_kg, pickup_area, lat, lng, notes, status, inventory_status, screening_flags, review_reason, reviewed_by, reviewed_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${reviewed ? 'NOW()' : 'NULL'})`,
                [ids[f.donor], f.name, f.category, f.condition, f.dimensions, f.weight, f.area, c.lat, c.lng, f.notes, f.status, f.inventory, '[]', f.reason || null, reviewed ? ids.admin : null])).insertId;
        }
        for (const r of seed.requests) {
            const decided = r.status !== 'pending';
            reqs[r.item] = (await q(`INSERT INTO requests (user_id, furniture_id, message, status, decided_by, decided_at) VALUES (?,?,?,?,?,${decided ? 'NOW()' : 'NULL'})`,
                [ids[r.user], items[r.item], r.message, r.status, decided ? ids.admin : null])).insertId;
        }
        for (const t of seed.tasks) {
            await q('INSERT INTO tasks (furniture_id, request_id, volunteer_id, type, assigned_by, scheduled_for) VALUES (?,?,?,?,?,CURDATE())',
                [items[t.item], t.request ? reqs[t.request] : null, ids[t.volunteer], t.type, ids.admin]);
        }
        await q('INSERT INTO activity_log (actor_id, text) VALUES (?, ?)', [ids.admin, 'Demo workspace seeded']);
    });
}

module.exports = {pool, query, one, transaction, init, config};
