# 深入理解 Git

本文档面向企业开发团队，从底层原理到高级用法，系统讲解 Git 的核心概念。

---

## 一、Git 的本质：内容寻址的文件系统

Git 的底层是一个**内容寻址 (content-addressable) 的键值数据库**。所有数据都以对象的形式存储在 `.git/objects/` 目录中，每个对象通过其内容的 SHA-1 哈希值唯一标识。

### 1.1 四种核心对象

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  commit  │────▶│   tree   │────▶│   blob   │
│  提交对象 │     │  树对象   │     │  数据对象 │
└──────────┘     └──────────┘     └──────────┘
      │
      ▼
┌──────────┐
│  commit  │  (父提交)
│  提交对象 │
└──────────┘
```

| 对象类型 | 存储内容 | 类比 |
|---------|---------|------|
| **blob** | 文件内容（不含文件名） | 文件的某一个版本 |
| **tree** | 目录结构，包含文件名与对应 blob/tree 的引用 | 目录快照 |
| **commit** | 指向 tree、父提交、作者、提交信息 | 一次保存操作 |
| **tag** | 指向某个 commit 的带注释标签 | 里程碑标记 |

### 1.2 动手验证

```bash
# 查看对象类型
git cat-file -t <hash>

# 查看对象内容
git cat-file -p <hash>

# 查看某个 commit 指向的 tree
git cat-file -p HEAD

# 查看 tree 中的文件列表
git cat-file -p HEAD^{tree}
```

### 1.3 对象存储机制

Git 对每个对象执行以下操作：

```
内容 → 添加头部(类型 + 大小) → SHA-1 哈希 → zlib 压缩 → 写入 .git/objects/ab/cdef...
```

- 相同内容的文件只存储一份 blob（天然去重）
- 对象一旦写入即不可变（immutable）
- 大量小文件会被打包为 `.pack` 文件以节省空间（`git gc`）

---

## 二、三个工作区域与文件状态

```
┌─────────────┐    git add    ┌─────────────┐   git commit   ┌─────────────┐
│  工作目录     │ ───────────▶ │  暂存区/索引  │ ─────────────▶ │  本地仓库    │
│ Working Dir  │              │ Staging/Index│               │  Repository │
└─────────────┘              └─────────────┘               └─────────────┘
       ▲                                                          │
       └──────────────────── git checkout ────────────────────────┘
```

### 2.1 暂存区（Index）的真正含义

暂存区是 `.git/index` 文件，它是下一次提交的**预备快照**：

```bash
# 查看暂存区内容
git ls-files --stage

# 输出示例：
# 100644 a1b2c3d4... 0   src/main.py
# 100644 e5f6a7b8... 0   README.md
```

关键理解：**暂存区不是「改动的列表」，而是「完整的文件快照」。** `git add` 实际上是将文件的当前完整内容写入对象库并更新索引。

### 2.2 文件状态流转

```
Untracked ──git add──▶ Staged ──git commit──▶ Committed (Unmodified)
                          ▲                         │
                          │                    修改文件
                          │                         ▼
                       git add◀── Modified ◀────────┘
```

---

## 三、分支的本质：指针

### 3.1 分支只是一个文件

```bash
# 分支本质上是 .git/refs/heads/ 下的一个文件
cat .git/refs/heads/main
# 输出：某个 commit 的 40 位 SHA-1 哈希

# HEAD 是一个符号引用，指向当前分支
cat .git/HEAD
# 输出：ref: refs/heads/main
```

**创建分支 = 创建一个 41 字节的文件。** 这就是 Git 分支如此轻量的原因。

### 3.2 分支操作的本质

| 操作 | 实际动作 |
|------|---------|
| `git branch feat` | 创建文件 `refs/heads/feat`，内容为当前 commit 哈希 |
| `git checkout feat` | 将 HEAD 指向 `refs/heads/feat`，更新工作目录和索引 |
| `git commit` | 创建新 commit 对象，将当前分支指针前移 |
| `git branch -d feat` | 删除文件 `refs/heads/feat` |

### 3.3 Detached HEAD

当 HEAD 直接指向一个 commit 而非分支时，就处于「游离 HEAD」状态：

```bash
git checkout <commit-hash>   # 进入 detached HEAD
# 此时的提交不属于任何分支，可能会被 gc 回收

