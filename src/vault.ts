/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";
import { getChangedFiles } from "./git";
import { pathMatchesAny } from "./matcher";
import { vaultPath } from "./store";

function copyFile(src: string, dest: string): void {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function walkFiles(dir: string, base: string, acc: string[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const full = path.join(dir, e.name);
    const rel = path.join(base, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) {
      walkFiles(full, rel, acc);
    } else if (e.isFile()) {
      acc.push(rel);
    }
  }
}

export function countVaultFiles(gitDir: string): number {
  const root = vaultPath(gitDir);
  const acc: string[] = [];
  walkFiles(root, "", acc);
  return acc.length;
}

export async function backupBlocked(
  gitRoot: string,
  gitDir: string,
  rules: string[]
): Promise<{ saved: number; paths: string[] }> {
  const vault = vaultPath(gitDir);
  const changes = await getChangedFiles(gitRoot);
  const saved: string[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const rel = c.path;
    if (!pathMatchesAny(rel, rules)) {
      continue;
    }
    const src = path.join(gitRoot, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      continue;
    }
    copyFile(src, path.join(vault, rel));
    saved.push(rel);
  }
  return { saved: saved.length, paths: saved };
}

export function restoreVault(
  gitRoot: string,
  gitDir: string
): { restored: number; paths: string[] } {
  const vault = vaultPath(gitDir);
  const rels: string[] = [];
  walkFiles(vault, "", rels);
  const restored: string[] = [];
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const src = path.join(vault, rel);
    const dest = path.join(gitRoot, rel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      continue;
    }
    copyFile(src, dest);
    restored.push(rel);
  }
  return { restored: restored.length, paths: restored };
}

export function listConflictCandidates(
  gitRoot: string,
  gitDir: string
): string[] {
  const vault = vaultPath(gitDir);
  const rels: string[] = [];
  walkFiles(vault, "", rels);
  const hits: string[] = [];
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const dest = path.join(gitRoot, rel);
    if (fs.existsSync(dest)) {
      const a = fs.readFileSync(path.join(vault, rel));
      const b = fs.readFileSync(dest);
      if (!a.equals(b)) {
        hits.push(rel);
      }
    }
  }
  return hits;
}
