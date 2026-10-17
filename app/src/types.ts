export type Role = 'admin' | 'volunteer' | 'donor' | 'user';

export type User = {
    id: number,
    name: string,
    email: string,
    role: Role,
    phone?: string | null,
    area?: string | null,
    address?: string | null,
    geoPrecise?: boolean,
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
    address?: string | null,
    geoPrecise?: boolean,
    lat: number,
    lng: number,
    notes: string,
    photo?: string | null,
    status: 'pending' | 'approved' | 'rejected',
    inventoryStatus: 'pledged' | 'in_stock' | 'delivered' | 'rejected',
    screening: { flags: string[] },
    // Photo-only donations: OCI photo scan. Video donations: video intake result.
    visionResult: PhotoScanResult | VisionResult | null,
    reviewReason?: string | null,
    reviewedAt?: string | null,
    createdAt: string,
    pickupTask?: { id: number, volunteerName: string } | null,
    pendingRequests?: number,
    myRequest?: string | null
};

// OCI photo scan stored on photo-only donations (see server/photo-scan.cjs).
export type PhotoScanResult =
    | { status: 'scanning' }
    | { status: 'error', error: string, scannedAt: string }
    | {
    status: 'done',
    category: string,
    matchesCategory: boolean,
    visibleCondition: 'Like new' | 'Good' | 'Fair' | 'Poor' | 'Unclear',
    visibleIssues: string[],
    summary: string,
    recommendation: 'review' | 'reject',
    explanation: string,
    labels: { name: string, confidence: number }[],
    model: string,
    scannedAt: string,
    warnings: string[]
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
    address: string | null,
    geoPrecise: boolean,
    lat: number,
    lng: number
};

export type RouteStop = {
    id: number,
    label: string,
    kind: 'pickup' | 'delivery',
    area: string | null,
    address: string | null,
    precise: boolean,
    contact: string | null,
    lat: number,
    lng: number,
    legKm: number,
    legMin: number
};

export type Routes = {
    depot: { lat: number, lng: number, name: string },
    trucks: {
        name: string,
        stops: RouteStop[],
        returnKm: number,
        distanceKm: number,
        durationMin: number,
        geometry: [number, number][],
        navigationUrl: string
    }[],
    optimizedKm: number,
    baselineKm: number,
    savingsPct: number,
    totalMin: number,
    provider: 'osrm' | 'straight-line',
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
export type Meta = { categories: string[], areas: string[], visionConfigured?: boolean };

// ---------- Video intake (server/vision.cjs, ../vision-service) ----------
export type AiOutcome = 'accept' | 'review' | 'decline';
export type RuleHit = { rule_id: string, outcome: AiOutcome, reason: string, alternative: string };
export type Defect = {
    type: string,
    severity: 'minor' | 'moderate' | 'severe',
    location: string,
    evidence: 'visual' | 'spoken' | 'both',
    timestamp_s: number | null,
    note: string
};
export type DefectFrame = { defectIndex: number, t: number, url: string };

// Stored in furniture.vision_result for items donated through a video.
export type VisionResult = {
    source: 'video',
    intakeId: string,
    itemIndex: number,
    provider: string,
    analyzedAt: string,
    outcome: AiOutcome,
    hits: RuleHit[],
    title: string,
    category: string,
    conditionGrade: string,
    conditionScore: number,
    isSleeper: boolean | null,
    defects: Defect[],
    viewsCovered: string[],
    confidence: number,
    evidence: string,
    videoUrl: string,
    photoUrl: string,
    defectFrames: DefectFrame[],
    summary: string,
    inconsistencies: string[],
    transcript: string
};

export type VideoAnalysis = {
    id: string,
    provider: string,
    mode: string,
    duration: number,
    transcript: string,
    videoUrl: string,
    frames: { url: string, t: number }[],
    summary: string,
    inconsistencies: string[],
    retakeSuggestions: string[],
    items: {
        index: number,
        item: {
            title: string, category: string, quantity: number, condition_grade: string, condition_score: number,
            defects: Defect[], views_covered: string[], confidence: number, evidence: string, is_sleeper: boolean | null
        },
        decision: { outcome: AiOutcome, hits: RuleHit[], est_weight_lbs: number },
        photoUrl: string,
        defectFrames: DefectFrame[],
        suggested: { name: string, category: string, dimensions: string, weight: number, notes: string, photo: string }
    }[]
};

export type VisionStatus = {
    available: boolean,
    error?: string,
    provider?: string,
    model?: string,
    maxVideoSeconds?: number,
    missingTools?: string[]
};
