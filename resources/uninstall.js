/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs when this copy is uninstalled. Removes this version and older copies
 * so the extension list does not keep a stale README. A newer version already
 * on disk is left in place.
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

function parseVer(name) {
  const m = String(name).match(/-(\d+)\.(\d+)\.(\d+)(?:-|$)/);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    try {
      fs.rmdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

const selfRoot = path.resolve(__dirname, "..");
const selfName = path.basename(selfRoot);
const selfVer = parseVer(selfName);

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
    const ver = parseVer(name);
    if (selfVer && ver && cmpVer(ver, selfVer) > 0) {
      continue;
    }
    rmDir(path.join(root, name));
  }
}

if (fs.existsSync(selfRoot)) {
  rmDir(selfRoot);
}
