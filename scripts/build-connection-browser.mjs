import {build} from "esbuild";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const result=await build({
 absWorkingDir:root,
 entryPoints:["src/client/connection-browser-entry.ts"],
 outfile:process.argv[2]?resolve(process.argv[2]):resolve(root,"dist/browser/connection-assistance.js"),
 bundle:true,platform:"browser",format:"esm",target:"es2022",metafile:true,
 sourcemap:false,legalComments:"eof"
});
if(Object.values(result.metafile.outputs).some(output=>output.imports.length))throw new Error("BROWSER_BUNDLE_EXTERNAL_IMPORTS");
console.log("Connection browser bundle built.");
