// MARKING A MEMBER'S WORK-LIST ISSUE (protocol.mjs's `MARK`, tasks-dispatch DESIGN
// §16.12). The enforcer's two halves — the weekly scan and the hand-forced request
// — each converge one issue per member, and both hand it here: the issue carries
// the mark, its body names the member task in a `Task:` field, and the member's own
// hourly scheduler run adopts it. Nothing dispatches a wake for it any more.
//
// Three things this owns that neither caller should re-derive:
//
//  - THE LABEL EXISTS FIRST. Applying a label GitHub does not know 422s, and a
//    refused mark is a work list nobody ever runs — so the mark is created in the
//    member before it is applied, from the engine's own definition of it rather
//    than a second copy of its colour and prose.
//  - THE MACHINE BLOCK SURVIVES A REWRITE. A repeated force rewrites the body; once
//    the member has adopted the issue, part of that body is the machine's (the
//    block adoption appended). Rewriting the human half and re-attaching the block
//    is what keeps a re-forced ask from erasing the item it is asking for.
//  - A CHANGED ASK RE-ASKS. Clearing the status is the one re-ask lever (§16.3), so
//    a body that actually changed clears whatever status stands — a parked or
//    finished run of the OLD list must not be what silences the new one.
import { ensureLabel } from '../../fleet-api.mjs';
import {
  ORIGIN_AD_HOC, QUEUE_LABELS, statusOf, spellingsOf, machineBlockOf, withMachineBlock,
} from '../../../../engine/scheduler/queue/work-item.mjs';
import { MARK, withTargeting } from './protocol.mjs';

// The engine's own definition of the mark — never a second copy of its colour and
// description, which would drift the moment either side is edited.
const MARK_LABEL = QUEUE_LABELS.find((l) => l.name === ORIGIN_AD_HOC);

export async function ensureMark(gh, fullName) {
  await ensureLabel(gh, fullName, MARK, { color: MARK_LABEL.color, description: MARK_LABEL.description });
}

// The body to write for a work list: the targeting fields, the caller's list, and —
// where the member has already adopted this issue — the machine block it wrote,
// re-attached unchanged.
export const markedBody = (body, existing = null, { blockedBy = null } = {}) => {
  const block = existing ? machineBlockOf(existing.body) : null;
  const human = withTargeting(body, { blockedBy });
  return block === null ? human : withMachineBlock(human, block);
};

// Bring an EXISTING work-list issue to the marked shape: the mark applied (an issue
// opened before this fold has none), the body rewritten only where it differs, and
// the status cleared when it did — the re-ask. Returns whether anything was written.
export async function remarkWorkList(gh, fullName, existing, body) {
  await ensureMark(gh, fullName);
  const labels = (existing.labels ?? []).map((l) => l.name ?? l);
  if (!labels.includes(MARK)) {
    await gh(`/repos/${fullName}/issues/${existing.number}/labels`, { method: 'POST', body: { labels: [MARK] } });
  }
  if (existing.body === body) return false;
  await gh(`/repos/${fullName}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
  const status = statusOf({ labels });
  if (status) {
    for (const spelling of spellingsOf(status)) {
      await gh(`/repos/${fullName}/issues/${existing.number}/labels/${encodeURIComponent(spelling)}`, { method: 'DELETE' });
    }
  }
  return true;
};

// The member's other open work list, if it has one — what a newly marked list waits
// on, so two lists in one member run one after the other rather than putting two
// sessions on one declaration.
export const otherOpenWorkList = (open, title) => open.find((i) => i.title !== title)?.number ?? null;