# 解决方法：基于当前位置创建新分支
git checkout -b new-branch
```

---

## 四、合并策略深入

### 4.1 Fast-Forward 合并

```
合并前：
main:    A ── B
                ╲
feat:            C ── D

合并后（fast-forward）：
main:    A ── B ── C ── D
```

只是移动指针，不产生新的 commit：

```bash
git merge feat           # 默认 fast-forward
git merge --no-ff feat   # 强制产生合并提交，保留分支拓扑
```

### 4.2 三方合并 (Three-Way Merge)

当两个分支都有新提交时：

```
合并前：
main:    A ── B ── E
                ╲
feat:            C ── D

合并后：
main:    A ── B ── E ── M  (合并提交，有两个父节点)
                ╲       ╱
feat:            C ── D
```

三方合并算法使用三个版本：
- **base**: 两个分支的最近公共祖先（B）
- **ours**: 当前分支版本（E）
- **theirs**: 被合并分支版本（D）

### 4.3 冲突解决

```bash
# 合并产生冲突时
git merge feat

# 查看冲突文件
git status

# 冲突标记解析：
<<<<<<< HEAD
当前分支的内容
=======
被合并分支的内容
>>>>>>> feat

# 手动解决后
git add <resolved-file>
git commit
```

### 4.4 合并策略选项

```bash
# 使用 ours 策略（保留当前分支，忽略对方所有修改）
git merge -s ours feat

# 使用 recursive 策略的 theirs 选项（冲突时自动选对方版本）
git merge -X theirs feat

# 使用 recursive 策略的 patience 选项（更好的 diff 算法）
git merge -X patience feat
```

---

## 五、Rebase 深入理解

### 5.1 Rebase 的工作原理

```
rebase 前：
main:    A ── B ── E
                ╲
feat:            C ── D

git checkout feat && git rebase main

rebase 后：
main:    A ── B ── E
                    ╲
feat:                C' ── D'   (新的 commit，哈希不同)
```

Rebase 实际步骤：
1. 找到 feat 和 main 的公共祖先 B
2. 提取 feat 相对于 B 的每个 commit 的 diff（补丁）
3. 将 feat 的基底移到 main 的最新 commit (E)
4. 在新基底上依次重新应用每个补丁，生成新 commit (C', D')

### 5.2 交互式 Rebase

```bash
git rebase -i HEAD~3
```

打开编辑器，可对最近 3 个 commit 进行：

| 指令 | 作用 |
|------|------|
| `pick` | 保留该 commit |
| `reword` | 修改提交信息 |
| `edit` | 暂停，允许修改该 commit 的内容 |
| `squash` | 合并到上一个 commit，保留信息 |
| `fixup` | 合并到上一个 commit，丢弃信息 |
| `drop` | 删除该 commit |

### 5.3 黄金法则

> **不要对已经推送到公共仓库的 commit 执行 rebase。**

原因：rebase 会创建新的 commit（哈希不同），其他协作者基于旧 commit 的工作将无法正常合并。

---

## 六、引用与引用日志

### 6.1 引用 (Refs) 体系

```
.git/refs/
├── heads/          # 本地分支
│   ├── main
│   └── feature
├── remotes/        # 远程跟踪分支
│   └── origin/
│       ├── main
│       └── feature
├── tags/           # 标签
│   └── v1.0
└── stash           # 暂存
```

### 6.2 引用日志 (Reflog)

Reflog 记录了每个引用（分支/HEAD）的所有变动历史：

```bash
# 查看 HEAD 的历史
git reflog

# 输出示例：
# a1b2c3d HEAD@{0}: commit: 添加新功能
# e5f6a7b HEAD@{1}: checkout: moving from main to feat
# d4c3b2a HEAD@{2}: merge feat: Fast-forward

# 恢复误操作（reflog 是安全网）
git reset --hard HEAD@{2}    # 回到两步之前的状态
```

**Reflog 是本地的**，默认保留 90 天，不会推送到远程。

### 6.3 祖先引用语法

```bash
HEAD^     # HEAD 的第一个父提交
HEAD^2    # HEAD 的第二个父提交（合并提交时）
HEAD~3    # HEAD 的第三代祖先（等同于 HEAD^^^）
HEAD^2~3  # HEAD 的第二个父提交的第三代祖先
```

---

## 七、远程仓库协作模型

### 7.1 远程跟踪分支

```bash
# 远程跟踪分支是只读书签
git branch -vv
# * main   a1b2c3d [origin/main] 最新提交信息
# feat     e5f6a7b [origin/feat: ahead 2, behind 1] 功能开发

