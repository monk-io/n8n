# @n8n/backend-network

The single home for n8n's backend outbound-network concerns.

## Why this package exists

Today network behavior is scattered across `packages/core` and several `@n8n/*` packages. 

This package consolidates into one place behind a single factory contract: 
SSRF/DNS guarding, proxy handling, and the HTTP client plumbing.
The eventual goal is to make backend network behavior reviewable and controllable from a single entry point.

## Using the factory

Backend code that needs to make an outbound HTTP request should obtain a client
from this package rather than importing an HTTP library directly. That way every
call inherits SSRF/DNS guarding and proxy handling from one place.

## The boundary rule

The `n8n-local-rules/no-uncentralized-http` ESLint rule enforces this.
It is on by default for every Node backend package.

## Requesting an exception

Two sanctioned escape hatches, depending on the shape of the exception:

**1. Inline disable — for a genuine one-off.** When a single callsite
legitimately cannot use the factory (a trusted, hardcoded endpoint), disable the
rule on the line with a justifying comment:

```ts
// eslint-disable-next-line n8n-local-rules/no-uncentralized-http -- <reason>
import axios from 'axios';
```

Always include the reason after `--`. 

**2. Central allow list — for scope exclusions and tracked debt.** For whole
packages that are out of scope, or callsites awaiting migration, add the file
path (a substring of the absolute path is enough) to the `allow` list in
[`packages/@n8n/eslint-config/src/configs/backend-network-boundary.ts`](../../@n8n/eslint-config/src/configs/backend-network-boundary.ts),
under the appropriate heading with a comment explaining why:

- **Permanent exception** — the callsite genuinely cannot use the factory
  (standalone tooling, a kept canonical helper). State the reason.
- **Pending migration** — the callsite will move onto the factory in its own
  ticket. Tag the entry with that ticket so it is deleted when the migration
  lands.

Keep the list shrinking: every entry is debt or a documented carve-out, not a default.
