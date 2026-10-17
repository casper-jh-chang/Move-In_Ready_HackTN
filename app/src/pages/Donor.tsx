import {useState} from 'react';
import {ArrowRight, Camera, ClipboardCheck, Plus, Trash2, Upload} from 'lucide-react';
import {request, useAction, useApp, useLoad} from '../api';
import {Badge, Empty, FurnitureCard, Modal, PageHeader} from '../ui';
import type {Furniture} from '../types';

const blank = {name: '', category: 'Dining table', location: '', dimensions: '', notes: '', weight: 20, photo: ''};

export function DonationForm({onClose, onSaved}: { onClose: () => void, onSaved: () => void }) {
    const {user, meta, setError, notify} = useApp();
    const [form, setForm] = useState({...blank, location: user.area || meta.areas[0]});
    const [check, setCheck] = useState<{ recommendation: string, flags: string[], source: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileChange = (file?: File) => {
        if (!file) return;
        if (file.size > 3_000_000) return setError('Please choose an image smaller than 3 MB');
        const reader = new FileReader();
        reader.onload = () => setForm(f => ({...f, photo: String(reader.result)}));
        reader.readAsDataURL(file)
    };
    const rulesCheck = async () => {
        try {
            setCheck(await request('/screen', 'POST', form))
        } catch (e) {
            setError((e as Error).message)
        }
    };
    const submit = async () => {
        setBusy(true);
        try {
            await request('/furniture', 'POST', form);
            notify('Donation submitted. An admin will review it soon.');
            onSaved();
            onClose();
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy(false)
        }
    };
    return <Modal eyebrow="DONATION INTAKE" title="Give furniture a new story"
                  description="Your item is saved under your donor account as pending until an admin approves it."
                  onClose={onClose} onSubmit={submit}>
        <div className="form-grid">
            <label>Item name *<input required value={form.name} placeholder="e.g. Solid wood dining table"
                                     onChange={e => setForm({...form, name: e.target.value})}/></label>
            <label>Category *<select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {meta.categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>Pickup area *<select value={form.location} onChange={e => setForm({...form, location: e.target.value})}>
                {meta.areas.map(a => <option key={a}>{a}</option>)}</select></label>
            <label>Dimensions<input value={form.dimensions} placeholder="e.g. 60 x 36 inches"
                                    onChange={e => setForm({...form, dimensions: e.target.value})}/></label>
            <label>Estimated weight (kg)<input type="number" min="0" value={form.weight}
                                               onChange={e => setForm({...form, weight: Number(e.target.value)})}/></label>
        </div>
        <label className="full-label">Description / condition notes<textarea rows={2} value={form.notes}
                                                                             placeholder="Mention stains, damage, pets, stairs, etc."
                                                                             onChange={e => setForm({...form, notes: e.target.value})}/></label>
        <label className="photo-upload"><input type="file" accept="image/png,image/jpeg,image/webp"
                                               onChange={e => fileChange(e.target.files?.[0])}/>
            {form.photo ? <img src={form.photo} alt="Donation preview"/> : <Upload size={24}/>}
            <strong>{form.photo ? 'Photo selected · click to change' : 'Upload furniture photo'}</strong><small>JPG, PNG or WebP · max 3 MB</small></label>
        <div className="review-area">
            <div className="review-buttons">
                <button type="button" className="secondary" onClick={rulesCheck}><ClipboardCheck size={17}/> Check donation rules</button>
                {/* Vision model placeholder: wire this button to /api/vision once server/vision.cjs is implemented. */}
                <button type="button" className="secondary" disabled title="Vision model not implemented yet"><Camera size={17}/> AI photo review (coming soon)</button>
            </div>
            {check && <div className="review-result">
                <strong>Rules-only pre-screen: {check.recommendation.toUpperCase()}</strong>
                {check.flags.length ? check.flags.map(f => <p key={f}>• {f}</p>) : <p>No rule issues found.</p>}
                <small>{check.source}</small></div>}
        </div>
        <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit" disabled={busy}>Submit for review <ArrowRight size={16}/></button>
        </div>
    </Modal>
}

const donorBadge = (f: Furniture) => f.status !== 'approved' ? f.status : f.inventoryStatus === 'delivered' ? 'delivered' : f.inventoryStatus === 'in_stock' ? 'in_stock' : 'approved';

export function MyDonations() {
    const {data, reload} = useLoad<Furniture[]>('/furniture/mine');
    const {run} = useAction();
    const [modal, setModal] = useState(false);
    return <>
        <PageHeader eyebrow="MY DONATIONS" title="Furniture you've offered"
                    description="Everything here is stored under your donor account. Track each item from review to delivery."
                    action={<button className="primary" onClick={() => setModal(true)}><Plus size={17}/> Donate an item</button>}/>
        {data && !data.length && <Empty>You haven't offered anything yet. Click <b>Donate an item</b> to get started.</Empty>}
        <div className="donation-grid">{data?.map(f => <FurnitureCard key={f.id} item={f} badge={donorBadge(f)}
                                                                   footer={<><span>Submitted {f.createdAt.slice(0, 10)}</span><Badge value={f.inventoryStatus === 'rejected' ? 'rejected' : f.inventoryStatus}/></>}>
            {f.status === 'rejected' && f.reviewReason && <p className="review-note">Reason: {f.reviewReason}</p>}
            {f.status === 'pending' && <div className="item-buttons">
                <button className="reject" onClick={() => confirm('Withdraw this donation?') && run('/furniture/' + f.id, 'DELETE', undefined, 'Donation withdrawn', reload)}>
                    <Trash2 size={15}/> Withdraw
                </button>
            </div>}
        </FurnitureCard>)}</div>
        {modal && <DonationForm onClose={() => setModal(false)} onSaved={reload}/>}
    </>
}
