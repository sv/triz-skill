#!/usr/bin/env node
/**
 * Rewrite the dist bin shebang for publishing. src/server.ts carries a
 * `npx tsx` shebang for direct dev execution; the published bin must run
 * on plain node with no tsx download.
 */
import fs from "node:fs";

const target = new URL("../dist/server.js", import.meta.url);
let src = fs.readFileSync(target, "utf8");
if (!src.startsWith("#!")) throw new Error("dist/server.js is missing its shebang line");
src = src.replace(/^#!.*/, "#!/usr/bin/env node");
fs.writeFileSync(target, src);
console.log("[fix-shebang] dist/server.js -> #!/usr/bin/env node");
