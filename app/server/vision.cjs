// Video intake: forwards a donor's walk-around video to the Python vision service
// (../vision-service), which picks sharp keyframes, asks a multimodal model what it sees and
// hears, and applies the acceptance rules. The model only describes; an admin always decides.
//
// Node 16 has no global fetch/FormData, so this uses the http module and streams the
// browser's multipart upload straight through without parsing it.

const http = require('http'), https = require('https');
const {categories} = require('./meta.cjs');

const BASE = (process.env.VISION_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const MAX_UPLOAD = (Number(process.env.VISION_MAX_UPLOAD_MB) || 200) * 1024 * 1024;
const ANALYZE_TIMEOUT_MS = (Number(process.env.VISION_TIMEOUT_S) || 900) * 1000; // local models can be slow
const START_HINT = 'Video analysis service is not running. Start it with: cd vision-service && uvicorn app.main:app --port 8000';

class VisionError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Which donor ran which analysis, so a donor can only attach their own results.
// In memory: after an API restart the donor simply analyzes the video again.
const owners = new Map();
const remember = (id, userId) => {
    owners.set(id, userId);
    if (owners.size > 2000) owners.delete(owners.keys().next().value);
};

function call(method, path, {headers = {}, body, timeout = 10000} = {}) {
    const url = new URL(BASE + path);
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.request(url, {method, headers, timeout}, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({status: res.statusCode, buffer: Buffer.concat(chunks)}));
        });
        req.on('timeout', () => req.destroy(new VisionError(504, 'Video analysis timed out')));
        req.on('error', e => reject(e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' ? new VisionError(503, START_HINT) : e));
        if (body && typeof body.pipe === 'function') body.pipe(req);
        else req.end(body);
    });
}

const parse = (r) => {
    let data = {};
    try {
        data = JSON.parse(r.buffer.toString('utf8'));
    } catch {
        // non-JSON error page
    }
    if (r.status >= 400) throw new VisionError(r.status === 404 ? 404 : r.status >= 500 ? 502 : r.status, data.detail || 'Video analysis failed');
    return data;
};

