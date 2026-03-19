/**
 * Enterprise LLM Assistant - VS Code Extension
 * 企业大模型助手 - VS Code 扩展主入口
 */

import * as vscode from 'vscode';
import { AIClient } from './client/aiClient';
import { AuthClient, createAuthClient } from './client/authClient';
import { getConfigManager } from './client/config';
import { ChatPanelView, ChatHistoryManager } from './providers/chat';
import { AICodeCompletionProvider, SmartSnippetProvider } from './providers/completion';
import { TelemetryManager, trackAuth, trackFeature } from './utils/telemetry';

/**
 * 扩展上下文
 */
let extensionContext: vscode.ExtensionContext;
let aiClient: AIClient;
let authClient: AuthClient;
let completionProvider: AICodeCompletionProvider | null = null;
let snippetProvider: SmartSnippetProvider | null = null;
let statusBarItem: vscode.StatusBarItem;

/**
 * 激活扩展
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Enterprise LLM Assistant is now active!');

    extensionContext = context;
    const config = getConfigManager();

    // 初始化遥测
    const telemetry = TelemetryManager.getInstance();

    // 初始化认证客户端
    authClient = createAuthClient({
        authUrl: `${config.getApiUrl()}/auth`,
        clientId: 'vscode-plugin',
        redirectUri: 'vscode://company.enterprise-llm-assistant/callback',
    });

    // 尝试加载已保存的会话
    const hasSession = await authClient.loadSession();
    if (hasSession) {
        trackAuth('success');
    }

    // 初始化 AI 客户端
    aiClient = new AIClient(config.getApiUrl(), config.getApiKey());

    // 创建状态栏按钮
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'llm.settings.configure';
    statusBarItem.show();
    updateStatusBar();

    // 注册命令
    registerCommands(context);

    // 注册代码补全提供者
    registerCompletionProviders(context);

    // 加载聊天历史
    await ChatHistoryManager.loadHistory();

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('llm')) {
            updateStatusBar();
        }
    });

    // 显示欢迎信息（首次安装）
    if (!context.globalState.get('hasShownWelcome')) {
        vscode.window.showInformationMessage(
            '欢迎使用企业大模型助手！点击状态栏按钮配置 API 地址和密钥。',
            '配置'
        ).then(selection => {
            if (selection === '配置') {
                vscode.commands.executeCommand('llm.settings.configure');
            }
        });
        context.globalState.update('hasShownWelcome', true);
    }
}

/**
 * 注册命令
 */
function registerCommands(context: vscode.ExtensionContext) {
    // 开启 AI 对话
    const startChatCommand = vscode.commands.registerCommand(
        'llm.startChat',
        async () => {
            await ensureAuthenticated();
            trackFeature('chat_open');
            ChatPanelView.show(context.extensionUri, aiClient);
        }
    );

    // 代码补全
    const codeCompleteCommand = vscode.commands.registerCommand(
        'llm.codeComplete',
        async () => {
            await ensureAuthenticated();
            trackFeature('code_complete');
            if (completionProvider) {
                await completionProvider.triggerManualCompletion();
            }
        }
    );

    // 解释代码
    const explainCodeCommand = vscode.commands.registerCommand(
        'llm.explainCode',
        async () => {
            await ensureAuthenticated();
            await processSelectedCode('explain', '解释代码');
        }
    );

    // 重构代码
    const refactorCodeCommand = vscode.commands.registerCommand(
        'llm.refactorCode',
        async () => {
            await ensureAuthenticated();
            await processSelectedCode('refactor', '重构代码');
        }
    );

    // 生成测试
    const addTestsCommand = vscode.commands.registerCommand(
        'llm.addTests',
        async () => {
            await ensureAuthenticated();
            await processSelectedCode('test', '生成测试');
        }
    );

    // 优化代码
    const optimizeCodeCommand = vscode.commands.registerCommand(
        'llm.optimizeCode',
        async () => {
            await ensureAuthenticated();
            await processSelectedCode('optimize', '优化代码');
        }
    );

    // 查找问题
    const findBugsCommand = vscode.commands.registerCommand(
        'llm.findBugs',
        async () => {
            await ensureAuthenticated();
            await processSelectedCode('bug', '查找问题');
        }
    );

    // 清空对话
    const clearChatCommand = vscode.commands.registerCommand(
        'llm.clearChat',
        () => {
            vscode.window.showWarningMessage(
                '确定要清空所有对话历史吗？',
                '确定',
                '取消'
            ).then(async (selection) => {
                if (selection === '确定') {
                    await vscode.workspace.getConfiguration('llm').update(
                        'chatHistory',
                        [],
                        vscode.ConfigurationTarget.Global
                    );
                    vscode.window.showInformationMessage('对话历史已清空');
                }
            });
        }
    );

    // 导出对话
    const exportChatCommand = vscode.commands.registerCommand(
        'llm.exportChat',
        async () => {
            const history = ChatHistoryManager.getHistory();
            if (history.length === 0) {
                vscode.window.showInformationMessage('没有可导出的对话');
                return;
            }

            const options: vscode.SaveDialogOptions = {
                defaultUri: vscode.Uri.file('llm-chat-history.json'),
                filters: {
                    'JSON': ['json'],
                },
            };

            const uri = await vscode.window.showSaveDialog(options);
            if (uri) {
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(JSON.stringify(history, null, 2), 'utf-8')
                );
                vscode.window.showInformationMessage('对话已导出');
            }
        }
    );

    // 配置设置
    const configureCommand = vscode.commands.registerCommand(
        'llm.settings.configure',
        openConfiguration
    );

    // 注册所有命令
    context.subscriptions.push(
        startChatCommand,
        codeCompleteCommand,
        explainCodeCommand,
        refactorCodeCommand,
        addTestsCommand,
        optimizeCodeCommand,
        findBugsCommand,
        clearChatCommand,
        exportChatCommand,
        configureCommand
    );
}

