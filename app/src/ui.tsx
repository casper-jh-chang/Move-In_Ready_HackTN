import React, {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Camera, Loader2, MapPin, Navigation, Package, Truck, X} from 'lucide-react';
import type {Furniture, Routes, VisionResult} from './types';

const LABELS: Record<string, string> = {
    in_stock: 'In stock', pledged: 'At donor', delivered: 'Delivered', assigned: 'Assigned',
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
    fulfilled: 'Fulfilled', completed: 'Completed', pickup: 'Pickup', delivery: 'Delivery',
    admin: 'Admin', volunteer: 'Volunteer', donor: 'Donor', user: 'User'
};
export const label = (s: string) => LABELS[s] || (s ? s[0].toUpperCase() + s.slice(1) : '');
// Date-only values (YYYY-MM-DD) are parsed as local dates so they don't shift a day in US time zones.
export const shortDate = (s?: string | null) => s ? new Date(s.length === 10 ? s + 'T00:00' : s.replace(' ', 'T')).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '—';
export const initials = (name: string) => name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

export function Badge({value}: { value: string }) {
    return <span className={'badge ' + value}>{label(value)}</span>
}

export function Stat({icon, value, label, note, tone}: {
    icon: React.ReactNode,
    value: string | number,
    label: string,
    note: string,
    tone: string
}) {
    return <div className="stat">
        <div className={'stat-icon ' + tone}>{icon}</div>
        <strong className="stat-value">{value}</strong><span className="stat-label">{label}</span><small>{note}</small>
    </div>
}

export function PageHeader({eyebrow, title, description, action}: {
    eyebrow: string,
    title: string,
    description: string,
    action?: React.ReactNode
}) {
    return <div className="page-header">
        <div>
            <div className="eyebrow dark">{eyebrow}</div>
            <h1>{title}</h1><p>{description}</p></div>
        {action}</div>
}

export function Modal({eyebrow, title, description, onClose, children, onSubmit}: {
    eyebrow: string,
    title: string,
    description?: string,
    onClose: () => void,
    children: React.ReactNode,
    onSubmit?: (e: React.FormEvent) => void
}) {
    return <div className="modal-overlay" onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
    }}>
        <form className="modal" onSubmit={e => {
            e.preventDefault();
            onSubmit?.(e)
        }}>
            <div className="modal-head">
                <div><span className="eyebrow dark">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
                <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><X size={20}/></button>
            </div>
            {children}
        </form>
    </div>
}

export function Empty({children}: { children: React.ReactNode }) {
    return <div className="empty-state">{children}</div>
}

export function FurnitureCard({item, badge, footer, children}: {
    item: Furniture,
    badge?: string,
    footer?: React.ReactNode,
    children?: React.ReactNode
}) {
    return <div className="donation-card">
        <div className="item-photo">{item.photo ? <img src={item.photo} alt={item.name}/> : <Package size={34}/>}
            <span className={'status ' + (badge || item.status)}>{label(badge || item.status)}</span></div>
        <div className="item-info">
            <div className="item-category">{item.category}</div>
            <h3>{item.name}</h3><p><MapPin size={14}/>{item.location}</p>
            <p className="item-desc">{item.notes || 'No notes provided.'}</p>
            <PhotoScan result={item.visionResult} compact/>
            <div className="item-footer">{footer ?? <><span>{item.dimensions}</span><span>{item.weight} kg est.</span></>}</div>
            {children}
        </div>
    </div>
}

// OCI photo scan shown under a donation's description.
export function PhotoScan({result, compact}: { result: VisionResult | null | undefined, compact?: boolean }) {
    if (!result) return null;
    if (result.status === 'scanning') return <div className="scan"><Loader2 size={13} className="spin"/> Scanning photo with Oracle Cloud AI…</div>;
    if (result.status === 'error') return <div className="scan scan-error"><Camera size={13}/> Photo scan failed: {result.error}</div>;
    return <div className={'scan ' + (result.recommendation === 'reject' ? 'scan-warn' : '')}>
        <div className="scan-head"><Camera size={13}/><b>Photo scan</b><span className={'cond c-' + result.visibleCondition.replace(' ', '-').toLowerCase()}>{result.visibleCondition}</span></div>
        <p>{result.summary}</p>
        {!!result.visibleIssues.length && <ul>{result.visibleIssues.map(i => <li key={i}>{i}</li>)}</ul>}
        {!result.matchesCategory && <p className="scan-flag">Looks like: {result.category}</p>}
        {!compact && !!result.labels.length && <small>Detected: {result.labels.map(l => `${l.name} ${l.confidence}%`).join(', ')}</small>}
        {!compact && <small>{result.explanation} Model: {result.model}.</small>}
    </div>
}

const COLORS = ['#356e56', '#d99a60', '#5b7fb5', '#9b6fb0', '#c45f5f'];
const duration = (min: number) => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;

