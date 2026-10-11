export interface AuthenticatedSender { userId:string; email?:string; }

export class SupabaseSenderAuthenticator {
  constructor(private readonly url:string,private readonly publishableKey:string,private readonly request:typeof fetch=globalThis.fetch){}
  async authenticate(authorization:string|undefined,signal?:AbortSignal):Promise<AuthenticatedSender>{
    signal?.throwIfAborted();
    if(!authorization?.startsWith("Bearer ")) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    const token=authorization.slice(7).trim();
    if(!token) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    let response:Response|undefined,aborted:(()=>void)|undefined;
    const cancelled=new Promise<never>((_resolve,reject)=>{
      if(signal){aborted=()=>reject(signal.reason);signal.addEventListener("abort",aborted,{once:true});}
    });
    const releaseBody=()=>{if(response?.body)void response.body.cancel().catch(()=>{});};
    try{
      return await Promise.race([(async()=>{
        response=await this.request(`${this.url}/auth/v1/user`,{headers:{apikey:this.publishableKey,Authorization:`Bearer ${token}`},signal});
        if(signal?.aborted){releaseBody();signal.throwIfAborted();}
        if(!response.ok){releaseBody();throw new Error("SENDER_AUTHENTICATION_REQUIRED");}
        const user=await response.json() as {id?:string;email?:string};
        signal?.throwIfAborted();
        if(!user||typeof user.id!=="string"||!user.id.trim())throw new Error("SENDER_AUTHENTICATION_REQUIRED");
        return {userId:user.id,email:user.email};
      })(),cancelled]);
    }finally{
      if(aborted)signal?.removeEventListener("abort",aborted);
      if(signal?.aborted)releaseBody();
    }
  }
}
