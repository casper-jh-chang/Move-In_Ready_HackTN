// Vision model placeholder — intentionally left blank for the team to implement.
//
// Contract the rest of the app expects:
//   analyzePhoto({photo, category, notes}) -> Promise<null | {
//       category?: string, visibleCondition?: string, visibleIssues?: string[],
//       recommendation: 'review' | 'reject', explanation?: string
//   }>
//   - `photo` is a data URL (image/png, image/jpeg or image/webp).
//   - Return null while the model is not configured.
//   - Never auto-approve: an admin always makes the final decision.
//   - The result can be stored in furniture.vision_result (TEXT, JSON-encoded).

const isConfigured = () => false;

async function analyzePhoto() {
    // TODO: call the vision model here.
    return null;
}

module.exports = {isConfigured, analyzePhoto};
