import {ConnectionCheckClient,type ConnectionCheckInput} from "./connection-check-client.js";
export interface BrowserConnectionNavigator {
 userAgentData?:{platform?:string;brands?:{brand:string;version:string}[];getHighEntropyValues?:(hints:string[])=>Promise<unknown>};
}
const platforms:Record<string,string>={Android:"android",Windows:"windows",macOS:"macos",Linux:"linux","Chrome OS":"chromeos"};
const browsers=new Set(["Google Chrome","Microsoft Edge"]);

// Client-reported routing hints only. Never infer country/provider from browser.
export async function collectBrowserConnectionHints(navigator:BrowserConnectionNavigator|undefined,signal?:AbortSignal,timeoutMs=500):Promise<ConnectionCheckInput["software"]>{
 signal?.throwIfAborted();if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw new Error("INVALID_BROWSER_HINT_TIMEOUT");
 let data:BrowserConnectionNavigator["userAgentData"],platform:string|undefined,brands:unknown;
 try{data=navigator?.userAgentData;platform=platforms[data?.platform??""];brands=structuredClone(data?.brands);}catch{return undefined;}
 if(!data)return undefined;
 let timer:ReturnType<typeof setTimeout>|undefined,abort:(()=>void)|undefined,values:unknown;
 try{
  if(data.getHighEntropyValues){
   const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>reject(signal?.reason);signal?.addEventListener("abort",abort,{once:true});});
   const expired=new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),timeoutMs);});
   values=await Promise.race([Promise.resolve().then(()=>data!.getHighEntropyValues!(["fullVersionList"])),expired,cancelled]);
  }
 }catch{signal?.throwIfAborted();}
 finally{if(timer)clearTimeout(timer);if(abort)signal?.removeEventListener("abort",abort);}
 signal?.throwIfAborted();
 const full=values&&typeof values==="object"?Reflect.get(values,"fullVersionList"):undefined;
 const list=Array.isArray(full)?full:Array.isArray(brands)?brands:[];
 const recognized=list.slice(0,20).filter(item=>item&&typeof item==="object"&&browsers.has(item.brand));
 const names=new Set(recognized.map(item=>item.brand));
 const hints:NonNullable<ConnectionCheckInput["software"]>={...(platform?{platform}:{})};
 if(names.size===1){
  hints.client=recognized[0].brand;
  const versions=new Set(recognized.map(item=>item.version));
  const version=recognized[0].version;
  if(Array.isArray(full)&&versions.size===1&&typeof version==="string"&&/^\d{1,6}(?:\.\d{1,6}){3}$/.test(version)&&!/^\d+\.0\.0\.0$/.test(version))hints.softwareVersion=version;
 }
 return Object.keys(hints).length?hints:undefined;
}
export class BrowserConnectionCheckClient extends ConnectionCheckClient {
 constructor(apiBase:string,accessToken:(signal:AbortSignal)=>Promise<string>,request:typeof fetch=globalThis.fetch,private readonly browserNavigator:BrowserConnectionNavigator|undefined=globalThis.navigator as BrowserConnectionNavigator|undefined){super(apiBase,accessToken,request);}
 override async check(input:ConnectionCheckInput={},signal?:AbortSignal){
  if(input.software!==undefined)return super.check(input,signal);
  const software=await collectBrowserConnectionHints(this.browserNavigator,signal);
  return super.check({...input,...(software?{software}:{})},signal);
 }
}
