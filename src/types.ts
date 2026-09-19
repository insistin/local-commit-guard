/**
 * Copyright 2026 insistin (https://github.com/insistin)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GuardStore {
  version: number;
  rules: string[];
  hookInstalled?: boolean;
  updatedAt?: string;
}

export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
}

export interface ClassifiedChange {
  status: string;
  path: string;
  blocked: boolean;
}

export interface GuardSnapshot {
  gitRoot: string | null;
  gitDir: string | null;
  isGit: boolean;
  rules: string[];
  hookInstalled: boolean;
  changes: ClassifiedChange[];
  vaultCount: number;
  message?: string;
}
