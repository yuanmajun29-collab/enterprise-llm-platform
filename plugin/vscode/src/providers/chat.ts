/**
 * Chat Panel Provider
 * 聊天面板提供者
 *
 * 支持：
 * - 多轮对话管理（维护消息历史数组）
 * - 流式输出（逐字显示）
 * - 中止当前请求（stopChat）
 * - 清空对话历史 / 获取完整消息历史
 * - System Prompt 设置
 * - Markdown 渲染
 */

import * as vscode from 'vscode';
import { AIClient, ChatMessage } from '../client/aiClient';
import { AuthClient } from '../client/authClient';
import { getConfigManager } from '../client/config';

/**
 * 聊天消息类型（UI 层）
 */
export interface ChatPanelMessage {
    id: string;
    type: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokens?: {
        prompt: number;
        completion: number;
        total: number;
    };
    model?: string;
    isStreaming?: boolean;
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
    systemPrompt: string;
}

/**
 * 聊天面板视图
 */
export class ChatPanelView {
    private static currentPanel: ChatPanelView | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly client: AIClient;
    private readonly authClient: AuthClient;
    private session: ChatSession;
    private isGenerating = false;
    private currentAbortController: AbortController | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        client: AIClient,
        authClient: AuthClient,
        session?: ChatSession
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.client = client;
        this.authClient = authClient;
        this.session = session || this.createNewSession();

        this.panel.webview.html = this.getWebviewContent();

        // 处理来自 Webview 的消息
        this.panel.webview.onDidReceiveMessage(
            this.handleWebviewMessage.bind(this),
            null,
            this.disposables
        );

