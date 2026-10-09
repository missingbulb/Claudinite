// `.claudinite/flat/` - every file a converge derives from the declared packs, in one
// place: the rules and skills indexes, and the task declarations and dashboard
// descriptors flattened into one file each. A reader (a session, the dashboard reading
// a member over the API) takes one file where it used to walk every pack.
//
// Written by a converge, which bootstrap, the update flows and pack adoption all run;
// never by a session and never by hand.
import { join } from 'node:path';

export const FLAT_DIR = join('.claudinite', 'flat');

