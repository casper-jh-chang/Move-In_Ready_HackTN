import React, {useState} from 'react';
import {ArrowRight, Camera, CheckCircle2, Clock, Heart, Leaf, Navigation, Package, Plus, RefreshCw, Send, Truck, Users} from 'lucide-react';
import {request, useApp, useLoad} from '../api';
import {PageHeader, Stat} from '../ui';
import type {Activity, Impact, Stats, User} from '../types';
import {DonationForm} from './Donor';

type Priority = { icon: React.ReactNode, tone: string, title: string, text: string, tab: string };

const HERO: Record<string, { title: string, text: string, action?: { label: string, tab: string } }> = {
    admin: {title: 'Keep the whole pipeline moving.', text: 'Review donations, approve requests from households, and assign volunteers to pickups and deliveries.'},
    volunteer: {title: 'Thank you for driving change.', text: 'Your assigned pickups and deliveries are ready. Mark each one complete when the furniture has moved.', action: {label: 'Open my tasks', tab: 'tasks'}},
    donor: {title: 'Give your furniture a second home.', text: 'Offer gently used furniture. Every item you donate is stored under your account so you can follow it all the way to a new home.'},
    user: {title: 'Every home deserves a beginning.', text: 'Browse approved furniture and request what your new home needs. Our team will confirm and deliver it.', action: {label: 'Browse furniture', tab: 'browse'}}
};

