import assert from "node:assert/strict";
import test from "node:test";
import { requireProductionConfig, requireProductionSecret } from "../src/config/production-secrets.js";

test("production refuses missing signing secret", () => {
  const oldNode=process.env.NODE_ENV, oldToken=process.env.TOKEN_SIGNING_SECRET;
  process.env.NODE_ENV="production"; delete process.env.TOKEN_SIGNING_SECRET;
  try { assert.throws(() => requireProductionSecret("TOKEN_SIGNING_SECRET","dev"), /TOKEN_SIGNING_SECRET_NOT_CONFIGURED/); }
  finally { if(oldNode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNode; if(oldToken===undefined) delete process.env.TOKEN_SIGNING_SECRET; else process.env.TOKEN_SIGNING_SECRET=oldToken; }
});

test("development may use explicit fallback", () => {
  const oldNode=process.env.NODE_ENV, oldStaff=process.env.STAFF_SIGNING_SECRET;
  process.env.NODE_ENV="test"; delete process.env.STAFF_SIGNING_SECRET;
  try { assert.equal(requireProductionSecret("STAFF_SIGNING_SECRET","dev-staff"),"dev-staff"); }
  finally { if(oldNode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNode; if(oldStaff===undefined) delete process.env.STAFF_SIGNING_SECRET; else process.env.STAFF_SIGNING_SECRET=oldStaff; }
});

test("configured production secret is returned unchanged", () => {
  const oldNode=process.env.NODE_ENV, oldToken=process.env.TOKEN_SIGNING_SECRET;
  process.env.NODE_ENV="production"; process.env.TOKEN_SIGNING_SECRET="configured-secret";
  try { assert.equal(requireProductionSecret("TOKEN_SIGNING_SECRET","dev"),"configured-secret"); }
  finally { if(oldNode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNode; if(oldToken===undefined) delete process.env.TOKEN_SIGNING_SECRET; else process.env.TOKEN_SIGNING_SECRET=oldToken; }
});

test("production refuses missing Supabase publishable key", () => {
  const oldNode=process.env.NODE_ENV, old=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.NODE_ENV="production"; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try { assert.throws(()=>requireProductionSecret("SUPABASE_PUBLISHABLE_KEY","dev"),/SUPABASE_PUBLISHABLE_KEY_NOT_CONFIGURED/); }
  finally { if(oldNode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNode; if(old===undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY=old; }
});
test("production refuses missing Supabase URL", () => {
  const oldNode=process.env.NODE_ENV, old=process.env.SUPABASE_URL;
  process.env.NODE_ENV="production"; delete process.env.SUPABASE_URL;
  try { assert.throws(()=>requireProductionConfig("SUPABASE_URL","http://localhost"),/SUPABASE_URL_NOT_CONFIGURED/); }
  finally { if(oldNode===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=oldNode; if(old===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=old; }
});
