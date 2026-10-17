import {useState} from 'react';
import {AlertTriangle, ArrowRight, Check, Plus, RotateCcw, Search, ShieldCheck, Truck, UserPlus, X} from 'lucide-react';
import {request, setToken, useAction, useApp, useLoad} from '../api';
import {Badge, Empty, FurnitureCard, Modal, PageHeader, shortDate} from '../ui';
import type {Furniture, FurnitureRequest, Role, Task, User} from '../types';
import {hasVideo, VisionPanel} from './VideoIntake';

const today = () => new Date().toISOString().slice(0, 10);

function AssignModal({title, payload, onClose, onDone}: {
    title: string,
    payload: { type: 'pickup', furnitureId: number } | { type: 'delivery', requestId: number },
    onClose: () => void,
    onDone: () => unknown
}) {
    const {data: users} = useLoad<User[]>('/users');
    const volunteers = (users || []).filter(u => u.role === 'volunteer' && u.active);
    const [form, setForm] = useState({volunteerId: '', scheduledFor: today(), notes: ''});
    const {run, busy} = useAction();
    const submit = async () => {
        if (await run('/tasks', 'POST', {...payload, ...form, volunteerId: Number(form.volunteerId || volunteers[0]?.id)}, `Volunteer assigned to ${payload.type}`, onDone)) onClose();
    };
    return <Modal eyebrow={'ASSIGN ' + payload.type.toUpperCase()} title={title} onClose={onClose} onSubmit={submit}
                  description="The volunteer will see this task on their dashboard and route.">
        <div className="form-grid">
            <label>Volunteer *<select required value={form.volunteerId || volunteers[0]?.id || ''} onChange={e => setForm({...form, volunteerId: e.target.value})}>
                {volunteers.map(v => <option key={v.id} value={v.id}>{v.name} · {v.openTasks} open · {v.area || 'no area'}</option>)}</select></label>
            <label>Scheduled for<input type="date" value={form.scheduledFor} onChange={e => setForm({...form, scheduledFor: e.target.value})}/></label>
        </div>
        <label className="full-label">Notes for the volunteer<textarea rows={2} value={form.notes} maxLength={300} onChange={e => setForm({...form, notes: e.target.value})}/></label>
        {users && !volunteers.length && <p className="review-note">No active volunteers. Create one under Users.</p>}
        <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy || !volunteers.length}>Assign <ArrowRight size={16}/></button>
        </div>
    </Modal>
}

function ReviewModal({item, status, onClose, onDone}: { item: Furniture, status: 'approved' | 'rejected', onClose: () => void, onDone: () => unknown }) {
    // Pre-fill a rejection with the rule reasons the AI intake cited; the admin can rewrite it.
    const aiReason = status === 'rejected' && hasVideo(item.visionResult)
        ? item.visionResult.hits.filter(h => h.outcome === 'decline').map(h => h.reason + (h.alternative ? ' Try instead: ' + h.alternative : '')).join(' ').slice(0, 300)
        : '';
    const [form, setForm] = useState({condition: status === 'approved' ? 'Good' : item.condition, reason: aiReason});
    const {run, busy} = useAction();
    const submit = async () => {
        if (await run(`/furniture/${item.id}/review`, 'POST', {status, ...form}, `${item.name} ${status}`, onDone)) onClose();
    };
    return <Modal eyebrow={status === 'approved' ? 'APPROVE DONATION' : 'REJECT DONATION'} title={item.name} onClose={onClose} onSubmit={submit}
                  description={`Donated by ${item.donorName} · ${item.category} · ${item.location}`}>
        {!!item.screening.flags.length && <div className="review-result"><strong>Rule flags</strong>{item.screening.flags.map(f => <p key={f}>• {f}</p>)}</div>}
        {hasVideo(item.visionResult) && <VisionPanel v={item.visionResult}/>}
        <div className="form-grid">
            {status === 'approved' && <label>Verified condition<select value={form.condition} onChange={e => setForm({...form, condition: e.target.value})}>
                {['Like new', 'Good', 'Fair'].map(c => <option key={c}>{c}</option>)}</select></label>}
        </div>
        <label className="full-label">{status === 'rejected' ? 'Reason shown to the donor *' : 'Internal note'}
            <textarea rows={2} required={status === 'rejected'} maxLength={300} value={form.reason}
                      placeholder={status === 'rejected' ? 'e.g. Used mattresses are not accepted. Try Habitat ReStore.' : ''}
                      onChange={e => setForm({...form, reason: e.target.value})}/></label>
        <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button className={status === 'approved' ? 'primary' : 'primary danger'} disabled={busy}>{status === 'approved' ? 'Approve' : 'Reject'}</button>
        </div>
    </Modal>
}

