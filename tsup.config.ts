import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/index.ts', 'src/cli/index.ts'], format: ['esm'], dts: true, clean: true, splitting: false, sourcemap: true, target: 'node20', external: ['commander', 'picocolors', 'zod', 'execa'] });
