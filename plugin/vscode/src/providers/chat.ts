/**
 * Chat Panel Provider
 * 聊天面板提供者
 */

import * as vscode from 'vscode';
import { AIClient, ChatMessage } from '../client/aiClient';
import { getConfigManager } from '../client/config';

/**
 * 聊天消息类型
 */
export interface ChatPanelMessage {
    type: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokens?: number;
    model?: string;
}

/**
 * 聊天会话
 */
export interface ChatSession {
    id: string;
    title: string;
    messages: ChatPanelMessage[];
    createdAt: number;
    updatedAt: number;
    model: string;
}

/**
 * 聊天面板视图
 */
export class ChatPanelView {
    private static currentPanel: ChatPanelView | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private client: AIClient;
    private session: ChatSession;
    private isGenerating = false;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        client: AIClient,
        session?: ChatSession
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.client = client;
        this.session = session || this.createNewSession();

        // 设置 Webview
        this.panel.webview.html = this.getWebviewContent();

        // 处理消息
        this.panel.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );

        // 监听面板关闭事件
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 初始化消息历史
        this.sendMessagesToWebview();
    }

    /**
     * 创建新的会话
     */
    private createNewSession(): ChatSession {
        return {
            id: `session_${Date.now()}`,
            title: '新对话',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            model: getConfigManager().getModel(),
        };
    }

    /**
     * 显示或创建聊天面板
     */
    public static show(extensionUri: vscode.Uri, client: AIClient, session?: ChatSession): ChatPanelView {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // 如果面板已存在，显示它
        if (ChatPanelView.currentPanel) {
            ChatPanelView.currentPanel.panel.reveal(column);
            return ChatPanelView.currentPanel;
        }

        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            'llm.chatView',
            'AI 对话',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
            }
        );

        ChatPanelView.currentPanel = new ChatPanelView(panel, extensionUri, client, session);
        return ChatPanelView.currentPanel;
    }

    /**
     * 获取 Webview 内容
     */
    private getWebviewContent(): string {
        const nonce = this.getNonce();
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'resources', 'chat.css')
        );
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'resources', 'chat.js')
        );

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${this.panel.webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${this.panel.webview.cspSource};
        font-src ${this.panel.webview.cspSource};
        img-src ${this.panel.webview.cspSource} https:;
    ">
    <link rel="stylesheet" href="${styleUri}">
    <title>AI 对话</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="model-selector">
                <label for="model-select">模型:</label>
                <select id="model-select">
                    <option value="Qwen-72B-Chat">Qwen 72B Chat</option>
                    <option value="Qwen-14B-Chat">Qwen 14B Chat</option>
                    <option value="DeepSeek-Coder-33B">DeepSeek Coder 33B</option>
                    <option value="Llama-3-70B-Instruct">Llama 3 70B</option>
                </select>
            </div>
            <div class="actions">
                <button id="clear-btn" title="清空对话" class="icon-btn">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path fill="currentColor" d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                </button>
                <button id="export-btn" title="导出对话" class="icon-btn">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path fill="currentColor" d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                        <path fill="currentColor" d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="messages" id="messages"></div>
        <div class="input-area">
            <textarea id="message-input" placeholder="输入消息... (Shift+Enter 发送)" rows="3"></textarea>
            <button id="send-btn" disabled>发送</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * 生成随机 nonce
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * 发送消息到 Webview
     */
    private sendMessagesToWebview(): void {
        this.panel.webview.postMessage({
            type: 'init',
            session: this.session,
        });
    }

    /**
     * 添加用户消息
     */
    private addUserMessage(content: string): void {
        const message: ChatPanelMessage = {
            type: 'user',
            content,
            timestamp: Date.now(),
        };
        this.session.messages.push(message);
        this.updateSession();
        this.panel.webview.postMessage({
            type: 'message',
            message,
        });
    }

    /**
     * 添加助手消息
     */
    private addAssistantMessage(content: string, model?: string): void {
        const message: ChatPanelMessage = {
            type: 'assistant',
            content,
            timestamp: Date.now(),
            model,
        };
        this.session.messages.push(message);
        this.updateSession();
        this.panel.webview.postMessage({
            type: 'message',
            message,
        });
    }

    /**
     * 更新会话
     */
    private updateSession(): void {
        this.session.updatedAt = Date.now();

        // 更新标题（使用第一条用户消息）
        if (this.session.title === '新对话') {
            const firstUserMessage = this.session.messages.find(m => m.type === 'user');
            if (firstUserMessage) {
                this.session.title = firstUserMessage.content.substring(0, 30) +
                    (firstUserMessage.content.length > 30 ? '...' : '');
            }
        }
    }

    /**
     * 处理 Webview 消息
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'sendMessage':
                await this.handleSendMessage(message.content);
                break;
            case 'clear':
                this.session = this.createNewSession();
                this.panel.webview.postMessage({
                    type: 'cleared',
                });
                break;
            case 'export':
                await this.exportSession();
                break;
            case 'modelChange':
                this.session.model = message.model;
                break;
        }
    }

    /**
     * 处理发送消息
     */
    private async handleSendMessage(content: string): Promise<void> {
        if (this.isGenerating || !content.trim()) {
            return;
        }

        this.isGenerating = true;
        this.panel.webview.postMessage({ type: 'generating', value: true });

        try {
            // 添加用户消息
            this.addUserMessage(content);

            // 准备 AI 请求
            const messages: ChatMessage[] = [
                { role: 'system', content: getConfigManager().getSystemPrompt() },
                ...this.session.messages.map(m => ({
                    role: m.type === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                } as ChatMessage)),
            ];

            if (getConfigManager().isStreamEnabled()) {
                // 流式响应
                let assistantContent = '';
                for await (const chunk of this.client.chatStream({
                    model: this.session.model,
                    messages,
                    temperature: getConfigManager().getTemperature(),
                    max_tokens: getConfigManager().getMaxTokens(),
                })) {
                    assistantContent += chunk;
                    this.panel.webview.postMessage({
                        type: 'chunk',
                        content: chunk,
                    });
                }
                this.addAssistantMessage(assistantContent, this.session.model);
            } else {
                // 非流式响应
                const response = await this.client.chat({
                    model: this.session.model,
                    messages,
                    temperature: getConfigManager().getTemperature(),
                    max_tokens: getConfigManager().getMaxTokens(),
                });
                this.addAssistantMessage(response.choices[0].message.content, this.session.model);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`请求失败: ${error.message}`);
            this.panel.webview.postMessage({
                type: 'error',
                message: error.message,
            });
        } finally {
            this.isGenerating = false;
            this.panel.webview.postMessage({ type: 'generating', value: false });
        }
    }

    /**
     * 导出会话
     */
    private async exportSession(): Promise<void> {
        const options: vscode.SaveDialogOptions = {
            defaultUri: vscode.Uri.file(`${this.session.title}.md`),
            filters: {
                'Markdown': ['md'],
                'Text': ['txt'],
                'JSON': ['json'],
            },
        };

        const uri = await vscode.window.showSaveDialog(options);
        if (!uri) {
            return;
        }

        const content = this.formatSessionAsMarkdown();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));

        vscode.window.showInformationMessage('对话已导出');
    }

    /**
     * 格式化会话为 Markdown
     */
    private formatSessionAsMarkdown(): string {
        let markdown = `# ${this.session.title}\n\n`;
        markdown += `**模型**: ${this.session.model}\n\n`;
        markdown += `**创建时间**: ${new Date(this.session.createdAt).toLocaleString()}\n\n`;
        markdown += '---\n\n';

        for (const message of this.session.messages) {
            const role = message.type === 'user' ? '用户' : '助手';
            markdown += `### ${role}\n\n${message.content}\n\n`;
        }

        return markdown;
    }

    /**
     * 获取当前会话
     */
    getSession(): ChatSession {
        return this.session;
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        ChatPanelView.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

/**
 * 聊天历史管理器
 */
export class ChatHistoryManager {
    private static history: ChatSession[] = [];

    static async loadHistory(): Promise<ChatSession[]> {
        const context = vscode.workspace.getConfiguration('llm');
        const saved = context.get<ChatSession[]>('chatHistory', []);
        this.history = saved;
        return this.history;
    }

    static async saveHistory(): Promise<void> {
        const context = vscode.workspace.getConfiguration('llm');
        await context.update('chatHistory', this.history, vscode.ConfigurationTarget.Global);
    }

    static async addSession(session: ChatSession): Promise<void> {
        this.history.push(session);
        await this.saveHistory();
    }

    static async deleteSession(sessionId: string): Promise<void> {
        this.history = this.history.filter(s => s.id !== sessionId);
        await this.saveHistory();
    }

    static getHistory(): ChatSession[] {
        return this.history;
    }

    static getSession(sessionId: string): ChatSession | undefined {
        return this.history.find(s => s.id === sessionId);
    }
}
