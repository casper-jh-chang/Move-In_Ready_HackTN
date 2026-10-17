import {useState} from 'react';
import {ArrowRight, Check, Search, Send} from 'lucide-react';
import {useAction, useApp, useLoad} from '../api';
import {Badge, Empty, FurnitureCard, Modal, PageHeader, shortDate} from '../ui';
import type {Furniture, FurnitureRequest} from '../types';

export function Browse() {
    const {meta, go} = useApp();
    const {data, reload} = useLoad<Furniture[]>('/furniture/available');
    const {run, busy} = useAction();
    const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [target, setTarget] = useState<Furniture | null>(null), [message, setMessage] = useState('');
    const items = (data || []).filter(f => (!category || f.category === category) && (f.name + ' ' + f.location + ' ' + f.notes).toLowerCase().includes(query.toLowerCase()));
    const send = async () => {
        if (!target) return;
        if (await run('/requests', 'POST', {furnitureId: target.id, message}, 'Request sent. An admin will review it.', reload)) {
            setTarget(null);
            setMessage('');
        }
    };
    return <>
        <PageHeader eyebrow="BROWSE FURNITURE" title="Find what your home needs"
                    description="These items are approved and available. Send a request and an admin will confirm and schedule delivery."
                    action={<button className="secondary" onClick={() => go('requests')}>My requests <ArrowRight size={16}/></button>}/>
        <div className="filter-row">
            <div className="searchbox"><Search size={17}/><input placeholder="Search furniture or area..." value={query} onChange={e => setQuery(e.target.value)}/></div>
            <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {meta.categories.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        {data && !items.length && <Empty>No available items match. Check back soon — new donations arrive every week.</Empty>}
        <div className="donation-grid">{items.map(f => <FurnitureCard key={f.id} item={f} badge={f.inventoryStatus}>
            <div className="item-buttons">{f.myRequest ? <button className="approve" disabled><Check size={15}/> Requested</button> :
                <button className="approve" onClick={() => setTarget(f)}><Send size={15}/> Request this item</button>}</div>
        </FurnitureCard>)}</div>
        {target && <Modal eyebrow="REQUEST FURNITURE" title={target.name} onClose={() => setTarget(null)} onSubmit={send}
                          description="Tell the team anything that helps with delivery (move-in date, stairs, household size).">
            <label className="full-label">Message to the team<textarea rows={3} value={message} maxLength={400}
                                                                      placeholder="e.g. Moving in Oct 23, second floor, no elevator"
                                                                      onChange={e => setMessage(e.target.value)}/></label>
            <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setTarget(null)}>Cancel</button>
                <button className="primary" disabled={busy}>Send request <ArrowRight size={16}/></button>
            </div>
        </Modal>}
    </>
}

export function MyRequests() {
    const {data, reload} = useLoad<FurnitureRequest[]>('/requests/mine');
    const {run} = useAction();
    return <>
        <PageHeader eyebrow="MY REQUESTS" title="Requests you've sent"
                    description="Pending requests are reviewed by an admin. Approved items are delivered by a volunteer."/>
        {data && !data.length && <Empty>No requests yet. Browse available furniture to send your first one.</Empty>}
        {!!data?.length && <div className="table-wrap">
            <table className="table">
                <thead>
                <tr><th>Item</th><th>Sent</th><th>Status</th><th>Delivery</th><th>Note</th><th/></tr>
                </thead>
                <tbody>{data.map(r => <tr key={r.id}>
                    <td><strong>{r.furnitureName}</strong><small>{r.category}</small></td>
                    <td>{shortDate(r.createdAt)}</td>
                    <td><Badge value={r.status}/></td>
                    <td>{r.status === 'fulfilled' ? 'Delivered' : r.deliveryTask ? `Scheduled · ${r.deliveryTask.volunteerName}` : r.status === 'approved' ? 'Awaiting scheduling' : '—'}</td>
                    <td className="muted">{r.decisionNote || r.message || '—'}</td>
                    <td>{['pending', 'approved'].includes(r.status) &&
                        <button className="link-danger" onClick={() => confirm('Cancel this request?') && run(`/requests/${r.id}/cancel`, 'POST', {}, 'Request cancelled', reload)}>Cancel</button>}</td>
                </tr>)}</tbody>
            </table>
        </div>}
    </>
}
