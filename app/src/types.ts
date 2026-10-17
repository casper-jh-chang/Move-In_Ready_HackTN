export type Role = 'admin' | 'volunteer' | 'donor' | 'user';

export type User = {
    id: number,
    name: string,
    email: string,
    role: Role,
    phone?: string | null,
    area?: string | null,
    active: boolean,
    createdAt?: string,
    donations?: number,
    requests?: number,
    openTasks?: number
};

export type Furniture = {
    id: number,
    donorId: number,
    donorName?: string,
    donorEmail?: string,
    name: string,
    category: string,
    condition: string,
    dimensions: string,
    weight: number,
    location: string,
    lat: number,
    lng: number,
    notes: string,
    photo?: string | null,
    status: 'pending' | 'approved' | 'rejected',
    inventoryStatus: 'pledged' | 'in_stock' | 'delivered' | 'rejected',
    screening: { flags: string[] },
    visionResult: unknown,
    reviewReason?: string | null,
    reviewedAt?: string | null,
    createdAt: string,
    pickupTask?: { id: number, volunteerName: string } | null,
    pendingRequests?: number,
    myRequest?: string | null
};

export type FurnitureRequest = {
    id: number,
    userId: number,
    userName: string,
    userArea?: string | null,
    furnitureId: number,
    furnitureName: string,
    category: string,
    furnitureStatus: Furniture['inventoryStatus'],
    message: string,
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'fulfilled',
    decisionNote?: string | null,
    decidedAt?: string | null,
    createdAt: string,
    deliveryTask: { id: number, volunteerName: string, status: string } | null
};

export type Task = {
    id: number,
    type: 'pickup' | 'delivery',
    status: 'assigned' | 'completed' | 'cancelled',
    furnitureId: number,
    furnitureName: string,
    category: string,
    weight: number,
    requestId: number | null,
    volunteerId: number,
    volunteerName: string,
    scheduledFor: string | null,
    notes: string,
    completedAt: string | null,
    createdAt: string,
    contactName: string | null,
    contactPhone: string | null,
    area: string | null,
    lat: number,
    lng: number
};

export type Routes = {
    depot: { lat: number, lng: number, name: string },
    trucks: {
        name: string,
        stops: { id: number, label: string, kind: string, area: string, lat: number, lng: number }[],
        distanceKm: number
    }[],
    optimizedKm: number,
    baselineKm: number,
    savingsPct: number,
    method: string
};

export type Stats = Record<string, number | string>;
export type Impact = {
    delivered: number,
    kgDelivered: number,
    kgInPipeline: number,
    householdsServed: number,
    donors: number,
    volunteers: number,
    tripsCompleted: number
};
export type Activity = { id: number, text: string, actor: string | null, date: string };
export type Meta = { categories: string[], areas: string[] };
