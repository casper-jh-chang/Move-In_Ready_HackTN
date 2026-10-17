import React from 'react';
import {MapPin, Package, Truck, X} from 'lucide-react';
import type {Furniture, Routes} from './types';

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
            <div className="item-footer">{footer ?? <><span>{item.dimensions}</span><span>{item.weight} kg est.</span></>}</div>
            {children}
        </div>
    </div>
}

const COLORS = ['#356e56', '#d99a60', '#5b7fb5', '#9b6fb0', '#c45f5f'];
const x = (lng: number) => (lng + 86.98) / .40 * 540, y = (lat: number) => (36.30 - lat) / .27 * 380;

export function RouteView({routes}: { routes: Routes }) {
    const stops = routes.trucks.reduce((s, t) => s + t.stops.length, 0);
    return <>
        <div className="route-summary">
            <div><span>Separate round trips</span><strong>{routes.baselineKm} km</strong><small>Illustrative baseline</small></div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <div><span>Grouped routes</span><strong>{routes.optimizedKm} km</strong><small>Straight-line estimate</small></div>
            <div className="route-saving"><span>Estimated distance reduction</span><strong>{routes.savingsPct}%</strong><small>Not verified road savings</small></div>
        </div>
        <div className="route-layout">
            <div className="route-map">
                <div className="map-title"><MapPin size={17}/> Nashville task map <span>Illustrative coordinates</span></div>
                <svg viewBox="0 0 540 380" role="img" aria-label="Schematic Nashville task map">
                    <rect width="540" height="380" fill="#edf1e9"/>
                    {Array.from({length: 8}, (_, i) => <path key={'a' + i} d={`M${i * 80 - 40} 0 L${i * 80 + 80} 380`} stroke="#fff" strokeWidth="9"/>)}
                    {Array.from({length: 7}, (_, i) => <path key={'b' + i} d={`M0 ${i * 75 - 25} L540 ${i * 75 + 5}`} stroke="#fff" strokeWidth="7"/>)}
                    <path d="M310 0 Q270 130 350 210 T330 380" fill="none" stroke="#b7dce7" strokeWidth="22"/>
                    <text x="26" y="32" fill="#87978b" fontSize="13">NASHVILLE · SCHEMATIC</text>
                    {routes.trucks.map((t, idx) => {
                        const color = COLORS[idx % COLORS.length];
                        const pts = [routes.depot, ...t.stops, routes.depot].map(p => `${x(p.lng)},${y(p.lat)}`).join(' ');
                        return <g key={t.name}>
                            <polyline points={pts} stroke={color} strokeWidth="4" strokeDasharray={idx ? '9 5' : 'none'} fill="none" opacity=".85"/>
                            {t.stops.map((s, i) => <g key={s.id}>
                                <circle cx={x(s.lng) + idx * 4} cy={y(s.lat) + idx * 4} r="12" fill={color} stroke="white" strokeWidth="3"/>
                                <text x={x(s.lng) + idx * 4} y={y(s.lat) + idx * 4 + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{i + 1}</text>
                            </g>)}</g>
                    })}
                    <circle cx={x(routes.depot.lng)} cy={y(routes.depot.lat)} r="12" fill="#243d31" stroke="white" strokeWidth="3"/>
                    <text x={x(routes.depot.lng)} y={y(routes.depot.lat) + 4} textAnchor="middle" fill="white" fontSize="11">D</text>
                </svg>
                <p className="map-footnote">Diagram only · D = warehouse depot. Real road routes and truck capacity need a routing provider.</p>
            </div>
            <div className="route-trucks">{routes.trucks.length ? routes.trucks.map((t, i) => <div className="truck-panel" key={t.name}>
                <div className="truck-title"><span className="truck-badge" style={{color: COLORS[i % COLORS.length]}}><Truck size={18}/></span>
                    <div><h3>{t.name}</h3><p>{t.stops.length} stops · {t.distanceKm} km</p></div>
                </div>
                {t.stops.map((s, j) => <div className="truck-stop" key={s.id}>
                    <span>{j + 1}</span>
                    <div><strong>{s.label}</strong><p>{s.area}</p></div>
                </div>)}</div>) : <div className="truck-panel"><p className="empty">No open tasks to route{stops ? '' : ' yet'}.</p></div>}</div>
        </div>
        <div className="notice bottom-notice"><MapPin size={19}/>
            <div>{routes.method} This is a planning illustration, not a dispatch-ready itinerary.</div>
        </div>
    </>
}
