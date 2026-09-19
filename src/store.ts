/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";
import { uniqueRules } from "./matcher";
import { GuardStore } from "./types";

export const STORE_NAME = "local-commit-guard.json";
export const RULES_NAME = "local-commit-guard.rules";
export const VAULT_DIR_NAME = "local-commit-guard-vault";

export function storePath(gitDir: string): string {
  return path.join(gitDir, STORE_NAME);
}

export function rulesPath(gitDir: string): string {
  return path.join(gitDir, RULES_NAME);
}

export function vaultPath(gitDir: string): string {
  return path.join(gitDir, VAULT_DIR_NAME);
}

export function readStore(gitDir: string): GuardStore {
  const p = storePath(gitDir);
  if (!fs.existsSync(p)) {
    return { version: 1, rules: [] };
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw) as GuardStore;
    if (!data || !Array.isArray(data.rules)) {
      return { version: 1, rules: [] };
    }
    return {
      version: data.version || 1,
      rules: uniqueRules(data.rules),
      hookInstalled: !!data.hookInstalled,
      updatedAt: data.updatedAt,
    };
  } catch {
    return { version: 1, rules: [] };
  }
}

export function writeStore(gitDir: string, store: GuardStore): void {
  const next: GuardStore = {
    version: 1,
    rules: uniqueRules(store.rules || []),
    hookInstalled: !!store.hookInstalled,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(storePath(gitDir), JSON.stringify(next, null, 2), "utf8");
  const lines = next.rules.join("\n") + (next.rules.length ? "\n" : "");
  fs.writeFileSync(rulesPath(gitDir), lines, "utf8");
}
