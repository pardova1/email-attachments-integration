import type {ConnectionField,ConnectionChoice} from "./customer-connection-fallback.js";
import type {ConnectionEnvironment} from "./global-connection-readiness-agent.js";

export function completeConnectionChoiceIds(keys:ConnectionField[],options:Map<ConnectionField,readonly ConnectionChoice[]>,fixed:Partial<Record<ConnectionField,string>>={}) {
    const reachable=new Map(keys.map(key=>[key,new Set<string>()]));
    // Keep only earlier values referenced by remaining choices in each memo
    // key. Independent dropdowns do not create a Cartesian-product search.
    const needed=keys.map((_key,index)=>new Set(keys.slice(index).flatMap(key=>(options.get(key)??[]).flatMap(option=>Object.keys(option.requires??{}) as ConnectionField[]))));
    const memo=new Map<string,boolean>();let work=0,states=0;
    const visit=(index:number,selected:Partial<ConnectionEnvironment>):boolean=>{
      if(index===keys.length)return true;
      const identity=JSON.stringify([index,...keys.slice(0,index).filter(key=>needed[index].has(key)).map(key=>selected[key])]);
      if(memo.has(identity))return memo.get(identity)!;
      if(++states>10_000)throw new Error("CONNECTION_CHOICE_SEARCH_LIMIT");
      const key=keys[index];let complete=false;
      for(const option of options.get(key)??[]){
        if(fixed[key]!==undefined&&fixed[key]!==option.id)continue;
        if(++work>50_000)throw new Error("CONNECTION_CHOICE_SEARCH_LIMIT");
        if(Object.entries(option.requires??{}).some(([dependency,value])=>selected[dependency as ConnectionField]!==value))continue;
        if(visit(index+1,{...selected,[key]:option.value})){reachable.get(key)!.add(option.id);complete=true;}
      }
      memo.set(identity,complete);return complete;
    };
    try{
      if(!visit(0,{}))return undefined;
      return reachable;
    }catch{return undefined;}
  }