        // 面板关闭时清理
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 初始化 Webview
        this.sendSessionToWebview();
    }

    // ==================== 静态方法 ====================

    /**
     * 显示或创建聊天面板
     */
    public static show(
        extensionUri: vscode.Uri,
        client: AIClient,
        authClient: AuthClient,
        session?: ChatSession
    ): ChatPanelView {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (ChatPanelView.currentPanel) {
            ChatPanelView.currentPanel.panel.reveal(column);
            return ChatPanelView.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'llm-assistant-chat',
            'AI 对话',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
            }
        );

        ChatPanelView.currentPanel = new ChatPanelView(panel, extensionUri, client, authClient, session);
        return ChatPanelView.currentPanel;
    }

    // ==================== 对话管理 ====================

    /**
     * 流式聊天 - 发送用户消息并逐字显示 AI 响应
     */
    private async streamChat(userMessage: string): Promise<void> {
        if (this.isGenerating) return;

        this.isGenerating = true;
        this.panel.webview.postMessage({ type: 'generating', value: true });

        // 添加用户消息
        const userMsg: ChatPanelMessage = {
            id: `msg_${Date.now()}_user`,
            type: 'user',
            content: userMessage,
            timestamp: Date.now(),
        };
        this.session.messages.push(userMsg);
        this.panel.webview.postMessage({ type: 'message', message: userMsg });

        // 创建助手消息占位（用于流式更新）
        const assistantMsg: ChatPanelMessage = {
            id: `msg_${Date.now()}_assistant`,
            type: 'assistant',
            content: '',
            timestamp: Date.now(),
            model: this.session.model,
            isStreaming: true,
        };
        this.session.messages.push(assistantMsg);
        this.panel.webview.postMessage({ type: 'message', message: assistantMsg });

        try {
            // 构建消息列表（包含 system prompt + 历史）
            const config = getConfigManager();
            const messages: ChatMessage[] = [
                { role: 'system', content: this.session.systemPrompt || config.getSystemPrompt() },
                ...this.session.messages
                    .filter(m => m.type !== 'system')
                    .map(m => ({
                        role: (m.type === 'assistant' ? 'assistant' : 'user') as ChatMessage['role'],
                        content: m.content,
                    })),
            ];

            // 流式输出
            let fullContent = '';
            for await (const chunk of this.client.streamChatCompletions(
                messages,
                this.session.model,
                {
                    temperature: config.getTemperature(),
                    max_tokens: config.getMaxTokens(),
                }
            )) {
                fullContent += chunk;
                // 逐字更新 Webview
                this.panel.webview.postMessage({
                    type: 'stream-update',
                    messageId: assistantMsg.id,
                    content: fullContent,
                });
            }

            // 更新最终内容
            assistantMsg.content = fullContent;
            assistantMsg.isStreaming = false;
            this.panel.webview.postMessage({
                type: 'stream-complete',
                messageId: assistantMsg.id,
                content: fullContent,
            });

            // 更新会话标题
            if (this.session.title === '新对话') {
                this.session.title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
                this.panel.title = `AI 对话 - ${this.session.title}`;
            }
        } catch (error: any) {
            assistantMsg.content = `请求失败: ${error.message}`;
            assistantMsg.isStreaming = false;
            this.panel.webview.postMessage({
                type: 'error',
                message: error.message,
            });
        } finally {
            this.isGenerating = false;
            this.currentAbortController = null;
            this.session.updatedAt = Date.now();
            this.panel.webview.postMessage({ type: 'generating', value: false });
        }
    }

    /**
     * 中止当前聊天请求
     */
    stopChat(): void {
        this.client.abortRequest();
        this.isGenerating = false;
        this.currentAbortController = null;
        this.panel.webview.postMessage({ type: 'generating', value: false });
    }

    /**
     * 清空对话历史
     */
    clearHistory(): void {
        this.session = this.createNewSession();
        this.panel.webview.postMessage({ type: 'cleared' });
        this.panel.title = 'AI 对话';
    }

    /**
     * 获取完整消息历史
     */
    getHistory(): ChatPanelMessage[] {
        return [...this.session.messages];
    }

    /**
     * 设置 System Prompt
     */
    setSystemPrompt(prompt: string): void {
        this.session.systemPrompt = prompt;
    }

    // ==================== 会话管理 ====================

    private createNewSession(): ChatSession {
        const config = getConfigManager();
        return {
            id: `session_${Date.now()}`,
            title: '新对话',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            model: config.getDefaultModel(),
            systemPrompt: config.getSystemPrompt(),
        };
    }

    // ==================== Webview 通信 ====================

    private sendSessionToWebview(): void {
        this.panel.webview.postMessage({
            type: 'init',
            session: this.session,
        });
    }

    private async handleWebviewMessage(message: { type: string; content?: string; model?: string }): Promise<void> {
        switch (message.type) {
            case 'sendMessage':
                if (message.content) {
                    await this.streamChat(message.content);
                }
                break;

            case 'stopGeneration':
                this.stopChat();
                break;

            case 'clearHistory':
                this.clearHistory();
                break;

            case 'modelChange':
                if (message.model) {
                    this.session.model = message.model;
                }
                break;

            case 'getHistory':
                this.panel.webview.postMessage({
                    type: 'history',
                    messages: this.getHistory(),
                });
                break;

            case 'setSystemPrompt':
                if (message.content) {
                    this.setSystemPrompt(message.content);
                }
                break;
        }
    }

    // ==================== Webview HTML ====================

    private getWebviewContent(): string {
        const chatHtmlPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'chat.html');
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src 'unsafe-inline' ${this.panel.webview.cspSource};
        script-src 'unsafe-inline' ${this.panel.webview.cspSource};
        font-src ${this.panel.webview.cspSource};
        img-src ${this.panel.webview.cspSource} https:;
    ">
    <style>${this.getStyles()}</style>
</head>
<body>
    ${this.getBodyHtml()}
    <script>${this.getScript()}</script>
