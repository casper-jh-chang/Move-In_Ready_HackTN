// Shared reference data: furniture categories, acceptance rules and illustrative Nashville area coordinates.
const categories = ['Dining table', 'Sofa', 'Bed frame', 'Nightstand', 'Dresser', 'Chair', 'Desk', 'Bookshelf', 'Other', 'Mattress', 'Sofa bed', 'Appliance'];
const blocked = ['Mattress', 'Sofa bed', 'Appliance'];

const areas = {
    'Downtown': [36.162, -86.781],
    'East Nashville': [36.182, -86.747],
    'The Nations': [36.161, -86.859],
    'Berry Hill': [36.116, -86.770],
    'Germantown': [36.178, -86.790],
    '12 South': [36.126, -86.791],
    'Antioch': [36.060, -86.670],
    'Madison': [36.252, -86.714],
    'South Nashville': [36.100, -86.745],
    'Green Hills': [36.105, -86.815],
    'Bellevue': [36.075, -86.930],
    'Donelson': [36.170, -86.665],
    'Hermitage': [36.196, -86.623],
    'North Nashville': [36.190, -86.820]
};
const depot = {lat: 36.162, lng: -86.781, name: 'Demo depot (central Nashville)'};

const coordsFor = (area) => {
    const c = areas[area];
    return c ? {lat: c[0], lng: c[1]} : {lat: depot.lat, lng: depot.lng};
};

// Rule-based pre-screening only. The vision model is handled separately (see vision.cjs).
function screening(d) {
    const flags = [];
    if (blocked.includes(d.category)) flags.push('Category excluded by acceptance policy');
    if (/stain|tear|broken|pet damage|mold|bed ?bug/i.test(d.notes || '')) flags.push('Condition needs review: damage or stain reported');
    if (!d.photo) flags.push('No photo supplied; ask the donor for photos');
    return {
        recommendation: flags.some(x => x.includes('excluded')) ? 'reject' : 'review',
        flags,
        source: 'Rule-based screening. Admin approval is always required.'
    };
}

module.exports = {categories, blocked, areas, depot, coordsFor, screening};
