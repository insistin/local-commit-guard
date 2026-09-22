/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { ChangedFile } from "./types";

const execFileAsync = promisify(execFile);

export async function git(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const res = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: res.stdout || "", stderr: res.stderr || "", code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
}

export async function findGitRoot(startDir: string): Promise<string | null> {
  if (!startDir) {
    return null;
  }
  let dir = startDir;
  try {
    dir = fs.realpathSync(startDir);
  } catch {
    dir = startDir;
  }
  const res = await git(["rev-parse", "--show-toplevel"], dir);
  if (res.code !== 0) {
    return null;
  }
  const root = (res.stdout || "").trim();
  return root ? path.resolve(root) : null;
}

export async function findGitDir(gitRoot: string): Promise<string | null> {
  const res = await git(["rev-parse", "--git-dir"], gitRoot);
  if (res.code !== 0) {
    return null;
  }
  const raw = (res.stdout || "").trim();
  if (!raw) {
    return null;
  }
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(gitRoot, raw);
}

function parsePorcelainPath(rest: string): { path: string; oldPath?: string } {
  let s = rest.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\"/g, '"');
  }
  const arrow = " -> ";
  const idx = s.indexOf(arrow);
  if (idx >= 0) {
    return {
      oldPath: s.slice(0, idx).replace(/\\/g, "/"),
      path: s.slice(idx + arrow.length).replace(/\\/g, "/"),
    };
  }
  return { path: s.replace(/\\/g, "/") };
}

export async function getChangedFiles(gitRoot: string): Promise<ChangedFile[]> {
  const res = await git(["status", "--porcelain", "-uall"], gitRoot);
  if (res.code !== 0) {
    return [];
  }
  const lines = (res.stdout || "").split(/\r?\n/);
  const out: ChangedFile[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 3) {
      continue;
    }
    const status = line.slice(0, 2).trim() || line.slice(0, 2);
    const parsed = parsePorcelainPath(line.slice(3));
    out.push({
      status,
      path: parsed.path,
      oldPath: parsed.oldPath,
    });
  }
  return out;
}

export async function getStagedPaths(gitRoot: string): Promise<string[]> {
  const res = await git(
    ["diff", "--cached", "--name-status", "-z", "--diff-filter=ACDMR"],
    gitRoot
  );
  if (res.code !== 0 || !res.stdout) {
    return [];
  }
  const parts = res.stdout.split("\0").filter((p) => p.length > 0);
  const paths: string[] = [];
  const seen: { [k: string]: boolean } = {};
  const add = (p: string) => {
    const n = p.replace(/\\/g, "/");
    if (n && !seen[n]) {
      seen[n] = true;
      paths.push(n);
    }
  };
  let i = 0;
  while (i < parts.length) {
    const st = parts[i];
    const code = st.charAt(0);
    if (code === "R" || code === "C") {
      const oldP = parts[i + 1];
      const newP = parts[i + 2];
      if (oldP) {
        add(oldP);
      }
      if (newP) {
        add(newP);
      }
      i += 3;
    } else {
      const p = parts[i + 1];
      if (p) {
        add(p);
      }
      i += 2;
    }
  }
  return paths;
}

export async function unstagePaths(
  gitRoot: string,
  relPaths: string[]
): Promise<string[]> {
  const done: string[] = [];
  for (let i = 0; i < relPaths.length; i++) {
    const p = relPaths[i];
    const res = await git(["restore", "--staged", "--", p], gitRoot);
    if (res.code !== 0) {
      await git(["reset", "-q", "HEAD", "--", p], gitRoot);
    }
    done.push(p);
  }
  return done;
}

export async function stagePaths(
  gitRoot: string,
  relPaths: string[]
): Promise<string[]> {
  const done: string[] = [];
  for (let i = 0; i < relPaths.length; i++) {
    const p = relPaths[i];
    const res = await git(["add", "--", p], gitRoot);
    if (res.code === 0) {
      done.push(p);
    }
  }
  return done;
}

export function walkUpFindGit(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let i = 0; i < 40; i++) {
    const dotGit = path.join(current, ".git");
    if (fs.existsSync(dotGit)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}
