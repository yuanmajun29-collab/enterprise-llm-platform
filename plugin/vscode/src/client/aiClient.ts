/**
 * Enterprise LLM API Client
 * 企业大模型 API 客户端
 *
 * 支持：
 * - 聊天补全（流式/非流式）
 * - 代码补全
 * - 代码解释/重构/测试生成/Bug 检测/优化
 * - 自动 Token 注入、错误重试、限流处理
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { EventEmitter } from 'events';
import { CancellationToken } from 'vscode';
import { AuthClient } from './authClient';

/**
 * 聊天消息接口
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * AI 请求配置
 */
export interface AIRequestOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stream?: boolean;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: ChatMessage;
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * 流式响应块
 */
export interface StreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: Partial<ChatMessage>;
        finish_reason: string | null;
    }>;
}

/**
 * 代码补全响应
 */
export interface CodeCompletionResponse {
    completion: string;
    model?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

/**
 * API 错误响应
 */
export interface APIError {
    error: {
        message: string;
        type: string;
        code: string;
    };
}

/**
 * 模型信息
 */
export interface ModelInfo {
    id: string;
    name: string;
    display_name: string;
    description: string;
    parameters: number;
    context_length: number;
}

/**
 * 最大重试次数
 */
const MAX_RETRIES = 2;

/**
 * AI 客户端类
 */
export class AIClient extends EventEmitter {
    private apiBaseUrl: string;
    private authClient: AuthClient;
    private axiosInstance: AxiosInstance;
    private requestQueue: Map<string, AbortController> = new Map();

    /**
     * 构造函数
     */
    constructor(apiBaseUrl: string, authClient: AuthClient) {
        super();
        this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
        this.authClient = authClient;

        this.axiosInstance = axios.create({
            baseURL: this.apiBaseUrl,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // 请求拦截器：自动注入 Token
        this.axiosInstance.interceptors.request.use((config) => {
            const token = this.authClient.getAccessToken();
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            config.headers['X-Request-ID'] = this.generateRequestId();
            return config;
        });

        // 响应拦截器：错误处理
        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error: AxiosError<APIError>) => {
                const status = error.response?.status;

                if (status === 401) {
                    // 未认证 → 自动尝试刷新 Token
                    this.emit('auth-error', error);
                    try {
                        await this.authClient.refreshToken();
                        // 重试原请求
                        const newToken = this.authClient.getAccessToken();
                        if (error.config) {
                            error.config.headers['Authorization'] = `Bearer ${newToken}`;
                            return this.axiosInstance.request(error.config);
                        }
                    } catch (refreshError) {
                        this.emit('unauthorized');
                        throw new Error('认证已过期，请重新登录');
                    }
                }

                if (status === 429) {
                    // 限流 → 提示用户
                    const retryAfter = error.response?.headers?.['retry-after'];
                    const waitTime = retryAfter ? parseInt(retryAfter) : 5;
                    throw new Error(`请求过于频繁，请等待 ${waitTime} 秒后重试`);
                }

                throw error;
            }
        );
    }

    // ==================== 核心方法 ====================

    /**
     * 聊天补全（非流式）
     * POST /v1/chat/completions
     */
    async chatCompletions(
        messages: ChatMessage[],
        model?: string,
        options?: AIRequestOptions
    ): Promise<ChatResponse> {
        const config = vscode.workspace.getConfiguration('llm-assistant');

        const response = await this.requestWithRetry<ChatResponse>(
            () => this.axiosInstance.post<ChatResponse>('/v1/chat/completions', {
                model: options?.model || model || config.get('defaultModel', 'Qwen-72B-Chat'),
                messages,
                temperature: options?.temperature ?? config.get('temperature', 0.7),
                max_tokens: options?.max_tokens ?? config.get('maxTokens', 2000),
                top_p: options?.top_p ?? 1.0,
                stream: false,
            })
        );

        return response.data;
    }

    /**
     * 聊天补全（流式 SSE）
     * POST /v1/chat/completions (stream: true)
     */
    async *streamChatCompletions(
        messages: ChatMessage[],
        model?: string,
        options?: AIRequestOptions,
        token?: CancellationToken
    ): AsyncGenerator<string> {
        const config = vscode.workspace.getConfiguration('llm-assistant');
        const requestId = this.generateRequestId();
        const controller = new AbortController();

        this.requestQueue.set(requestId, controller);

        // 监听取消
        if (token) {
            token.onCancellationRequested(() => {
                controller.abort();
                this.requestQueue.delete(requestId);
            });
        }

        try {
            const authToken = this.authClient.getAccessToken();
            const response = await axios({
                method: 'POST',
                url: `${this.apiBaseUrl}/v1/chat/completions`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken ? `Bearer ${authToken}` : '',
                    'X-Request-ID': requestId,
                    'Accept': 'text/event-stream',
                },
                data: {
                    model: options?.model || model || config.get('defaultModel', 'Qwen-72B-Chat'),
                    messages,
                    temperature: options?.temperature ?? config.get('temperature', 0.7),
                    max_tokens: options?.max_tokens ?? config.get('maxTokens', 2000),
                    top_p: options?.top_p ?? 1.0,
                    stream: true,
                },
                responseType: 'stream',
                signal: controller.signal,
            });

            this.emit('stream-start', { requestId });

            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

                for (const line of lines as string[]) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();

                        if (data === '[DONE]') {
                            this.emit('stream-complete', { requestId });
                            return;
                        }

                        try {
                            const parsed: StreamChunk = JSON.parse(data);
                            const delta = parsed.choices[0]?.delta;
                            const finishReason = parsed.choices[0]?.finish_reason;

                            if (delta?.content) {
                                this.emit('stream-chunk', { requestId, content: delta.content });
                                yield delta.content;
                            }

                            if (finishReason) {
                                this.emit('stream-complete', { requestId, finishReason });
                            }
                        } catch {
                            // 忽略解析错误（可能是空行或注释）
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'CanceledError' || error.name === 'AbortError') {
                this.emit('stream-cancelled', { requestId });
                return;
            }
            this.emit('stream-error', { requestId, error });
            throw error;
        } finally {
            this.requestQueue.delete(requestId);
        }
    }

