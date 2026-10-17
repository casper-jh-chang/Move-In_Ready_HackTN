// Geocoding (OpenStreetMap Nominatim) and road routing (OSRM). Both are free and need no API key.
// Self-host or point to another instance with GEOCODER_URL / OSRM_URL for heavier use: the public
// servers allow light use only (about 1 request per second).
const {requestJson} = require('./http.cjs');
const {coordsFor} = require('./meta.cjs');

const GEOCODER_URL = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const USER_AGENT = process.env.GEO_USER_AGENT || 'MoveInReady/1.1 (HackathonTN prototype)';
// Results are limited to the Nashville region.
const VIEWBOX = '-87.25,36.45,-86.40,35.85';

// Nominatim's policy is at most one request per second, so requests are queued.
let queue = Promise.resolve();
const throttled = (fn) => (queue = queue.then(fn, fn).finally(() => new Promise(r => setTimeout(r, 1100))));
const geoCache = new Map();

// Returns {lat, lng, precise}. Falls back to the area center when the address is empty or not found.
async function locate(address, area) {
    const fallback = {...coordsFor(area), precise: false};
    const q = String(address || '').trim();
    if (!q) return fallback;
    const key = q.toLowerCase();
    if (!geoCache.has(key)) {
        try {
            const url = `${GEOCODER_URL}/search?format=jsonv2&limit=1&countrycodes=us&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q + ', Nashville, TN')}`;
            const [hit] = await throttled(() => requestJson(url, {headers: {'user-agent': USER_AGENT}, timeout: 8000}));
            geoCache.set(key, hit ? {lat: Number(Number(hit.lat).toFixed(6)), lng: Number(Number(hit.lon).toFixed(6)), precise: true} : null);
        } catch (e) {
            console.warn('Geocoding failed:', e.message);
            return fallback;
        }
    }
    return geoCache.get(key) || fallback;
}

// ---------- Routing ----------
const routeCache = new Map();
const ROUTE_TTL = 10 * 60 * 1000;
const coordList = (points) => points.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');

async function osrm(service, points, query) {
    const key = service + coordList(points) + query, hit = routeCache.get(key);
    if (hit && Date.now() - hit.at < ROUTE_TTL) return hit.data;
    const data = await requestJson(`${OSRM_URL}/${service}/v1/driving/${coordList(points)}?${query}`, {
        headers: {'user-agent': USER_AGENT},
        timeout: 15000
    });
    if (data.code !== 'Ok') throw new Error('OSRM: ' + (data.message || data.code));
    routeCache.set(key, {at: Date.now(), data});
    return data;
}

// Solves the round trip depot -> stops (best order) -> depot on the road network.
// Returns {order, legs: [{km, min}], km, min, geometry: [[lat, lng]], baselineKm}, where order lists stop indexes in visiting order.
async function planTrip(depot, stops) {
    const points = [depot, ...stops];
    const [trip, table] = await Promise.all([
        osrm('trip', points, 'source=first&roundtrip=true&geometries=geojson&overview=full'),
        osrm('table', points, 'annotations=distance')
    ]);
    const t = trip.trips[0];
    // waypoints[i].waypoint_index = position of input point i in the trip (depot is 0).
    const order = stops.map((_, i) => i).sort((a, b) => trip.waypoints[a + 1].waypoint_index - trip.waypoints[b + 1].waypoint_index);
    const d = table.distances;
    return {
        order,
        legs: t.legs.map(l => ({km: l.distance / 1000, min: l.duration / 60})),
        km: t.distance / 1000,
        min: t.duration / 60,
        geometry: t.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        // Baseline: a separate depot round trip for every stop.
        baselineKm: stops.reduce((s, _, i) => s + ((d[0][i + 1] || 0) + (d[i + 1][0] || 0)) / 1000, 0)
    };
}

// Turn-by-turn navigation link (Google Maps URLs work without an API key; up to 9 waypoints).
function googleMapsUrl(depot, stops) {
    const at = (p) => p.address ? p.address + ', Nashville, TN' : `${p.lat},${p.lng}`;
    const params = new URLSearchParams({api: '1', origin: `${depot.lat},${depot.lng}`, destination: `${depot.lat},${depot.lng}`, travelmode: 'driving'});
    if (stops.length) params.set('waypoints', stops.slice(0, 9).map(at).join('|'));
    return 'https://www.google.com/maps/dir/?' + params;
}

module.exports = {locate, planTrip, googleMapsUrl, OSRM_URL};
