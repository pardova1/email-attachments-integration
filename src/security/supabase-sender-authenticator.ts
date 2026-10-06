export interface AuthenticatedSender { userId:string; email?:string; }

export class SupabaseSenderAuthenticator {
  constructor(private readonly url:string,private readonly publishableKey:string){}
  async authenticate(authorization:string|undefined):Promise<AuthenticatedSender>{
    if(!authorization?.startsWith("Bearer ")) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    const token=authorization.slice(7).trim();
    if(!token) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    const response=await fetch(`${this.url}/auth/v1/user`,{headers:{apikey:this.publishableKey,Authorization:`Bearer ${token}`}});
    if(!response.ok) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    const user=await response.json() as {id?:string;email?:string};
    if(!user.id) throw new Error("SENDER_AUTHENTICATION_REQUIRED");
    return {userId:user.id,email:user.email};
  }
}
