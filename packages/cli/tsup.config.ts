import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/bin.ts',
        'src/create-enterstellar-app.ts',
    ],
    format: ['esm', 'cjs'],
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
        },
    },
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    banner: {
        js: '#!/usr/bin/env node',
    },
});
