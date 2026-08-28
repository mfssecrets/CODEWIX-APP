import { execSync } from 'child_process';

// When @opennextjs/cloudflare calls "bun run build" internally, it will
// inherit this env var and skip the OpenNext wrapper (avoiding recursion).
if (process.env.__OPENNEXT_INTERNAL_BUILD__) {
  // Just run plain next build (called by OpenNext internally)
  execSync('npx next build', { stdio: 'inherit' });
} else {
  // Direct call (e.g. Cloudflare dashboard "npm run build")
  // Run the full OpenNext build which calls next build + converts output
  process.env.__OPENNEXT_INTERNAL_BUILD__ = '1';
  execSync('npx @opennextjs/cloudflare build', { stdio: 'inherit' });
}
