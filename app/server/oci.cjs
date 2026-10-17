// Oracle Cloud (OCI) REST client: reads an API-key profile from ~/.oci/config and signs requests
// with OCI's HTTP Signature scheme, so no SDK dependency is needed.
// Overrides: OCI_CONFIG_FILE, OCI_PROFILE, OCI_KEY_FILE, OCI_REGION, OCI_COMPARTMENT_ID.
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const {requestJson} = require('./http.cjs');

const expandHome = (p) => p && p.replace(/^~(?=$|\/)/, os.homedir());

function readProfile() {
    const file = expandHome(process.env.OCI_CONFIG_FILE || '~/.oci/config'), want = process.env.OCI_PROFILE || 'DEFAULT';
    if (!fs.existsSync(file)) return null;
    const profiles = {};
    let current = null;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.replace(/\s+#.*$/, '').trim();
        if (!line || line.startsWith('#')) continue;
        const section = line.match(/^\[(.+)]$/);
        if (section) profiles[current = section[1]] = {};
        else if (current && line.includes('=')) {
            const i = line.indexOf('=');
            profiles[current][line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
    }
    return profiles[want] || null;
}

let cached;

function config() {
    if (cached !== undefined) return cached;
    const p = readProfile() || {};
    const keyFile = expandHome(process.env.OCI_KEY_FILE || p.key_file);
    const c = {
        tenancy: p.tenancy, user: p.user, fingerprint: p.fingerprint,
        region: process.env.OCI_REGION || p.region,
        compartment: process.env.OCI_COMPARTMENT_ID || p.tenancy
    };
    if (!c.tenancy || !c.user || !c.fingerprint || !c.region || !keyFile || !fs.existsSync(keyFile)) return cached = null;
    c.key = crypto.createPrivateKey({key: fs.readFileSync(keyFile), passphrase: p.pass_phrase});
    return cached = c;
}

const isConfigured = () => !!config();

// POST/GET a JSON body to an OCI service endpoint, e.g. call('vision.aiservice', '/20220125/actions/analyzeImage', body).
async function call(service, pathAndQuery, body, {timeout = 60000} = {}) {
    const c = config();
    if (!c) throw new Error('OCI is not configured');
    const host = `${service}.${c.region}.oci.oraclecloud.com`, method = body === undefined ? 'GET' : 'POST';
    const headers = {date: new Date().toUTCString(), host};
    const signed = ['(request-target)', 'date', 'host'];
    let payload;
    if (method === 'POST') {
        payload = JSON.stringify(body);
        Object.assign(headers, {
            'x-content-sha256': crypto.createHash('sha256').update(payload).digest('base64'),
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(payload))
        });
        signed.push('x-content-sha256', 'content-type', 'content-length');
    }
    const signingString = signed.map(hd => hd === '(request-target)' ? `(request-target): ${method.toLowerCase()} ${pathAndQuery}` : `${hd}: ${headers[hd]}`).join('\n');
    const signature = crypto.sign('sha256', Buffer.from(signingString), c.key).toString('base64');
    headers.authorization = `Signature version="1",keyId="${c.tenancy}/${c.user}/${c.fingerprint}",algorithm="rsa-sha256",headers="${signed.join(' ')}",signature="${signature}"`;
    return requestJson(`https://${host}${pathAndQuery}`, {method, headers, body: payload, timeout});
}

module.exports = {isConfigured, config, call, configFile: () => path.resolve(expandHome(process.env.OCI_CONFIG_FILE || '~/.oci/config'))};
