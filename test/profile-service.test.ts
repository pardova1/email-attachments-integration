import assert from "node:assert/strict";
import test from "node:test";
import { ProfileService } from "../src/profile/profile-service.js";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";

test("profile without active purchase asks user to renew", async () => {
  const status = await new ProfileService(new MemoryLicenseRepository()).getServiceStatus("u1");
  assert.equal(status.userStatus, "Renewal Required");
  assert.equal(status.indicator, "red");
  assert.equal(status.note, "Please renew your service.");
});
