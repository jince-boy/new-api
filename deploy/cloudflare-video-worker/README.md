# Cloudflare video delivery Worker

This Worker streams generated videos directly from an upstream provider to the
client. The gateway returns only a short-lived encrypted Worker URL, so the
upstream URL and configured authorization headers are not exposed and video
bytes do not pass through the gateway.

1. Copy `wrangler.toml.example` to `wrangler.toml`.
2. Set `VIDEO_WORKER_SECRET` with `wrangler secret put VIDEO_WORKER_SECRET`.
3. Deploy the Worker.
4. In the system Worker settings, set the Video Worker URL to the deployed URL
   and set the Video Worker secret to exactly the same value.

The Worker supports `GET`, `HEAD`, byte ranges, conditional requests, and up to
five validated upstream redirects. Signed links expire after 15 minutes; users
can request the gateway content endpoint again to receive a fresh link.