export function DonationReview() {
    const {data, reload} = useLoad<Furniture[]>('/furniture');
    const [filter, setFilter] = useState('pending'), [query, setQuery] = useState('');
    const [review, setReview] = useState<{ item: Furniture, status: 'approved' | 'rejected' } | null>(null), [assign, setAssign] = useState<Furniture | null>(null);
    const items = (data || []).filter(f => (filter === 'all' || f.status === filter) && (f.name + ' ' + f.donorName + ' ' + f.location).toLowerCase().includes(query.toLowerCase()));
    const count = (s: string) => (data || []).filter(f => s === 'all' || f.status === s).length;
    return <>
        <PageHeader eyebrow="DONATION REVIEW" title="Review incoming donations"
                    description="Screen offers against acceptance rules, approve or reject them, then assign a volunteer to pick up approved items."/>
        <div className="notice"><ShieldCheck size={20}/>
            <div><strong>Humans decide.</strong> Rule flags and the AI video intake help you spot issues, but only an admin can approve a donation. Open Approve or Reject to watch the donor's video.</div>
        </div>
        <div className="filter-row">
            <div className="segmented">{['pending', 'approved', 'rejected', 'all'].map(s => <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
                {s[0].toUpperCase() + s.slice(1)} <span>{count(s)}</span></button>)}</div>
            <div className="searchbox"><Search size={17}/><input placeholder="Search item, donor, area..." value={query} onChange={e => setQuery(e.target.value)}/></div>
        </div>
        {data && !items.length && <Empty>Nothing here.</Empty>}
        <div className="donation-grid">{items.map(f => <FurnitureCard key={f.id} item={f}
                                                                    footer={<><span>Donor: <b>{f.donorName}</b></span><Badge value={f.inventoryStatus}/></>}>
            {hasVideo(f.visionResult) && f.status === 'pending' && <VisionPanel v={f.visionResult} compact/>}
            {!!f.screening.flags.length && f.status === 'pending' && <div className="flags">{f.screening.flags.map(x => <span key={x}><AlertTriangle size={12}/>{x}</span>)}</div>}
            {f.reviewReason && <p className="review-note">Note: {f.reviewReason}</p>}
            {f.status === 'pending' && <div className="item-buttons">
                <button className="approve" onClick={() => setReview({item: f, status: 'approved'})}><Check size={15}/> Approve</button>
                <button className="reject" onClick={() => setReview({item: f, status: 'rejected'})}><X size={15}/> Reject</button>
            </div>}
            {f.status === 'approved' && f.inventoryStatus === 'pledged' && <div className="item-buttons">{f.pickupTask ?
                <span className="assigned-to"><Truck size={14}/> Pickup: {f.pickupTask.volunteerName}</span> :
                <button className="approve" onClick={() => setAssign(f)}><Truck size={15}/> Assign pickup</button>}</div>}
            {f.status === 'approved' && !!f.pendingRequests && <p className="review-note">{f.pendingRequests} pending request(s)</p>}
        </FurnitureCard>)}</div>
        {review && <ReviewModal {...review} onClose={() => setReview(null)} onDone={reload}/>}
        {assign && <AssignModal title={assign.name} payload={{type: 'pickup', furnitureId: assign.id}} onClose={() => setAssign(null)} onDone={reload}/>}
    </>
}

