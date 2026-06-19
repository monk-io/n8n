import tseslint from 'typescript-eslint';

/**
 * Backend network boundary — CAT-3380.
 *
 * Backend outbound HTTP must go through the `@n8n/backend-network` factory so
 * SSRF/DNS guarding and proxy handling stay centrally controlled. This turns on
 * `n8n-local-rules/no-uncentralized-http` for every Node backend package (it is
 * part of `nodeConfig`).
 *
 * Out of natural scope:
 * - Frontend packages use `frontendConfig` (built on `baseConfig`, not
 *   `nodeConfig`), so the rule is never enabled there.
 * - `@n8n/backend-network` itself and `@n8n/client-oauth2` use `baseConfig`
 *   directly, so they are exempt without an entry here.
 *
 * The `allow` list below is the single, reviewed home for exceptions. It is
 * matched against the absolute file path (substring), because lint runs
 * per-package and config `files` globs cannot reference a package name.
 *
 * To request a new exception, see
 * `packages/@n8n/backend-network/README.md` ("Requesting an exception").
 */

/**
 * Whole packages and individual files exempt from the rule. Grouped by reason so
 * the temporary debt (which shrinks as migrations land) is obvious at a glance.
 */
const allow = [
	// ---- Out of scope: node packages use the execution-engine request path, ----
	// ---- not the backend service factory (CAT-3380 scope decision).          ----
	'packages/nodes-base/',
	'packages/@n8n/nodes-langchain/',

	// ---- Permanent exceptions ----
	// Standalone load-test CLI; talks to n8n's own API and doesn't depend on the factory.
	'packages/@n8n/benchmark/',
	// Canonical task-runner proxy helper. CAT-3379 deliberately keeps it.
	'packages/@n8n/ai-utilities/src/utils/http-proxy-agent.ts',

	// ---- Pending migration (delete each entry when its callsite moves onto the
	// ---- factory). Service-layer migrations are tracked under the epic CAT-3365.
	// CAT-3373 — migrate OAuth service callsites onto the factory.
	'packages/cli/src/oauth/oauth.service.ts',
	// Remaining cli service callsites, to migrate as their slices land (see CAT-3365).
	'packages/cli/src/license/license.service.ts',
	'packages/cli/src/telemetry/index.ts',
	'packages/cli/src/utils/strapi-utils.ts',
	'packages/cli/src/workflows/workflows.controller.ts',
	'packages/cli/src/security-audit/risk-reporters/instance-risk-reporter.ts',
	'packages/cli/src/services/dynamic-templates.service.ts',
	'packages/cli/src/modules/community-packages/community-packages.service.ts',
	'packages/cli/src/modules/community-packages/npm-utils.ts',
	'packages/cli/src/modules/quick-connect/handlers/firecrawl.handler.ts',
	'packages/cli/src/modules/instance-ai/web-research/fetch-and-extract.ts',
	// CAT-3377 — consolidate AI proxy helpers onto the factory. These `getProxyFetch`
	// helpers reach for `undici`'s ProxyAgent at runtime via `require`.
	'packages/@n8n/ai-workflow-builder.ee/src/tools/utils/web-fetch.utils.ts',
	'packages/@n8n/ai-workflow-builder.ee/src/utils/http-proxy-agent.ts',
	'packages/cli/src/modules/instance-ai/instance-ai.service.ts',
	'packages/@n8n/agents/src/runtime/model/model-factory.ts',
];

export const backendNetworkBoundaryConfig = tseslint.config({
	rules: {
		'n8n-local-rules/no-uncentralized-http': ['error', { allow }],
	},
});
