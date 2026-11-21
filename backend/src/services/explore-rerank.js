// Explore re-ranking: a JavaScript port of the scoring and MMR re-ranking (maximal marginal
// relevance) for the Explore feed. Each candidate has `probs` (per-action likelihoods 0..1),
// `ageHours`, `authorId` and an `embedding` (number array) used for similarity.

const WEIGHTS = {
  watch_complete: 3.0,
  share: 2.5,
  save: 2.0,
  comment: 1.5,
  like: 1.0,
  not_interested: 5.0,
  quick_skip: 1.2,
};

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function scoreCandidate(probs, ageHours, weights = WEIGHTS, gamma = 0.35) {
  const positive = ['watch_complete', 'share', 'save', 'comment', 'like']
    .reduce((sum, k) => sum + weights[k] * (probs[k] || 0), 0);
  const negative = ['not_interested', 'quick_skip']
    .reduce((sum, k) => sum + weights[k] * (probs[k] || 0), 0);
  const decay = 1 / ((1 + Math.max(ageHours || 0, 0)) ** gamma);
  return (positive - negative) * decay;
}

function rerankExploreFeed(candidates, { topK = 24, lam = 0.75, authorPenalty = 0.25 } = {}) {
  for (const item of candidates) {
    item.baseScore = scoreCandidate(item.probs || {}, item.ageHours);
  }
  const selected = [];
  const remaining = [...candidates];
  const authorCounts = new Map();

  while (remaining.length && selected.length < topK) {
    let bestIndex = -1;
    let bestMmr = -Infinity;
    remaining.forEach((item, index) => {
      // Largest similarity to anything already selected (0 when nothing is selected yet).
      let maxSim = selected.length ? -Infinity : 0;
      for (const chosen of selected) {
        maxSim = Math.max(maxSim, cosineSimilarity(item.embedding, chosen.embedding));
      }
      const aPenalty = authorPenalty * (authorCounts.get(item.authorId) || 0);
      const mmr = lam * item.baseScore - (1 - lam) * maxSim - aPenalty;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    const [best] = remaining.splice(bestIndex, 1);
    selected.push(best);
    authorCounts.set(best.authorId, (authorCounts.get(best.authorId) || 0) + 1);
  }
  return selected;
}

module.exports = { cosineSimilarity, scoreCandidate, rerankExploreFeed, WEIGHTS };
