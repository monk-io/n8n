import { RuleTester } from '@typescript-eslint/rule-tester';
import { NoUncentralizedHttpRule } from './no-uncentralized-http.js';

const ruleTester = new RuleTester({
	languageOptions: {
		parser: require('@typescript-eslint/parser'),
		parserOptions: {
			ecmaVersion: 2020,
			sourceType: 'module',
		},
	},
});

const runtimeFile = '/repo/packages/cli/src/service.ts';

ruleTester.run('no-uncentralized-http', NoUncentralizedHttpRule, {
	valid: [
		// Type-only imports carry no runtime behavior.
		{ code: "import type { AxiosRequestConfig } from 'axios';", filename: runtimeFile },
		{ code: "import { type AxiosRequestConfig } from 'axios';", filename: runtimeFile },
		{ code: "import type { Dispatcher } from 'undici';", filename: runtimeFile },
		// axios error/guard symbols perform no request.
		{ code: "import { AxiosError } from 'axios';", filename: runtimeFile },
		{ code: "import { isAxiosError, CanceledError } from 'axios';", filename: runtimeFile },
		// node http/https server primitives are unaffected; only `Agent` is restricted.
		{ code: "import { createServer } from 'node:http';", filename: runtimeFile },
		{ code: "import type { Agent } from 'node:https';", filename: runtimeFile },
		// Re-exporting a type, or a node-http namespace, carries no request behavior.
		{ code: "export type { AxiosRequestConfig } from 'axios';", filename: runtimeFile },
		{ code: "export { type Dispatcher } from 'undici';", filename: runtimeFile },
		{ code: "export { isAxiosError } from 'axios';", filename: runtimeFile },
		{ code: "export * from 'node:http';", filename: runtimeFile },
		// Dynamic import / require of unrelated or node-http modules.
		{ code: "const http = require('node:http');", filename: runtimeFile },
		{ code: "async function f() { await import('node:https'); }", filename: runtimeFile },
		{ code: "const lib = require('express');", filename: runtimeFile },
		// Unrelated modules.
		{ code: "import express from 'express';", filename: runtimeFile },
		{ code: "import { helper } from './local';", filename: runtimeFile },
		// Allow-listed file (reviewed exception).
		{
			code: "import axios from 'axios';",
			filename: '/repo/packages/cli/src/oauth/oauth.service.ts',
			options: [{ allow: ['packages/cli/src/oauth/oauth.service.ts'] }],
		},
		{
			code: "import { ProxyAgent } from 'undici';",
			filename: '/repo/packages/nodes-base/credentials/foo.ts',
			options: [{ allow: ['packages/nodes-base/'] }],
		},
		// Allow-list substrings (forward-slash) match on Windows backslash paths.
		{
			code: "import axios from 'axios';",
			filename: 'C:\\repo\\packages\\cli\\src\\oauth\\oauth.service.ts',
			options: [{ allow: ['packages/cli/src/oauth/oauth.service.ts'] }],
		},
		// Tests and fixtures import these libraries to mock them, not to call out.
		{ code: "import axios from 'axios';", filename: '/repo/packages/cli/src/service.test.ts' },
		{
			code: "import axios from 'axios';",
			filename: '/repo/packages/cli/src/__tests__/service.ts',
		},
		{
			code: "import axios from 'axios';",
			filename: '/repo/packages/@n8n/ai-utilities/integration-tests/openai.fixtures.ts',
		},
	],

	invalid: [
		{
			code: "import axios from 'axios';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'axios' } }],
		},
		{
			// The default import is the request client even alongside an allowed symbol.
			code: "import axios, { AxiosError } from 'axios';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import * as axios from 'axios';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import { request } from 'axios';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import { ProxyAgent } from 'undici';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'undici' } }],
		},
		{
			code: "import { Agent } from 'undici';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import { HttpsProxyAgent } from 'https-proxy-agent';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import proxyFromEnv from 'proxy-from-env';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import 'undici';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork' }],
		},
		{
			code: "import { Agent } from 'node:http';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'node:http' } }],
		},
		// Re-exports pull the client into consumers just like a direct import.
		{
			code: "export { request } from 'axios';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'axios' } }],
		},
		{
			code: "export * from 'undici';",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'undici' } }],
		},
		// Dynamic import / require load the whole client at runtime.
		{
			code: "async function f() { await import('axios'); }",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'axios' } }],
		},
		{
			code: "const { ProxyAgent } = require('undici');",
			filename: runtimeFile,
			errors: [{ messageId: 'useBackendNetwork', data: { module: 'undici' } }],
		},
	],
});
