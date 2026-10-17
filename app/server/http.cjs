// Minimal HTTPS JSON client (Node 16 has no global fetch).
const https = require('https');

function requestJson(url, {method = 'GET', headers = {}, body, timeout = 30000} = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {method, headers, timeout}, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let data = text;
                try {
                    data = text ? JSON.parse(text) : null
                } catch {
                }
                if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
                const message = (data && (data.message || data.error?.message || data.error)) || text.slice(0, 200);
                reject(Object.assign(new Error(`${res.statusCode} ${message}`), {status: res.statusCode, data}));
            });
        });
        req.on('timeout', () => req.destroy(new Error('Request timed out: ' + new URL(url).host)));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

module.exports = {requestJson};
