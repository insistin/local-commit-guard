/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from "vscode";
import { getBoundGitRoot } from "./bind";
import { GuardPanel, GuardViewProvider } from "./panel";
import {
  autoUnstageIfNeeded,
  backupNow,
  buildSnapshot,
  listGuardGitRoots,
  restoreNow,
  stageAllowedOnly,
} from "./service";
import { runCheckAndUpdate } from "./update";

let unstageTimer: NodeJS.Timeout | undefined;
let lastUnstageToast = 0;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const open = vscode.commands.registerCommand("localCommitGuard.open", () => {
    void GuardPanel.show();
  });
  const check = vscode.commands.registerCommand(
    "localCommitGuard.check",
    async () => {
      await GuardPanel.show();
    }
  );
  const backup = vscode.commands.registerCommand(
    "localCommitGuard.backup",
    async () => {
      try {
        const root = getBoundGitRoot(context);
        const r = await backupNow(root);
        vscode.window.showInformationMessage(
          "Local Commit Guard: 已备份 " + r.saved + " 个文件。"
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(
          "Local Commit Guard: " + (e && e.message ? e.message : String(e))
        );
      }
    }
  );
  const apply = vscode.commands.registerCommand("localCommitGuard.apply", () => {
    void GuardPanel.show();
  });
  const stageAllowed = vscode.commands.registerCommand(
    "localCommitGuard.stageAllowed",
    async () => {
      try {
        const root = getBoundGitRoot(context);
        const r = await stageAllowedOnly(root);
        const parts: string[] = [];
        if (r.staged.length) {
          parts.push("已暂存 " + r.staged.length + " 个");
        }
        if (r.skipped.length) {
          parts.push("跳过黑名单 " + r.skipped.length + " 个");
        }
        if (r.unstaged.length) {
          parts.push("移出暂存 " + r.unstaged.length + " 个");
        }
        vscode.window.showInformationMessage(
          "Local Commit Guard: " +
            (parts.length ? parts.join("，") + "。" : "没有可暂存的改动。")
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(
          "Local Commit Guard: " + (e && e.message ? e.message : String(e))
        );
      }
    }
  );
  const restore = vscode.commands.registerCommand(
    "localCommitGuard.restore",
    async () => {
      try {
        const yes = await vscode.window.showWarningMessage(
          "用保险库覆盖工作区中的对应文件？",
          { modal: true },
          "还原"
        );
        if (yes !== "还原") {
          return;
        }
        const root = getBoundGitRoot(context);
        const r = await restoreNow(root);
        vscode.window.showInformationMessage(
          "Local Commit Guard: 已还原 " + r.restored + " 个文件。"
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(
          "Local Commit Guard: " + (e && e.message ? e.message : String(e))
        );
      }
    }
  );
  const openRecent = vscode.commands.registerCommand(
    "localCommitGuard.openRecent",
    async () => {
      await GuardPanel.show();
      if (GuardViewProvider.current) {
        await GuardViewProvider.current.openRecent();
      }
    }
  );
  const checkUpdate = vscode.commands.registerCommand(
    "localCommitGuard.checkUpdate",
    async () => {
      try {
        await runCheckAndUpdate(context);
      } catch (e: any) {
        vscode.window.showErrorMessage(
          "Local Commit Guard: 检查更新失败 — " +
            (e && e.message ? e.message : String(e))
        );
      }
    }
  );

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    80
  );
  status.command = "localCommitGuard.open";
  status.text = "$(shield) 禁止提交";
  status.tooltip = "Local Commit Guard：先选择 Git 项目文件夹";
  status.show();

  const provider = new GuardViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GuardViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    open,
    check,
    backup,
    apply,
    stageAllowed,
    restore,
    checkUpdate,
    openRecent,
    status
  );

  await refreshStatus(status, context);
  watchGit(context);
}

async function refreshStatus(
  status: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): Promise<void> {
  const bound = getBoundGitRoot(context);
  if (!bound) {
    status.text = "$(shield) 禁止提交";
    status.tooltip = "未选择 Git 仓库，点击打开后手动输入或浏览路径";
    return;
  }
  const snap = await buildSnapshot(bound);
  if (!snap.isGit) {
    status.text = "$(shield) 禁止提交";
    status.tooltip = "已保存路径不是 Git 仓库，请重新选择";
    return;
  }
  const n = snap.rules.length;
  status.text = "$(shield) 禁止提交" + (n ? " · " + n : "");
  status.tooltip =
    bound + (n ? "\n已禁止 " + n + " 条路径" : "\n点击打开，添加不可提交路径");
}

function watchGit(context: vscode.ExtensionContext): void {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) {
    return;
  }
  const run = () => {
    if (unstageTimer) {
      clearTimeout(unstageTimer);
    }
    unstageTimer = setTimeout(() => {
      void (async () => {
        const roots = await listGuardGitRoots(context);
        if (!roots.length) {
          return;
        }
        const allHit: string[] = [];
        for (let i = 0; i < roots.length; i++) {
          const hit = await autoUnstageIfNeeded(roots[i]);
          for (let j = 0; j < hit.length; j++) {
            allHit.push(hit[j]);
          }
        }
        if (allHit.length > 0) {
          const now = Date.now();
          if (now - lastUnstageToast > 4000) {
            lastUnstageToast = now;
            vscode.window.showWarningMessage(
              "Local Commit Guard: 黑名单路径未加入暂存区（已移出 " +
                allHit.length +
                " 个）。"
            );
          }
        }
      })();
    }, 120);
  };
  const start = () => {
    try {
      const api = gitExt.exports.getAPI(1);
      if (!api) {
        return;
      }
      context.subscriptions.push(api.onDidOpenRepository(run));
      context.subscriptions.push(api.onDidCloseRepository(run));
      for (let i = 0; i < api.repositories.length; i++) {
        const repo = api.repositories[i];
        context.subscriptions.push(repo.state.onDidChange(run));
      }
    } catch {
      /* git API optional */
    }
  };
  if (gitExt.isActive) {
    start();
  } else {
    void gitExt.activate().then(start);
  }
}

export function deactivate(): void {
  if (unstageTimer) {
    clearTimeout(unstageTimer);
  }
}