export function Overview() {
    const {user, go} = useApp();
    const {data: s, reload} = useLoad<Stats>('/stats');
    const {data: activity, reload: reloadActivity} = useLoad<Activity[]>(['admin', 'volunteer'].includes(user.role) ? '/activity' : null);
    const [donating, setDonating] = useState(false);
    const v = (k: string) => Number(s?.[k] ?? 0);
    const hero = HERO[user.role];
    const statCards: Record<string, React.ReactNode> = {
        admin: <>
            <Stat icon={<Clock size={20}/>} value={v('pendingDonations')} label="Donations to review" note="Waiting for an admin" tone="amber"/>
            <Stat icon={<Send size={20}/>} value={v('pendingRequests')} label="Requests to decide" note="From users" tone="blue"/>
            <Stat icon={<Package size={20}/>} value={v('availableItems')} label="Available items" note="Approved, unreserved" tone="sage"/>
            <Stat icon={<Truck size={20}/>} value={v('openTasks')} label="Open volunteer tasks" note="Pickups + deliveries" tone="lavender"/></>,
        volunteer: <>
            <Stat icon={<Truck size={20}/>} value={v('openTasks')} label="Open tasks" note="Assigned to you" tone="amber"/>
            <Stat icon={<Package size={20}/>} value={v('pickups')} label="Pickups" note="From donors" tone="sage"/>
            <Stat icon={<Heart size={20}/>} value={v('deliveries')} label="Deliveries" note="To households" tone="blue"/>
            <Stat icon={<CheckCircle2 size={20}/>} value={v('completed')} label="Completed" note="Thank you!" tone="lavender"/></>,
        donor: <>
            <Stat icon={<Package size={20}/>} value={v('myItems')} label="Items donated" note="Stored under your account" tone="sage"/>
            <Stat icon={<Clock size={20}/>} value={v('pending')} label="Awaiting review" note="Admin will check soon" tone="amber"/>
            <Stat icon={<CheckCircle2 size={20}/>} value={v('approved')} label="Approved" note="Accepted for reuse" tone="blue"/>
            <Stat icon={<Heart size={20}/>} value={v('delivered')} label="Delivered" note="Now in a new home" tone="lavender"/></>,
        user: <>
            <Stat icon={<Package size={20}/>} value={v('available')} label="Available now" note="Approved furniture" tone="sage"/>
            <Stat icon={<Clock size={20}/>} value={v('pending')} label="Pending requests" note="Waiting for review" tone="amber"/>
            <Stat icon={<CheckCircle2 size={20}/>} value={v('approved')} label="Approved" note="Delivery coming" tone="blue"/>
            <Stat icon={<Heart size={20}/>} value={v('fulfilled')} label="Delivered" note="In your home" tone="lavender"/></>
    };
    const priorities: Priority[] = user.role === 'admin' ? [
        {icon: <Camera size={19}/>, tone: 'amber', title: 'Review incoming donations', text: `${v('pendingDonations')} items waiting for a decision`, tab: 'donations'},
        {icon: <Send size={19}/>, tone: 'blue', title: 'Decide on requests', text: `${v('pendingRequests')} pending · ${v('awaitingDelivery')} approved need a delivery volunteer`, tab: 'requests'},
        {icon: <Truck size={19}/>, tone: 'sage', title: 'Assign pickups', text: `${v('awaitingPickup')} approved items still at the donor without a volunteer`, tab: 'donations'},
        {icon: <Navigation size={19}/>, tone: 'lavender', title: 'Plan routes', text: `${v('openTasks')} open tasks across volunteers`, tab: 'routes'}
    ] : user.role === 'volunteer' ? [
        {icon: <Package size={19}/>, tone: 'amber', title: 'Pickups', text: `${v('pickups')} items to collect from donors`, tab: 'tasks'},
        {icon: <Heart size={19}/>, tone: 'sage', title: 'Deliveries', text: `${v('deliveries')} items to bring to households`, tab: 'tasks'},
        {icon: <Navigation size={19}/>, tone: 'blue', title: 'My route', text: 'Suggested stop order for today', tab: 'routes'}
    ] : user.role === 'donor' ? [
        {icon: <Plus size={19}/>, tone: 'sage', title: 'Donate an item', text: 'Add photos and details for review', tab: 'donations'},
        {icon: <Package size={19}/>, tone: 'amber', title: 'Track my donations', text: `${v('myItems')} items under your account`, tab: 'donations'}
    ] : [
        {icon: <Package size={19}/>, tone: 'sage', title: 'Browse furniture', text: `${v('available')} items available to request`, tab: 'browse'},
        {icon: <Send size={19}/>, tone: 'blue', title: 'My requests', text: `${v('pending') + v('approved')} in progress`, tab: 'requests'},
        {icon: <Users size={19}/>, tone: 'amber', title: 'Update my profile', text: 'Add your street address so routes are planned correctly', tab: 'profile'}
    ];
    return <>
        <div className="welcome">
            <div>
                <div className="eyebrow">WELCOME, {user.name.toUpperCase()}</div>
                <h1>{hero.title.split(' ').slice(0, -2).join(' ')}<br/><em>{hero.title.split(' ').slice(-2).join(' ')}</em></h1>
                <p>{hero.text}</p>
                <div className="hero-actions">
                    {user.role === 'donor' && <button className="primary" onClick={() => setDonating(true)}><Plus size={17}/> New donation</button>}
                    {user.role === 'admin' && <button className="primary" onClick={() => go('donations')}><Camera size={17}/> Review donations</button>}
                    {hero.action && <button className="primary" onClick={() => go(hero.action!.tab)}>{hero.action.label} <ArrowRight size={17}/></button>}
                    <button className="secondary light" onClick={() => go('impact')}>See our impact <ArrowRight size={17}/></button>
                </div>
            </div>
            <div className="hero-art">
                <div className="art-sun"/>
                <div className="art-house">
                    <div className="roof"/>
                    <div className="home-body">
                        <div className="window"/>
                        <div className="door"/>
                    </div>
                </div>
                <div className="art-leaf leaf-one"/>
                <div className="art-leaf leaf-two"/>
                <div className="art-dot dot-one"/>
                <div className="art-dot dot-two"/>
            </div>
        </div>
        <div className="section-head">
            <div>
                <div className="eyebrow dark">AT A GLANCE</div>
                <h2>Your dashboard</h2></div>
            <button className="text-button" onClick={() => {
                reload();
                reloadActivity()
            }}><RefreshCw size={15}/> Refresh</button>
        </div>
        <div className="stat-grid">{statCards[user.role]}</div>
        <div className={activity ? 'two-cols' : 'one-col'}>
            <section className="panel">
                <div className="panel-head">
                    <div><h3>Where you can help</h3><p>Your next steps</p></div>
                </div>
                <div className="priority-list">{priorities.map(p => <div className="priority" key={p.title}>
                    <span className={'round-icon ' + p.tone}>{p.icon}</span>
                    <div><strong>{p.title}</strong><p>{p.text}</p></div>
                    <button onClick={() => p.title === 'Donate an item' ? setDonating(true) : go(p.tab)} aria-label={p.title}><ArrowRight size={18}/></button>
                </div>)}</div>
            </section>
            {activity && <section className="panel">
                <div className="panel-head">
                    <div><h3>Recent activity</h3><p>What's been happening</p></div>
                    <span className="muted-tag">Live</span></div>
                <div className="activity">{activity.slice(0, 6).map(a => <div className="activity-row" key={a.id}><span className="activity-dot"/>
                    <div><strong>{a.text}</strong><p>{new Date(a.date.replace(' ', 'T')).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</p></div>
                </div>)}</div>
            </section>}
        </div>
        {donating && <DonationForm onClose={() => setDonating(false)} onSaved={reload}/>}
    </>
}

export function ImpactPage() {
    const {data: i} = useLoad<Impact>('/impact');
    return <>
        <PageHeader eyebrow="TRANSPARENT COMMUNITY IMPACT" title="Every piece has a purpose"
                    description="Counts come straight from the database. Weights are donor estimates."/>
        <div className="stat-grid">
            <Stat icon={<Heart size={20}/>} value={i?.delivered ?? 0} label="Items delivered" note="Completed deliveries" tone="sage"/>
            <Stat icon={<Users size={20}/>} value={i?.householdsServed ?? 0} label="Households served" note="Received at least one item" tone="blue"/>
            <Stat icon={<Leaf size={20}/>} value={(i?.kgDelivered ?? 0) + ' kg'} label="Kept from landfill" note="Delivered, estimated" tone="amber"/>
            <Stat icon={<Truck size={20}/>} value={i?.tripsCompleted ?? 0} label="Volunteer trips" note="Pickups + deliveries" tone="lavender"/>
        </div>
        <div className="two-cols">
            <section className="panel impact-panel"><h3>Our mission, measured honestly.</h3><p>Move-In Ready connects
                {' '}{i?.donors ?? 0} donors and {i?.volunteers ?? 0} volunteers. Another {i?.kgInPipeline ?? 0} kg of approved
                furniture is on its way to a new home.</p>
                <div className="impact-lines"><span><CheckCircle2 size={17}/> Every item is linked to its donor</span><span><CheckCircle2
                    size={17}/> Admins approve every donation and request</span><span><CheckCircle2 size={17}/> Volunteers confirm each pickup and delivery</span>
                </div>
            </section>
            <section className="panel impact-panel"><h3>Ready for a live pilot?</h3><p>Before deploying with a nonprofit, validate
                accepted-item rules, warehouse hours, vehicle capacities, privacy needs, volunteer availability and delivery confirmation.</p>
            </section>
        </div>
    </>
}

export function Profile({onUpdated}: { onUpdated: (u: User) => void }) {
    const {user, meta, setError, notify} = useApp();
    const [form, setForm] = useState({name: user.name, phone: user.phone || '', area: user.area || meta.areas[0], address: user.address || ''});
    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            onUpdated(await request<User>('/auth/me', 'PATCH', form));
            notify('Profile saved');
        } catch (err) {
            setError((err as Error).message)
        }
    };
    return <>
        <PageHeader eyebrow="MY PROFILE" title="Account details"
                    description={user.role === 'user' ? 'Your address is used to route deliveries to you. Only staff and your assigned volunteer see it.' : user.role === 'donor' ? 'Your address is the default pickup location for new donations. Recipients never see it.' : 'Your contact details.'}/>
        <form className="panel profile-form" onSubmit={save}>
            <div className="form-grid">
                <label>Full name<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
                <label>Email<input value={user.email} disabled/></label>
                <label>Area<select value={form.area} onChange={e => setForm({...form, area: e.target.value})}>{meta.areas.map(a => <option key={a}>{a}</option>)}</select></label>
                <label>Phone<input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/></label>
                {(user.role === 'user' || user.role === 'donor') && <label>Street address<input value={form.address} maxLength={200} placeholder="e.g. 615 Church St"
                                                                                                onChange={e => setForm({...form, address: e.target.value})}/>
                    <small className="hint">{user.address ? (user.geoPrecise ? 'Found on the map.' : 'Not found on the map; the area center is used.') : 'Without an address, routes use your area center.'}</small></label>}
            </div>
            <div className="modal-actions">
                <button className="primary">Save changes</button>
            </div>
        </form>
    </>
}
