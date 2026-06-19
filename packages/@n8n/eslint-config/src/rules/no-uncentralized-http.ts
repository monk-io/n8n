import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

type Options = [{ allow?: string[] }];
type MessageIds = 'useBackendNetwork';

/**
 * Modules whose runtime use means "this code opens its own outbound connection"
 * instead of going through the `@n8n/backend-network` factory. Type-only imports
 * are always fine (they carry no behavior).
 */
const RESTRICTED_MODULES = new Set([
	'axios',
	'undici',
	'http-proxy-agent',
	'https-proxy-agent',
	'proxy-from-env',
]);

/** Raw node agents are restricted; server primitives (`createServer`, ...) are not. */
const NODE_HTTP_MODULES = new Set(['http', 'https', 'node:http', 'node:https']);

/**
 * axios symbols that perform no request: error classes, type guards and config
 * shapes. `import { AxiosError } from 'axios'` for `instanceof` checks is fine;
 * only `import axios` (the request client) needs the factory.
 */
const ALLOWED_AXIOS_VALUE_IMPORTS = new Set([
	'AxiosError',
	'AxiosHeaders',
	'CanceledError',
	'isAxiosError',
	'isCancel',
]);

/** Tests and fixtures import these libraries to mock/assert them, not to make calls. */
const NON_RUNTIME_FILE = /(\.test\.ts|\.spec\.ts|\/__tests__\/|\/test\/|\/integration-tests\/)/;

export const NoUncentralizedHttpRule = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow direct backend imports of HTTP client/proxy libraries; outbound HTTP must go through the @n8n/backend-network factory.',
		},
		messages: {
			useBackendNetwork:
				"Don't import '{{ module }}' directly. Route backend outbound HTTP through the @n8n/backend-network factory so SSRF/DNS guarding and proxy handling stay centrally controlled. For a genuine one-off opt-out add `// eslint-disable-next-line n8n-local-rules/no-uncentralized-http -- <reason>`; for scope exclusions or tracked migration debt use the allow list in @n8n/eslint-config (src/configs/backend-network-boundary.ts). See packages/@n8n/backend-network/README.md.",
		},
		schema: [
			{
				type: 'object',
				additionalProperties: false,
				properties: {
					allow: {
						type: 'array',
						items: { type: 'string' },
						description: 'File path substrings exempt from this rule (reviewed exceptions).',
					},
				},
			},
		],
	},
	defaultOptions: [{ allow: [] }],
	create(context, [options]) {
		// Normalize to forward slashes so allow-list substrings (always written with
		// `/`) match on Windows, where `context.filename` is backslash-separated.
		const filename = context.filename.replace(/\\/g, '/');

		if (NON_RUNTIME_FILE.test(filename)) return {};

		const allow = options?.allow ?? [];
		if (allow.some((entry) => filename.includes(entry))) return {};

		const report = (node: TSESTree.Node, module: string) => {
			context.report({ node, messageId: 'useBackendNetwork', data: { module } });
		};

		/**
		 * Decide whether a single named value binding from `module` is restricted.
		 * `importedName` is undefined for default/namespace bindings (the whole
		 * client), which are always restricted.
		 */
		const reportNamedValue = (
			node: TSESTree.Node,
			module: string,
			importedName: string | undefined,
		) => {
			if (NODE_HTTP_MODULES.has(module)) {
				// Only the raw `Agent` class is restricted from node http/https. A
				// namespace/default binding (`import http from 'node:http'`) can still
				// reach `http.Agent`, but banning it would also forbid `createServer`;
				// that gap is accepted (see README "The boundary rule").
				if (importedName === 'Agent') report(node, module);
				return;
			}

			// axios error/guard/config symbols carry no request behavior.
			if (module === 'axios' && importedName && ALLOWED_AXIOS_VALUE_IMPORTS.has(importedName)) {
				return;
			}

			report(node, module);
		};

		return {
			ImportDeclaration(node) {
				const module = node.source.value;
				if (!RESTRICTED_MODULES.has(module) && !NODE_HTTP_MODULES.has(module)) return;

				// `import type ... from 'axios'` — types only, erased at runtime.
				if (node.importKind === 'type') return;

				// `import 'undici'` — bare side-effect import still loads the library.
				if (RESTRICTED_MODULES.has(module) && node.specifiers.length === 0) {
					report(node, module);
					return;
				}

				for (const specifier of node.specifiers) {
					// `import { type Foo }` — type-only specifier.
					if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue;

					const importedName =
						specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
							? specifier.imported.name
							: undefined;

					reportNamedValue(specifier, module, importedName);
				}
			},

			// `export { request } from 'axios'` — re-exporting a value pulls the
			// library into consumers exactly like a direct import.
			ExportNamedDeclaration(node) {
				if (!node.source) return; // local re-export (`export { x }`), no module.
				const module = node.source.value;
				if (!RESTRICTED_MODULES.has(module) && !NODE_HTTP_MODULES.has(module)) return;
				if (node.exportKind === 'type') return;

				for (const specifier of node.specifiers) {
					if (specifier.exportKind === 'type') continue;
					const importedName =
						specifier.local.type === 'Identifier' ? specifier.local.name : undefined;
					reportNamedValue(specifier, module, importedName);
				}
			},

			// `export * from 'undici'` re-exports the whole client. Node http/https
			// are excluded for parity with the allowed namespace import.
			ExportAllDeclaration(node) {
				const module = node.source.value;
				if (!RESTRICTED_MODULES.has(module)) return;
				if (node.exportKind === 'type') return;
				report(node, module);
			},

			// Dynamic `import('axios')` loads the whole client at runtime. Node
			// http/https are excluded for parity with the allowed namespace import.
			ImportExpression(node) {
				if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return;
				if (!RESTRICTED_MODULES.has(node.source.value)) return;
				report(node, node.source.value);
			},

			// `require('axios')` — same as a dynamic import for our purposes.
			CallExpression(node) {
				if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
				const [arg] = node.arguments;
				if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return;
				if (!RESTRICTED_MODULES.has(arg.value)) return;
				report(node, arg.value);
			},
		};
	},
});
