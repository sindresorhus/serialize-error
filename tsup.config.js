import { defineConfig } from 'tsup';

export default defineConfig((opts) => ({
	entryPoints: ['src/**/*.js'],
	bundle: false,
	format: ['cjs'],
	dts: true,
	clean: !opts.watch,
	sourcemap: true,
	minify: false,
	outDir: 'dist',
	target: 'esnext',
	plugins: [
		{
			name: 'fix-cjs',
			renderChunk(_, chunk) {
				if (this.format === 'cjs') {
					// replace `from '...js'` with `from '...cjs'` for cjs imports & exports
					const code = chunk.code.replace(/from ['"](.*)\.js['"]/g, "from '$1.cjs'");
					const code2 = code.replace(/import\(['"](.*)\.js['"]\)/g, "import('$1.cjs')");
					const code3 = code2.replace(/require\(['"](.*)\.js['"]\)/g, "require('$1.cjs')");
					return { code: code3 };
				}
			},
		},
	],
}));
