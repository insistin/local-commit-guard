/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as path from "path";

const BEGIN = "# >>> local-commit-guard >>>";
const END = "# <<< local-commit-guard <<<";

const WRAP = `${BEGIN}
GIT_DIR_PATH=$(git rev-parse --git-dir)
case "$GIT_DIR_PATH" in
  /*|?:*) ;;
  *) GIT_DIR_PATH="$(git rev-parse --show-toplevel)/$GIT_DIR_PATH" ;;
esac
if [ -f "$GIT_DIR_PATH/hooks/local-commit-guard.sh" ]; then
  sh "$GIT_DIR_PATH/hooks/local-commit-guard.sh" || exit $?
fi
${END}
`;

function hooksDir(gitDir: string): string {
  return path.join(gitDir, "hooks");
}

function preCommitPath(gitDir: string): string {
  return path.join(hooksDir(gitDir), "pre-commit");
}

function guardHookPath(gitDir: string): string {
  return path.join(hooksDir(gitDir), "local-commit-guard.sh");
}

export function installHook(gitDir: string, extensionRoot: string): void {
  const dir = hooksDir(gitDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const src = path.join(extensionRoot, "resources", "local-commit-guard.sh");
  const dest = guardHookPath(gitDir);
  fs.copyFileSync(src, dest);

  const pc = preCommitPath(gitDir);
  if (!fs.existsSync(pc)) {
    const body = "#!/bin/sh\n" + WRAP + "\n";
    fs.writeFileSync(pc, body.replace(/\r\n/g, "\n"), "utf8");
    return;
  }

  let existing = fs.readFileSync(pc, "utf8");
  existing = existing.replace(/\r\n/g, "\n");
  if (existing.indexOf(BEGIN) >= 0) {
    const re = new RegExp(
      BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "[\\s\\S]*?" +
        END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "\\n?",
      "m"
    );
    existing = existing.replace(re, WRAP);
  } else {
    if (existing.startsWith("#!")) {
      const nl = existing.indexOf("\n");
      if (nl >= 0) {
        existing =
          existing.slice(0, nl + 1) + WRAP + "\n" + existing.slice(nl + 1);
      } else {
        existing = existing + "\n" + WRAP;
      }
    } else {
      existing = "#!/bin/sh\n" + WRAP + "\n" + existing;
    }
  }
  fs.writeFileSync(pc, existing, "utf8");
}

export function hookInstalled(gitDir: string): boolean {
  try {
    if (!fs.existsSync(guardHookPath(gitDir))) {
      return false;
    }
    if (!fs.existsSync(preCommitPath(gitDir))) {
      return false;
    }
    const t = fs.readFileSync(preCommitPath(gitDir), "utf8");
    return t.indexOf(BEGIN) >= 0;
  } catch {
    return false;
  }
}
