# 企业大模型平台 - 用户使用说明

## 目录

- [1. 快速开始](#1-快速开始)
- [2. IDE 插件安装](#2-ide-插件安装)
- [3. 插件配置](#3-插件配置)
- [4. 功能使用](#4-功能使用)
- [5. API 使用](#5-api-使用)
- [6. 常见问题](#6-常见问题)

---

## 1. 快速开始

### 1.1 登录平台

1. 打开 IDE（VS Code 或 JetBrains）
2. 安装企业大模型助手插件
3. 点击插件图标选择"登录"
4. 使用企业账号登录

### 1.2 获取访问权限

- 联系管理员创建账号
- 等待账号激活
- 获取 API 密钥（可选）

---

## 2. IDE 插件安装

### 2.1 VS Code 插件

#### 方法一：从市场安装

```
1. 打开 VS Code
2. 进入扩展市场 (Ctrl+Shift+X)
3. 搜索 "Enterprise AI Assistant"
4. 点击安装
```

#### 方法二：安装本地文件

```bash
# 1. 下载 .vsix 文件
wget https://your-company.com/enterprise-llm-assistant.vsix

# 2. 安装插件
code --install-extension enterprise-llm-assistant.vsix
```

### 2.2 JetBrains 插件

#### 从市场安装

```
1. 打开 IDE (IntelliJ IDEA / PyCharm / WebStorm 等)
2. 进入 Settings → Plugins
3. 搜索 "Enterprise AI Assistant"
4. 点击安装并重启 IDE
```

#### 安装本地文件

```
1. 下载插件 zip 文件
2. Settings → Plugins → ⚙️ → Install Plugin from Disk
3. 选择下载的 zip 文件
4. 重启 IDE
```

---

## 3. 插件配置

### 3.1 VS Code 配置

打开设置（Ctrl+,），搜索 "LLM"，配置以下选项：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API 地址 | 平台 API 地址 | https://api.company.com |
| API 密钥 | API 访问密钥 | 空（推荐使用 OAuth） |
| 默认模型 | 默认使用的模型 | Qwen-72B-Chat |
| 温度 | 生成随机性 (0-2) | 0.7 |
| 最大 Tokens | 最大输出长度 | 2048 |
| 启用流式响应 | 实时流式输出 | 是 |
| 启用自动补全 | 自动代码补全 | 是 |
| 补全防抖延迟 | 补全触发延迟 (毫秒) | 300 |
| 系统提示词 | AI 系统提示词 | - |

**配置示例：**

```json
{
  "llm.apiUrl": "https://api.yourcompany.com",
  "llm.model": "Qwen-72B-Chat",
  "llm.temperature": 0.7,
  "llm.maxTokens": 2048,
  "llm.enableStream": true,
  "llm.enableAutocomplete": true
}
```

### 3.2 JetBrains 配置

```
1. File → Settings → Tools → AI Assistant
2. 配置以下选项：
   - API 地址
   - API 密钥（可选）
   - 默认模型
   - 温度
   - 最大 Tokens
3. 点击 "Test Connection" 测试连接
4. Apply 保存配置
```

---

## 4. 功能使用

### 4.1 AI 对话

#### VS Code

**打开方式：**
- 快捷键：`Ctrl+Alt+A` (Windows/Linux) / `Cmd+Alt+A` (Mac)
- 点击侧边栏 AI 助手图标
- 命令面板：`Ctrl+Shift+P` → "AI 对话"

**使用方法：**
```
1. 在输入框中输入问题或代码
2. 点击发送或按 Enter
3. 查看流式响应结果
4. 可继续追问，保持上下文
```

**对话示例：**

```
用户: 如何在 Python 中实现单例模式？

助手: Python 中有多种实现单例模式的方式：

方式一：使用模块
```python
# singleton.py
class Singleton:
    def __init__(self):
        pass

instance = Singleton()

# 其他文件导入
from singleton import instance
```

方式二：使用装饰器
```python
def singleton(cls):
    instances = {}
    def wrapper(*args, **kwargs):
        if cls not in instances:
            instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    return wrapper

@singleton
class MyClass:
    pass
```
...
```

#### JetBrains

**打开方式：**
- 菜单：Tools → AI 对话
- 快捷键：`Ctrl+Shift+A` → 输入 "AI 对话"

### 4.2 代码补全

#### 自动补全

配置后，插件会自动提供代码补全建议：

```
1. 正常编写代码
2. 停顿输入（等待约 300ms）
3. 补全建议以灰色文字显示
4. 按 Tab 接受建议，Esc 忽略
```

#### 手动触发补全

- VS Code: `Ctrl+Alt+Space`
- JetBrains: `Ctrl+Shift+Enter`

### 4.3 代码解释

选中代码后执行：

**VS Code：**
- 右键菜单 → AI 助手 → 解释代码
- 快捷键：`Ctrl+Alt+E`

**JetBrains：**
- 右键菜单 → AI 解释代码

**使用场景：**
- 阅读他人代码
- 理解复杂逻辑
- 学习新技术

### 4.4 代码重构

选中需要重构的代码：

**VS Code：**
- 右键菜单 → AI 助手 → 重构代码
- 快捷键：`Ctrl+Alt+R`

**JetBrains：**
- 右键菜单 → AI 重构代码

**重构示例：**

```python
# 原始代码
def process_data(data):
    result = []
    for item in data:
        if item['value'] > 10:
            result.append(item['value'] * 2)
        else:
            result.append(item['value'])
    return result

# 重构后
def process_data(data):
    return [item['value'] * 2 if item['value'] > 10 else item['value'] for item in data]
```

### 4.5 单元测试生成

选中函数或类：

**VS Code：**
- 右键菜单 → AI 助手 → 生成单元测试
- 快捷键：`Ctrl+Alt+T`

**JetBrains：**
- 右键菜单 → AI 生成测试

**测试示例：**

```python
# 原始函数
def calculate_discount(price, discount_rate):
    if not 0 <= discount_rate <= 1:
        raise ValueError("Discount rate must be between 0 and 1")
    return price * (1 - discount_rate)

# 生成的测试
import unittest

class TestCalculateDiscount(unittest.TestCase):
    def test_normal_discount(self):
        self.assertEqual(calculate_discount(100, 0.2), 80)

    def test_no_discount(self):
        self.assertEqual(calculate_discount(100, 0), 100)

    def test_full_discount(self):
        self.assertEqual(calculate_discount(100, 1), 0)

    def test_invalid_discount(self):
        with self.assertRaises(ValueError):
            calculate_discount(100, 1.5)
```

### 4.6 查找 Bug

选中代码后选择"查找问题"：

**VS Code：** 快捷键 `Ctrl+Alt+B`
**JetBrains：** 右键菜单 → AI 查找问题

**检查内容：**
- 潜在的错误
- 安全漏洞
- 性能问题
- 代码异味

### 4.7 代码优化

选中代码后选择"优化代码"：

**VS Code：** 快捷键 `Ctrl+Alt+O`
**JetBrains：** 右键菜单 → AI 优化代码

**优化方向：**
- 性能优化
- 内存优化
- 可读性优化
- 最佳实践

---

## 5. API 使用

### 5.1 获取 API 密钥

```
1. 登录平台
2. 进入个人中心
3. 生成 API 密钥
4. 复制密钥保存
```

### 5.2 聊天补全 API

```bash
curl -X POST https://api.yourcompany.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

**响应示例：**

```json
{
  "id": "chat-123456",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "Qwen-72B-Chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是企业大模型助手，可以帮助你进行代码编写、重构、测试生成等工作。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

### 5.3 流式响应

```bash
curl -X POST https://api.yourcompany.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [{"role": "user", "content": "写一首诗"}],
    "stream": true
  }'
```

**流式响应格式：**

```
data: {"choices":[{"delta":{"content":"春"},"index":0}]}

data: {"choices":[{"delta":{"content":"风"},"index":0}]}

data: {"choices":[{"delta":{"content":"拂"},"index":0}]}

data: [DONE]
```

### 5.4 Python SDK 示例

```python
import requests

class EnterpriseLLM:
    def __init__(self, api_key, base_url="https://api.yourcompany.com"):
        self.api_key = api_key
        self.base_url = base_url

    def chat(self, messages, model="Qwen-72B-Chat", **kwargs):
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": model,
                "messages": messages,
                **kwargs
            }
        )
        return response.json()

    def stream_chat(self, messages, model="Qwen-72B-Chat", **kwargs):
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": model,
                "messages": messages,
                "stream": True,
                **kwargs
            },
            stream=True
        )
        for line in response.iter_lines():
            if line.startswith(b"data: "):
                data = line.decode("utf-8")[6:]
                if data == "[DONE]":
                    break
                yield json.loads(data)

# 使用示例
llm = EnterpriseLLM(api_key="your-api-key")

# 普通聊天
result = llm.chat([
    {"role": "user", "content": "写一个冒泡排序"}
])
print(result["choices"][0]["message"]["content"])

# 流式聊天
for chunk in llm.stream_chat([
    {"role": "user", "content": "讲一个故事"}
]):
    content = chunk["choices"][0]["delta"].get("content", "")
    print(content, end="", flush=True)
```

### 5.5 Node.js SDK 示例

```javascript
class EnterpriseLLM {
    constructor(apiKey, baseUrl = 'https://api.yourcompany.com') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    async chat(messages, model = 'Qwen-72B-Chat', options = {}) {
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                ...options
            })
        });
        return await response.json();
    }

    async* streamChat(messages, model = 'Qwen-72B-Chat', options = {}) {
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                ...options
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    yield JSON.parse(data);
                }
            }
        }
    }
}

// 使用示例
const llm = new EnterpriseLLM('your-api-key');

// 普通聊天
const result = await llm.chat([
    { role: 'user', content: '写一个 Hello World 程序' }
]);
console.log(result.choices[0].message.content);

// 流式聊天
for await (const chunk of llm.streamChat([
    { role: 'user', content: '介绍一下 Python' }
])) {
    const content = chunk.choices[0].delta?.content || '';
    process.stdout.write(content);
}
```

---

## 6. 常见问题

### 6.1 安装相关

**Q: 插件安装后不显示？**

A:
- VS Code: 重启 VS Code，检查扩展列表
- JetBrains: 禁用后重新启用插件

**Q: 插件报错"无法连接到服务器"？**

A:
1. 检查网络连接
2. 确认 API 地址配置正确
3. 联系管理员确认服务状态

### 6.2 使用相关

**Q: 代码补全不工作？**

A:
1. 检查"启用自动补全"设置
2. 确认 API 密钥或登录状态
3. 检查是否有剩余配额

**Q: 生成的代码有错误怎么办？**

A:
1. AI 生成仅供参考
2. 需要人工审核和测试
3. 可以要求 AI 重新生成或修正

**Q: 如何查看我的配额使用情况？**

A:
- 插件内查看使用统计
- 联系管理员获取详细报告

### 6.3 安全相关

**Q: 我的代码会被上传到哪里？**

A:
- 所有请求通过内网传输
- 数据存储在企业私有服务器
- 不涉及第三方服务

**Q: 敏感信息会被记录吗？**

A:
- 平台自动过滤敏感信息
- 可查看审计日志
- 建议手动脱敏后发送

### 6.4 性能相关

**Q: 响应很慢怎么办？**

A:
1. 检查网络延迟
2. 减少请求上下文长度
3. 联系管理员检查服务负载

**Q: 配额用完了怎么办？**

A:
1. 联系管理员申请增加配额
2. 等待配额周期重置（每日/每小时）

---

## 附录

### A. 快捷键一览表

| 功能 | VS Code | JetBrains |
|------|---------|-----------|
| 打开对话 | `Ctrl+Alt+A` | `Ctrl+Shift+A` |
| 代码补全 | `Ctrl+Alt+Space` | `Ctrl+Shift+Enter` |
| 解释代码 | `Ctrl+Alt+E` | 右键菜单 |
| 重构代码 | `Ctrl+Alt+R` | 右键菜单 |
| 生成测试 | `Ctrl+Alt+T` | 右键菜单 |
| 查找问题 | `Ctrl+Alt+B` | 右键菜单 |
| 优化代码 | `Ctrl+Alt+O` | 右键菜单 |

### B. 支持的模型

| 模型 | 参数量 | 上下文长度 | 适用场景 |
|------|--------|-----------|----------|
| Qwen-72B-Chat | 72B | 32K | 通用对话、代码生成 |
| Qwen-14B-Chat | 14B | 16K | 快速响应、轻量任务 |
| DeepSeek-Coder-33B | 33B | 16K | 代码补全、重构 |
| Llama-3-70B-Instruct | 70B | 8K | 英文任务 |

### C. 联系支持

- 技术支持邮箱：support@yourcompany.com
- 内部工单系统：https://support.yourcompany.com
- 使用文档：https://docs.yourcompany.com/llm
