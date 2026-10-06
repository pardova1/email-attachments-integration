import type { AnnualLicense, LicensePlan } from "../billing/annual-license.js";
import type { LicenseRepository } from "../billing/license-repository.js";

type Row={user_id:string;plan:LicensePlan;license_name:string;starts_at:string;expires_at:string;amount_paid_usd_cents:number;status:"active"|"expired"};
export class SupabaseLicenseRepository implements LicenseRepository {
  constructor(private readonly url:string,private readonly secretKey:string){}
  private headers(extra:Record<string,string>={}){return {apikey:this.secretKey,Authorization:`Bearer ${this.secretKey}`,...extra};}
  private fromRow(r:Row):AnnualLicense{return {userId:r.user_id,plan:r.plan,licenseName:r.license_name,startsAt:new Date(r.starts_at),expiresAt:new Date(r.expires_at),amountPaidUsdCents:r.amount_paid_usd_cents,status:r.status};}
  async getByUserId(userId:string){return (await this.listByUserId(userId))[0]??null;}
  async getByUserIdAndPlan(userId:string,plan:LicensePlan){
    const q=`${this.url}/rest/v1/annual_licenses?user_id=eq.${encodeURIComponent(userId)}&plan=eq.${plan}&limit=1`;
    const r=await fetch(q,{headers:this.headers()}); if(!r.ok) throw new Error("LICENSE_STATE_READ_FAILED");
    const rows=await r.json() as Row[]; return rows[0]?this.fromRow(rows[0]):null;
  }
  async listByUserId(userId:string){
    const r=await fetch(`${this.url}/rest/v1/annual_licenses?user_id=eq.${encodeURIComponent(userId)}&order=plan.asc`,{headers:this.headers()});
    if(!r.ok) throw new Error("LICENSE_STATE_READ_FAILED"); return ((await r.json()) as Row[]).map(x=>this.fromRow(x));
  }
  async save(l:AnnualLicense){
    const row:Row={user_id:l.userId,plan:l.plan,license_name:l.licenseName,starts_at:l.startsAt.toISOString(),expires_at:l.expiresAt.toISOString(),amount_paid_usd_cents:l.amountPaidUsdCents,status:l.status};
    const r=await fetch(`${this.url}/rest/v1/annual_licenses?on_conflict=user_id,plan`,{method:"POST",headers:this.headers({"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"}),body:JSON.stringify(row)});
    if(!r.ok) throw new Error("LICENSE_STATE_SAVE_FAILED");
  }
}