# fetch 只更新远程跟踪分支，不影响本地分支
git fetch origin

# pull = fetch + merge
git pull origin main
# 等同于：
git fetch origin main && git merge origin/main
```

### 7.2 推送与上游

```bash
# 设置上游分支
git push -u origin feat

# 之后可以直接
git push
git pull

# 查看远程信息
git remote -v
git remote show origin
```

### 7.3 企业协作工作流

#### Git Flow

```
main ──────●──────────────●──────────●──── (生产发布)
            ╲            ╱            ╲
develop ─────●──●──●──●──●──●──●──●────── (开发集成)
                 ╲     ╱     ╲     ╱
feature           ●──●       ●──●          (功能开发)
```

适合：发布周期固定的企业项目。

#### Trunk-Based Development

```
main ──●──●──●──●──●──●──●──●── (持续集成)
        ╲╱    ╲╱    ╲╱
      短期分支(< 1天)
```

适合：CI/CD 成熟的团队，追求快速迭代。

---

## 八、Reset、Revert 与 Checkout

### 8.1 三种 Reset 模式

```bash
git reset --soft HEAD~1    # 只移动 HEAD，暂存区和工作目录不变
git reset --mixed HEAD~1   # 移动 HEAD + 重置暂存区（默认）
git reset --hard HEAD~1    # 移动 HEAD + 重置暂存区 + 重置工作目录（危险）
```

对比表：

| 模式 | HEAD | 暂存区 | 工作目录 | 用途 |
|------|------|--------|---------|------|
| `--soft` | 移动 | 不变 | 不变 | 重新组织提交 |
| `--mixed` | 移动 | 重置 | 不变 | 取消暂存 |
| `--hard` | 移动 | 重置 | 重置 | 彻底撤销（慎用） |

### 8.2 Revert vs Reset

```bash
# revert：创建一个新的「撤销提交」，安全用于公共分支
git revert <commit-hash>

# reset：直接移动分支指针，改写历史，仅用于本地分支
git reset <commit-hash>
```

### 8.3 Checkout vs Switch vs Restore

Git 2.23+ 将 checkout 的功能拆分为两个更清晰的命令：

```bash
# 旧方式
git checkout <branch>        # 切换分支
git checkout -- <file>       # 恢复文件

# 新方式（推荐）
git switch <branch>          # 切换分支
git restore <file>           # 恢复文件
git restore --staged <file>  # 取消暂存
```

---

## 九、高级技巧

### 9.1 Cherry-Pick

```bash
# 将某个 commit 的修改应用到当前分支
git cherry-pick <commit-hash>

# 只应用修改，不自动提交
git cherry-pick --no-commit <hash>

# 批量 cherry-pick
git cherry-pick A..B    # 不含 A，含 B
git cherry-pick A^..B   # 含 A，含 B
```

### 9.2 Stash（暂存工作）

```bash
# 暂存当前修改
git stash
git stash push -m "描述信息"

# 暂存包括未跟踪文件
git stash -u

# 恢复
git stash pop        # 恢复并删除 stash
git stash apply      # 恢复但保留 stash

# 管理
git stash list
git stash show -p stash@{0}
git stash drop stash@{0}
```

### 9.3 Bisect（二分查找 Bug）

```bash
git bisect start
git bisect bad                # 当前版本有 bug
git bisect good v1.0          # v1.0 没有 bug

# Git 自动 checkout 中间版本，测试后标记
git bisect good   # 或 git bisect bad

# 找到后
git bisect reset

# 自动化：提供测试脚本
git bisect start HEAD v1.0
git bisect run ./test-script.sh
```

### 9.4 Worktree（多工作目录）

```bash
# 在不同目录同时检出多个分支
git worktree add ../hotfix-branch hotfix

# 在 hotfix 目录工作，不影响主工作目录
cd ../hotfix-branch

# 完成后清理
git worktree remove ../hotfix-branch
```

### 9.5 子模块 (Submodule)

```bash
# 添加子模块
git submodule add <repo-url> path/to/submodule

# 克隆含子模块的仓库
git clone --recurse-submodules <repo-url>

# 更新子模块
git submodule update --remote --merge
```

---

## 十、.gitignore 与属性

### 10.1 .gitignore 规则

```bash
# 忽略所有 .log 文件
*.log

