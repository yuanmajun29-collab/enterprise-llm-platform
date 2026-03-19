# 企业大模型平台 - 用户使用手册

> 本文档详细介绍了企业大模型平台的各种功能和使用方法，帮助用户快速上手并高效使用 AI 助手。

---

## 目录

- [1. 平台简介](#1-平台简介)
- [2. 快速开始](#2-快速开始)
- [3. IDE 插件安装](#3-ide-插件安装)
- [4. 插件配置](#4-插件配置)
- [5. 核心功能](#5-核心功能)
- [6. 高级功能](#6-高级功能)
- [7. API 使用](#7-api-使用)
- [8. 最佳实践](#8-最佳实践)
- [9. 常见问题](#9-常见问题)

---

## 1. 平台简介

### 1.1 什么是企业大模型平台？

企业大模型平台是一个面向企业的本地化 AI 助手平台，提供以下特性：

- **私有部署**：所有数据在企业内部服务器处理，保障数据安全
- **多模型支持**：支持 Qwen、DeepSeek、Llama 等主流大模型
- **IDE 集成**：与 VS Code、JetBrains 等 IDE 无缝集成
- **智能补全**：实时代码补全，提升开发效率
- **代码辅助**：代码解释、重构、测试生成、优化建议
- **对话交互**：自然语言对话，解决各种问题

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| **代码编写** | 快速生成代码片段、补全代码 |
| **代码理解** | 解释复杂代码逻辑 |
| **代码优化** | 重构代码、优化性能 |
| **测试生成** | 自动生成单元测试 |
| **Bug 修复** | 查找并修复代码问题 |
| **技术咨询** | 技术问题咨询、方案设计 |
| **文档编写** | 生成技术文档、注释 |

### 1.3 支持的模型

| 模型 | 参数量 | 上下文长度 | 适用场景 | 特点 |
|------|--------|-----------|----------|------|
| **Qwen-72B-Chat** | 72B | 32K | 通用对话、代码生成 | 综合能力强 |
| **Qwen-14B-Chat** | 14B | 16K | 快速响应、轻量任务 | 响应快速 |
| **DeepSeek-Coder-33B** | 33B | 16K | 代码补全、重构 | 代码专项 |
| **Llama-3-70B-Instruct** | 70B | 8K | 英文任务 | 英文优秀 |
| **BGE-Embedding-ZH** | 750M | 512 | 文本嵌入 | 向量化 |

---

## 2. 快速开始

### 2.1 获取账号

```
1. 联系企业管理员
2. 提供以下信息：
   - 用户名
   - 邮箱
   - 部门
   - 工号
3. 等待账号创建
4. 收到初始密码
5. 首次登录后修改密码
```

### 2.2 首次登录

#### VS Code

1. 打开 VS Code
2. 安装企业大模型助手插件
3. 点击状态栏的 AI 助手图标
4. 选择"登录"
5. 输入企业账号和密码
6. 登录成功

#### JetBrains

1. 打开 JetBrains IDE
2. 安装企业大模型助手插件
3. 点击菜单 Tools → AI Assistant → Login
4. 输入企业账号和密码
5. 登录成功

### 2.3 验证连接

发送一条测试消息："你好"，确认 AI 助手正常响应。

---

## 3. IDE 插件安装

### 3.1 VS Code 插件

#### 安装方法

**方法一：从扩展市场安装**

```
1. 打开 VS Code
2. 按 Ctrl+Shift+X 打开扩展面板
3. 搜索 "Enterprise AI Assistant"
4. 找到插件，点击"安装"
5. 安装完成后点击"重新加载"
```

**方法二：安装 .vsix 文件**

```bash
# 1. 下载插件文件
wget https://your-company.com/vsix/enterprise-llm-assistant.vsix

# 2. 安装插件
code --install-extension enterprise-llm-assistant.vsix

# 3. 重新加载 VS Code
```

**方法三：手动安装**

```
1. 下载插件源码
2. 进入插件目录
3. 运行 npm install
4. 运行 npm run package
5. 安装生成的 .vsix 文件
```

#### 验证安装

安装成功后，你应该能在 VS Code 中看到：

- 侧边栏的 AI 助手图标
- 状态栏的 AI 助手状态指示器
- 代码编辑器中的右键菜单选项

### 3.2 JetBrains 插件

#### 安装方法

**方法一：从插件市场安装**

```
1. 打开 JetBrains IDE
2. 进入 Settings → Plugins (或 Preferences → Plugins)
3. 点击 Marketplace 标签
4. 搜索 "Enterprise AI Assistant"
5. 找到插件，点击"Install"
6. 重启 IDE
```

**方法二：安装插件包**

```
1. 下载插件 zip 文件
2. 进入 Settings → Plugins
3. 点击齿轮图标 → Install Plugin from Disk
4. 选择下载的 zip 文件
5. 重启 IDE
```

#### 支持的 IDE

- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- GoLand
- RubyMine
- CLion
- Rider
- DataGrip

### 3.3 插件更新

#### VS Code

```
1. 打开扩展面板 (Ctrl+Shift+X)
2. 找到 Enterprise AI Assistant
3. 如果有更新，点击"更新"按钮
4. 重载 VS Code
```

#### JetBrains

```
1. 进入 Settings → Plugins
2. 找到 Enterprise AI Assistant
3. 如果有更新，点击"Update"按钮
4. 重启 IDE
```

---

## 4. 插件配置

### 4.1 VS Code 配置

打开设置（Ctrl+,），搜索 "llm"，可配置以下选项：

#### 基础配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `llm.apiUrl` | 平台 API 地址 | `https://api.company.com` |
| `llm.apiKey` | API 访问密钥 | 空 |
| `llm.model` | 默认使用的模型 | `Qwen-72B-Chat` |

#### 生成参数

| 配置项 | 说明 | 默认值 | 范围 |
|--------|------|--------|------|
| `llm.temperature` | 生成随机性 | 0.7 | 0.0 - 2.0 |
| `llm.topP` | 核采样概率 | 0.9 | 0.0 - 1.0 |
| `llm.maxTokens` | 最大输出长度 | 2048 | 1 - 32768 |
| `llm.frequencyPenalty` | 频率惩罚 | 0.0 | -2.0 - 2.0 |
| `llm.presencePenalty` | 存在惩罚 | 0.0 | -2.0 - 2.0 |

#### 功能配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `llm.enableStream` | 启用流式响应 | `true` |
| `llm.enableAutocomplete` | 启用自动补全 | `true` |
| `llm.autocompleteDelay` | 补全触发延迟 | 300 (毫秒) |
| `llm.systemPrompt` | AI 系统提示词 | - |

#### 配置示例

```json
{
  "llm.apiUrl": "https://api.company.com",
  "llm.model": "Qwen-72B-Chat",
  "llm.temperature": 0.7,
  "llm.maxTokens": 2048,
  "llm.enableStream": true,
  "llm.enableAutocomplete": true,
  "llm.autocompleteDelay": 300,
  "llm.systemPrompt": "你是一个专业的代码助手，帮助用户解决编程问题。"
}
```

#### Workspace 配置

可以在项目根目录创建 `.vscode/settings.json`：

```json
{
  "llm.model": "DeepSeek-Coder-33B",
  "llm.temperature": 0.3,
  "llm.enableAutocomplete": true,
  "llm.systemPrompt": "你是一个专业的 Python 开发助手，帮助用户编写高质量的 Python 代码。"
}
```

### 4.2 JetBrains 配置

```
1. 打开 Settings (或 Preferences)
2. 进入 Tools → AI Assistant
3. 配置以下选项：

   基础设置:
   - API Address: https://api.company.com
   - API Key: (可选)
   - Default Model: Qwen-72B-Chat

   生成参数:
   - Temperature: 0.7
   - Max Tokens: 2048
   - Top P: 0.9

   功能设置:
   - Enable Stream: ✓
   - Enable Autocomplete: ✓
   - Autocomplete Delay: 300ms

4. 点击"Test Connection"测试连接
5. 点击"Apply"保存配置
```

### 4.3 系统提示词

系统提示词（System Prompt）用于定义 AI 的角色和行为。

#### 代码助手提示词

```
你是一个专业的代码助手，具有以下特点：
1. 代码风格简洁、清晰
2. 注重代码的可读性和可维护性
3. 遵循编程语言的最佳实践
4. 对于复杂逻辑提供详细注释
5. 优先考虑代码的安全性

回答时：
- 提供完整的代码示例
- 解释代码的工作原理
- 指出潜在的改进点
- 如有相关安全考虑，请说明
```

#### 技术顾问提示词

```
你是一位经验丰富的技术顾问，擅长：
1. 架构设计
2. 技术选型
3. 性能优化
4. 问题排查
5. 最佳实践

回答时：
- 从多个角度分析问题
- 提供具体的实施建议
- 说明各自的优缺点
- 给出参考资料
```

### 4.4 多配置切换

如果需要在不同项目使用不同配置：

#### VS Code - 多工作区配置

```json
// 项目 A 配置
// .vscode/settings.json
{
  "llm.model": "DeepSeek-Coder-33B",
  "llm.temperature": 0.3
}

// 项目 B 配置
// .vscode/settings.json
{
  "llm.model": "Qwen-72B-Chat",
  "llm.temperature": 0.7
}
```

#### 快速切换配置

使用 VS Code 配置文件切换功能：

```
1. Ctrl+Shift+P 打开命令面板
2. 输入"Preferences: Open Workspace Settings (JSON)"
3. 切换不同配置文件
```

---

## 5. 核心功能

### 5.1 AI 对话

#### VS Code

**打开方式：**
- 快捷键：`Ctrl+Alt+A` (Windows/Linux) / `Cmd+Alt+A` (Mac)
- 点击侧边栏的 AI 助手图标
- 命令面板：`Ctrl+Shift+P` → "AI 对话"
- 右键菜单 → AI 助手 → 开始对话

**对话界面：**

```
┌─────────────────────────────────────────┐
│  企业大模型助手 - 对话                  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │ 对话历史                        │   │
│  │                                 │   │
│  │ 你: 如何实现一个单例模式？       │   │
│  │                                 │   │
│  │ 助手: Python 中有多种实现单例   │   │
│  │ 模式的方式...                   │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 输入问题...                     │   │
│  └─────────────────────────────────┘   │
│  [发送] [清空] [导出] [设置]            │
└─────────────────────────────────────────┘
```

**使用技巧：**

1. **具体化问题**：越具体的问题，答案越准确
   ```
   好: 如何在 Python 3.9 中使用 asyncio 实现并发的 HTTP 请求？
   差: Python 怎么发请求？
   ```

2. **提供上下文**：提供相关代码片段
   ```
   我有以下代码：
   [粘贴代码]
   这段代码有什么问题？如何优化？
   ```

3. **追问深入**：对不理解的点继续提问
   ```
   这段代码的 time complexity 是什么？
   能进一步解释一下这个概念吗？
   ```

4. **多轮对话**：AI 会记住对话历史
   ```
   你: 什么是装饰器？
   助手: [解释装饰器]
   你: 能给我一个实际的例子吗？
   助手: [提供代码示例]
   ```

**对话示例：**

```
用户: 如何在 Python 中实现一个线程安全的单例模式？

助手: Python 中有多种实现线程安全单例模式的方式，以下是几种常见方法：

## 方法一：使用模块级别的变量
```python
# singleton.py
class Singleton:
    def __init__(self):
        pass

instance = Singleton()

# 其他文件中导入
from singleton import instance
```
这种方式简单直接，利用 Python 模块只初始化一次的特性。

## 方法二：使用 __new__ 方法
```python
class Singleton:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        # 防止重复初始化
        if not hasattr(self, 'initialized'):
            self.initialized = True
            # 其他初始化代码
```

## 方法三：使用装饰器
```python
def singleton(cls):
    instances = {}
    _lock = threading.Lock()

    def get_instance(*args, **kwargs):
        if cls not in instances:
            with _lock:
                if cls not in instances:
                    instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    return get_instance

@singleton
class MyClass:
    pass
```

推荐使用方法二（__new__ + Lock），它既保证了线程安全，又保持了良好的代码结构。
```

### 5.2 代码补全

#### 自动补全

AI 助手会在你输入时自动提供补全建议：

```
输入: def calculate_average(numbers):
     total = sum(numbers)
     count = len(numbers)

AI 建议:     return total / count if count > 0 else 0

按 Tab 接受建议，按 Esc 忽略
```

#### 手动触发补全

- **VS Code**: `Ctrl+Alt+Space`
- **JetBrains**: `Ctrl+Shift+Enter`

#### 补全示例

**场景一：函数实现**

```python
# 输入
def bubble_sort(arr):
    """实现冒泡排序算法"""

# AI 补全
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
```

**场景二：类方法**

```java
// 输入
public class StringUtils {

    public static boolean isEmpty(String str) {

// AI 补全
        return str == null || str.length() == 0;
    }

    public static boolean isNotEmpty(String str) {
        return !isEmpty(str);
    }
}
```

**场景三：测试用例**

```javascript
// 输入
describe('Calculator', () => {
    it('should add two numbers', () => {

// AI 补全
        expect(calculator.add(2, 3)).toBe(5);
    });

    it('should subtract two numbers', () => {
        expect(calculator.subtract(5, 3)).toBe(2);
    });
});
```

#### 提高补全质量

1. **提供函数签名**：先写函数签名和注释
2. **使用类型提示**：添加类型注解
3. **命名规范**：使用有意义的变量名
4. **上下文信息**：确保相关代码在编辑器中打开

### 5.3 代码解释

#### 使用方法

**VS Code:**
- 选中代码
- 右键菜单 → AI 助手 → 解释代码
- 快捷键：`Ctrl+Alt+E`

**JetBrains:**
- 选中代码
- 右键菜单 → AI 解释代码

#### 解释示例

**输入代码：**

```python
def memoize(func):
    cache = {}
    def wrapper(*args):
        if args in cache:
            return cache[args]
        result = func(*args)
        cache[args] = result
        return result
    return wrapper
```

**AI 解释：**

```
这段代码实现了一个装饰器 `memoize`，用于函数结果的缓存。

## 工作原理：

1. **缓存字典**：创建一个字典 `cache` 来存储函数计算结果

2. **包装函数**：定义内部函数 `wrapper`，它包装了原始函数

3. **缓存检查**：
   - 如果参数已经在缓存中，直接返回缓存结果
   - 否则调用原始函数计算，并将结果存入缓存

## 使用示例：

```python
@memoize
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

这个装饰器可以显著提升递归函数（如斐波那契数列）的性能，因为重复的计算会被缓存。

## 注意事项：
- 这个实现有局限性：只能处理可哈希的参数
- 缓存不会过期，可能导致内存问题
- 对于有副作用的函数不适合使用
```

### 5.4 代码重构

#### 使用方法

**VS Code:**
- 选中代码
- 右键菜单 → AI 助手 → 重构代码
- 快捷键：`Ctrl+Alt+R`

**JetBrains:**
- 选中代码
- 右键菜单 → AI 重构代码

#### 重构示例

**重构前：**

```python
def process_data(data):
    result = []
    for item in data:
        if item['value'] > 10:
            new_value = item['value'] * 2
            result.append(new_value)
        else:
            new_value = item['value']
            result.append(new_value)
    return result
```

**重构后：**

```python
def process_data(data):
    """处理数据列表，大于10的值加倍"""
    return [item['value'] * 2 if item['value'] > 10 else item['value']
            for item in data]
```

**AI 解释：**

```
重构改进：

1. **使用列表推导式**：更简洁、Pythonic
2. **消除重复代码**：合并相似逻辑
3. **添加文档字符串**：提高可读性
4. **减少中间变量**：简化代码结构

性能提升：列表推导式比显式循环略快
可读性提升：代码更简洁，意图更明确
```

### 5.5 单元测试生成

#### 使用方法

**VS Code:**
- 选中函数或类
- 右键菜单 → AI 助手 → 生成单元测试
- 快捷键：`Ctrl+Alt+T`

**JetBrains:**
- 选中函数或类
- 右键菜单 → AI 生成测试

#### 测试生成示例

**输入函数：**

```python
def calculate_discount(price, discount_rate):
    if not 0 <= discount_rate <= 1:
        raise ValueError("Discount rate must be between 0 and 1")
    if price < 0:
        raise ValueError("Price cannot be negative")
    return price * (1 - discount_rate)
```

**AI 生成的测试：**

```python
import unittest

class TestCalculateDiscount(unittest.TestCase):
    def test_normal_discount(self):
        """测试正常折扣计算"""
        self.assertEqual(calculate_discount(100, 0.2), 80)
        self.assertEqual(calculate_discount(100, 0.5), 50)

    def test_no_discount(self):
        """测试无折扣"""
        self.assertEqual(calculate_discount(100, 0), 100)

    def test_full_discount(self):
        """测试全折扣"""
        self.assertEqual(calculate_discount(100, 1), 0)

    def test_invalid_discount_high(self):
        """测试无效折扣率（高）"""
        with self.assertRaises(ValueError):
            calculate_discount(100, 1.5)

    def test_invalid_discount_low(self):
        """测试无效折扣率（低）"""
        with self.assertRaises(ValueError):
            calculate_discount(100, -0.1)

    def test_invalid_price(self):
        """测试无效价格"""
        with self.assertRaises(ValueError):
            calculate_discount(-100, 0.2)

    def test_edge_cases(self):
        """测试边界情况"""
        self.assertEqual(calculate_discount(0, 0.5), 0)
        self.assertEqual(calculate_discount(1, 0.999), 0.001)

if __name__ == '__main__':
    unittest.main()
```

---

## 6. 高级功能

### 6.1 对话历史管理

#### 查看历史

```
VS Code:
1. 打开 AI 助手面板
2. 点击"历史记录"按钮
3. 选择之前的对话

JetBrains:
1. AI Assistant → View History
2. 选择要查看的对话
```

#### 导出对话

```bash
# 导出对话为 JSON 文件
对话面板 → 导出按钮 → 选择保存位置
```

#### 清空历史

```
1. AI 助手面板 → 清空按钮
2. 确认清空操作
```

### 6.2 自定义提示词

#### 创建提示词模板

VS Code 支持创建自定义提示词模板：

```json
// .vscode/llm-prompts.json
{
  "templates": [
    {
      "name": "代码审查",
      "prompt": "请审查以下代码，指出潜在问题、性能瓶颈和改进建议：\n\n${selection}",
      "description": "审查选中的代码"
    },
    {
      "name": "添加注释",
      "prompt": "请为以下代码添加详细的中文注释：\n\n${selection}",
      "description": "为代码添加注释"
    },
    {
      "name": "转换语言",
      "prompt": "请将以下${currentLanguage}代码转换为${targetLanguage}：\n\n${selection}",
      "description": "代码语言转换",
      "variables": {
        "targetLanguage": "Python"
      }
    }
  ]
}
```

### 6.3 多模型切换

#### 切换模型

```
VS Code:
1. 点击状态栏的模型名称
2. 从列表中选择其他模型

JetBrains:
1. Settings → Tools → AI Assistant
2. 修改 Default Model
```

#### 模型选择建议

| 任务 | 推荐模型 | 原因 |
|------|----------|------|
| 通用对话 | Qwen-72B-Chat | 综合能力强 |
| 代码补全 | DeepSeek-Coder-33B | 代码专项 |
| 快速响应 | Qwen-14B-Chat | 响应速度快 |
| 英文任务 | Llama-3-70B | 英文优秀 |

### 6.4 代码搜索与理解

#### 解释整个项目

```
提示词:
请帮我分析这个项目的结构，说明：
1. 项目的主要功能和目标
2. 核心模块和它们的作用
3. 数据流和依赖关系
4. 代码架构设计模式
```

#### 查找特定功能

```
提示词:
在这个项目中，用户认证是如何实现的？
请找出相关代码文件并解释其工作原理。
```

---

## 7. API 使用

### 7.1 获取 API 密钥

```
1. 登录平台 Web 界面
2. 进入个人中心
3. 点击"API 密钥"
4. 点击"生成新密钥"
5. 设置密钥名称和过期时间
6. 复制密钥并妥善保存
```

### 7.2 聊天补全 API

```bash
curl -X POST https://api.company.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [
      {"role": "system", "content": "你是一个专业的编程助手"},
      {"role": "user", "content": "如何实现一个单例模式？"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000,
    "stream": false
  }'
```

### 7.3 流式响应

```python
import requests
import json

def stream_chat(messages, model="Qwen-72B-Chat"):
    response = requests.post(
        "https://api.company.com/v1/chat/completions",
        headers={
            "Authorization": "Bearer YOUR_API_KEY",
            "Content-Type": "application/json"
        },
        json={
            "model": model,
            "messages": messages,
            "stream": True
        },
        stream=True
    )

    for line in response.iter_lines():
        if line.startswith(b"data: "):
            data = line.decode("utf-8")[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
                content = chunk["choices"][0]["delta"].get("content", "")
                print(content, end="", flush=True)
            except:
                pass

# 使用示例
stream_chat([
    {"role": "user", "content": "写一首关于春天的诗"}
])
```

---

## 8. 最佳实践

### 8.1 编写有效提示词

#### 提示词原则

1. **具体明确**
   ```
   好的：用 Python 实现一个支持泛型的二叉搜索树
   差的：写个树的数据结构
   ```

2. **提供上下文**
   ```
   好的：我有一个 Django 项目，需要实现用户认证... [代码片段]
   差的：怎么实现用户认证？
   ```

3. **指定格式**
   ```
   好的：请用 JSON 格式返回结果
   差的：给我结果
   ```

4. **分步骤**
   ```
   好的：请分步骤解释：
        1. 如何配置
        2. 如何使用
        3. 常见问题
   差的：怎么用这个工具？
   ```

### 8.2 代码安全

**注意事项：**
- 不要发送密码、密钥等敏感信息
- 对 IP 地址、邮箱等进行脱敏
- 使用占位符代替真实数据
```
好：
请帮我分析这段数据库连接代码：
conn = psycopg2.connect(
    host="xxx.xxx.xxx.xxx",
    database="mydb",
    user="user",
    password="********"
)

差：
conn = psycopg2.connect(
    host="192.168.1.100",
    database="mydb",
    user="admin",
    password="MySecretPassword123"
)
```

### 8.3 效率提升

1. **使用代码补全**：让 AI 帮你写重复代码
2. **生成测试**：提高代码覆盖率
3. **代码审查**：让 AI 帮你检查潜在问题
4. **学习新知识**：快速理解新技术

---

## 9. 常见问题

### 9.1 安装问题

**Q: 插件安装后不显示？**

A: 尝试以下步骤：
1. 重启 IDE
2. 检查插件是否被禁用
3. 查看 IDE 日志了解详细错误

**Q: 插件报错"无法连接到服务器"？**

A: 检查：
1. 网络连接是否正常
2. API 地址配置是否正确
3. 是否正确登录
4. 联系管理员确认服务状态

### 9.2 使用问题

**Q: 代码补全不工作？**

A: 检查：
1. 是否启用了自动补全功能
2. 网络连接是否正常
3. 配额是否充足
4. 当前文件类型是否支持

**Q: 生成的代码有错误怎么办？**

A:
1. AI 生成仅供参考，需要人工审核
2. 可以要求 AI 重新生成或修正
3. 对于生产代码，务必进行充分测试

**Q: 如何查看我的配额使用情况？**

A:
1. 在插件中查看使用统计
2. 联系管理员获取详细报告
3. 在平台 Web 界面查看个人中心

### 9.3 安全问题

**Q: 我的代码会被上传到哪里？**

A:
- 所有请求通过企业内网传输
- 数据存储在企业私有服务器
- 不会涉及任何第三方服务

**Q: 敏感信息会被记录吗？**

A:
- 平台有敏感信息自动过滤功能
- 可以查看审计日志
- 建议手动脱敏后再发送

---

## 附录

### A. 快捷键一览表

| 功能 | VS Code (Win/Linux) | VS Code (Mac) | JetBrains |
|------|---------------------|---------------|----------|
| 打开对话 | `Ctrl+Alt+A` | `Cmd+Alt+A` | `Ctrl+Shift+A` |
| 代码补全 | `Ctrl+Alt+Space` | `Cmd+Alt+Space` | `Ctrl+Shift+Enter` |
| 解释代码 | `Ctrl+Alt+E` | `Cmd+Alt+E` | 右键菜单 |
| 重构代码 | `Ctrl+Alt+R` | `Cmd+Alt+R` | 右键菜单 |
| 生成测试 | `Ctrl+Alt+T` | `Cmd+Alt+T` | 右键菜单 |
| 查找问题 | `Ctrl+Alt+B` | `Cmd+Alt+B` | 右键菜单 |
| 优化代码 | `Ctrl+Alt+O` | `Cmd+Alt+O` | 右键菜单 |

### B. 支持的语言

- Python
- JavaScript / TypeScript
- Java
- Go
- Rust
- C / C++
- C#
- PHP
- Ruby
- Swift
- Kotlin
- SQL
- Shell / Bash
- Markdown / 文档

### C. 联系支持

- 技术支持邮箱：support@company.com
- 内部工单：https://support.company.com
- 使用文档：https://docs.company.com/llm
- 反馈渠道：https://feedback.company.com/llm
