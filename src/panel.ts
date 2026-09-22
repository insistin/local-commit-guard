/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from "vscode";
import {
  getBoundGitRoot,
  getRecentGitRoots,
  pickRecentGitRoot,
  saveBoundGitRoot,
} from "./bind";
import {
  applyRules,
  backupNow,
  buildSnapshot,
  conflictNow,
  emptySnapshot,
  restoreNow,
  stageAllowedOnly,
} from "./service";
import { GuardSnapshot } from "./types";
import { getExtensionVersion, runCheckAndUpdate } from "./update";

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
      this.showBlocked,
      getExtensionVersion(this.context)
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
      showBlocked,
      getExtensionVersion(this.context)
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

  async openRecent(): Promise<void> {
    const picked = await pickRecentGitRoot(this.context, this.gitRoot);
    if (picked) {
      await this.bindPath(picked);
    }
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
    if (type === "recent") {
      await this.openRecent();
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
    if (type === "stageAllowed") {
      if (!this.gitRoot) {
        vscode.window.showErrorMessage("请先选择 Git 仓库路径");
        return;
      }
      const r = await stageAllowedOnly(this.gitRoot);
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
      return;
    }
    if (type === "checkUpdate") {
      await runCheckAndUpdate(this.context);
      return;
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
  showBlocked: boolean,
  extensionVersion: string
): string {
  const nonce = String(Date.now()) + Math.random().toString(16).slice(2);
  const csp = [
    "default-src 'none'",
    "style-src " + webview.cspSource + " 'unsafe-inline'",
    "script-src 'nonce-" + nonce + "'",
  ].join("; ");

  const disabled = snap.isGit ? "" : "disabled";
  const rulesJson = JSON.stringify(snap.rules);
  const hook = snap.hookInstalled ? "已生效" : "未生效";
  const armed = snap.hookInstalled ? "armed" : "idle";
  const blocked = snap.changes;
  const blockedCount = blocked.length;

  const listRules = snap.rules
    .map(
      (r) =>
        '<li class="chip"><span>' +
        esc(r) +
        '</span><button class="ghost icon del" data-del="' +
        esc(r) +
        '" title="删除" ' +
        disabled +
        ">×</button></li>"
    )
    .join("");

  const recentOpts = recent
    .map((p) => "<option value=\"" + esc(p) + "\"></option>")
    .join("");

  const blockedHtml = blocked
    .map(
      (c) =>
        "<div class='file'><span class='st'>" +
        esc(c.status) +
        "</span> " +
        esc(c.path) +
        "</div>"
    )
    .join("");

  const ico = {
    shield:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.4 8h13.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="1.15" fill="currentColor"/></svg>',
    folder:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 3.5h4.2l1.2 1.4H14.5v8H1.5v-9.4zm1 1v7.4h11V6H6.2L5 4.5H2.5z"/></svg>',
    pin:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6a3.4 3.4 0 0 0-3.4 3.4c0 2.5 3.4 6.8 3.4 6.8s3.4-4.3 3.4-6.8A3.4 3.4 0 0 0 8 1.6zm0 4.6a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zM4.2 13.2h7.6v1.2H4.2z"/></svg>',
    history:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6a6.4 6.4 0 1 0 6.2 8H13A4.9 4.9 0 1 1 8 3.1V1.6zm-.6 2.6h1.2v3.3l2.2 1.3-.6 1-2.8-1.6V4.2z"/></svg>',
    plus:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.4 2.4h1.2v4.8h4.8v1.2H8.6v4.8H7.4V8.4H2.6V7.2h4.8z"/></svg>',
    check:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4 11.2 2.8 7.6l.9-.9 2.7 2.7 5.9-5.9.9.9z"/></svg>',
    refresh:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M13.2 8A5.2 5.2 0 1 1 8 2.8V1.4L11 3.6 8 5.8V4.2A3.8 3.8 0 1 0 11.8 8h1.4z"/></svg>',
    stage:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 4.2 8 1.6l6 2.6v7.6L8 14.4 2 11.8V4.2zm1.2.7v6.2L8 13.2l4.8-2.1V4.9L8 2.8 3.2 4.9z"/></svg>',
    box:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 4.2 8 1.5l6 2.7v7.6L8 14.5 2 11.8V4.2zm6 .3L4 6.2v4.7l4 1.8 4-1.8V6.2L8 4.5z"/></svg>',
    undo:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 3.2 3 6.4l3.2 3.2.8-.8L5.2 7h5.1A2.7 2.7 0 0 1 13 9.7 2.7 2.7 0 0 1 10.3 12.4H6.4v1.2h3.9A3.9 3.9 0 0 0 14.2 9.7 3.9 3.9 0 0 0 10.3 5.8H5.2l1.8-1.8-.8-.8z"/></svg>',
    diff:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5h4.2v1.2H4.2V13H3V2.5zm5.8 0H13v1.2H8.8V2.5zM3 7.4h10v1.2H3V7.4zm5.8 4.9H13V13.5H8.8v-1.2z"/></svg>',
    eye:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 3.2C4.4 3.2 1.6 6 1 8c.6 2 3.4 4.8 7 4.8s6.4-2.8 7-4.8c-.6-2-3.4-4.8-7-4.8zm0 8.1A3.3 3.3 0 1 1 8 4.7a3.3 3.3 0 0 1 0 6.6zm0-1.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z"/></svg>',
    update:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2.2v1.3A4.5 4.5 0 1 1 3.6 9H2.2A5.8 5.8 0 1 0 8 2.2zm-.6 2.2h1.2v3.4l2.3 1.4-.6 1-2.9-1.7V4.4z"/></svg>',
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>禁止提交</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px 8px 12px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    }
    svg { width: 12px; height: 12px; display: block; flex: 0 0 auto; }
    .mast {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px 8px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.28));
      margin: -8px -8px 8px;
    }
    .mark {
      width: 26px; height: 26px; border-radius: 6px;
      display: grid; place-items: center;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .mark svg { width: 14px; height: 14px; }
    .titles { min-width: 0; flex: 1; }
    .titles strong { display: block; font-size: 12px; font-weight: 650; letter-spacing: .01em; }
    .titles span { display: block; margin-top: 1px; font-size: 10px; color: var(--vscode-descriptionForeground); }
    .pill {
      display: inline-flex; align-items: center; gap: 4px;
      height: 18px; padding: 0 6px; border-radius: 99px;
      font-size: 10px; letter-spacing: .02em;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      color: var(--vscode-descriptionForeground);
    }
    .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
    .pill.armed { color: var(--vscode-testing-iconPassed, #3fb950); }
    .pill.armed .dot { background: var(--vscode-testing-iconPassed, #3fb950); }
    .meta { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }
    .stat {
      font-size: 10px; color: var(--vscode-descriptionForeground);
      padding: 2px 0;
    }
    .stat b { color: var(--vscode-foreground); font-weight: 600; }
    section { margin: 0 0 8px; }
    .label {
      margin: 0 0 4px; font-size: 10px; letter-spacing: .08em;
      text-transform: uppercase; color: var(--vscode-descriptionForeground);
    }
    .line { display: flex; gap: 4px; align-items: center; }
    input[type=text] {
      flex: 1; min-width: 0; height: 22px; padding: 0 7px;
      font-size: 11px; border-radius: 3px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(127,127,127,.45));
    }
    input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    button {
      height: 22px; padding: 0 7px; font-size: 11px; line-height: 20px;
      border-radius: 3px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--vscode-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.4));
    }
    button:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.16)); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: transparent;
    }
    button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    button.ghost { background: transparent; }
    button.icon { width: 22px; padding: 0; justify-content: center; }
    .path {
      margin: 5px 0 0; font-family: var(--vscode-editor-font-family);
      font-size: 10px; line-height: 1.35; word-break: break-all;
      color: var(--vscode-descriptionForeground);
    }
    .warn { margin: 4px 0 0; color: var(--vscode-errorForeground); font-size: 11px; }
    ul { list-style: none; margin: 6px 0; padding: 0; }
    .chip {
      display: flex; align-items: center; gap: 6px;
      margin: 0 0 3px; padding: 2px 2px 2px 7px;
      border-radius: 3px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,.12));
    }
    .chip span {
      flex: 1; min-width: 0; font-family: var(--vscode-editor-font-family);
      font-size: 11px; word-break: break-all;
    }
    .empty { padding: 6px 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; }
    .file {
      display: flex; gap: 6px; align-items: baseline;
      font-family: var(--vscode-editor-font-family); font-size: 11px;
      padding: 2px 0; word-break: break-all;
    }
    .st { min-width: 22px; color: var(--vscode-descriptionForeground); }
    .foot {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 4px; padding-top: 6px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.28));
    }
    .ver { font-size: 10px; color: var(--vscode-descriptionForeground); }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  </style>