</body>
</html>`;
    }

    private getStyles(): string {
        return `
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --accent: var(--vscode-button-background);
            --accent-hover: var(--vscode-button-hoverBackground);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--fg);
            background: var(--bg);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
        }

        .model-selector {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .model-selector label { font-size: 12px; opacity: 0.7; }

        .model-selector select,
        .system-prompt-input {
            padding: 4px 8px;
            border: 1px solid var(--input-border);
            border-radius: 4px;
            background: var(--input-bg);
            color: var(--fg);
            font-size: 12px;
        }

        .header-actions { display: flex; gap: 4px; }

        .icon-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background: transparent;
            color: var(--fg);
            cursor: pointer;
        }
        .icon-btn:hover { background: var(--accent-hover); }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }

        .message {
            display: flex;
            margin-bottom: 16px;
            animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .message.user { justify-content: flex-end; }
        .message.assistant { justify-content: flex-start; }

        .message-bubble {
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 8px;
            word-wrap: break-word;
            line-height: 1.5;
        }

        .message.user .message-bubble {
            background: var(--accent);
            color: white;
            border-bottom-right-radius: 2px;
        }

        .message.assistant .message-bubble {
            background: var(--input-bg);
            border: 1px solid var(--border);
            border-bottom-left-radius: 2px;
        }

        .message-bubble pre {
            background: rgba(0,0,0,0.15);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
            font-size: 13px;
        }

        .message-bubble code {
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(0,0,0,0.1);
        }
        .message-bubble pre code { background: none; padding: 0; }

        .message-bubble strong { font-weight: 600; }

        .message-meta {
            font-size: 11px;
            opacity: 0.5;
            margin-top: 4px;
        }

        .typing-cursor::after {
            content: '▊';
            animation: blink 1s infinite;
            color: var(--accent);
        }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }

        .input-area {
            display: flex;
            gap: 8px;
            padding: 12px;
            border-top: 1px solid var(--border);
        }

        #message-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--input-border);
            border-radius: 6px;
            background: var(--input-bg);
            color: var(--fg);
            font-family: inherit;
            font-size: 13px;
            resize: none;
            min-height: 40px;
            max-height: 120px;
        }
        #message-input:focus { outline: none; border-color: var(--accent); }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .btn-send {
            background: var(--accent);
            color: white;
        }
        .btn-send:hover:not(:disabled) { opacity: 0.9; }
        .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-stop {
            background: #d32f2f;
            color: white;
        }
        .btn-stop:hover { opacity: 0.9; }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.5;
            text-align: center;
        }
        .empty-state h3 { margin-bottom: 8px; }
        `;
    }

    private getBodyHtml(): string {
        return `
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
        <div class="header-actions">
            <button id="clear-btn" class="icon-btn" title="清空对话">🗑</button>
        </div>
    </div>

    <div class="messages" id="messages">
        <div class="empty-state" id="empty-state">
            <h3>🤖 企业大模型助手</h3>
            <p>输入消息开始对话</p>
        </div>
    </div>

    <div class="input-area">
        <textarea id="message-input" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="2"></textarea>
        <button id="send-btn" class="btn btn-send" disabled>发送</button>
        <button id="stop-btn" class="btn btn-stop" style="display:none;">停止</button>
    </div>
    `;
    }

    private getScript(): string {
        return `
