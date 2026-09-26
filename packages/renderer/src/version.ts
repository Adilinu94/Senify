// The renderer version stamped into every release manifest (E2). A build is
// only byte-reproducible for the same renderer version, so the number travels
// with the release. A test pins it to `package.json`, the two cannot drift.
export const RENDERER_VERSION = "0.1.0";