</head>
<body>
  <header class="mast">
    <div class="mark">${ico.shield}</div>
    <div class="titles">
      <strong>禁止提交</strong>
      <span>黑名单留在本机，其余正常提交</span>
    </div>
    <span class="pill ${armed}"><i class="dot"></i>${esc(hook)}</span>
  </header>
  <div class="meta">
    <span class="stat">保险库 <b>${snap.vaultCount}</b></span>
    <span class="stat">拦截中 <b>${blockedCount}</b></span>
  </div>
  <section>
    <p class="label">仓库</p>
    <div class="line">
      <input id="pathInput" type="text" list="recentRoots"
        placeholder="Git 项目路径，不要选多仓根目录"
        value="${esc(pathInput)}" />
      <datalist id="recentRoots">${recentOpts}</datalist>
      <button id="browseBtn" class="ghost icon" title="浏览">${ico.folder}</button>
      <button id="recentBtn" class="ghost" title="最近绑定的仓库">${ico.history}最近</button>
      <button id="bindBtn" class="primary" title="使用此仓库">${ico.pin}绑定</button>
    </div>
    <p class="path">${esc(snap.gitRoot || "未绑定仓库")}</p>
    ${snap.message ? '<p class="warn">' + esc(snap.message) + "</p>" : ""}
  </section>
  <section>
    <p class="label">黑名单</p>
    <div class="line">
      <input id="ruleInput" type="text" ${disabled}
        placeholder="短名，如 module-auth 或 config.yml" />
      <button id="addBtn" class="icon" title="添加" ${disabled}>${ico.plus}</button>
    </div>
    <ul id="ruleList">${listRules || "<li class='empty'>添加路径后点「生效」。</li>"}</ul>
    <div class="actions">
      <button id="applyBtn" class="primary" ${disabled}>${ico.check}生效</button>
      <button id="refreshBtn" class="ghost">${ico.refresh}刷新</button>
    </div>
  </section>
  <section>
    <p class="label">操作</p>
    <div class="actions">
      <button id="stageAllowedBtn" ${disabled}>${ico.stage}暂存</button>
      <button id="backupBtn" ${disabled}>${ico.box}备份</button>
      <button id="restoreBtn" ${disabled}>${ico.undo}还原</button>
      <button id="diffBtn" ${disabled}>${ico.diff}差异</button>
      <button id="blockedBtn" ${disabled}>${ico.eye}${showBlocked ? "收起" : "拦截"} ${blockedCount}</button>
    </div>
    <div id="blockedPanel" style="margin-top:6px;${showBlocked ? "" : "display:none"}">
      ${blockedCount ? blockedHtml : "<div class='empty'>没有命中黑名单的改动。</div>"}
    </div>
  </section>
  <footer class="foot">
    <span class="ver">v${esc(extensionVersion)}</span>
    <button id="updateBtn" class="ghost">${ico.update}更新</button>
  </footer>
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
        ul.innerHTML = "<li class='empty'>添加路径后点「生效」。</li>";
        return;
      }
      ul.innerHTML = rules.map(function(r) {
        return '<li class="chip"><span>' + esc(r) + '</span><button class="ghost icon del" data-del="' + esc(r) + '" title="删除">×</button></li>';
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
    document.getElementById('recentBtn').onclick = function() {
      vscode.postMessage({ type: 'recent' });
    };
    document.getElementById('ruleList').addEventListener('click', function(e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-del]') : null;
      if (t) {
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
    document.getElementById('stageAllowedBtn').onclick = function() {
      vscode.postMessage({ type: 'stageAllowed' });
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
    document.getElementById('updateBtn').onclick = function() {
      vscode.postMessage({ type: 'checkUpdate' });
    };
  </script>
</body>
</html>`;
}
