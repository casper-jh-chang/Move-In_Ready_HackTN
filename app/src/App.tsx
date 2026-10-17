import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Heart, Home, LayoutDashboard, LogOut, Menu, Navigation, Package, Search, Send, Truck, UserCog, UserRound, X} from 'lucide-react';
import {Ctx, getToken, request, setToken, setUnauthorizedHandler} from './api';
import Auth from './Auth';
import {initials, label} from './ui';
import type {Meta, Role, User} from './types';
import {Overview, ImpactPage, Profile} from './pages/Shared';
import {MyDonations} from './pages/Donor';
import {Browse, MyRequests} from './pages/Recipient';
import {MyTasks, RoutePlanner} from './pages/Volunteer';
import {DonationReview, RequestsAdmin, TasksAdmin, UsersAdmin} from './pages/Admin';

type NavItem = { id: string, text: string, icon: React.ElementType };

// What each role can see. The server enforces the same rules on every API call.
const NAV: Record<Role, NavItem[]> = {
    admin: [
        {id: 'overview', text: 'Overview', icon: LayoutDashboard},
        {id: 'donations', text: 'Donation review', icon: Package},
        {id: 'requests', text: 'Requests', icon: Send},
        {id: 'tasks', text: 'Volunteer tasks', icon: ClipboardList},
        {id: 'routes', text: 'Route planner', icon: Truck},
        {id: 'users', text: 'Users & roles', icon: UserCog},
        {id: 'impact', text: 'Community impact', icon: Heart}
    ],
    volunteer: [
        {id: 'overview', text: 'Overview', icon: LayoutDashboard},
        {id: 'tasks', text: 'My tasks', icon: ClipboardList},
        {id: 'routes', text: 'My route', icon: Navigation},
        {id: 'impact', text: 'Community impact', icon: Heart},
        {id: 'profile', text: 'Profile', icon: UserRound}
    ],
    donor: [
        {id: 'overview', text: 'Overview', icon: LayoutDashboard},
        {id: 'donations', text: 'My donations', icon: Package},
        {id: 'impact', text: 'Community impact', icon: Heart},
        {id: 'profile', text: 'Profile', icon: UserRound}
    ],
    user: [
        {id: 'overview', text: 'Overview', icon: LayoutDashboard},
        {id: 'browse', text: 'Browse furniture', icon: Search},
        {id: 'requests', text: 'My requests', icon: Send},
        {id: 'impact', text: 'Community impact', icon: Heart},
        {id: 'profile', text: 'Profile', icon: UserRound}
    ]
};

function Page({role, tab, onProfile}: { role: Role, tab: string, onProfile: (u: User) => void }) {
    if (tab === 'overview') return <Overview/>;
    if (tab === 'impact') return <ImpactPage/>;
    if (tab === 'profile') return <Profile onUpdated={onProfile}/>;
    if (tab === 'routes') return <RoutePlanner mine={role === 'volunteer'}/>;
    if (role === 'admin') return tab === 'donations' ? <DonationReview/> : tab === 'requests' ? <RequestsAdmin/> : tab === 'tasks' ? <TasksAdmin/> : <UsersAdmin/>;
    if (role === 'volunteer') return <MyTasks/>;
    if (role === 'donor') return <MyDonations/>;
    return tab === 'requests' ? <MyRequests/> : <Browse/>;
}

function App() {
    const [user, setUser] = useState<User | null>(null), [meta, setMeta] = useState<Meta | null>(null), [booting, setBooting] = useState(true);
    const [tab, setTab] = useState('overview'), [mobile, setMobile] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
    const signOut = useCallback(() => {
        setToken(null);
        setUser(null);
        setTab('overview');
    }, []);
    useEffect(() => {
        setUnauthorizedHandler(signOut);
        request<Meta>('/meta').then(setMeta).catch(e => setError(e.message));
        if (!getToken()) return setBooting(false);
        request<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
    }, [signOut]);
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(''), 3500);
        return () => clearTimeout(t);
    }, [toast]);
    const go = useCallback((id: string) => {
        setTab(id);
        setMobile(false);
        setError('');
    }, []);
    const ctx = useMemo(() => user && meta ? {user, meta, setError, notify: setToast, go} : null, [user, meta, go]);

    if (booting) return <div className="loading">Loading community workspace...</div>;
    if (!user || !ctx) return <Auth meta={meta} onAuth={(token, u) => {
        setToken(token);
        setUser(u);
        setTab('overview');
    }}/>;

    const nav = NAV[user.role];
    const logout = async () => {
        try {
            await request('/auth/logout', 'POST', {})
        } catch {
            // Session may already be gone; sign out locally regardless.
        }
        signOut();
    };
    return <Ctx.Provider value={ctx}>
        <div className="shell">
            <aside className={'sidebar ' + (mobile ? 'mobile-open' : '')}>
                <div className="brand"><span className="brand-icon"><Home size={22} strokeWidth={2.5}/></span><span><strong>move-in<span
                    className="green"> ready</span></strong><small>COMMUNITY OPERATIONS</small></span></div>
                <div className="workspace">{label(user.role).toUpperCase()} WORKSPACE</div>
                <nav>{nav.map(n => <button key={n.id} className={'nav-item ' + (tab === n.id ? 'active' : '')} onClick={() => go(n.id)}>
                    <n.icon size={18}/>{n.text}{tab === n.id && <ChevronRight size={15} className="push"/>}</button>)}</nav>
                <div className="sidebar-bottom">
                    <div className="mission-card"><span className="mission-emoji">✦</span><strong>Every home deserves a beginning.</strong>
                        <p>Making donated furniture go further, together.</p></div>
                    <div className="demo-label"><span className="online-dot"/> DEMO WORKSPACE <span className="small-grey">· Nashville, TN</span></div>
                </div>
            </aside>
            {mobile && <div className="scrim" onClick={() => setMobile(false)}/>}
            <main className="main">
                <header className="topbar">
                    <button className="iconbtn mobile-menu" onClick={() => setMobile(true)} aria-label="Open menu"><Menu size={22}/></button>
                    <span className="breadcrumb">{label(user.role)} <ChevronRight size={14}/> <b>{nav.find(n => n.id === tab)?.text}</b></span>
                    <div className="top-actions">
                        <span className={'role-pill ' + user.role}>{label(user.role)}</span>
                        <span className="user-name">{user.name}</span>
                        <button className="avatar" title="Profile" onClick={() => go(user.role === 'admin' ? 'users' : 'profile')}>{initials(user.name)}</button>
                        <button className="iconbtn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={19}/></button>
                    </div>
                </header>
                <div className="content">
                    {error && <div className="error"><AlertTriangle size={17}/>{error}
                        <button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button>
                    </div>}
                    <Page key={tab} role={user.role} tab={nav.some(n => n.id === tab) ? tab : 'overview'} onProfile={setUser}/>
                </div>
                <footer className="footer"><span>Move-In Ready · Hackathon prototype · Not affiliated with House2Home · Synthetic data only</span><span>Made for stronger communities <Heart
                    size={13}/></span></footer>
            </main>
            {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
        </div>
    </Ctx.Provider>
}

export default App;
