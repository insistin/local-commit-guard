/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from "vscode";
import {
  getBoundGitRoot,
  getRecentGitRoots,
  saveBoundGitRoot,
} from "./bind";
import {
  applyRules,
  backupNow,
  buildSnapshot,
  conflictNow,
  emptySnapshot,
  restoreNow,
} from "./service";
import { GuardSnapshot } from "./types";

export class GuardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "localCommitGuard.sidebar";
  public static current: GuardViewProvider | undefined;

  private view: vscode.WebviewView | undefined;
  private gitRoot: string | undefined;
  private showBlocked = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    GuardViewProvider.current = this;
    this.view = webviewView;
    this.gitRoot = getBoundGitRoot(this.context);
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this.onMessage(msg);
      } catch (e: any) {
        vscode.window.showErrorMessage(
          "Local Commit Guard: " + (e && e.message ? e.message : String(e))
        );
      }
    });
    void this.refresh();
  }

  private get webview(): vscode.Webview | undefined {
    return this.view ? this.view.webview : undefined;
  }

  async refresh(): Promise<void> {
    const wv = this.webview;
    if (!wv) {
      return;
    }
    this.gitRoot = this.gitRoot || getBoundGitRoot(this.context);
    const snap = this.gitRoot
      ? await buildSnapshot(this.gitRoot)
      : emptySnapshot();
    if (snap.gitRoot) {
      this.gitRoot = snap.gitRoot;
    }
    wv.html = renderHtml(
      wv,
      snap,
      this.gitRoot || "",
      getRecentGitRoots(this.context),
      this.showBlocked
    );
  }

  private setHtml(
    snap: GuardSnapshot,
    pathInput: string,
    showBlocked: boolean
  ): void {
    const wv = this.webview;
    if (!wv) {
      return;
    }
    wv.html = renderHtml(
      wv,
      snap,
      pathInput,
      getRecentGitRoots(this.context),
      showBlocked
    );
  }

  private async bindPath(raw: string): Promise<void> {
    const snap = await buildSnapshot(raw);
    if (!snap.isGit || !snap.gitRoot) {
      vscode.window.showErrorMessage(
        "该路径不是 Git 仓库，请选择具体项目文件夹（不要选只用来放多个仓库的根目录）。"
      );
      this.setHtml(snap, raw, false);
      return;
    }
    this.gitRoot = snap.gitRoot;
    this.showBlocked = false;
    await saveBoundGitRoot(this.context, snap.gitRoot);
    vscode.window.showInformationMessage("已绑定仓库：" + snap.gitRoot);
    await this.refresh();
  }

  private async onMessage(msg: any): Promise<void> {
    const type = msg && msg.type;
    if (type === "refresh") {
      await this.refresh();
      return;
    }
    if (type === "bindPath") {
      await this.bindPath(String(msg.path || ""));
      return;
    }
    if (type === "browse") {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择 Git 项目文件夹",
        defaultUri: this.gitRoot
          ? vscode.Uri.file(this.gitRoot)
          : vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders[0]
          ? vscode.workspace.workspaceFolders[0].uri
          : undefined,
      });
      if (picked && picked[0]) {
        await this.bindPath(picked[0].fsPath);
      }
      return;
    }
    if (type === "toggleBlocked") {
      this.showBlocked = !this.showBlocked;
      await this.refresh();
      return;
    }
    if (type === "apply") {
      if (!this.gitRoot) {
        vscode.window.showErrorMessage("请先选择 Git 仓库路径");
        return;
      }
      const rules = Array.isArray(msg.rules) ? msg.rules : [];
      const snap = await applyRules(
        rules,
        this.context.extensionPath,
        this.gitRoot
      );
      if (snap.gitRoot) {
        this.gitRoot = snap.gitRoot;
      }
      vscode.window.showInformationMessage(
        snap.hookInstalled
          ? "已生效：黑名单路径无法提交，pre-commit 已安装。"
          : "规则已保存。"
      );
      this.setHtml(snap, this.gitRoot || "", this.showBlocked);
      return;
    }
    if (type === "backup") {
      const r = await backupNow(this.gitRoot);
      vscode.window.showInformationMessage(
        "已备份 " + r.saved + " 个本地专用文件到保险库。"
      );
      await this.refresh();
      return;
    }
    if (type === "restore") {
      const yes = await vscode.window.showWarningMessage(
        "用保险库覆盖工作区中的对应文件？未备份的本地修改会丢失。",
        { modal: true },
        "还原"
      );
      if (yes !== "还原") {
        return;
      }
      const r = await restoreNow(this.gitRoot);
      vscode.window.showInformationMessage(
        "已从保险库还原 " + r.restored + " 个文件。"
      );
      await this.refresh();
      return;
    }
    if (type === "conflicts") {
      const hits = await conflictNow(this.gitRoot);
      if (hits.length === 0) {
        vscode.window.showInformationMessage(
          "保险库与工作区无差异（或尚未备份）。"
        );
      } else {
        vscode.window.showWarningMessage(
          "以下文件工作区与备份不同（拉取后常见）：\n" +
            hits.slice(0, 20).join("\n") +
            (hits.length > 20 ? "\n…" : "") +
            "\n需要保留本地时点「从备份还原」。"
        );
      }
    }
  }
}

