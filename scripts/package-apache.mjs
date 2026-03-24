import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const outDir = path.join(rootDir, "out");
const distDir = path.join(rootDir, "apache-dist");
const siteDir = path.join(distDir, "artkit");
const archivePath = path.join(distDir, "artkit-apache.tar.gz");
const instructionsPath = path.join(distDir, "DEPLOY.txt");

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(outDir, siteDir, { recursive: true });

  const instructions = [
    "Apache deployment bundle",
    "",
    "1. Extract artkit-apache.tar.gz on the Apache server.",
    "2. Point DocumentRoot to the extracted artkit directory or copy its contents into the target web root.",
    "3. Ensure mod_rewrite and mod_headers are enabled so .htaccess rules apply.",
    "4. The /video route requires COOP/COEP headers from .htaccess for editor features.",
    "",
    `Bundle path: ${archivePath}`,
    `Site root: ${siteDir}`,
  ].join("\n");

  await writeFile(instructionsPath, instructions, "utf8");
  execFileSync("tar", ["-czf", archivePath, "-C", distDir, "artkit"], { stdio: "inherit" });

  console.info("[ApachePackage] created bundle", {
    siteDir,
    archivePath,
    instructionsPath,
  });
}

main().catch((error) => {
  console.error("[ApachePackage] failed", error);
  process.exit(1);
});
