// The deployment's settings, out of the member's own declaration — the
// `claudinite-dashboard` entry's `config` in `.claudinite-settings.json`.
//
// One reader, because two things now need the same facts and must never disagree
// about where they live: the site build (which bakes `clientId`/`exchangeUrl` into
// the page's own config) and the deploy-oauth-exchange task (which mints the URL
// that `exchangeUrl` names). A second copy would let a deployment configure the
// button in one place and the endpoint in another.
//
// Every key is optional and an unset one means the default, never a
// misconfiguration — a declaration with no `config` at all is an ordinary
// deployment, so this returns `{}` rather than failing.
import { readFile } from 'node:fs/promises';
import { settingsPath } from '../../engine/settings-file.mjs';

export const PACK_ID = 'claudinite-dashboard';

export async function declaredConfig(repoRoot) {
  let decl = null;
  try {
    decl = JSON.parse(await readFile(settingsPath(repoRoot), 'utf8'));
  } catch {
    return {};
  }
  const entry = (decl?.packs ?? []).find((p) => (typeof p === 'string' ? p : p?.id) === PACK_ID);
  return (typeof entry === 'object' && entry?.config) || {};
}
