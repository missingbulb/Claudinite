---
name: sam-deploy
description: Running or debugging `sam deploy` — the deploy role's transform and CloudFront grants, the new-account CloudFront verification gate, and cleaning up a failed first CREATE before retrying. Use when a SAM deploy fails or a deploy principal is being set up.
---

# Running `sam deploy`

- **A deploy role must be able to drive the transform and CloudFront, or change-set creation fails
  with the real reason hidden.** The `Serverless-2016-10-31` transform runs as a macro, so the
  deploy principal needs `cloudformation:*`, and CloudFront management needs `cloudfront:*`, both at
  `Resource: "*"` (scope the *data-plane* grants to your stack instead). `sam deploy` surfaces only
  `Waiter ChangeSetCreateComplete failed` — the actual `AccessDenied` is visible only in the
  CloudFormation console's **Change sets** tab. Don't paper over it with `AdministratorAccess`.

- **A brand-new AWS account can't create a CloudFront distribution until AWS verifies it.** The
  deploy fails `AccessDenied: Your account must be verified before you can add new CloudFront
  resources` — an account-level anti-abuse gate, not an IAM or template bug. Open a Support case to
  get the account verified, and launch against the origin URL directly meanwhile.

- **A failed first `CREATE` must be cleaned up before you retry.** A stack left in
  `ROLLBACK_COMPLETE` (and a SAM managed-bucket stack stuck in `REVIEW_IN_PROGRESS`) can only be
  *deleted*, never updated. And any resource with `DeletionPolicy: Retain` survives the rollback
  orphaned, so the retry then fails `already exists` until you delete the orphan too.
