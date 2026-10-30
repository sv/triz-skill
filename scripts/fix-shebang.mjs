#!/usr/bin/env node
/**
 * Rewrite the dist bin shebangs for publishing. src/server.ts and src/cli.ts carry a
 * `npx tsx` shebang for direct dev execution; the published bins must run
 * on plain node with no tsx download.
 */
import fs from "node:fs";

for (const bin of ["server.js", "cli.js"]) {
  const target = new URL(`../dist/${bin}`, import.meta.url);
  let src = fs.readFileSync(target, "utf8");
  if (!src.startsWith("#!")) throw new Error(`dist/${bin} is missing its shebang line`);
  src = src.replace(/^#!.*/, "#!/usr/bin/env node");
  fs.writeFileSync(target, src);
  console.log(`[fix-shebang] dist/${bin} -> #!/usr/bin/env node`);
}
