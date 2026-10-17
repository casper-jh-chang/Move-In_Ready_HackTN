// Synthetic demo data. Every demo account uses the password below.
const DEMO_PASSWORD = 'demo1234';

const users = [
    {key: 'admin', name: 'Avery Admin', email: 'admin@demo.org', role: 'admin', area: 'Downtown'},
    {key: 'vol1', name: 'Victor Volunteer', email: 'volunteer1@demo.org', role: 'volunteer', area: 'East Nashville'},
    {key: 'vol2', name: 'Vera Volunteer', email: 'volunteer2@demo.org', role: 'volunteer', area: 'Berry Hill'},
    {key: 'maya', name: 'Maya L.', email: 'donor1@demo.org', role: 'donor', area: 'East Nashville'},
    {key: 'daniel', name: 'Daniel K.', email: 'donor2@demo.org', role: 'donor', area: 'The Nations'},
    {key: 'jules', name: 'Jules P.', email: 'donor3@demo.org', role: 'donor', area: '12 South'},
    {key: 'rosa', name: 'Rosa M.', email: 'user1@demo.org', role: 'user', area: 'Antioch'},
    {key: 'sam', name: 'Sam T.', email: 'user2@demo.org', role: 'user', area: 'Madison'}
];

const furniture = [
    {key: 'table', donor: 'maya', name: 'Oak dining table', category: 'Dining table', condition: 'Good', status: 'approved', inventory: 'in_stock', area: 'East Nashville', dimensions: '60 × 36 in', notes: 'Seats four. Light surface wear.', weight: 35},
    {key: 'chairs', donor: 'maya', name: 'Set of two wooden chairs', category: 'Chair', condition: 'Good', status: 'approved', inventory: 'pledged', area: 'East Nashville', dimensions: '18 × 20 in', notes: 'Matches the oak table.', weight: 10},
    {key: 'sofa', donor: 'daniel', name: 'Blue fabric sofa', category: 'Sofa', condition: 'Good', status: 'approved', inventory: 'in_stock', area: 'The Nations', dimensions: '78 × 34 in', notes: 'Clean, no pets.', weight: 55},
    {key: 'bed', donor: 'daniel', name: 'Twin bed frame', category: 'Bed frame', condition: 'Good', status: 'approved', inventory: 'pledged', area: 'The Nations', dimensions: 'Twin', notes: 'Frame only. Mattress not included.', weight: 25},
    {key: 'mattress', donor: 'jules', name: 'Used mattress', category: 'Mattress', condition: 'Unknown', status: 'rejected', inventory: 'rejected', area: '12 South', dimensions: 'Queen', notes: 'Used mattresses are not accepted.', weight: 30, reason: 'Used mattresses are excluded by the acceptance policy.'},
    {key: 'nightstand', donor: 'jules', name: 'Walnut nightstand', category: 'Nightstand', condition: 'Good', status: 'pending', inventory: 'pledged', area: '12 South', dimensions: '20 × 18 in', notes: 'Small scratch on top.', weight: 12},
    {key: 'dresser', donor: 'maya', name: 'Six-drawer dresser', category: 'Dresser', condition: 'Fair', status: 'pending', inventory: 'pledged', area: 'East Nashville', dimensions: '58 × 18 × 32 in', notes: 'One drawer sticks a little.', weight: 45}
];

const requests = [
    {user: 'rosa', item: 'table', message: 'Family of three moving in on Oct 23. Second-floor unit.', status: 'pending'},
    {user: 'sam', item: 'sofa', message: 'Ground-floor apartment, moving in Oct 26.', status: 'approved'}
];

const tasks = [
    {item: 'chairs', volunteer: 'vol1', type: 'pickup'},
    {item: 'sofa', volunteer: 'vol2', type: 'delivery', request: 'sofa'}
];

module.exports = {DEMO_PASSWORD, users, furniture, requests, tasks};
