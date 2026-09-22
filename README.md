# Local Commit Guard

通用 Git 本地提交守卫：把「只想留在本机、不要提交」的目录或文件名加入黑名单。两层拦截：插件里 **暂存** 时不把黑名单放进暂存区；**提交 hook** 再兜底，暂存区里若仍有黑名单会先移出，其余文件正常提交。

拉取（`git pull` / `git fetch`）**不拦截**，远程更新会进来。本机改动可先备份，冲突时再还原。

适用于任意 Git 仓库。Cursor、Trae、CodeBuddy 等 VS Code 兼容 IDE 均可从 VSIX 安装（优先保证 Cursor）。许可：[Apache License 2.0](LICENSE)。

---

## 它解决什么问题

多人共用一个仓库时，本地常会改：

- 某个子模块、网关、鉴权等目录（联调用，不应推上去）
- 全仓同名配置，如 `application.yml`、`.env`

直接 `git add .` 很容易把这些一并提交。本插件在 **暂存** 时跳过黑名单，并在 **pre-commit** 再拦一次；规则写在当前仓库的 `.git` 里，不会进远程。

---

## 安装

1. 用 `npm run package` 生成 VSIX，或使用仓库旁已打好的安装包。
2. IDE：扩展视图 → `...` → **Install from VSIX...** → 选择该文件。
3. 安装后左侧活动栏会出现拦线圆点图标，点开即本插件界面。扩展详情里的说明来自该安装包中的 README，装上更新的 VSIX 后即为对应版本。若详情仍是旧文，先卸载本扩展，再安装新 VSIX，然后 **Developer: Reload Window**。
4. 也可点状态栏 **禁止提交**，或命令面板搜索 `Local Commit Guard: 打开` / `检查更新`。

工作区根目录不必是 Git 仓库。插件**不会**自动把工作区根当项目使用。

若卸载后扩展列表仍有残留，命令面板执行 **Developer: Reload Window**。

---

## 使用

### 先选择 Git 项目

常见结构：一个文件夹里放多个独立 Git 仓，根目录本身不是仓库。

```text
workspace/                 ← 只是容器，不要选这个
  ├── app-a/               ← 有 .git，选这个
  └── app-b/               ← 另一个 Git 项目
```

1. 在「Git 仓库路径」填绝对路径，或相对工作区的子目录名（如 `app-a`）。
2. 也可点 **浏览** 选文件夹。
3. 点 **使用此仓库**。顶部「当前绑定」应显示该仓的 Git 根路径。
4. 选错了再改路径，重新点「使用此仓库」。上次成功绑定的路径会记住。

未绑定仓库时，规则相关按钮不可用。

### 添加黑名单

输入框只填 **短名**，不必写 `/**`。

| 你输入 | 实际匹配 |
|--------|----------|
| `module-auth` | 任意层级下名为 `module-auth` 的目录及其全部文件 |
| `config.yml` | 仓库内所有同名文件 |
| `src/config` | 相对仓库根的前缀路径（含该目录下全部文件） |

1. 输入 → **添加**（可多次）。列表中可查看、删除。
2. 点 **确定并生效**：写入该仓库 `.git`，并安装 hook。
3. 点侧边栏 **暂存**：只把允许的路径加入暂存区，黑名单不会进暂存。
4. **提交时兜底**：若暂存区仍有黑名单文件，提交前 hook 会移出它们，其余文件正常提交。
5. 需要核对时，点 **拦截**。
6. **最近**：打开曾经绑定过的仓库列表，点选即切换，类似 Open Recent。

### 拉代码

禁止提交 ≠ 禁止拉取。

- 拉之前：**备份本地改动**（拷到当前仓库 `.git/local-commit-guard-vault/`，仅本机）。
- 拉完若本地配置被远程覆盖：**从备份还原**。
- **查看备份差异**：工作区与备份不一致时列出。

建议：有本地未提交改动时先备份再 pull；默认吃远程新代码，需要本地版本再还原。

暂存在插件里完成。规则更新或升级插件后，请再点一次 **生效**，以便刷新 `.git/hooks` 里的提交检查脚本。

侧边栏底部 **检查更新** 会从 GitHub 拉取最新版；若发布页附带 `.vsix` 可一键下载安装。

---

## 规则落在哪（每个 Git 仓库一份）

均在 **该仓库 `.git` 目录内**，不会被 `git add` 进版本库：

| 路径 | 作用 |
|------|------|
| `.git/local-commit-guard.json` | 规则主数据（插件读写） |
| `.git/local-commit-guard.rules` | 给 hook 用的纯文本名单 |
| `.git/hooks/local-commit-guard.sh` | 提交前检查脚本 |
| `.git/hooks/pre-commit` | 包装调用上述脚本（已有 hook 则插入片段，不整文件覆盖） |
| `.git/local-commit-guard-vault/` | 本机备份镜像 |

换一台电脑或删掉 `.git` 后规则需重新添加。

---

## 本仓库结构

```text
local-commit-guard/
├── package.json
├── tsconfig.json
├── .vscodeignore
├── README.md
├── LICENSE
├── NOTICE
├── AUTHORS.md
├── CONTRIBUTING.md
├── media/
│   ├── icon.png
│   └── shield.svg
├── resources/
│   ├── local-commit-guard.sh
│   └── uninstall.js
├── scripts/
│   ├── package.ps1
│   └── test-matcher.js
├── src/
│   ├── extension.ts
│   ├── panel.ts
│   ├── bind.ts
│   ├── service.ts
│   ├── matcher.ts
│   ├── git.ts
│   ├── store.ts
│   ├── hook.ts
│   ├── vault.ts
│   └── types.ts
└── out/
```

安装到 IDE 后运行的是 VSIX 里的 `out/` 与 `resources/`。业务仓库只多上述 `.git/local-commit-guard*` 文件。

---

## 从源码打包

在本扩展根目录执行：

```powershell
npm install
npm run compile
npm run package
```

或：`.\scripts\package.ps1`

生成的 VSIX 默认写在上一级目录。

---

Original author: [insistin](https://github.com/insistin)
