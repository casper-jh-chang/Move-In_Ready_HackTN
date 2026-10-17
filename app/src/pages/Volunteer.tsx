import {CheckCircle2, MapPin, Navigation, Package, Phone, Truck, User as UserIcon} from 'lucide-react';
import {useAction, useLoad} from '../api';
import {Badge, Empty, PageHeader, RouteView, shortDate} from '../ui';
import type {Routes, Task} from '../types';

export function MyTasks() {
    const {data, reload} = useLoad<Task[]>('/tasks/mine');
    const {run, busy} = useAction();
    const open = data?.filter(t => t.status === 'assigned') || [], done = data?.filter(t => t.status !== 'assigned') || [];
    const complete = (t: Task) => run(`/tasks/${t.id}/complete`, 'POST', {}, t.type === 'pickup' ? 'Pickup recorded — item is now in stock' : 'Delivery recorded — thank you!', reload);
    return <>
        <PageHeader eyebrow="MY TASKS" title="Your pickups and deliveries"
                    description="Tasks assigned to you by an admin. Mark each one complete when the item has moved."/>
        {data && !open.length && <Empty>No open tasks right now. An admin will assign new pickups and deliveries.</Empty>}
        <div className="task-grid">{open.map(t => <div className="task-card" key={t.id}>
            <div className="task-top"><span className={'round-icon ' + (t.type === 'pickup' ? 'amber' : 'sage')}>{t.type === 'pickup' ? <Package size={19}/> : <Truck size={19}/>}</span>
                <div><span className="eyebrow dark">{t.type.toUpperCase()}</span><h3>{t.furnitureName}</h3></div>
                <Badge value={t.status}/></div>
            <div className="task-meta">
                <span><MapPin size={14}/>{t.type === 'pickup' ? 'Pick up at ' : 'Deliver to '}{t.address ? `${t.address}, ${t.area}` : (t.area || 'area not set') + ' (no street address)'}</span>
                <span><UserIcon size={14}/>{t.type === 'pickup' ? 'Donor: ' : 'Recipient: '}{t.contactName || '—'}</span>
                {t.contactPhone && <span><Phone size={14}/>{t.contactPhone}</span>}
                <span>{t.category} · {t.weight} kg · {t.scheduledFor ? 'Scheduled ' + shortDate(t.scheduledFor) : 'No date set'}</span>
            </div>
            {t.notes && <p className="task-notes">{t.notes}</p>}
            <div className="task-actions">
                <a className="secondary" target="_blank" rel="noreferrer"
                   href={'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(t.address ? t.address + ', Nashville, TN' : `${t.lat},${t.lng}`)}><Navigation size={15}/> Directions</a>
                <button className="primary" disabled={busy} onClick={() => complete(t)}><CheckCircle2 size={16}/> Mark {t.type === 'pickup' ? 'picked up' : 'delivered'}</button>
            </div>
        </div>)}</div>
        {!!done.length && <>
            <h2 className="section-title">History</h2>
            <div className="table-wrap">
                <table className="table">
                    <thead><tr><th>Task</th><th>Item</th><th>Area</th><th>Status</th><th>Completed</th></tr></thead>
                    <tbody>{done.map(t => <tr key={t.id}><td><Badge value={t.type}/></td><td>{t.furnitureName}</td><td>{t.area}</td><td><Badge value={t.status}/></td><td>{shortDate(t.completedAt)}</td></tr>)}</tbody>
                </table>
            </div>
        </>}
    </>
}

export function RoutePlanner({mine}: { mine: boolean }) {
    const {data} = useLoad<Routes>('/routes');
    return <>
        <PageHeader eyebrow="LOGISTICS PLANNING" title={mine ? 'My route' : 'Smarter routes. More homes.'}
                    description={mine ? 'Your open pickups and deliveries in the shortest driving order, starting and ending at the depot.' : 'Each volunteer\'s open tasks planned as one road route, in the shortest driving order.'}/>
        {data && <RouteView routes={data}/>}
    </>
}
