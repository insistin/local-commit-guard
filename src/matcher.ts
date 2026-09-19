/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Normalize user input: bgioneco-upms/** -> bgioneco-upms */
export function normalizeRule(input: string): string {
  let s = (input || "").trim().replace(/\\/g, "/");
  s = s.replace(/^\.\//, "");
  while (s.startsWith("/")) {
    s = s.slice(1);
  }
  s = s.replace(/\/\*\*$/, "");
  s = s.replace(/^\*\*\//, "");
  s = s.replace(/\/+$/, "");
  s = s.replace(/^\/+/, "");
  return s.trim();
}

export function normalizeRepoPath(p: string): string {
  return (p || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Short name match:
 * - "bgioneco-upms" matches the dir itself and all descendants at any depth
 * - "application.yml" matches every file with that basename
 */
export function pathMatchesRule(relativePath: string, rule: string): boolean {
  const path = normalizeRepoPath(relativePath);
  const r = normalizeRule(rule);
  if (!path || !r) {
    return false;
  }

  if (r.includes("/")) {
    return path === r || path.startsWith(r + "/");
  }

  const wrapped = "/" + path + "/";
  if (wrapped.includes("/" + r + "/")) {
    return true;
  }
  const base = path.split("/").pop() || "";
  return base === r;
}

export function pathMatchesAny(relativePath: string, rules: string[]): boolean {
  for (let i = 0; i < rules.length; i++) {
    if (pathMatchesRule(relativePath, rules[i])) {
      return true;
    }
  }
  return false;
}

export function uniqueRules(rules: string[]): string[] {
  const seen: { [k: string]: boolean } = {};
  const out: string[] = [];
  for (let i = 0; i < rules.length; i++) {
    const n = normalizeRule(rules[i]);
    if (!n || seen[n]) {
      continue;
    }
    seen[n] = true;
    out.push(n);
  }
  return out;
}
