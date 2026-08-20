// The one string the filing session and the reading task must agree on.
//
// A TITLE PREFIX, not a label. The session that files a verification runs at the
// end of a change, on any repo, and GitHub 422s an attempt to apply a label that
// does not exist yet — only the tick mints labels, and it mints the queue's own.
// A title needs nothing to exist first, and the issues collector passes it
// through: its filter hides `[claudinite-work]` items and `Claudinite tracker:`
// bodies, and this is neither.
export const VERIFY_TITLE_PREFIX = 'Verify in production:';

export const isVerificationIssue = (title) => (title ?? '').trimStart().startsWith(VERIFY_TITLE_PREFIX);