/**
 * 注册代码补全提供者
 */
function registerCompletionProviders(context: vscode.ExtensionContext) {
    const config = getConfigManager();

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

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llm.enableAutocomplete')) {
                if (getConfigManager().isAutocompleteEnabled()) {
                    // 重新注册
                    context.subscriptions.push(
                        vscode.languages.registerInlineCompletionItemProvider(
                            { pattern: '**' },
                            completionProvider!
                        )
                    );
                }
            }
        })
    );
}

/**
 * 确保已认证
 */
async function ensureAuthenticated(): Promise<boolean> {
    if (authClient.isTokenValid()) {
        return true;
    }

    const result = await vscode.window.showInformationMessage(
        '需要登录才能使用 AI 功能',
        '登录',
        '取消'
    );

    if (result === '登录') {
        await authenticate();
        return authClient.isTokenValid();
    }

    return false;
}

/**
 * 认证流程
 */
async function authenticate(): Promise<void> {
    trackAuth('start');

    try {
        // 生成授权 URL
        const authUrl = authClient.getAuthUrl();

        // 显示授权 URL
        const result = await vscode.window.showInformationMessage(
            '请在浏览器中完成授权',
            '打开浏览器',
            '取消'
        );

        if (result === '打开浏览器') {
            vscode.env.openExternal(vscode.Uri.parse(authUrl));

            // 等待用户输入授权码
            const code = await vscode.window.showInputBox({
                prompt: '请输入授权码（从浏览器 URL 中获取）',
                ignoreFocusOut: true,
            });

            if (code) {
                await authClient.exchangeCodeForToken(code);
                trackAuth('success');
                updateStatusBar();
                vscode.window.showInformationMessage('登录成功！');
            }
        }
    } catch (error: any) {
        trackAuth('failure', { error: error.message });
        vscode.window.showErrorMessage(`登录失败: ${error.message}`);
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
            title: `${actionName}中...`,
            cancellable: true,
        },
        async (progress, token) => {
            let result = '';

            try {
                switch (action) {
                    case 'explain':
                        trackFeature('code_explain', { language });
                        result = await aiClient.explainCode(code, language);
                        break;
                    case 'refactor':
                        trackFeature('code_refactor', { language });
                        result = await aiClient.refactorCode(code, language);
                        break;
                    case 'test':
                        trackFeature('test_generate', { language });
                        result = await aiClient.generateTests(code, language);
                        break;
                    case 'optimize':
                        trackFeature('code_optimize', { language });
                        result = await aiClient.optimizeCode(code, language);
                        break;
                    case 'bug':
                        trackFeature('bug_find', { language });
                        result = await aiClient.findBugs(code, language);
                        break;
                }

                // 显示结果
                showResult(result, actionName);
            } catch (error: any) {
                vscode.window.showErrorMessage(`${actionName}失败: ${error.message}`);
            }
        }
    );
}

/**
 * 显示结果
 */
function showResult(content: string, title: string): void {
    const panel = vscode.window.createWebviewPanel(
        'llm-result',
        title,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
</head>
<body>
    ${formatContent(content)}
</body>
</html>`;
}

/**
 * 格式化内容
 */
function formatContent(content: string): string {
    // 转义 HTML
    content = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 格式化代码块
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 格式化段落
    content = content.replace(/\n\n/g, '</p><p>');
    content = `<p>${content}</p>`;

    return content;
}

/**
 * 打开配置
 */
async function openConfiguration(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'llm');
}

/**
 * 更新状态栏
 */
function updateStatusBar(): void {
    const config = getConfigManager();
    const isConnected = authClient.isTokenValid() || config.getApiKey();

    statusBarItem.text = isConnected
        ? '$(check) AI助手'
        : '$(warning) AI助手';
    statusBarItem.tooltip = isConnected
        ? `已连接到 ${config.getApiUrl()}`
        : '点击配置 API';
    statusBarItem.color = isConnected
        ? undefined
        : new vscode.ThemeColor('statusBarItem.warningForeground');
}

/**
 * 停用扩展
 */
export function deactivate() {
    console.log('Enterprise LLM Assistant is now deactivated.');

    // 上报遥测数据
    TelemetryManager.getInstance().flushNow();

    // 清理资源
    if (completionProvider) {
        completionProvider.dispose();
    }
    if (snippetProvider) {
        snippetProvider.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (authClient) {
        authClient.dispose();
    }
    if (aiClient) {
        aiClient.dispose();
    }
}
