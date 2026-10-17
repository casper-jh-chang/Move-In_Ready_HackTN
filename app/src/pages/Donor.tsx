import {useEffect, useState} from 'react';
import {ArrowRight, Camera, ClipboardCheck, Loader2, Plus, Sparkles, Trash2, Upload, Video} from 'lucide-react';
import {request, useAction, useApp, useLoad} from '../api';
import {Badge, Empty, FurnitureCard, Modal, PageHeader, PhotoScan, photoScanOf} from '../ui';
import type {Furniture, PhotoScanResult} from '../types';
import {hasVideo, OutcomeBadge, VideoIntake} from './VideoIntake';

const blank = {name: '', category: 'Dining table', location: '', address: '', dimensions: '', notes: '', weight: 20, photo: ''};

// Reloads a list every few seconds while any of its photo scans is still running.
export function useScanRefresh(items: Furniture[] | null, reload: () => unknown) {
    const scanning = !!items?.some(f => photoScanOf(f.visionResult)?.status === 'scanning');
    useEffect(() => {
        if (!scanning) return;
        const t = setTimeout(reload, 3000);
        return () => clearTimeout(t);
    }, [scanning, items, reload]);
}

export function DonationForm({onClose, onSaved, onVideo}: { onClose: () => void, onSaved: () => void, onVideo: () => void }) {
    const {user, meta, setError, notify} = useApp();
    const [form, setForm] = useState({...blank, location: user.area || meta.areas[0], address: user.role === 'donor' ? user.address || '' : ''});
    const [scan, setScan] = useState<PhotoScanResult | null>(null), [scanning, setScanning] = useState(false);
    const [check, setCheck] = useState<{ recommendation: string, flags: string[], source: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileChange = (file?: File) => {
        if (!file) return;
        if (file.size > 3_000_000) return setError('Please choose an image smaller than 3 MB');
        const reader = new FileReader();
        reader.onload = () => {
            setForm(f => ({...f, photo: String(reader.result)}));
            setScan(null)
        };
        reader.readAsDataURL(file)
    };
    const rulesCheck = async () => {
        try {
            setCheck(await request('/screen', 'POST', form))
        } catch (e) {
            setError((e as Error).message)
        }
    };
    const photoScan = async () => {
        if (!form.photo) return setError('Upload a photo first');
        setScanning(true);
        try {
            setScan(await request('/vision/photo', 'POST', {photo: form.photo, category: form.category, name: form.name, notes: form.notes}))
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setScanning(false)
        }
    };
    const submit = async () => {
        setBusy(true);
        try {
            await request('/furniture', 'POST', form);
            notify(form.photo && meta.visionConfigured ? 'Donation submitted. Your photo is being scanned for the admin.' : 'Donation submitted. An admin will review it soon.');
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
            <label>Street address<input value={form.address} maxLength={200} placeholder="e.g. 615 Church St (only shared with staff)"
                                        onChange={e => setForm({...form, address: e.target.value})}/></label>
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
                <button type="button" className="secondary" onClick={photoScan} disabled={scanning || !form.photo || !meta.visionConfigured}
                        title={meta.visionConfigured ? 'Scan the photo with Oracle Cloud AI' : 'Photo scanning is not configured on the server'}>
                    {scanning ? <Loader2 size={17} className="spin"/> : <Camera size={17}/>} {scanning ? 'Scanning…' : 'AI photo check'}</button>
                <button type="button" className="secondary" onClick={onVideo} title="Record a walk-around video; AI fills in the details"><Sparkles size={17}/> AI video intake</button>
            </div>
            <PhotoScan result={scan}/>
            {form.photo && meta.visionConfigured && !scan && <small className="hint">Your photo is scanned automatically when you submit, and the result is added to the description for the admin.</small>}
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
    useScanRefresh(data, reload);
    const [modal, setModal] = useState<'form' | 'video' | null>(null);
    return <>
        <PageHeader eyebrow="MY DONATIONS" title="Furniture you've offered"
                    description="Everything here is stored under your donor account. Track each item from review to delivery."
                    action={<div className="hero-actions">
                        <button className="secondary" onClick={() => setModal('video')}><Video size={17}/> Donate with a video</button>
                        <button className="primary" onClick={() => setModal('form')}><Plus size={17}/> Donate an item</button>
                    </div>}/>
        {data && !data.length && <Empty>You haven't offered anything yet. Click <b>Donate an item</b> to get started.</Empty>}
        <div className="donation-grid">{data?.map(f => <FurnitureCard key={f.id} item={f} badge={donorBadge(f)}
                                                                   footer={<><span>Submitted {f.createdAt.slice(0, 10)}</span><Badge value={f.inventoryStatus === 'rejected' ? 'rejected' : f.inventoryStatus}/></>}>
            {hasVideo(f.visionResult) && f.status === 'pending' && <div className="flags"><OutcomeBadge outcome={f.visionResult.outcome}/></div>}
            {f.status === 'rejected' && f.reviewReason && <p className="review-note">Reason: {f.reviewReason}</p>}
            {f.status === 'pending' && <div className="item-buttons">
                <button className="reject" onClick={() => confirm('Withdraw this donation?') && run('/furniture/' + f.id, 'DELETE', undefined, 'Donation withdrawn', reload)}>
                    <Trash2 size={15}/> Withdraw
                </button>
            </div>}
        </FurnitureCard>)}</div>
        {modal === 'form' && <DonationForm onClose={() => setModal(null)} onSaved={reload} onVideo={() => setModal('video')}/>}
        {modal === 'video' && <VideoIntake onClose={() => setModal(null)} onSaved={reload}/>}
    </>
}
