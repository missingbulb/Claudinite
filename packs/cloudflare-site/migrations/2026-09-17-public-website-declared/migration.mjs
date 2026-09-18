// The version scheme and the page stamp left this pack for public-website, and the
// release now advances the version only where THAT pack is declared. A member that
// adopted cloudflare-site when it still carried the scheme keeps its versioning
// through this record: every repo declaring cloudflare-site is made to declare
// public-website too, once, so no release goes out unversioned because a pack moved.
//
// SEED, NEVER OVERRIDE (the `declarePacks` op's contract): a member already declaring
// public-website is untouched, and a member that later undeclares it is making the
// unversioned choice on purpose — the record only ever adds.
//
// legacyPresent: a member declares cloudflare-site and not public-website. A repo with
// no declaration is not a member and is not this record's business; a member that
// declares neither, or both, has converged as far as this record is concerned.
const DECLARATIONS = ['.claudinite-settings.json', '.claudinite-checks.json'];

async function declaredPacks(read) {
  const raw = (await read(DECLARATIONS[0])) ?? await read(DECLARATIONS[1]);
  if (raw == null) return null;
  try {
    const { packs } = JSON.parse(raw);
    return Array.isArray(packs) ? packs.map((e) => (typeof e === 'string' ? e : e?.id)) : null;
  } catch {
    return null; // unparsable settings are the world runner's finding, not this record's
  }
}

export default {
  id: 'cloudflare-site-keeps-its-version',
  landed: '2026-09-17',
  version: 1,
  summary: 'a repo serving from Cloudflare declares public-website, which now owns the version its release advances',

  appliesTo: async (read) => (await declaredPacks(read))?.includes('cloudflare-site') === true,

  declarePacks: [{ id: 'public-website' }],

  legacyPresent: async (exists, read) => {
    const packs = await declaredPacks(read);
    return packs !== null && packs.includes('cloudflare-site') && !packs.includes('public-website');
  },
};
