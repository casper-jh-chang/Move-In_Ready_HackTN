import React, {useState} from 'react';
import {AlertTriangle, ArrowRight, Heart, Home, Package} from 'lucide-react';
import {request} from './api';
import type {Meta, User} from './types';

const DEMO = [
    {role: 'Admin', email: 'admin@demo.org'},
    {role: 'Volunteer', email: 'volunteer1@demo.org'},
    {role: 'Donor', email: 'donor1@demo.org'},
    {role: 'User', email: 'user1@demo.org'}
];

export default function Auth({meta, onAuth}: { meta: Meta | null, onAuth: (token: string, user: User) => void }) {
    const [mode, setMode] = useState<'login' | 'register'>('login'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [form, setForm] = useState({name: '', email: '', password: '', role: 'donor', area: 'Downtown', address: '', phone: ''});
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({...form, [k]: e.target.value});
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const r = await request<{ token: string, user: User }>(mode === 'login' ? '/auth/login' : '/auth/register', 'POST', form);
            onAuth(r.token, r.user);
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setBusy(false)
        }
    };
    return <div className="auth-page">
        <div className="auth-hero">
            <div className="brand"><span className="brand-icon"><Home size={22} strokeWidth={2.5}/></span><span><strong>move-in<span
                className="green"> ready</span></strong><small>COMMUNITY OPERATIONS</small></span></div>
            <h1>Good things deserve<br/><em>a second home.</em></h1>
            <p>Donors offer furniture, admins review it, volunteers move it, and neighbors moving in after homelessness
                receive it.</p>
            <div className="auth-roles">
                <span><Package size={15}/> Donors give furniture</span>
                <span><Heart size={15}/> Users request what they need</span>
            </div>
        </div>
        <form className="auth-card" onSubmit={submit}>
            <div className="auth-tabs">
                <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
                <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
            </div>
            {error && <div className="error"><AlertTriangle size={17}/>{error}</div>}
            <div className="form-grid single">
                {mode === 'register' && <>
                    <label>I want to
                        <select value={form.role} onChange={set('role')}>
                            <option value="donor">Donate furniture (donor)</option>
                            <option value="user">Receive furniture (user)</option>
                        </select></label>
                    <label>Full name *<input required value={form.name} onChange={set('name')}/></label>
                </>}
                <label>Email *<input required type="email" autoComplete="email" value={form.email} onChange={set('email')}/></label>
                <label>Password *<input required type="password" minLength={mode === 'register' ? 8 : undefined}
                                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                        value={form.password} onChange={set('password')}/></label>
                {mode === 'register' && <>
                    <label>Area in Nashville
                        <select value={form.area} onChange={set('area')}>{(meta?.areas || []).map(a => <option key={a}>{a}</option>)}</select></label>
                    <label>Street address (optional)<input value={form.address} maxLength={200} placeholder="Used for pickups / deliveries" onChange={set('address')}/></label>
                    <label>Phone (optional)<input value={form.phone} onChange={set('phone')}/></label>
                    <small className="hint">Volunteer and admin accounts are created by an admin.</small>
                </>}
            </div>
            <button className="primary wide" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button>
            {mode === 'login' && <div className="demo-accounts">
                <span>Demo accounts (password <b>demo1234</b>)</span>
                <div>{DEMO.map(d => <button type="button" key={d.email} onClick={() => setForm({...form, email: d.email, password: 'demo1234'})}>{d.role}</button>)}</div>
            </div>}
        </form>
    </div>
}
