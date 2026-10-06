import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseLicenseRepository } from "../src/adapters/supabase-license-repository.js";
import { createAnnualLicense } from "../src/billing/annual-license.js";

test("Supabase license repository keeps Individual and Business as separate rows", async () => {
  const old=globalThis.fetch; const rows:any[]=[];
  globalThis.fetch=async (input:any,init?:any)=>{
    const url=String(input);
    if(init?.method==="POST"){const row=JSON.parse(String(init.body));const i=rows.findIndex(x=>x.user_id===row.user_id&&x.plan===row.plan);if(i>=0)rows[i]=row;else rows.push(row);return new Response(null,{status:201});}
    const uid=decodeURIComponent(url.match(/user_id=eq\.([^&]+)/)?.[1]??"");
    const plan=url.match(/plan=eq\.([^&]+)/)?.[1];
    return new Response(JSON.stringify(rows.filter(x=>x.user_id===uid&&(!plan||x.plan===plan))),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try {
    const repo=new SupabaseLicenseRepository("https://example.supabase.co","secret");
    await repo.save(createAnnualLicense("u1",new Date("2026-01-01T00:00:00Z"),"individual",null,"John"));
    await repo.save(createAnnualLicense("u1",new Date("2026-01-01T00:00:00Z"),"business",null,"Example Business"));
    const all=await repo.listByUserId("u1");
    assert.equal(all.length,2); assert.equal((await repo.getByUserIdAndPlan("u1","individual"))?.licenseName,"John");
    assert.equal((await repo.getByUserIdAndPlan("u1","business"))?.licenseName,"Example Business");
  } finally { globalThis.fetch=old; }
});
