import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", ...options });
}

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenEnv = tracked.filter((file) =>
  /(^|\/)\.env($|\.)/.test(file) &&
  !/(^|\/)\.env\.(example|sample|template)$/.test(file)
);

if (forbiddenEnv.length) {
  throw new Error(`Tracked environment files are not allowed: ${forbiddenEnv.join(", ")}`);
}

const secretPatterns = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

for (const file of tracked) {
  if (file === "package-lock.json" || file.startsWith("_archive/")) continue;
  if (!/\.(?:js|mjs|cjs|ts|tsx|json|md|yml|yaml|sql|txt|csv)$/.test(file)) continue;
  const body = fs.readFileSync(file, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(body))) {
    throw new Error(`Potential committed secret pattern detected in ${file}`);
  }
}

run("npx tsc --noEmit");
run("npm run lint");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.scripts?.test) {
  run("npm test");
} else {
  console.log("\n> No test script is defined; skipping tests.");
}
