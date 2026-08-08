import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Tailwind utility naming a color token that does not exist compiles to nothing.
 * No error, no warning — the rule is simply absent from the CSS and that element
 * silently loses its color.
 *
 * That is how `bg-accent` / `hover:bg-accent-hover` survived in 14 files: the design
 * system only ever defined `--color-accent-primary` and friends, so the video
 * timeline's active-tool highlight, the clip drop targets, the sprite frame
 * selection, and the hover state of ten primary buttons were all painting nothing.
 * Reading the source could not reveal it; only the compiled CSS (or this test) can.
 *
 * So the guard is mechanical: every `*-accent-*` utility in the source must name a
 * token that `globals.css` actually exposes.
 */

const ROOT = join(__dirname, "..");
const GLOBALS = join(ROOT, "app", "globals.css");
const SOURCE_DIRS = ["app", "domains", "shared"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

// Utilities that take a color. Kept explicit so a new prefix is a deliberate edit.
const COLOR_PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke",
  "from", "to", "via", "divide", "outline", "decoration", "caret", "shadow",
];

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectSourceFiles(path, found);
      continue;
    }
    if (SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))) found.push(path);
  }
  return found;
}

/** Token names `globals.css` exposes to Tailwind, e.g. "accent-primary-hover". */
function exposedColorTokens(): Set<string> {
  const css = readFileSync(GLOBALS, "utf8");
  const tokens = new Set<string>();
  for (const match of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
    tokens.add(match[1]);
  }
  return tokens;
}

describe("theme color utilities name tokens that exist", () => {
  it("exposes the accent tokens this app uses", () => {
    const tokens = exposedColorTokens();
    // sanity: the guard is worthless if the css parse silently yields nothing
    expect(tokens.size).toBeGreaterThan(10);
    expect(tokens.has("accent-primary")).toBe(true);
    expect(tokens.has("accent-primary-hover")).toBe(true);
  });

  it("uses no accent utility whose token is undefined", () => {
    const tokens = exposedColorTokens();
    const prefixes = COLOR_PREFIXES.join("|");
    // `bg-accent-primary/20`, `hover:text-accent-danger`, ...
    const utility = new RegExp(`\\b(?:${prefixes})-(accent-[a-z0-9-]+|accent)(?=[^a-z0-9-]|$)`, "g");

    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of collectSourceFiles(join(ROOT, dir))) {
        if (file.endsWith("themeTokens.test.ts")) continue;
        const text = readFileSync(file, "utf8");
        for (const match of text.matchAll(utility)) {
          const token = match[1];
          if (tokens.has(token)) continue;
          offenders.push(`${file.slice(ROOT.length + 1)}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
