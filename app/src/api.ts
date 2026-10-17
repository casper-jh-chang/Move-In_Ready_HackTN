import {createContext, useCallback, useContext, useEffect, useState} from 'react';
import type {Meta, User} from './types';

const API = '/api';
const TOKEN_KEY = 'moveInReadyToken';

export const getToken = () => {
    try {
        return localStorage.getItem(TOKEN_KEY)
    } catch {
        return null
    }
};
export const setToken = (token: string | null) => {
    try {
        token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)
    } catch {
        // Storage unavailable (private mode); session lasts until reload.
    }
};

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message)
    }
}

let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => {
    onUnauthorized = fn
};

export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const token = getToken();
    const r = await fetch(API + url, {
        method,
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && token) onUnauthorized();
    if (!r.ok) throw new ApiError(data.error || 'Request failed', r.status);
    return data
}

// Multipart upload (the JSON helper above can't carry a video file).
export async function upload<T>(url: string, form: FormData): Promise<T> {
    const token = getToken();
    const r = await fetch(API + url, {method: 'POST', headers: token ? {Authorization: 'Bearer ' + token} : {}, body: form});
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && token) onUnauthorized();
    if (!r.ok) throw new ApiError(data.error || 'Upload failed', r.status);
    return data
}

export type AppContext = {
    user: User,
    meta: Meta,
    setError: (message: string) => void,
    notify: (message: string) => void,
    go: (tab: string) => void
};
export const Ctx = createContext<AppContext>(null as unknown as AppContext);
export const useApp = () => useContext(Ctx);

// Loads `url` on mount and whenever it changes; `reload` refetches.
export function useLoad<T>(url: string | null) {
    const {setError} = useApp();
    const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true);
    const reload = useCallback(async () => {
        if (!url) return;
        try {
            setData(await request<T>(url))
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }, [url, setError]);
    useEffect(() => {
        reload()
    }, [reload]);
    return {data, loading, reload};
}

// Runs a mutation, shows a toast on success and refreshes the given loaders.
export function useAction() {
    const {setError, notify} = useApp();
    const [busy, setBusy] = useState(false);
    const run = async (url: string, method: string, body: unknown, success?: string, ...after: (() => unknown)[]) => {
        setBusy(true);
        try {
            const result = await request(url, method, body);
            if (success) notify(success);
            await Promise.all(after.map(f => f()));
            return result;
        } catch (e) {
            setError((e as Error).message);
            return null;
        } finally {
            setBusy(false)
        }
    };
    return {run, busy};
}
