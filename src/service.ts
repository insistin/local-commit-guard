/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  getBoundGitRoot,
  resolveGitContext,
} from "./bind";
import {
  getChangedFiles,
  getStagedPaths,
  stagePaths,
  unstagePaths,
} from "./git";
import { hookInstalled, installHook } from "./hook";
import { pathMatchesAny, uniqueRules } from "./matcher";
import { readStore, vaultPath, writeStore } from "./store";
import { ClassifiedChange, GuardSnapshot } from "./types";
import {
  backupBlocked,
  countVaultFiles,
  listConflictCandidates,
  restoreVault,
} from "./vault";

export { resolveGitContext, resolveUserPath } from "./bind";

export function emptySnapshot(message?: string): GuardSnapshot {
  return {
    gitRoot: null,
    gitDir: null,
    isGit: false,
    rules: [],
    hookInstalled: false,
    changes: [],
    vaultCount: 0,
    message:
      message ||
      "请手动输入或浏览选择 Git 仓库文件夹。工作区根目录若只是多个仓库的容器，不要填它。",
  };
}

export async function buildSnapshot(
  preferredRoot?: string
): Promise<GuardSnapshot> {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    return emptySnapshot(
      preferredRoot && preferredRoot.trim()
        ? "该路径不是 Git 仓库，请选择带 .git 的项目文件夹。"
        : undefined
    );
  }
  const store = readStore(ctx.gitDir);
  const changesRaw = await getChangedFiles(ctx.gitRoot);
  const changes: ClassifiedChange[] = [];
  const seen: { [k: string]: boolean } = {};
  for (let i = 0; i < changesRaw.length; i++) {
    const c = changesRaw[i];
    const paths = c.oldPath ? [c.path, c.oldPath] : [c.path];
    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      if (seen[p]) {
        continue;
      }
      seen[p] = true;
      if (!pathMatchesAny(p, store.rules)) {
        continue;
      }
      changes.push({
        status: c.status,
        path: p,
        blocked: true,
      });
    }
  }
  return {
    gitRoot: ctx.gitRoot,
    gitDir: ctx.gitDir,
    isGit: true,
    rules: store.rules,
    hookInstalled: hookInstalled(ctx.gitDir),
    changes,
    vaultCount: countVaultFiles(ctx.gitDir),
  };
}

export async function applyRules(
  rules: string[],
  extensionRoot: string,
  preferredRoot?: string
): Promise<GuardSnapshot> {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    return buildSnapshot(preferredRoot);
  }
  const next = uniqueRules(rules);
  writeStore(ctx.gitDir, {
    version: 1,
    rules: next,
    hookInstalled: true,
  });
  installHook(ctx.gitDir, extensionRoot);
  await unstageBlocked(ctx.gitRoot, next);
  return buildSnapshot(ctx.gitRoot);
}

export async function unstageBlocked(
  gitRoot: string,
  rules: string[]
): Promise<string[]> {
  if (!rules.length) {
    return [];
  }
  const staged = await getStagedPaths(gitRoot);
  const hit = staged.filter((p) => pathMatchesAny(p, rules));
  if (hit.length === 0) {
    return [];
  }
  await unstagePaths(gitRoot, hit);
  return hit;
}

export async function stageAllowedOnly(
  preferredRoot?: string
): Promise<{ staged: string[]; skipped: string[]; unstaged: string[] }> {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    throw new Error("尚未选择 Git 仓库");
  }
  const store = readStore(ctx.gitDir);
  if (!store.rules.length) {
    throw new Error("还没有禁止提交的路径，请先添加并确定生效");
  }
  const rules = store.rules;
  const unstaged = await unstageBlocked(ctx.gitRoot, rules);
  const changes = await getChangedFiles(ctx.gitRoot);
  const toStage: string[] = [];
  const skipped: string[] = [];
  const seen: { [k: string]: boolean } = {};
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const paths = c.oldPath ? [c.path, c.oldPath] : [c.path];
    for (let j = 0; j < paths.length; j++) {
      const p = paths[j];
      if (seen[p]) {
        continue;
      }
      seen[p] = true;
      if (pathMatchesAny(p, rules)) {
        if (skipped.indexOf(p) < 0) {
          skipped.push(p);
        }
        continue;
      }
      if (toStage.indexOf(c.path) < 0) {
        toStage.push(c.path);
      }
    }
  }
  const staged = await stagePaths(ctx.gitRoot, toStage);
  return { staged, skipped, unstaged };
}

export async function listGuardGitRoots(
  context: vscode.ExtensionContext
): Promise<string[]> {
  const roots: string[] = [];
  const push = (r: string) => {
    const n = path.resolve(r);
    for (let i = 0; i < roots.length; i++) {
      if (path.resolve(roots[i]).toLowerCase() === n.toLowerCase()) {
        return;
      }
    }
    roots.push(n);
  };

  const bound = getBoundGitRoot(context);
  if (bound) {
    push(bound);
  }

  try {
    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (gitExt) {
      if (!gitExt.isActive) {
        await gitExt.activate();
      }
      const api = gitExt.exports && gitExt.exports.getAPI(1);
      if (api && api.repositories) {
        for (let i = 0; i < api.repositories.length; i++) {
          const repo = api.repositories[i];
          push(repo.rootUri.fsPath);
        }
      }
    }
  } catch {
    /* git API optional */
  }

  const guarded: string[] = [];
  for (let i = 0; i < roots.length; i++) {
    const ctx = await resolveGitContext(roots[i]);
    if (!ctx) {
      continue;
    }
    const store = readStore(ctx.gitDir);
    if (store.rules.length) {
      guarded.push(ctx.gitRoot);
    }
  }
  return guarded;
}

export async function backupNow(preferredRoot?: string) {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    throw new Error("尚未选择 Git 仓库");
  }
  const store = readStore(ctx.gitDir);
  if (!store.rules.length) {
    throw new Error("还没有禁止提交的路径，请先添加并确定生效");
  }
  return backupBlocked(ctx.gitRoot, ctx.gitDir, store.rules);
}

export async function restoreNow(preferredRoot?: string) {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    throw new Error("尚未选择 Git 仓库");
  }
  const dir = vaultPath(ctx.gitDir);
  if (!fs.existsSync(dir)) {
    throw new Error("保险库为空，请先备份");
  }
  return restoreVault(ctx.gitRoot, ctx.gitDir);
}

export async function conflictNow(preferredRoot?: string) {
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    throw new Error("尚未选择 Git 仓库");
  }
  return listConflictCandidates(ctx.gitRoot, ctx.gitDir);
}

export async function autoUnstageIfNeeded(
  preferredRoot?: string
): Promise<string[]> {
  if (!preferredRoot) {
    return [];
  }
  const ctx = await resolveGitContext(preferredRoot);
  if (!ctx) {
    return [];
  }
  const store = readStore(ctx.gitDir);
  if (!store.rules.length) {
    return [];
  }
  return unstageBlocked(ctx.gitRoot, store.rules);
}
