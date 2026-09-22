/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const REPO = "insistin/local-commit-guard";
const RELEASES_LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
const PACKAGE_JSON_MAIN =
  "https://raw.githubusercontent.com/" + REPO + "/main/package.json";
const RELEASES_PAGE = "https://github.com/" + REPO + "/releases";

export interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseUrl: string;
  releaseNotes?: string;
}

function parseVersion(v: string): number[] {
  return String(v || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => {
      const x = parseInt(n, 10);
      return isNaN(x) ? 0 : x;
    });
}

export function isVersionNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) {
      return true;
    }
    if (x < y) {
      return false;
    }
  }
  return false;
}

function requestText(url: string, redirect = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirect > 8) {
      reject(new Error("重定向过多"));
      return;
    }
    const lib = url.indexOf("https:") === 0 ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "local-commit-guard-update",
          Accept: "application/vnd.github+json, application/json, text/plain",
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          requestText(res.headers.location, redirect + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (code < 200 || code >= 300) {
          reject(new Error("HTTP " + code));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("请求超时"));
    });
  });
}

function requestJson(url: string): Promise<any> {
  return requestText(url).then((t) => JSON.parse(t));
}

async function fetchLatestFromMainPackage(): Promise<{
  latest: string;
  releaseUrl: string;
}> {
  const pkg = await requestJson(PACKAGE_JSON_MAIN);
  const latest = String((pkg && pkg.version) || "").trim();
  if (!latest) {
    throw new Error("无法读取远程版本号");
  }
  return { latest, releaseUrl: RELEASES_PAGE };
}

export async function fetchUpdateInfo(current: string): Promise<UpdateInfo> {
  let latest = current;
  let downloadUrl: string | undefined;
  let releaseUrl = RELEASES_PAGE;
  let releaseNotes: string | undefined;

  try {
    const release = await requestJson(RELEASES_LATEST);
    latest = String(release.tag_name || release.name || "")
      .replace(/^v/i, "")
      .trim();
    if (!latest && release.name) {
      latest = String(release.name).replace(/^v/i, "").trim();
    }
    releaseUrl = String(release.html_url || RELEASES_PAGE);
    releaseNotes = release.body ? String(release.body).slice(0, 500) : undefined;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const name = String(a.name || "");
      if (name.indexOf(".vsix") >= 0) {
        downloadUrl = String(a.browser_download_url || "");
        break;
      }
    }
  } catch {
    const fallback = await fetchLatestFromMainPackage();
    latest = fallback.latest;
    releaseUrl = fallback.releaseUrl;
  }

  if (!latest) {
    throw new Error("无法获取最新版本");
  }

  return {
    current,
    latest,
    hasUpdate: isVersionNewer(latest, current),
    downloadUrl,
    releaseUrl,
    releaseNotes,
  };
}

function downloadFile(url: string, dest: string, redirect = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirect > 8) {
      reject(new Error("下载重定向过多"));
      return;
    }
    const lib = url.indexOf("https:") === 0 ? https : http;
    const file = fs.createWriteStream(dest);
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "local-commit-guard-update",
          Accept: "application/octet-stream",
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {
            downloadFile(res.headers.location as string, dest, redirect + 1)
              .then(resolve)
              .catch(reject);
          });
          return;
        }
        if (code < 200 || code >= 300) {
          file.close();
          fs.unlink(dest, () => {
            reject(new Error("下载失败 HTTP " + code));
          });
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      }
    );
    req.on("error", (err) => {
      file.close();
      fs.unlink(dest, () => reject(err));
    });
    req.setTimeout(120000, () => {
      req.destroy(new Error("下载超时"));
    });
  });
}

async function installVsix(vsixPath: string): Promise<boolean> {
  const uri = vscode.Uri.file(vsixPath);
  const commands = [
    "workbench.extensions.action.installVSIX",
    "workbench.extensions.command.installFromVSIX",
  ];
  for (let i = 0; i < commands.length; i++) {
    try {
      await vscode.commands.executeCommand(commands[i], uri);
      return true;
    } catch {
      /* try next */
    }
  }
  const pick = await vscode.window.showInformationMessage(
    "已下载更新包：" + vsixPath + "\n若未自动安装，请扩展视图 → … → Install from VSIX",
    "打开文件位置"
  );
  if (pick === "打开文件位置") {
    await vscode.commands.executeCommand("revealFileInOS", uri);
  }
  return false;
}

export function getExtensionVersion(context: vscode.ExtensionContext): string {
  const ext = context.extension.packageJSON;
  return String((ext && ext.version) || "0.0.0");
}

export async function runCheckAndUpdate(
  context: vscode.ExtensionContext
): Promise<UpdateInfo> {
  const current = getExtensionVersion(context);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Local Commit Guard",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "正在检查更新…" });
      const info = await fetchUpdateInfo(current);
      await context.globalState.update("localCommitGuard.lastUpdateCheck", {
        at: new Date().toISOString(),
        info,
      });

      if (!info.hasUpdate) {
        vscode.window.showInformationMessage(
          "Local Commit Guard 已是最新版本（" + current + "）。"
        );
        return info;
      }

      const msg =
        "发现新版本 " +
        info.latest +
        "（当前 " +
        current +
        "）。是否下载并安装？";
      const yes = await vscode.window.showInformationMessage(msg, "更新", "查看发布页");
      if (yes === "查看发布页") {
        await vscode.env.openExternal(vscode.Uri.parse(info.releaseUrl));
        return info;
      }
      if (yes !== "更新") {
        return info;
      }

      if (!info.downloadUrl) {
        const manual = await vscode.window.showWarningMessage(
          "GitHub 发布页暂无 VSIX 安装包，请手动下载或本地打包安装。",
          "打开发布页"
        );
        if (manual === "打开发布页") {
          await vscode.env.openExternal(vscode.Uri.parse(info.releaseUrl));
        }
        return info;
      }

      progress.report({ message: "正在下载 " + info.latest + "…" });
      const dir = path.join(
        context.globalStorageUri.fsPath,
        "updates"
      );
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fileName = "local-commit-guard-" + info.latest + ".vsix";
      const dest = path.join(dir, fileName);
      await downloadFile(info.downloadUrl, dest);

      progress.report({ message: "正在安装…" });
      const installed = await installVsix(dest);
      if (installed) {
        const reload = await vscode.window.showInformationMessage(
          "Local Commit Guard " +
            info.latest +
            " 已安装，重新加载窗口后生效。",
          "重新加载窗口"
        );
        if (reload === "重新加载窗口") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      }
      return info;
    }
  );
}
