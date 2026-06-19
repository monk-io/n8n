import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Guards the DI-less bundle: the `@n8n/backend-network/transport` subpath
// must stay free of DI / config / backend-common at runtime, so DI-less callers
// can build transport without dragging the full `OutboundHttp` service and its
// backend dependencies into their bundle.
//
// This walks the *runtime* import graph from `src/transport.ts` (following only
// relative, non-type imports/exports — `import type` / `export type` are erased
// by tsc) and asserts no forbidden package is reachable.

const FORBIDDEN_PACKAGES = ['@n8n/di', '@n8n/backend-common', '@n8n/config', 'cache-manager'];

const ENTRY = resolve(__dirname, '../../transport.ts');

interface ImportRef {
	specifier: string;
	typeOnly: boolean;
}

/**
 * Extract module specifiers from a source file via the TypeScript AST. This
 * covers static `import`/`export ... from`, bare side-effect imports, and the
 * runtime forms a regex would miss: dynamic `import('<s>')` and `require('<s>')`.
 */
function parseImports(fileName: string, source: string): ImportRef[] {
	const refs: ImportRef[] = [];
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

	const visit = (node: ts.Node): void => {
		// `import ... from '<s>'` / `import '<s>'`
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			refs.push({
				specifier: node.moduleSpecifier.text,
				typeOnly: node.importClause?.isTypeOnly ?? false,
			});
		}
		// `export ... from '<s>'` (re-exports; bare `export {}` has no specifier)
		else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			refs.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
		}
		// Dynamic `import('<s>')` and `require('<s>')` — always runtime.
		else if (ts.isCallExpression(node)) {
			const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
			const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
			const [arg] = node.arguments;
			if ((isDynamicImport || isRequire) && arg && ts.isStringLiteral(arg)) {
				refs.push({ specifier: arg.text, typeOnly: false });
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return refs;
}

function resolveRelative(fromFile: string, specifier: string): string | undefined {
	// Strip a NodeNext `.js`/`.jsx` extension back to its TS source.
	const asTs = specifier.replace(/\.jsx?$/, '');
	const base = resolve(dirname(fromFile), asTs);
	const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')];
	return candidates.find((candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate));
}

/** All bare (non-relative) specifiers reachable at runtime from the entry file. */
function collectRuntimeExternals(entry: string): Set<string> {
	const externals = new Set<string>();
	const visited = new Set<string>();

	const visit = (file: string) => {
		if (visited.has(file)) return;
		visited.add(file);

		const source = readFileSync(file, 'utf8');
		for (const { specifier, typeOnly } of parseImports(file, source)) {
			if (typeOnly) continue; // erased at compile time — no runtime dependency
			if (specifier.startsWith('.')) {
				const resolved = resolveRelative(file, specifier);
				if (resolved) visit(resolved);
				continue;
			}
			externals.add(specifier);
		}
	};

	visit(entry);
	return externals;
}

describe('@n8n/backend-network/transport subpath purity', () => {
	it('has a resolvable entry file', () => {
		expect(existsSync(ENTRY)).toBe(true);
	});

	it('does not pull DI / config / backend-common into the runtime graph', () => {
		const externals = collectRuntimeExternals(ENTRY);

		for (const forbidden of FORBIDDEN_PACKAGES) {
			const leaked = [...externals].some(
				(specifier) => specifier === forbidden || specifier.startsWith(`${forbidden}/`),
			);
			expect(
				leaked,
				`forbidden runtime dependency reachable from transport subpath: ${forbidden}`,
			).toBe(false);
		}
	});

	it('only depends on undici and n8n-workflow at runtime', () => {
		const externals = collectRuntimeExternals(ENTRY);

		expect([...externals].sort()).toEqual(['n8n-workflow', 'undici']);
	});
});

describe('transport subpath purity — import parser', () => {
	const parse = (source: string) => parseImports('module.ts', source);

	it('treats `import type` / `export type` as erased', () => {
		expect(parse("import type { Foo } from './foo';")).toEqual([
			{ specifier: './foo', typeOnly: true },
		]);
		expect(parse("export type { Foo } from './foo';")).toEqual([
			{ specifier: './foo', typeOnly: true },
		]);
	});

	it('treats static value imports and re-exports as runtime', () => {
		expect(parse("import { foo } from './foo';")).toEqual([
			{ specifier: './foo', typeOnly: false },
		]);
		expect(parse("export { foo } from './foo';")).toEqual([
			{ specifier: './foo', typeOnly: false },
		]);
		expect(parse("import './bare';")).toEqual([{ specifier: './bare', typeOnly: false }]);
	});

	// The reason for parsing the AST instead of regex: dynamic forms are runtime
	// dependencies a regex over import/export statements would silently miss.
	it('catches dynamic import() and require() as runtime', () => {
		expect(parse("async function f() { await import('@n8n/di'); }")).toEqual([
			{ specifier: '@n8n/di', typeOnly: false },
		]);
		expect(parse("const di = require('@n8n/di');")).toEqual([
			{ specifier: '@n8n/di', typeOnly: false },
		]);
	});
});
