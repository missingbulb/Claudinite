# AWS SAM (Serverless Application Model)

- **Review the change set before applying — `Replacement: True` on a stateful resource is a
  data-loss hard stop.** Replacement creates a *new, empty* resource; a DynamoDB table shows it
  whenever an immutable property (its `KeySchema`/`AttributeDefinitions`) changes. Enable stack
  **termination protection** too — it's a one-time CLI/API call (`update-termination-protection`),
  not expressible in the template body.

- **A custom request header turns even a public GET into a preflighted CORS request.** Any
  non-simple header (e.g. a client-version header) makes the browser send an `OPTIONS` preflight, so
  the API's CORS `AllowHeaders` must list that header or the real request is blocked *in the
  browser* — while server-side unit tests that never run the CORS layer stay green.

- **Reach AWS from a session with the AWS CLI or a boto3 script — there is no AWS MCP tool.** A
  stack's real state comes from a CLI call (`aws cloudformation describe-stacks …`) — the last
  green deploy workflow only reports the last *deploy*, not the current stack state. The CLI is
  **not pre-installed on the cloud/web runner** (nor `boto3`/`sam`), so declare its install in
  the **environment setup script** (`pip install awscli`, or the official bundle) rather than
  per session; point it at the sandbox proxy's CA bundle (`AWS_CA_BUNDLE`) if a call fails TLS
  verification.
