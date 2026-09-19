# Local Commit Guard

**原始作者 Original author: [insistin](https://github.com/insistin)**  
原始仓库: https://github.com/insistin/local-commit-guard  
许可: [Apache License 2.0](LICENSE)（允许二次开发与分发，**必须保留原始作者署名与 NOTICE**）

通用 Git 本地提交守卫：把「只想留在本机、不要提交」的目录或文件名加入黑名单。命中规则的路径无法进入 commit；其余路径正常提交。

拉取（`git pull` / `git fetch`）**不拦截**，远程更新会进来。本机改动可先备份，冲突时再还原。

适用于任意 Git 仓库，不绑定特定业务工程。Cursor、Trae、CodeBuddy 等 VS Code 兼容 IDE 均可从 VSIX 安装（优先保证 Cursor）。

---

## 它解决什么问题

多人共用一个仓库时，本地常会改：

- 某个子模块、网关、鉴权等目录（联调用，不应推上去）
- 全仓同名配置，如 `application.yml`、`.env`

直接 `git add .` 很容易把这些一并提交。本插件用 **短名黑名单 + pre-commit 硬拦**，避免误提交；规则写在当前仓库的 `.git` 里，不会进远程。

---

## 安装

1. 使用已打包的 `local-commit-guard-0.1.1.vsix`（与本目录同级，或自行打包生成）。
2. **若已安装旧版**：先在扩展列表卸载 Local Commit Guard，命令面板执行 **Developer: Reload Window**，再装新 VSIX。同版本重装时 IDE 会缓存旧介绍，所以版本号会递增。
3. IDE：扩展视图 → `...` → **Install from VSIX...** → 选择该文件。
4. 安装后左侧活动栏会出现盾牌图标，点开即本插件界面。扩展列表中也会显示蓝色盾牌图标。
5. 也可点状态栏 **禁止提交**，或命令面板搜索 `Local Commit Guard: 打开`。

卸载后扩展列表应消失；若仍残留，再执行一次 **Reload Window**。重新安装会带上本 README 的最新介绍。

工作区根目录不必是 Git 仓库。插件**不会**自动把工作区根当项目使用。

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
2. 点 **确定并生效**：写入该仓库 `.git`，并安装 / 包装 `pre-commit`。
3. 之后 Git 面板或终端 `git commit`，暂存区若含黑名单路径会被拒绝；插件也会尽量把它们从暂存区移出。
4. **未列入名单的路径都可以提交**（界面不列出可提交文件，避免刷屏）。
5. 需要核对拦截结果时，点 **查看不能提交的改动**。

### 拉代码

禁止提交 ≠ 禁止拉取。

- 拉之前：**备份本地改动**（拷到当前仓库 `.git/local-commit-guard-vault/`，仅本机）。
- 拉完若本地文件被远程覆盖：**从备份还原**。
- **查看备份差异**：工作区与备份不一致时列出。

建议：有本地未提交改动时先备份再 pull；默认吃远程新代码，需要本地版本再还原。不要用 skip-worktree 长期挡住拉取，否则远程修复进不来。

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

## 本仓库（插件源码）结构

```text
local-commit-guard/
├── package.json              # 扩展清单：命令、引擎版本、打包脚本
├── tsconfig.json             # TypeScript 编译到 out/
├── .vscodeignore             # 打进 VSIX 时排除的文件
├── README.md                 # 本说明
├── LICENSE
├── media/
│   ├── icon.png              # 扩展列表 128×128 图标
│   └── shield.svg            # 左侧活动栏图标
├── resources/
│   ├── local-commit-guard.sh
│   └── uninstall.js          # 卸载时清理残留扩展目录
├── scripts/
│   ├── package.ps1           # npm install → 编译 → 测试 → 打 vsix
│   └── test-matcher.js       # 短名匹配单测
├── src/
│   ├── extension.ts          # 激活：命令、状态栏、打开面板、自动移出暂存
│   ├── panel.ts              # Webview 界面
│   ├── bind.ts               # 手动绑定 Git 路径（不默认工作区根）
│   ├── service.ts            # 应用规则、备份/还原入口
│   ├── matcher.ts            # 短名 / 前缀匹配
│   ├── git.ts                # 调用 git：status、暂存、unstage
│   ├── store.ts              # 读写 .git 下 json / rules
│   ├── hook.ts               # 把检查脚本装进 pre-commit
│   ├── vault.ts              # 保险库拷贝与差异
│   └── types.ts
└── out/                      # tsc 产物（打进 VSIX）
```

安装到 IDE 后，运行的是 VSIX 里的 `out/` + `resources/`，与你正在开发的业务仓库无关。业务仓库只多上述 `.git/local-commit-guard*` 文件。

---

## 从源码打包

在本扩展根目录执行：

```powershell
npm install
npm run compile
npm run package
```

或：`.\scripts\package.ps1`

默认在 **上一级目录** 生成 `local-commit-guard-0.1.1.vsix`。

---

## 版权与二次开发

- 原始作者：**insistin**（https://github.com/insistin）
- 协议：Apache-2.0。他人可以 fork、修改、再发布，但必须保留 `LICENSE`、`NOTICE`、`AUTHORS.md` 中的原始作者信息。
- 详见 [NOTICE](NOTICE)、[AUTHORS.md](AUTHORS.md)、[CONTRIBUTING.md](CONTRIBUTING.md)。

## 发布到 GitHub

在本目录（`local-commit-guard`）初始化并推到你的账号（需已登录 `gh` / `git`）：

```powershell
cd E:\workspace\plugins\local-commit-guard
git init
git add .
git commit -m "Initial commit: Local Commit Guard by insistin"
gh repo create local-commit-guard --public --source=. --remote=origin --push
```

仓库请建在 **https://github.com/insistin/local-commit-guard**，作为首次公开发布记录。
