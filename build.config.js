/**
 * Build configuration for bun bundler
 * Excludes problematic packages from bundling
 */
export default {
  entrypoints: ['./src/cli.ts'],
  outdir: './dist',
  target: 'node',
  external: [
    'blessed',
    'blessed-contrib',
    'neo-blessed'
  ],
  minify: false,
  sourcemap: 'none'
};