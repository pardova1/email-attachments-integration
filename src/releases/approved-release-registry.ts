export interface ApprovedRelease {
 version:string;
 commitSha:string;
 approvedAt:string;
 checks:{
  compile:true;
  tests:true;
  security:true;
  dependencyCompatibility:true;
  privateLaneIsolation:true;
  fourHourExpiration:true;
  verifiedExact:true;
  recoveryChain:true;
 };
 status:"approved"|"superseded"|"revoked";
}

export class ApprovedReleaseRegistry {
 private readonly releases=new Map<string,ApprovedRelease>();

 approve(release:ApprovedRelease) {
  if(release.status!=="approved") throw new Error("RELEASE_NOT_APPROVED");
  for(const existing of this.releases.values()) {
   if(existing.status==="approved")
    this.releases.set(existing.version,{...existing,status:"superseded"});
  }
  this.releases.set(release.version,structuredClone(release));
 }

 revoke(version:string) {
  const found=this.releases.get(version);
  if(!found) throw new Error("RELEASE_NOT_FOUND");
  this.releases.set(version,{...found,status:"revoked"});
 }

 get(version:string) {
  const r=this.releases.get(version);
  return r?structuredClone(r):undefined;
 }

 lastKnownGood() {
  const approved=[...this.releases.values()].filter(r=>r.status==="approved");
  if(approved.length!==1) throw new Error("NO_UNAMBIGUOUS_APPROVED_RELEASE");
  return structuredClone(approved[0]);
 }
}
