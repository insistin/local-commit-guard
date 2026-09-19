/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs when the extension is uninstalled (vscode:uninstall).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const PREFIXES = [
  "insistin.local-commit-guard-",
  "local-dev.local-commit-guard-",
];
const homes = [
  path.join(os.homedir(), ".cursor", "extensions"),
  path.join(os.homedir(), ".vscode", "extensions"),
  path.join(os.homedir(), ".trae", "extensions"),
  path.join(os.homedir(), ".codebuddy", "extensions"),
];

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (e) {
    try {
      fs.rmdirSync(dir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}

for (let i = 0; i < homes.length; i++) {
  const root = homes[i];
  if (!fs.existsSync(root)) {
    continue;
  }
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    continue;
  }
  for (let j = 0; j < names.length; j++) {
    const name = names[j];
    if (!PREFIXES.some((p) => name.indexOf(p) === 0)) {
      continue;
    }
    rmDir(path.join(root, name));
  }
}

const marker = path.join(os.tmpdir(), "local-commit-guard-uninstalled");
try {
  fs.writeFileSync(marker, String(Date.now()));
} catch {
  /* ignore */
}