export function RequestsAdmin() {
    const {data, reload} = useLoad<FurnitureRequest[]>('/requests');
    const {run} = useAction();
    const [assign, setAssign] = useState<FurnitureRequest | null>(null);
    const decide = (r: FurnitureRequest, status: 'approved' | 'rejected') => {
        const note = status === 'rejected' ? prompt('Reason shown to the user (optional):') : '';
        if (note === null) return;
        run(`/requests/${r.id}/decide`, 'POST', {status, note}, `Request ${status}`, reload);
    };
    return <>
        <PageHeader eyebrow="FURNITURE REQUESTS" title="Requests from users"
                    description="Approve a request to reserve the item for that household (other pending requests for it are declined), then assign a delivery volunteer."/>
        {data && !data.length && <Empty>No requests yet.</Empty>}
        {!!data?.length && <div className="table-wrap">
            <table className="table">
                <thead><tr><th>User</th><th>Item</th><th>Message</th><th>Status</th><th>Delivery</th><th>Actions</th></tr></thead>
                <tbody>{data.map(r => <tr key={r.id}>
                    <td><strong>{r.userName}</strong><small>{r.userArea || 'No area'} · {shortDate(r.createdAt)}</small></td>
                    <td><strong>{r.furnitureName}</strong><small>{r.category} · <Badge value={r.furnitureStatus}/></small></td>
                    <td className="muted">{r.message || '—'}{r.decisionNote && <small>Note: {r.decisionNote}</small>}</td>
                    <td><Badge value={r.status}/></td>
                    <td>{r.deliveryTask ? <>{r.deliveryTask.volunteerName}<small>{r.deliveryTask.status}</small></> : '—'}</td>
                    <td className="actions">
                        {r.status === 'pending' && <>
                            <button className="approve" onClick={() => decide(r, 'approved')}><Check size={14}/> Approve</button>
                            <button className="reject" onClick={() => decide(r, 'rejected')}><X size={14}/> Reject</button>
                        </>}
                        {r.status === 'approved' && !r.deliveryTask && (r.furnitureStatus === 'in_stock' ?
                            <button className="approve" onClick={() => setAssign(r)}><Truck size={14}/> Assign delivery</button> :
                            <small>Waiting for pickup</small>)}
                        {r.status === 'approved' && r.deliveryTask?.status === 'assigned' &&
                            <button className="reject" onClick={() => run(`/tasks/${r.deliveryTask!.id}/cancel`, 'POST', {}, 'Delivery unassigned', reload)}>Unassign</button>}
                    </td>
                </tr>)}</tbody>
            </table>
        </div>}
        {assign && <AssignModal title={`${assign.furnitureName} → ${assign.userName}`} payload={{type: 'delivery', requestId: assign.id}} onClose={() => setAssign(null)} onDone={reload}/>}
    </>
}

export function TasksAdmin() {
    const {data, reload} = useLoad<Task[]>('/tasks');
    const {run} = useAction();
    const [filter, setFilter] = useState('assigned');
    const tasks = (data || []).filter(t => filter === 'all' || t.status === filter);
    return <>
        <PageHeader eyebrow="VOLUNTEER TASKS" title="Who is moving what"
                    description="Every pickup and delivery assigned to volunteers. Unassign a task to give it to someone else."/>
        <div className="filter-row">
            <div className="segmented">{['assigned', 'completed', 'cancelled', 'all'].map(s => <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
                {s[0].toUpperCase() + s.slice(1)} <span>{(data || []).filter(t => s === 'all' || t.status === s).length}</span></button>)}</div>
        </div>
        {data && !tasks.length && <Empty>No tasks in this view.</Empty>}
        {!!tasks.length && <div className="table-wrap">
            <table className="table">
                <thead><tr><th>Type</th><th>Item</th><th>Volunteer</th><th>Area</th><th>Scheduled</th><th>Status</th><th/></tr></thead>
                <tbody>{tasks.map(t => <tr key={t.id}>
                    <td><Badge value={t.type}/></td>
                    <td><strong>{t.furnitureName}</strong><small>{t.type === 'pickup' ? 'From ' : 'To '}{t.contactName}</small></td>
                    <td>{t.volunteerName}</td><td>{t.area}</td><td>{shortDate(t.scheduledFor)}</td><td><Badge value={t.status}/></td>
                    <td className="actions">{t.status === 'assigned' && <>
                        <button className="approve" onClick={() => run(`/tasks/${t.id}/complete`, 'POST', {}, 'Task marked complete', reload)}>Complete</button>
                        <button className="reject" onClick={() => run(`/tasks/${t.id}/cancel`, 'POST', {}, 'Task unassigned', reload)}>Unassign</button>
                    </>}</td>
                </tr>)}</tbody>
            </table>
        </div>}
    </>
}

function DonorItems({donor, onClose}: { donor: User, onClose: () => void }) {
    const {data} = useLoad<{ furniture: Furniture[] }>(`/donors/${donor.id}/furniture`);
    return <Modal eyebrow="DONOR FURNITURE" title={donor.name} description={donor.email} onClose={onClose}>
        {data && !data.furniture.length && <Empty>No furniture stored under this donor.</Empty>}
        {!!data?.furniture.length && <table className="table">
            <thead><tr><th>Item</th><th>Review</th><th>Inventory</th><th>Submitted</th></tr></thead>
            <tbody>{data.furniture.map(f => <tr key={f.id}><td><strong>{f.name}</strong><small>{f.category}</small></td>
                <td><Badge value={f.status}/></td><td><Badge value={f.inventoryStatus}/></td><td>{shortDate(f.createdAt)}</td></tr>)}</tbody>
        </table>}
    </Modal>
}

