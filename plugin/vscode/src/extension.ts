/**
 * Enterprise LLM Assistant - VS Code Extension
 * 企业大模型助手 - VS Code 扩展主入口
 */

import * as vscode from 'vscode';
import { AIClient } from './client/aiClient';
import { AuthClient } from './client/authClient';
import { getConfigManager } from './client/config';
import { ChatPanelView, ChatHistoryManager } from './providers/chat';
import { AICodeCompletionProvider, SmartSnippetProvider } from './providers/completion';
import { trackAuth, trackFeature } from './utils/telemetry';

/**
 * 扩展上下文
 */
let extensionContext: vscode.ExtensionContext;
let aiClient: AIClient;
let authClient: AuthClient;
let completionProvider: AICodeCompletionProvider | null = null;
let snippetProvider: SmartSnippetProvider | null = null;
let statusBarItem: vscode.StatusBarItem;
let chatPanelView: ChatPanelView | null = null;

/**
 * 激活扩展
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Enterprise LLM Assistant is now active!');

    extensionContext = context;
    const config = getConfigManager();

    // 初始化认证客户端
    authClient = new AuthClient(context);
    await authClient.loadStoredToken();

    // 初始化 AI 客户端
    aiClient = new AIClient(config.getApiUrl(), authClient);

    // 创建状态栏项 - 显示连接状态
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'llm-assistant.openChat';
    statusBarItem.show();
    updateStatusBar();

    // 注册所有命令
    registerCommands(context);

    // 注册代码补全提供者
    registerCompletionProviders(context);

    // 加载聊天历史
    await ChatHistoryManager.loadHistory();

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llm-assistant')) {
                // 更新 AI 客户端配置
                aiClient.updateBaseUrl(config.getApiUrl());
                updateStatusBar();
            }
        })
    );

    // 监听认证状态变化
    authClient.onAuthChange(() => {
        updateStatusBar();
    });

    // 显示欢迎信息（首次安装）
    if (!context.globalState.get('hasShownWelcome')) {
        vscode.window.showInformationMessage(
            '欢迎使用企业大模型助手！请先登录以使用 AI 功能。',
            '登录',
            '取消'
        ).then(selection => {
            if (selection === '登录') {
                vscode.commands.executeCommand('llm-assistant.login');
            }
        });
        context.globalState.update('hasShownWelcome', true);
    }
}

/**
 * 注册所有命令
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // ==================== 认证命令 ====================

    // 登录
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.login', async () => {
            trackAuth('start');
            const username = await vscode.window.showInputBox({
                prompt: '请输入用户名',
                ignoreFocusOut: true,
                validateInput: (value) => value.trim() ? undefined : '用户名不能为空',
            });
            if (!username) return;

            const password = await vscode.window.showInputBox({
                prompt: '请输入密码',
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => value ? undefined : '密码不能为空',
            });
            if (!password) return;

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: '登录中...' },
                    async () => {
                        await authClient.login(username, password);
                    }
                );
                trackAuth('success');
                updateStatusBar();
                vscode.window.showInformationMessage(`欢迎回来，${username}！`);
            } catch (error: any) {
                trackAuth('failure', { error: error.message });
                vscode.window.showErrorMessage(`登录失败: ${error.message}`);
            }
        })
    );

    // 登出
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.logout', async () => {
            const result = await vscode.window.showWarningMessage(
                '确定要登出吗？',
                '确定',
                '取消'
            );
            if (result === '确定') {
                await authClient.logout();
                updateStatusBar();
                vscode.window.showInformationMessage('已成功登出');
            }
        })
    );

    // ==================== 聊天命令 ====================

    // 打开聊天面板
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.openChat', async () => {
            if (!authClient.isAuthenticated()) {
                const choice = await vscode.window.showInformationMessage(
                    '请先登录',
                    '登录',
                    '取消'
                );
                if (choice === '登录') {
                    await vscode.commands.executeCommand('llm-assistant.login');
                }
                return;
            }
            trackFeature('chat_open');
            chatPanelView = ChatPanelView.show(extensionContext.extensionUri, aiClient, authClient);
        })
    );

    // ==================== 代码操作命令 ====================

    // 解释代码
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.explainCode', async () => {
            if (!authClient.isAuthenticated()) {
                await promptLogin();
                return;
            }
            trackFeature('code_explain');
            await processSelectedCode('explain', '解释代码');
        })
    );

    // 重构代码
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.refactorCode', async () => {
            if (!authClient.isAuthenticated()) {
                await promptLogin();
                return;
            }
            trackFeature('code_refactor');
            await processSelectedCode('refactor', '重构代码');
        })
    );

    // 生成单元测试
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.generateTests', async () => {
            if (!authClient.isAuthenticated()) {
                await promptLogin();
                return;
            }
            trackFeature('test_generate');
            await processSelectedCode('test', '生成测试');
        })
    );

    // 查找代码问题
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.findBugs', async () => {
            if (!authClient.isAuthenticated()) {
                await promptLogin();
                return;
            }
            trackFeature('bug_find');
            await processSelectedCode('bug', '查找问题');
        })
    );

    // 优化代码
    context.subscriptions.push(
        vscode.commands.registerCommand('llm-assistant.optimizeCode', async () => {
            if (!authClient.isAuthenticated()) {
                await promptLogin();
                return;
            }
            trackFeature('code_optimize');
            await processSelectedCode('optimize', '优化代码');
        })
    );
}

/**
 * 注册代码补全提供者
 */
