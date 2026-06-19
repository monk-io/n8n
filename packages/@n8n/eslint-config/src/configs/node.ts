import tseslint from 'typescript-eslint';
import globals from 'globals';
import { baseConfig } from './base.js';
import { backendNetworkBoundaryConfig } from './backend-network-boundary.js';

export const nodeConfig = tseslint.config(
	baseConfig,
	{
		languageOptions: {
			ecmaVersion: 2024,
			globals: globals.node,
		},
	},
	...backendNetworkBoundaryConfig,
);
