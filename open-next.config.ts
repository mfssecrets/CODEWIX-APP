import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Override default behavior if needed
  // See: https://opennext.js.org/cloudflare

  // Cloudflare-specific optimizations
  incrementalCache: {
    // Use KV for ISR cache (uncomment when KV is bound)
    // type: "kv",
  },

  tagCache: {
    // Use KV for on-demand revalidation (uncomment when KV is bound)
    // type: "kv",
  },

  // Queue for background revalidation
  // queue: {
  //   binding: "REVALIDATION_QUEUE",
  // },

  // Wrapper for the worker entry point
  wrapper: "default",
});