function registerCompletionProviders(context: vscode.ExtensionContext): void {
    // AI 内联补全
    completionProvider = new AICodeCompletionProvider(aiClient);
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            completionProvider
        ),
        completionProvider
    );

    // 智能代码片段
    snippetProvider = new SmartSnippetProvider(aiClient);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { pattern: '**' },
            snippetProvider,
            '\t',
            ' '
        ),
        snippetProvider
    );
}

/**
 * 提示登录
 */
async function promptLogin(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
        '需要登录才能使用 AI 功能',
        '登录',
        '取消'
    );
    if (choice === '登录') {
        await vscode.commands.executeCommand('llm-assistant.login');
    }
}

/**
 * 处理选中的代码
 */
async function processSelectedCode(
    action: 'explain' | 'refactor' | 'test' | 'optimize' | 'bug',
    actionName: string
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    const selection = editor.selection;
    const code = editor.document.getText(selection);

    if (!code.trim()) {
        vscode.window.showWarningMessage('请先选择要处理的代码');
        return;
    }

    const language = editor.document.languageId;

    // 显示进度
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `AI ${actionName}中...`,
            cancellable: true,
        },
        async (progress, token) => {
            let result = '';

            try {
                switch (action) {
                    case 'explain':
                        result = await aiClient.explainCode(code, language, token);
                        break;
                    case 'refactor':
                        result = await aiClient.refactorCode(code, language, token);
                        break;
                    case 'test':
                        result = await aiClient.generateTests(code, language, token);
                        break;
                    case 'optimize':
                        result = await aiClient.optimizeCode(code, language, token);
                        break;
                    case 'bug':
                        result = await aiClient.findBugs(code, language, token);
                        break;
                }

                // 显示结果
                showResult(result, actionName);
            } catch (error: any) {
                if (error.message?.includes('cancelled')) {
                    vscode.window.showInformationMessage(`${actionName}已取消`);
                } else {
                    vscode.window.showErrorMessage(`${actionName}失败: ${error.message}`);
                }
            }
        }
    );
}

/**
 * 显示结果（在侧边 Webview Panel 中）
 */
function showResult(content: string, title: string): void {
    const panel = vscode.window.createWebviewPanel(
        'llm-assistant-result',
        `AI ${title}`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );

    const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 简单 Markdown 渲染
    let formatted = escaped
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    formatted = `<p>${formatted}</p>`;

    panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 16px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 12px 0;
        }
        code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
        }
        pre code {
            background: none;
            padding: 0;
        }
        strong { font-weight: 600; }
        .copy-btn {
            float: right;
            padding: 4px 12px;
            border: 1px solid var(--vscode-button-border, #444);
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            font-size: 12px;
        }
        .copy-btn:hover { background: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
    <button class="copy-btn" onclick="copyContent()">复制</button>
    <h2>${title}</h2>
    <hr>
    ${formatted}
    <script>
        function copyContent() {
            const body = document.querySelector('body');
            // Get just the text content without the button and heading
            const content = document.body.innerText.replace('复制', '').replace('${title}', '').trim();
            navigator.clipboard.writeText(content).then(() => {
                document.querySelector('.copy-btn').textContent = '已复制 ✓';
                setTimeout(() => { document.querySelector('.copy-btn').textContent = '复制'; }, 2000);
            });
        }
    </script>
</body>
</html>`;
}

/**
 * 更新状态栏
 */
function updateStatusBar(): void {
    const config = getConfigManager();
    const isConnected = authClient.isAuthenticated();

    statusBarItem.text = isConnected
        ? '$(check) AI助手 已连接'
        : '$(warning) AI助手 未连接';
    statusBarItem.tooltip = isConnected
        ? `已连接到 ${config.getApiUrl()} | 点击打开聊天`
        : '点击登录';
    statusBarItem.color = isConnected
        ? undefined
        : new vscode.ThemeColor('statusBarItem.warningForeground');
}

/**
 * 停用扩展
 */
export function deactivate() {
    console.log('Enterprise LLM Assistant is now deactivated.');

    if (completionProvider) {
        completionProvider.dispose();
    }
    if (snippetProvider) {
        snippetProvider.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (aiClient) {
        aiClient.dispose();
    }
}