// Popup content built with DOM text nodes so names and addresses are never parsed as HTML.
function popup(title: string, lines: (string | null | undefined)[]) {
    const el = document.createElement('div'), b = document.createElement('b');
    b.textContent = title;
    el.append(b);
    lines.filter(Boolean).forEach(l => {
        el.append(document.createElement('br'), document.createTextNode(l!))
    });
    return el;
}

const pin = (text: string, color: string) => L.divIcon({className: 'stop-pin', html: `<span style="background:${color}">${text}</span>`, iconSize: [28, 28], iconAnchor: [14, 14]});

function RouteMap({routes}: { routes: Routes }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const {depot, trucks} = routes;
        const map = L.map(ref.current!, {scrollWheelZoom: false});
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routing <a href="https://project-osrm.org">OSRM</a>'
        }).addTo(map);
        const bounds = L.latLngBounds([[depot.lat, depot.lng]]);
        // Stops at the same spot (e.g. two items in one area) get nudged apart so every pin stays visible.
        const used = new Map<string, number>();
        const spread = (lat: number, lng: number): [number, number] => {
            const key = lat.toFixed(4) + ',' + lng.toFixed(4), n = used.get(key) || 0;
            used.set(key, n + 1);
            return n ? [lat + 0.0025 * Math.cos(n * 2.1), lng + 0.0032 * Math.sin(n * 2.1)] : [lat, lng];
        };
        trucks.forEach((t, idx) => {
            const color = COLORS[idx % COLORS.length];
            L.polyline(t.geometry, {color, weight: 5, opacity: .8, dashArray: routes.provider === 'osrm' ? undefined : '8 6'}).addTo(map);
            t.geometry.forEach(p => bounds.extend(p));
            t.stops.forEach((s, i) => L.marker(spread(s.lat, s.lng), {icon: pin(String(i + 1), color)})
                .bindPopup(popup(s.label, [t.name, s.address || s.area, `${s.legKm} km · ${s.legMin} min from previous stop`])).addTo(map));
        });
        L.marker([depot.lat, depot.lng], {icon: pin('D', '#243d31'), zIndexOffset: 1000}).bindPopup(popup('Depot', [depot.name])).addTo(map);
        map.fitBounds(bounds, {padding: [30, 30], maxZoom: 14});
        return () => {
            map.remove()
        };
    }, [routes]);
    return <div ref={ref} className="leaflet-box" role="region" aria-label="Route map"/>;
}

export function RouteView({routes}: { routes: Routes }) {
    const roads = routes.provider === 'osrm';
    return <>
        <div className="route-summary">
            <div><span>Separate round trips</span><strong>{routes.baselineKm} km</strong><small>One depot trip per stop</small></div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <div><span>Planned routes</span><strong>{routes.optimizedKm} km</strong><small>{roads ? `${duration(routes.totalMin)} driving` : 'Straight-line estimate'}</small></div>
            <div className="route-saving"><span>Distance saved</span><strong>{routes.savingsPct}%</strong><small>{roads ? 'Road distances' : 'Not road distances'}</small></div>
        </div>
        <div className="route-layout">
            <div className="route-map">
                <div className="map-title"><MapPin size={17}/> Nashville task map <span>{roads ? 'Road routes · OpenStreetMap' : 'Routing service unavailable'}</span></div>
                <RouteMap routes={routes}/>
                <p className="map-footnote">D = warehouse depot. Numbers show the visiting order. Stops without a street address are placed at their neighborhood center.</p>
            </div>
            <div className="route-trucks">{routes.trucks.length ? routes.trucks.map((t, i) => <div className="truck-panel" key={t.name}>
                <div className="truck-title"><span className="truck-badge" style={{color: COLORS[i % COLORS.length]}}><Truck size={18}/></span>
                    <div><h3>{t.name}</h3><p>{t.stops.length} stop{t.stops.length === 1 ? '' : 's'} · {t.distanceKm} km · {duration(t.durationMin)}</p></div>
                    <a className="secondary nav-link" href={t.navigationUrl} target="_blank" rel="noreferrer"><Navigation size={14}/> Navigate</a>
                </div>
                <div className="truck-stop depot-stop"><span>D</span>
                    <div><strong>Start at depot</strong><p>{routes.depot.name}</p></div>
                </div>
                {t.stops.map((s, j) => <div className="truck-stop" key={s.id}>
                    <span>{j + 1}</span>
                    <div><strong>{s.label}</strong><p>{s.address || s.area}{!s.precise && ' (area center)'}{s.contact && ' · ' + s.contact}</p></div>
                    <small className="leg">{s.legKm} km<br/>{s.legMin} min</small>
                </div>)}
                <div className="truck-stop depot-stop"><span>D</span>
                    <div><strong>Back to depot</strong></div>
                    <small className="leg">{t.returnKm} km</small>
                </div>
            </div>) : <div className="truck-panel"><p className="empty">No open tasks to route yet.</p></div>}</div>
        </div>
        <div className="notice bottom-notice"><MapPin size={19}/>
            <div>{routes.method} Navigate opens the route in Google Maps for turn-by-turn directions.</div>
        </div>
    </>
}
