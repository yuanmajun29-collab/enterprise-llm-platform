# 企业大模型平台 - 快速开始指南

## 5 分钟快速部署

### 第一步：准备环境

```bash
# 1. 确保已安装 Docker 和 Docker Compose
docker --version
docker-compose version

# 2. 确保 NVIDIA 驱动已安装
nvidia-smi
```

### 第二步：克隆项目

```bash
# 进入工作目录
cd /opt

# 复制项目文件（或 git clone）
# git clone <repository-url> enterprise-llm-platform
cd enterprise-llm-platform
```

### 第三步：配置环境

```bash
# 复制环境变量模板
cp docker/.env.example docker/.env

# 编辑配置（主要修改 API 地址和密码）
vim docker/.env
```

**必须修改的配置：**

```bash
# 修改 API 地址
API_BASE_URL=https://api.yourcompany.com

# 修改数据库密码
POSTGRES_PASSWORD=<设置强密码>
KONG_DB_PASSWORD=<设置强密码>
KEYCLOAK_DB_PASSWORD=<设置强密码>
REDIS_PASSWORD=<设置强密码>

# 修改 Keycloak 管理员密码
KEYCLOAK_ADMIN_PASSWORD=<设置强密码>
```

### 第四步：一键部署

```bash
# 运行部署脚本
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

部署脚本会自动完成：
- ✅ 检查环境
- ✅ 生成配置
- ✅ 下载模型
- ✅ 启动服务
- ✅ 健康检查

### 第五步：验证部署

```bash
# 检查服务状态
cd docker && docker-compose ps

# 应该看到以下服务运行中：
# - vllm-inference (推理服务)
# - kong (API 网关)
# - keycloak (认证服务)
# - postgres (数据库)
# - redis (缓存)
# - prometheus (监控)
# - grafana (可视化)
```

访问以下地址验证：

| 服务 | 地址 | 默认账号 |
|------|------|----------|
| Keycloak | http://localhost:8080 | admin / ChangeMe123! |
| Grafana | http://localhost:3000 | admin / admin |

---

## 创建第一个用户

### 使用脚本创建

```bash
./scripts/create-user.sh
```

按提示输入用户信息：

```
Username: john.doe
Email: john.doe@company.com
Display Name: John Doe
Department: 研发部
Employee ID: E12345
Role (user/developer/admin): developer
Tokens per day [100000]: 50000
Tokens per hour [10000]: 5000
```

脚本会返回：
- 用户名
- 初始密码（需用户首次登录后修改）

---

## 安装 IDE 插件

### VS Code 插件

```bash
# 构建 VS Code 插件
./scripts/build-vscode.sh

# 安装插件
code --install-extension plugin/vscode/enterprise-llm-assistant-*.vsix
```

### JetBrains 插件

```bash
# 构建 JetBrains 插件
./scripts/build-jetbrains.sh

# 安装插件
# Settings → Plugins → Install Plugin from Disk
# 选择构建的 zip 文件
```

---

## 插件配置

### VS Code

1. 打开 VS Code
2. 按 `Ctrl+,` 打开设置
3. 搜索 "LLM"
4. 配置以下选项：

```json
{
  "llm.apiUrl": "http://localhost:8443",
  "llm.model": "Qwen-72B-Chat"
}
```

### JetBrains

1. 打开 IDE
2. Settings → Tools → AI Assistant
3. 配置 API 地址：`http://localhost:8443`
4. 点击 "Test Connection" 测试连接

---

## 开始使用

### AI 对话

1. 按 `Ctrl+Alt+A` 打开对话面板
2. 输入问题，例如：`写一个冒泡排序函数`
3. 查看流式响应结果

### 代码补全

1. 编写代码
2. 停顿约 300ms
3. 查看灰色补全建议
4. 按 `Tab` 接受建议

### 代码解释

1. 选中代码
2. 按 `Ctrl+Alt+E`
3. 查看代码解释

### 生成测试

1. 选中函数
2. 按 `Ctrl+Alt+T`
3. 查看生成的测试代码

---

## 常用命令

```bash
# 查看服务状态
cd docker && docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 启动服务
docker-compose up -d

# 查看GPU状态
nvidia-smi

# 创建用户
./scripts/create-user.sh

# 备份数据
./scripts/backup.sh
```

---

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | vLLM | 推理服务 |
| 8080 | Keycloak | 认证服务 |
| 8443 | Kong | API 网关 |
| 3000 | Grafana | 监控面板 |
| 9090 | Prometheus | 监控服务 |

---

## 下一步

- 📖 阅读完整文档：
  - [部署方案](DEPLOYMENT.md)
  - [使用说明](USER_GUIDE.md)
  - [管理员指南](ADMIN_GUIDE.md)

- 🔧 配置生产环境：
  - 配置域名和 HTTPS
  - 设置防火墙规则
  - 配置监控告警

- 👨‍💻 管理用户和配额：
  - 创建用户账号
  - 设置用户配额
  - 分配角色权限

- 📊 监控平台运行：
  - 查看 Grafana 仪表板
  - 设置 Prometheus 告警
  - 分析使用数据

---

## 需要帮助？

- 📧 技术支持：support@company.com
- 📚 文档中心：https://docs.company.com/llm
- 💬 内部群：企业微信 - 大模型平台交流群
