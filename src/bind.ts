/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { findGitDir, findGitRoot } from "./git";

export const STATE_GIT_ROOT = "localCommitGuard.gitRoot";
export const STATE_RECENT_ROOTS = "localCommitGuard.recentGitRoots";

export function getBoundGitRoot(
  context: vscode.ExtensionContext
): string | undefined {
  const v = context.workspaceState.get<string>(STATE_GIT_ROOT);
  return v && v.trim() ? v.trim() : undefined;
}

export function getRecentGitRoots(
  context: vscode.ExtensionContext
): string[] {
  const v = context.workspaceState.get<string[]>(STATE_RECENT_ROOTS);
  return Array.isArray(v) ? v.filter((x) => !!x) : [];
}

export async function saveBoundGitRoot(
  context: vscode.ExtensionContext,
  gitRoot: string
): Promise<void> {
  await context.workspaceState.update(STATE_GIT_ROOT, gitRoot);
  const recent = getRecentGitRoots(context).filter(
    (p) => p.toLowerCase() !== gitRoot.toLowerCase()
  );
  recent.unshift(gitRoot);
  await context.workspaceState.update(STATE_RECENT_ROOTS, recent.slice(0, 16));
}

interface RecentPick extends vscode.QuickPickItem {
  gitRoot: string;
}

export async function pickRecentGitRoot(
  context: vscode.ExtensionContext,
  current?: string
): Promise<string | undefined> {
  const recent = getRecentGitRoots(context);
  if (!recent.length) {
    vscode.window.showInformationMessage("还没有绑定过的 Git 仓库。");
    return undefined;
  }
  const items: RecentPick[] = recent.map((p) => {
    const norm = p.replace(/\\/g, "/");
    const slash = norm.lastIndexOf("/");
    const name = slash >= 0 ? norm.slice(slash + 1) : norm;
    const isCurrent =
      !!current && path.resolve(current).toLowerCase() === path.resolve(p).toLowerCase();
    return {
      label: (isCurrent ? "$(check) " : "$(history) ") + name,
      description: isCurrent ? "当前" : "",
      detail: p,
      gitRoot: p,
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "最近绑定的 Git 仓库",
    matchOnDetail: true,
  });
  return picked ? picked.gitRoot : undefined;
}

export function resolveUserPath(input: string): string {
  const raw = (input || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) {
    return "";
  }
  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    for (let i = 0; i < folders.length; i++) {
      const candidate = path.resolve(folders[i].uri.fsPath, raw);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return path.resolve(folders[0].uri.fsPath, raw);
  }
  return path.resolve(raw);
}

/** 只认用户指定的路径，不回退到工作区根或当前文件。 */
export async function resolveGitContext(
  preferredRoot?: string
): Promise<{ gitRoot: string; gitDir: string } | null> {
  if (!preferredRoot || !preferredRoot.trim()) {
    return null;
  }
  const start = resolveUserPath(preferredRoot);
  if (!start || !fs.existsSync(start)) {
    return null;
  }
  const gitRoot = await findGitRoot(start);
  if (!gitRoot) {
    return null;
  }
  const gitDir = await findGitDir(gitRoot);
  if (!gitDir) {
    return null;
  }
  return { gitRoot, gitDir };
}
