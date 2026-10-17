// Usage: npm run db:init            -> create database (if permitted), tables and demo data
//        npm run db:init -- --reset -> drop all app tables first, then recreate and reseed
const db = require('./db.cjs');

const reset = process.argv.includes('--reset');
db.init({reset, createDatabase: true})
    .then(() => {
        console.log(`Database ${db.config.database} ready on ${db.config.host}:${db.config.port}${reset ? ' (reset and reseeded)' : ''}`);
        return db.pool.end();
    })
    .catch(e => {
        console.error('Database init failed:', e.message);
        process.exit(1);
    });
