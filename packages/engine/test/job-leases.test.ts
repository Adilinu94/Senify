import { describe, expect, it } from "vitest";
import { BAKE_BUILD_TIMEOUT_MS } from "@senify/renderer";
import { DEFAULT_BAKE_LEASE_MS, imageLeaseMs } from "@senify/engine";

// The lease of a claimed job exists for one reason: a CRASHED process must
// not lose its work. That only works if the lease outlives the work itself.
// A lease that expires while the job still runs lets a second worker claim
// the same job - two bakes of the same release, two deploys of the same
// build.
//
// Fachanalyse 3, B3: the bake had a lease of 60 s against a build of up to
// 180 s. The lease was the shorter one, so the protection it was supposed
// to give was the first thing to expire. The image worker had it right; the
// test now pins both.
describe("die Lease eines beanspruchten Jobs ueberdauert die Arbeit", () => {
  it("die Bake-Lease ist laenger als der Build", () => {
    expect(DEFAULT_BAKE_LEASE_MS).toBeGreaterThan(BAKE_BUILD_TIMEOUT_MS);
  });

  it("die Bild-Lease ist laenger als das Job-Timeout", () => {
    for (const timeoutMinutes of [1, 5, 30, 120]) {
      expect(imageLeaseMs({ timeoutMinutes })).toBeGreaterThan(timeoutMinutes * 60_000);
    }
  });
});