(function() {
    const vscode = acquireVsCodeApi();
    const messagesDiv = document.getElementById('messages');
    const emptyState = document.getElementById('empty-state');
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const modelSelect = document.getElementById('model-select');

    let isGenerating = false;

    // 监听来自扩展的消息
    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.type) {
            case 'init':
                modelSelect.value = msg.session.model || 'Qwen-72B-Chat';
                if (msg.session.messages && msg.session.messages.length > 0) {
                    emptyState.style.display = 'none';
                    msg.session.messages.forEach(m => renderMessage(m));
                }
                break;

            case 'message':
                emptyState.style.display = 'none';
                renderMessage(msg.message);
                break;

            case 'stream-update':
                updateStreamingMessage(msg.messageId, msg.content);
                break;

            case 'stream-complete':
                finalizeStreamingMessage(msg.messageId, msg.content);
                break;

            case 'generating':
                isGenerating = msg.value;
                updateUI();
                break;

            case 'error':
                addErrorBubble(msg.message);
                break;

            case 'cleared':
                messagesDiv.innerHTML = '';
                emptyState.style.display = 'flex';
                break;

            case 'history':
                messagesDiv.innerHTML = '';
                if (msg.messages.length > 0) {
                    emptyState.style.display = 'none';
                    msg.messages.forEach(m => renderMessage(m));
                } else {
                    emptyState.style.display = 'flex';
                }
                break;
        }
    });

    function renderMessage(message) {
        emptyState.style.display = 'none';
        const el = document.createElement('div');
        el.className = 'message ' + message.type;
        el.id = message.id;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (message.type === 'assistant' && message.isStreaming) {
            bubble.classList.add('typing-cursor');
        }

        if (message.type === 'assistant') {
            bubble.innerHTML = formatMarkdown(message.content || '');
        } else {
            bubble.textContent = message.content;
        }

        el.appendChild(bubble);

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = new Date(message.timestamp).toLocaleTimeString() +
            (message.model ? ' · ' + message.model : '');
        el.appendChild(meta);

        messagesDiv.appendChild(el);
        scrollToBottom();
    }

    function updateStreamingMessage(messageId, content) {
        const el = document.getElementById(messageId);
        if (!el) return;
        const bubble = el.querySelector('.message-bubble');
        if (bubble) {
            bubble.innerHTML = formatMarkdown(content);
            bubble.classList.add('typing-cursor');
        }
        scrollToBottom();
    }

    function finalizeStreamingMessage(messageId, content) {
        const el = document.getElementById(messageId);
        if (!el) return;
        const bubble = el.querySelector('.message-bubble');
        if (bubble) {
            bubble.innerHTML = formatMarkdown(content);
            bubble.classList.remove('typing-cursor');
        }
    }

    function addErrorBubble(errorMsg) {
        const el = document.createElement('div');
        el.className = 'message assistant';
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.style.color = '#f44336';
        bubble.textContent = '❌ ' + errorMsg;
        el.appendChild(bubble);
        messagesDiv.appendChild(el);
        scrollToBottom();
    }

    function formatMarkdown(text) {
        if (!text) return '';
        // 转义 HTML
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // 代码块
        text = text.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
        // 行内代码
        text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
        // 加粗
        text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        // 换行
        text = text.replace(/\\n/g, '<br>');
        return text;
    }

    function updateUI() {
        sendBtn.style.display = isGenerating ? 'none' : '';
        stopBtn.style.display = isGenerating ? '' : 'none';
        sendBtn.disabled = !input.value.trim();
    }

    function sendMessage() {
        const content = input.value.trim();
        if (!content || isGenerating) return;
        vscode.postMessage({ type: 'sendMessage', content: content });
        input.value = '';
        input.style.height = 'auto';
        updateUI();
    }

    sendBtn.addEventListener('click', sendMessage);

    stopBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'stopGeneration' });
    });

    clearBtn.addEventListener('click', () => {
        if (confirm('确定要清空所有对话吗？')) {
            vscode.postMessage({ type: 'clearHistory' });
        }
    });

    modelSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'modelChange', model: modelSelect.value });
    });

    input.addEventListener('input', () => {
        updateUI();
        // Auto-resize
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    input.focus();
    updateUI();

    function scrollToBottom() {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
})();
        `;
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        ChatPanelView.currentPanel = undefined;
        this.stopChat();
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
        const config = vscode.workspace.getConfiguration('llm-assistant');
        const saved = config.get<ChatSession[]>('chatHistory', []);
        this.history = saved;
        return this.history;
    }

    static async saveHistory(): Promise<void> {
        const config = vscode.workspace.getConfiguration('llm-assistant');
        await config.update('chatHistory', this.history, vscode.ConfigurationTarget.Global);
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
