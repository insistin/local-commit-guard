# Local Commit Guard

本地黑名单。**暂存**时不加入暂存区；**pre-commit** 再兜底，其余文件正常提交。`git pull` 不拦截。

许可 [Apache-2.0](LICENSE)。

## 安装

从 [Releases](https://github.com/insistin/local-commit-guard/releases) 安装最新 VSIX，或在本目录 `npm run package`。

IDE：扩展 → Install from VSIX。活动栏打开面板。详情说明来自该 VSIX 内的 README；仍是旧文时先卸载再装，然后 Reload Window。

## 使用

绑定带 `.git` 的项目目录，不要选多仓容器。**最近** 可切回已绑定的仓库。

| 输入 | 匹配 |
|------|------|
| `module-auth` | 任意层级同名目录及其文件 |
| `config.yml` | 仓库内所有同名文件 |
| `src/config` | 相对仓库根的前缀 |

**生效** 写入该仓库 `.git`（不进远程）并安装 hook。升级插件后需再点一次。

- **暂存**：只暂存允许的路径
- **拦截**：查看命中黑名单的改动
- **备份 / 还原 / 差异**：`.git/local-commit-guard-vault/`
- **更新**：从 GitHub Release 检查新版本

规则在 `.git/local-commit-guard.json`、`.git/local-commit-guard.rules`、`.git/hooks/pre-commit`。

## 开发

```powershell
npm install
npm run package
```

VSIX 写到上一级目录。源码在 `src/`，hook 脚本在 `resources/`。

---

Original author: [insistin](https://github.com/insistin)