export class GuardPanel {
  static async show(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.view.extension.localCommitGuard"
    );
    if (GuardViewProvider.current) {
      await GuardViewProvider.current.refresh();
    }
  }
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(
  webview: vscode.Webview,
  snap: GuardSnapshot,
  pathInput: string,
  recent: string[],
  showBlocked: boolean
): string {
  const nonce = String(Date.now()) + Math.random().toString(16).slice(2);
  const csp = [
    "default-src 'none'",
    "style-src " + webview.cspSource + " 'unsafe-inline'",
    "script-src 'nonce-" + nonce + "'",
  ].join("; ");

  const disabled = snap.isGit ? "" : "disabled";
  const rulesJson = JSON.stringify(snap.rules);
  const hook = snap.hookInstalled ? "已安装 pre-commit" : "尚未生效";
  const blocked = snap.changes;
  const blockedCount = blocked.length;

  const listRules = snap.rules
    .map(
      (r) =>
        '<li><code>' +
        esc(r) +
        '</code> <button class="del" data-del="' +
        esc(r) +
        '" ' +
        disabled +
        ">删除</button></li>"
    )
    .join("");

  const recentOpts = recent
    .map((p) => "<option value=\"" + esc(p) + "\"></option>")
    .join("");

  const blockedHtml = blocked
    .map(
      (c) =>
        "<div class='row'><span class='st'>" +
        esc(c.status) +
        "</span> " +
        esc(c.path) +
        "</div>"
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>禁止提交</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
      background: var(--vscode-editor-background); padding: 10px; font-size: 12px; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    .muted { opacity: 0.75; margin: 0 0 12px; line-height: 1.5; }
    .box { border: 1px solid var(--vscode-widget-border, #444); padding: 10px 12px; margin: 12px 0; border-radius: 4px; }
    .row-flex { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    input[type=text] { flex: 1; min-width: 180px; padding: 6px 8px; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #555); }
    button { padding: 5px 10px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    ul { padding-left: 18px; }
    li { margin: 4px 0; }
    code { font-family: var(--vscode-editor-font-family); }
    .st { display: inline-block; min-width: 28px; opacity: 0.7; }
    .row { font-family: var(--vscode-editor-font-family); font-size: 12px; margin: 2px 0; word-break: break-all; }
    .warn { color: var(--vscode-errorForeground); }
    h2 { font-size: 13px; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>Local Commit Guard</h1>
  <p class="muted">先指定具体 Git 项目文件夹（不要用只存放多个仓库的根目录）。黑名单路径不能提交；拉取仍会更新它们。</p>
  <div class="box">
    <h2>Git 仓库路径</h2>
    <div class="row-flex">
      <input id="pathInput" type="text" list="recentRoots"
        placeholder="绝对路径，或相对工作区的子目录名，如 app-server"
        value="${esc(pathInput)}" />
      <datalist id="recentRoots">${recentOpts}</datalist>
      <button id="browseBtn">浏览</button>
      <button id="bindBtn">使用此仓库</button>
    </div>
    <div style="margin-top:8px">当前绑定：<code>${esc(snap.gitRoot || "未选择")}</code></div>
    <div>钩子：${esc(hook)}　保险库文件：${snap.vaultCount}</div>
    ${snap.message ? '<p class="warn">' + esc(snap.message) + "</p>" : ""}
  </div>
  <div class="box">
    <div class="row-flex">
      <input id="ruleInput" type="text" ${disabled}
        placeholder="输入路径或文件名，如 module-auth 或 config.yml" />
      <button id="addBtn" ${disabled}>添加</button>
    </div>
    <h2>已禁止提交的路径</h2>
    <ul id="ruleList">${listRules || "<li class='muted'>（空）点添加后，再点「确定并生效」</li>"}</ul>
    <div class="row-flex">
      <button id="applyBtn" ${disabled}>确定并生效</button>
      <button id="refreshBtn">刷新</button>
    </div>
  </div>
  <div class="box">
    <div class="row-flex">
      <button id="backupBtn" ${disabled}>备份本地改动</button>
      <button id="restoreBtn" ${disabled}>从备份还原</button>
      <button id="diffBtn" ${disabled}>查看备份差异</button>
      <button id="blockedBtn" ${disabled}>${showBlocked ? "收起不能提交的改动" : "查看不能提交的改动"}（${blockedCount}）</button>
    </div>
    <div id="blockedPanel" style="margin-top:10px;${showBlocked ? "" : "display:none"}">
      <h2 class="warn">不能提交的改动（${blockedCount}）</h2>
      ${blockedCount ? blockedHtml : "<div class='muted'>当前没有命中黑名单的改动。</div>"}
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let rules = ${rulesJson};
    const input = document.getElementById('ruleInput');
    const pathInput = document.getElementById('pathInput');
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function renderRules() {
      const ul = document.getElementById('ruleList');
      if (!rules.length) {
        ul.innerHTML = "<li class='muted'>（空）点添加后，再点「确定并生效」</li>";
        return;
      }
      ul.innerHTML = rules.map(function(r) {
        return '<li><code>' + esc(r) + '</code> <button class="del" data-del="' + esc(r) + '">删除</button></li>';
      }).join('');
    }
    function addRule() {
      const v = (input.value || '').trim();
      if (!v) return;
      let exists = false;
      for (let i = 0; i < rules.length; i++) {
        if (rules[i] === v) exists = true;
      }
      if (!exists) rules.push(v);
      input.value = '';
      renderRules();
    }
    document.getElementById('addBtn').onclick = addRule;
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') addRule();
    });
    pathInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        vscode.postMessage({ type: 'bindPath', path: pathInput.value });
      }
    });
    document.getElementById('bindBtn').onclick = function() {
      vscode.postMessage({ type: 'bindPath', path: pathInput.value });
    };
    document.getElementById('browseBtn').onclick = function() {
      vscode.postMessage({ type: 'browse' });
    };
    document.getElementById('ruleList').addEventListener('click', function(e) {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-del')) {
        const r = t.getAttribute('data-del');
        rules = rules.filter(function(x) { return x !== r; });
        renderRules();
      }
    });
    document.getElementById('applyBtn').onclick = function() {
      vscode.postMessage({ type: 'apply', rules: rules });
    };
    document.getElementById('refreshBtn').onclick = function() {
      vscode.postMessage({ type: 'refresh' });
    };
    document.getElementById('backupBtn').onclick = function() {
      vscode.postMessage({ type: 'backup' });
    };
    document.getElementById('restoreBtn').onclick = function() {
      vscode.postMessage({ type: 'restore' });
    };
    document.getElementById('diffBtn').onclick = function() {
      vscode.postMessage({ type: 'conflicts' });
    };
    document.getElementById('blockedBtn').onclick = function() {
      vscode.postMessage({ type: 'toggleBlocked' });
    };
  </script>
</body>
</html>`;
}