# 但保留 important.log
!important.log

# 忽略 build 目录
build/

# 只忽略根目录下的 TODO 文件
/TODO

# 忽略 doc 目录下所有 .pdf 文件
doc/**/*.pdf
```

### 10.2 全局忽略

```bash
git config --global core.excludesfile ~/.gitignore_global
```

### 10.3 已跟踪文件的忽略

```bash
# .gitignore 只对未跟踪文件生效
# 对已跟踪文件，需先移除跟踪
git rm --cached <file>

# 临时忽略已跟踪文件的修改
git update-index --assume-unchanged <file>
git update-index --no-assume-unchanged <file>  # 恢复
```

---

## 十一、Git Hooks

Git Hooks 是在特定事件触发时自动执行的脚本，位于 `.git/hooks/`。

### 11.1 常用客户端钩子

| 钩子 | 触发时机 | 用途 |
|------|---------|------|
| `pre-commit` | commit 之前 | 代码检查、lint |
| `commit-msg` | 编辑提交信息后 | 验证提交信息格式 |
| `pre-push` | push 之前 | 运行测试 |
| `post-merge` | merge 之后 | 安装依赖 |

### 11.2 示例：提交信息规范检查

```bash
#!/bin/sh
# .git/hooks/commit-msg

commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|refactor|test|chore)(\(.+\))?: .{1,50}"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
    echo "提交信息不符合规范！"
    echo "格式：type(scope): description"
    echo "示例：feat(api): 添加用户认证接口"
    exit 1
fi
```

### 11.3 团队共享 Hooks

```bash
# 将 hooks 放入项目目录
mkdir -p .githooks

# 配置 Git 使用项目内的 hooks 目录
git config core.hooksPath .githooks
```

---

## 十二、性能优化与大型仓库

### 12.1 浅克隆

```bash
# 只克隆最近的提交
git clone --depth 1 <repo-url>

# CI/CD 中常用：只需要最新代码
git clone --depth 1 --single-branch --branch main <repo-url>
```

### 12.2 稀疏检出

```bash
# 只检出部分目录
git sparse-checkout init --cone
git sparse-checkout set src/module-a src/module-b
```

### 12.3 大文件管理 (Git LFS)

```bash
# 安装并初始化
git lfs install

# 跟踪大文件
git lfs track "*.pth"     # 模型文件
git lfs track "*.bin"     # 二进制文件
git lfs track "*.tar.gz"  # 压缩包

# 查看跟踪的文件
git lfs ls-files
```

> 对于本项目的模型文件（如 Qwen-72B-Chat），强烈建议使用 Git LFS 或独立的模型管理方案。

---

## 十三、故障排除与数据恢复

### 13.1 常见恢复场景

```bash
# 恢复删除的分支
git reflog                          # 找到分支最后的 commit
git checkout -b recovered <hash>    # 重建分支

# 恢复 reset --hard 丢失的提交
git reflog
git reset --hard <hash>

# 恢复误删的文件
git checkout HEAD -- <file>          # 从最新提交恢复
git checkout <commit> -- <file>      # 从特定提交恢复

# 找回丢失的 commit（已无引用指向）
git fsck --lost-found
ls .git/lost-found/commit/
```

### 13.2 仓库维护

```bash
# 压缩对象库
git gc

# 积极压缩（释放更多空间）
git gc --aggressive

# 检查仓库完整性
git fsck

# 清理无用的远程跟踪分支
git remote prune origin
# 或
git fetch --prune
```

---

## 附录：常用命令速查

```bash
# 查看操作历史
git log --oneline --graph --all

# 查看某个文件的修改历史
git log --follow -p <file>

# 查看某一行是谁写的
git blame <file>
git blame -L 10,20 <file>     # 第 10-20 行

# 搜索提交内容
git log -S "function_name"     # 搜索添加/删除该字符串的提交
git log --grep="bug fix"       # 搜索提交信息

# 比较差异
git diff                       # 工作目录 vs 暂存区
git diff --staged              # 暂存区 vs 最新提交
git diff main..feat            # 两个分支的差异
git diff main...feat           # feat 相对于分叉点的变化

# 统计
git shortlog -sn               # 按作者统计提交数
git diff --stat main..feat     # 变更统计
```

---

> **参考资料**
> - Pro Git Book (git-scm.com/book)
> - Git Internals (git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