// The service serves media under /media/...; the browser reaches it through this API.
const withProxiedMedia = (data) => JSON.parse(JSON.stringify(data).replace(/"\/media\//g, '"/api/vision/media/'));

// The model's fine-grained categories mapped onto the app's list.
const CATEGORY_MAP = {
    sofa: 'Sofa', loveseat: 'Sofa', sectional: 'Sofa', sleeper_sofa: 'Sofa bed',
    armchair: 'Chair', chair: 'Chair', dining_chair: 'Chair', ottoman: 'Chair',
    dining_table: 'Dining table', nightstand: 'Nightstand', dresser: 'Dresser', wardrobe: 'Dresser',
    desk: 'Desk', bookshelf: 'Bookshelf', bed_frame: 'Bed frame', headboard: 'Bed frame',
    mattress: 'Mattress', large_appliance: 'Appliance'
};
const LB_TO_KG = 0.4536;

// Pre-filled donation form fields for one analyzed item. The donor can still edit them.
function suggestion(entry, result) {
    const it = entry.item, d = it.dimensions || {};
    const dims = [d.width_in, d.depth_in, d.height_in];
    const defects = (it.defects || []).map(x => `${x.severity} ${x.type.replace(/_/g, ' ')}${x.location ? ' (' + x.location + ')' : ''}`);
    const notes = [
        `AI video intake: ${it.condition_grade.replace('_', ' ')} condition (${it.condition_score}/5).`,
        defects.length ? `Defects: ${defects.join('; ')}.` : 'No defects found.',
        it.age_years != null ? `About ${it.age_years} years old.` : '',
        result.summary || ''
    ].filter(Boolean).join(' ');
    const category = CATEGORY_MAP[it.category] || 'Other';
    return {
        name: (it.quantity > 1 ? `${it.quantity} × ` : '') + it.title,
        category: categories.includes(category) ? category : 'Other',
        dimensions: dims.some(v => v != null) ? `${dims.map(v => v ?? '?').join(' x ')} inches${d.source === 'estimated' ? ' (estimated)' : ''}` : '',
        weight: Math.round(entry.decision.est_weight_lbs * LB_TO_KG),
        notes: notes.slice(0, 400),
        photo: entry.photo
    };
}

async function status() {
    try {
        return {available: true, ...parse(await call('GET', '/health', {timeout: 3000}))};
    } catch (e) {
        return {available: false, error: e.message};
    }
}

// Streams the multipart upload (field `video`, optional `transcript`) to the service.
async function analyzeVideo(req, userId) {
    const length = Number(req.headers['content-length'] || 0);
    if (length > MAX_UPLOAD) throw new VisionError(413, `Video is larger than ${MAX_UPLOAD / 1024 / 1024} MB`);
    if (!/^multipart\/form-data/.test(req.headers['content-type'] || '')) throw new VisionError(400, 'Upload the video as multipart/form-data');
    const headers = {'content-type': req.headers['content-type']};
    if (length) headers['content-length'] = length;
    const result = withProxiedMedia(parse(await call('POST', '/analyze', {headers, body: req, timeout: ANALYZE_TIMEOUT_MS})));
    remember(result.id, userId);
    result.items = result.items.map(entry => ({...entry, suggested: suggestion(entry, result)}));
    return result;
}

// What gets stored in furniture.vision_result (a TEXT column, so it stays small: no images).
async function resultForItem(intakeId, itemIndex, userId) {
    if (!/^[0-9a-f]{32}$/.test(String(intakeId)) || owners.get(intakeId) !== userId)
        throw new VisionError(400, 'This video analysis has expired. Please analyze the video again.');
    const result = withProxiedMedia(parse(await call('GET', '/intake/' + intakeId)));
    const entry = result.items[Number(itemIndex)];
    if (!entry) throw new VisionError(400, 'Unknown item in this video analysis');
    const it = entry.item;
    const stored = {
        source: 'video',
        intakeId,
        itemIndex: entry.index,
        provider: result.provider,
        analyzedAt: result.createdAt,
        outcome: entry.decision.outcome,
        hits: entry.decision.hits,
        title: it.title,
        category: it.category,
        conditionGrade: it.condition_grade,
        conditionScore: it.condition_score,
        isSleeper: it.is_sleeper,
        defects: it.defects,
        viewsCovered: it.views_covered,
        confidence: it.confidence,
        evidence: it.evidence,
        videoUrl: result.videoUrl,
        photoUrl: entry.photoUrl,
        defectFrames: entry.defectFrames,
        summary: result.summary,
        inconsistencies: result.inconsistencies,
        donorContext: result.donorContext,
        transcript: (result.transcript || '').slice(0, 2000)
    };
    if (JSON.stringify(stored).length > 60000) stored.transcript = stored.transcript.slice(0, 200); // TEXT holds 64 KB
    return {stored, photo: entry.photo};
}

// Streams frames and playback video for <img>/<video> tags. Paths are random 128-bit ids.
function pipeMedia(relPath, req, res) {
    if (!/^[0-9a-f]{32}\/[\w\-/]+\.(jpg|mp4)$/.test(relPath) || relPath.includes('..')) return res.status(404).end();
    const url = new URL(BASE + '/media/' + relPath);
    const lib = url.protocol === 'https:' ? https : http;
    // Forward Range so Safari can play the video.
    const up = lib.get(url, {headers: req.headers.range ? {range: req.headers.range} : {}}, r => {
        res.status(r.statusCode);
        ['content-type', 'content-length', 'accept-ranges', 'content-range'].forEach(h => r.headers[h] && res.setHeader(h, r.headers[h]));
        r.pipe(res);
    });
    up.on('error', () => res.status(503).end());
}

const isConfigured = () => !!BASE;

module.exports = {isConfigured, status, analyzeVideo, resultForItem, pipeMedia, VisionError};
