import { test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// Independent browser journeys represent independent clients. The test gateway
// trusts its loopback proxy, so give each journey its own rate-limit identity.
// Production limits and the authentication/rate-limit server tests stay intact.
export const test = base.extend({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const hash = createHash("sha256").update(testInfo.testId).digest();
    await use({ "X-Forwarded-For": `198.18.${hash[0]}.${hash[1]}` });
  },
});
export { expect };
