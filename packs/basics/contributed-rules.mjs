import { contributedBarrierRules } from './barriers.mjs';

// The seam interpreting other active packs' `contributes` as rules of this one: each
// fixed barrier a pack carries as manifest data becomes a first-class rule. Composition
// is declaration plus configuration, never a code import (pack-independence).
export default (activePacks) => contributedBarrierRules(activePacks);
