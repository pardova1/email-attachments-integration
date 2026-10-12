export interface ConnectionConcurrency {perCustomer?:number;total?:number;}

// Snapshot operator settings at mount time. These are request admission limits,
// not measured throughput, file-size limits, or a shared cross-instance budget.
export function connectionConcurrency(value:ConnectionConcurrency={}){
 const perCustomer=value.perCustomer??1,total=value.total??100;
 if(!Number.isInteger(perCustomer)||perCustomer<1||perCustomer>10||!Number.isInteger(total)||total<perCustomer||total>1000)throw new Error("INVALID_CONNECTION_CONCURRENCY");
 return {perCustomer,total};
}
export function connectionConcurrencyFromEnvironment(env:Record<string,string|undefined>){
 const read=(name:string)=>{
  const value=env[name];if(value===undefined)return undefined;
  if(!/^[0-9]+$/.test(value))throw new Error("INVALID_CONNECTION_CONCURRENCY");
  return Number(value);
 };
 return connectionConcurrency({perCustomer:read("CONNECTION_MAX_ACTIVE_PER_CUSTOMER"),total:read("CONNECTION_MAX_ACTIVE_TOTAL")});
}