    /**
     * 代码补全
     * POST /v1/completions (vLLM 原生端点)
     */
    async codeCompletion(
        code: string,
        _language: string,
        _cursorPosition: number,
        model?: string
    ): Promise<CodeCompletionResponse> {
        const config = vscode.workspace.getConfiguration('llm-assistant');

        const response = await this.requestWithRetry<any>(
            () => this.axiosInstance.post<any>('/v1/completions', {
                model: model || config.get('defaultModel', 'Qwen-72B-Chat'),
                prompt: code,
                max_tokens: 256,
                temperature: 0.2,
                stop: ['\n\n', 'Human:', 'Assistant:'],
            })
        );

        // 适配 vLLM /v1/completions 响应格式
        const data = response.data;
        return {
            completion: data.choices?.[0]?.text || '',
            model: data.model,
            usage: data.usage,
        };
    }

    // ==================== 便捷方法 ====================

    /**
     * 解释代码
     */
    async explainCode(code: string, language: string, token?: CancellationToken): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个代码解释专家。请用简洁清晰的语言解释给定的代码片段。' },
            { role: 'user', content: `请解释以下 ${language} 代码的功能和原理：\n\n\`\`\`${language}\n${code}\n\`\`\`` },
        ];

        const response = await this.chatCompletions(messages, undefined, {
            max_tokens: 1500,
            temperature: 0.3,
        });

        return response.choices[0]?.message?.content || '';
    }

    /**
     * 重构代码
     */
    async refactorCode(code: string, language: string, token?: CancellationToken): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个代码重构专家。请根据指令重构代码，使其更加简洁、高效、可维护。只输出重构后的代码，不要包含解释。' },
            { role: 'user', content: `请重构以下 ${language} 代码，使其更加简洁高效：\n\n\`\`\`${language}\n${code}\n\`\`\`` },
        ];

        const response = await this.chatCompletions(messages, undefined, {
            model: 'DeepSeek-Coder-33B',
            max_tokens: 2000,
            temperature: 0.2,
        });

        return response.choices[0]?.message?.content || '';
    }

    /**
     * 生成单元测试
     */
    async generateTests(code: string, language: string, token?: CancellationToken): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个测试代码生成专家。请为给定的代码生成完整的单元测试，包括正常场景和边界情况的测试用例。' },
            { role: 'user', content: `请为以下 ${language} 代码生成完整的单元测试：\n\n\`\`\`${language}\n${code}\n\`\`\`` },
        ];

        const response = await this.chatCompletions(messages, undefined, {
            model: 'DeepSeek-Coder-33B',
            max_tokens: 2000,
            temperature: 0.3,
        });

        return response.choices[0]?.message?.content || '';
    }

    /**
     * 查找代码问题
     */
    async findBugs(code: string, language: string, token?: CancellationToken): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个代码审查专家。请仔细检查代码中的潜在问题、bug、安全漏洞和性能问题。' },
            { role: 'user', content: `请审查以下 ${language} 代码，指出其中可能存在的问题：\n\n\`\`\`${language}\n${code}\n\`\`\`` },
        ];

        const response = await this.chatCompletions(messages, undefined, {
            max_tokens: 1500,
            temperature: 0.3,
        });

        return response.choices[0]?.message?.content || '';
    }

    /**
     * 优化代码
     */
    async optimizeCode(code: string, language: string, token?: CancellationToken): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个代码优化专家。请从性能、可读性和可维护性等方面优化代码。' },
            { role: 'user', content: `请优化以下 ${language} 代码：\n\n\`\`\`${language}\n${code}\n\`\`\`` },
        ];

        const response = await this.chatCompletions(messages, undefined, {
            model: 'DeepSeek-Coder-33B',
            max_tokens: 2000,
            temperature: 0.2,
        });

        return response.choices[0]?.message?.content || '';
    }

    // ==================== 管理方法 ====================

    /**
     * 更新 API 基础 URL
     */
    updateBaseUrl(url: string): void {
        this.apiBaseUrl = url.replace(/\/$/, '');
        this.axiosInstance.defaults.baseURL = this.apiBaseUrl;
    }

    /**
     * 取消正在进行的请求
     */
    abortRequest(requestId?: string): void {
        if (requestId) {
            const controller = this.requestQueue.get(requestId);
            if (controller) {
                controller.abort();
                this.requestQueue.delete(requestId);
            }
        } else {
            // 取消所有请求
            this.requestQueue.forEach(controller => controller.abort());
            this.requestQueue.clear();
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.abortRequest();
        this.removeAllListeners();
    }

    // ==================== 内部方法 ====================

    /**
     * 生成请求 ID
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 带重试的请求（5xx 错误自动重试，最多 MAX_RETRIES 次）
     */
    private async requestWithRetry<T>(
        requestFn: () => Promise<{ data: T }>,
        retries: number = MAX_RETRIES
    ): Promise<{ data: T }> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await requestFn();
            } catch (error: any) {
                lastError = error;
                const status = error.response?.status;

                // 只对 5xx 错误重试，4xx 不重试
                if (status && status >= 500 && status < 600 && attempt < retries) {
                    const delay = Math.pow(2, attempt) * 1000; // 指数退避：1s, 2s
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw error;
            }
        }

        throw lastError;
    }
}

// vscode namespace import for configuration access
import * as vscode from 'vscode';