export function UsersAdmin() {
    const {user: me, meta, notify} = useApp();
    const {data, reload} = useLoad<User[]>('/users');
    const {run, busy} = useAction();
    const [creating, setCreating] = useState(false), [donor, setDonor] = useState<User | null>(null), [role, setRole] = useState('');
    const [form, setForm] = useState({name: '', email: '', password: '', role: 'volunteer' as Role, area: meta.areas[0], phone: ''});
    const create = async () => {
        if (await run('/users', 'POST', form, `${form.role} account created`, reload)) {
            setCreating(false);
            setForm({...form, name: '', email: '', password: ''});
        }
    };
    const reset = async () => {
        if (!confirm('Erase all data and reload the demo seed? Everyone will be signed out.')) return;
        await request('/admin/reset', 'POST', {});
        notify('Demo data reset');
        setToken(null);
        location.reload();
    };
    const users = (data || []).filter(u => !role || u.role === role);
    return <>
        <PageHeader eyebrow="ACCESS CONTROL" title="Users and roles"
                    description="Donors and users sign themselves up. Admins create volunteers and other admins, change roles, and deactivate accounts."
                    action={<button className="primary" onClick={() => setCreating(true)}><UserPlus size={17}/> New account</button>}/>
        <div className="filter-row">
            <div className="segmented">{['', 'admin', 'volunteer', 'donor', 'user'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>
                {r ? r[0].toUpperCase() + r.slice(1) + 's' : 'All'} <span>{(data || []).filter(u => !r || u.role === r).length}</span></button>)}</div>
            <button className="text-button" onClick={reset}><RotateCcw size={15}/> Reset demo data</button>
        </div>
        <div className="table-wrap">
            <table className="table">
                <thead><tr><th>Name</th><th>Area</th><th>Role</th><th>Activity</th><th>Status</th><th/></tr></thead>
                <tbody>{users.map(u => <tr key={u.id} className={u.active ? '' : 'inactive'}>
                    <td><strong>{u.name}</strong><small>{u.email}</small></td>
                    <td>{u.area || '—'}</td>
                    <td><select className="select small" value={u.role} disabled={u.id === me.id || busy}
                                onChange={e => run('/users/' + u.id, 'PATCH', {role: e.target.value}, 'Role updated', reload)}>
                        {['admin', 'volunteer', 'donor', 'user'].map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></td>
                    <td className="muted">{u.role === 'donor' ? `${u.donations} donations` : u.role === 'user' ? `${u.requests} requests` : u.role === 'volunteer' ? `${u.openTasks} open tasks` : '—'}</td>
                    <td>{u.active ? <span className="badge approved">Active</span> : <span className="badge cancelled">Inactive</span>}</td>
                    <td className="actions">
                        {u.role === 'donor' && <button className="approve" onClick={() => setDonor(u)}>Furniture</button>}
                        {u.id !== me.id && <button className={u.active ? 'reject' : 'approve'} disabled={busy}
                                                   onClick={() => run('/users/' + u.id, 'PATCH', {active: !u.active}, u.active ? 'Account deactivated' : 'Account reactivated', reload)}>
                            {u.active ? 'Deactivate' : 'Reactivate'}</button>}
                    </td>
                </tr>)}</tbody>
            </table>
        </div>
        {donor && <DonorItems donor={donor} onClose={() => setDonor(null)}/>}
        {creating && <Modal eyebrow="NEW ACCOUNT" title="Create an account" onClose={() => setCreating(false)} onSubmit={create}
                            description="Share the password with the person securely; they can't change it in this prototype yet.">
            <div className="form-grid">
                <label>Role *<select value={form.role} onChange={e => setForm({...form, role: e.target.value as Role})}>
                    {['volunteer', 'admin', 'donor', 'user'].map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></label>
                <label>Full name *<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
                <label>Email *<input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}/></label>
                <label>Temporary password *<input required minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})}/></label>
                <label>Area<select value={form.area} onChange={e => setForm({...form, area: e.target.value})}>{meta.areas.map(a => <option key={a}>{a}</option>)}</select></label>
                <label>Phone<input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/></label>
            </div>
            <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
                <button className="primary" disabled={busy}><Plus size={16}/> Create</button>
            </div>
        </Modal>}
    </>
}
