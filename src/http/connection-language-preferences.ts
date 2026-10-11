// Bounded header parsing. Preferences affect presentation, never discovery.
export function connectionLanguagePreferences(header:string|undefined):string[]{
 if(!header||header.length>4096)return [];
 return header.split(",").slice(0,50).flatMap((entry,index)=>{
  const match=entry.trim().match(/^([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i);
  if(!match)return [];
  const quality=match[2]===undefined?1:Number(match[2]);
  if(quality<=0)return [];
  return [{language:match[1],quality,index}];
 }).sort((a,b)=>b.quality-a.quality||a.index-b.index).map(item=>item.language);
}
