/**
 * Enterprise LLM API Client
 * 企业大模型API客户端
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';

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
export interface AIRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
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
 * 用户信息
 */
export interface UserInfo {
    userId: string;
    username: string;
    email: string;
    department?: string;
    quota: {
        tokensPerDay: number;
        tokensUsedToday: number;
        callsPerHour: number;
        callsUsedThisHour: number;
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
    cost_per_1k_tokens: number;
}

/**
 * AI 客户端类
 */
export class AIClient extends EventEmitter {
    private axiosInstance: AxiosInstance;
    private apiBaseUrl: string;
    private apiKey: string;
    private accessToken: string;
    private userInfo: UserInfo | null = null;
    private requestQueue: Map<string, AbortController> = new Map();

    /**
     * 构造函数
     */
    constructor(apiBaseUrl: string, apiKey?: string) {
        super();

        this.apiBaseUrl = apiBaseUrl;
        this.apiKey = apiKey || '';
        this.accessToken = '';

        this.axiosInstance = axios.create({
            baseURL: apiBaseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // 请求拦截器
        this.axiosInstance.interceptors.request.use(
            (config) => {
                if (this.apiKey) {
                    config.headers['Authorization'] = `Bearer ${this.apiKey}`;
                }
                if (this.accessToken) {
                    config.headers['Authorization'] = `Bearer ${this.accessToken}`;
                }
                // 添加请求ID
                config.headers['X-Request-ID'] = this.generateRequestId();
                return config;
            },
            (error) => Promise.reject(error)
        );

        // 响应拦截器
        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401 && this.accessToken) {
                    // Token 过期，尝试刷新
                    try {
                        await this.refreshToken();
                        // 重试原请求
                        return this.axiosInstance.request(error.config);
                    } catch (refreshError) {
                        this.emit('auth-error', refreshError);
                        throw refreshError;
                    }
                }
                throw error;
            }
        );

        // 加载已保存的访问令牌
        this.loadAccessToken();
    }

    /**
     * 生成请求ID
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 设置 API 密钥
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    /**
     * 设置访问令牌
     */
    setAccessToken(token: string): void {
        this.accessToken = token;
        this.saveAccessToken(token);
    }

    /**
     * 加载访问令牌
     */
    private async loadAccessToken(): Promise<void> {
        const context = vscode Secrets.workspace;
        if (context) {
            const token = await context.get('llm_access_token');
            if (token) {
                this.accessToken = token;
            }
        }
    }

    /**
     * 保存访问令牌
     */
    private async saveAccessToken(token: string): Promise<void> {
        const context = vscode Secrets.workspace;
        if (context) {
            await context.store('llm_access_token', token);
        }
    }

    /**
     * 刷新访问令牌
     */
    private async refreshToken(): Promise<void> {
        // 从 Keycloak 刷新令牌的逻辑
        // 这里需要根据实际的认证流程实现
        this.emit('token-refreshed');
    }

    /**
     * 获取用户信息
     */
    async getUserInfo(): Promise<UserInfo> {
        if (this.userInfo) {
            return this.userInfo;
        }

        try {
            const response = await this.axiosInstance.get<UserInfo>('/api/user/info');
            this.userInfo = response.data;
            this.emit('user-info-updated', this.userInfo);
            return this.userInfo;
        } catch (error) {
            console.error('Failed to get user info:', error);
            throw error;
        }
    }

    /**
     * 获取可用模型列表
     */
    async getModels(): Promise<ModelInfo[]> {
        try {
            const response = await this.axiosInstance.get<{ data: ModelInfo[] }>('/api/models');
            return response.data.data;
        } catch (error) {
            console.error('Failed to get models:', error);
            throw error;
        }
    }

    /**
     * 发送聊天请求（非流式）
     */
    async chat(request: AIRequest): Promise<ChatResponse> {
        const requestId = this.generateRequestId();
        const controller = new AbortController();
        this.requestQueue.set(requestId, controller);

        try {
            const config: AxiosRequestConfig = {
                signal: controller.signal,
            };

            this.emit('request-start', { requestId, model: request.model });

            const response = await this.axiosInstance.post<ChatResponse>(
                '/v1/chat/completions',
                {
                    model: request.model,
                    messages: request.messages,
                    temperature: request.temperature || 0.7,
                    max_tokens: request.max_tokens || 2048,
                    top_p: request.top_p || 1.0,
                    frequency_penalty: request.frequency_penalty || 0,
                    presence_penalty: request.presence_penalty || 0,
                    stream: false,
                },
                config
            );

            this.emit('request-complete', {
                requestId,
                usage: response.data.usage,
            });

            return response.data;
        } catch (error) {
            this.emit('request-error', { requestId, error });
            throw error;
        } finally {
            this.requestQueue.delete(requestId);
        }
    }

    /**
     * 发送聊天请求（流式）
     */
    async *chatStream(request: AIRequest): AsyncGenerator<string> {
        const requestId = this.generateRequestId();
        const controller = new AbortController();
        this.requestQueue.set(requestId);

        try {
            const response = await axios({
                method: 'POST',
                url: `${this.apiBaseUrl}/v1/chat/completions`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.accessToken ? `Bearer ${this.accessToken}` : `Bearer ${this.apiKey}`,
                    'X-Request-ID': requestId,
                },
                data: {
                    model: request.model,
                    messages: request.messages,
                    temperature: request.temperature || 0.7,
                    max_tokens: request.max_tokens || 2048,
                    top_p: request.top_p || 1.0,
                    frequency_penalty: request.frequency_penalty || 0,
                    presence_penalty: request.presence_penalty || 0,
                    stream: true,
                },
                responseType: 'stream',
                signal: controller.signal,
            });

            this.emit('request-start', { requestId, model: request.model });

            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);

                        if (data === '[DONE]') {
                            return;
                        }

                        try {
                            const parsed: StreamChunk = JSON.parse(data);
                            const delta = parsed.choices[0]?.delta;

                            if (delta?.content) {
                                this.emit('stream-chunk', { requestId, content: delta.content });
                                yield delta.content;
                            }

                            if (parsed.choices[0]?.finish_reason) {
                                this.emit('request-complete', { requestId, finish_reason: parsed.choices[0].finish_reason });
                            }
                        } catch (parseError) {
                            // 忽略解析错误（可能是空行）
                        }
                    }
                }
            }
        } catch (error) {
            this.emit('request-error', { requestId, error });
            throw error;
        } finally {
            this.requestQueue.delete(requestId);
        }
    }

    /**
     * 代码补全
     */
    async codeComplete(
        code: string,
        language: string,
        cursorPosition: number,
        model?: string
    ): Promise<string> {
        try {
            const response = await this.axiosInstance.post<{ completion: string }>(
                '/api/code/complete',
                {
                    code,
                    language,
                    cursorPosition,
                    model: model || 'DeepSeek-Coder-33B',
                }
            );
            return response.data.completion;
        } catch (error) {
            console.error('Code completion failed:', error);
            throw error;
        }
    }

    /**
     * 解释代码
     */
    async explainCode(code: string, language: string, model?: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个代码解释专家。请用简洁清晰的语言解释给定的代码片段。'
            },
            {
                role: 'user',
                content: `请解释以下 ${language} 代码的功能和原理：\n\n\`\`\`${language}\n${code}\n\`\`\``
            }
        ];

        const response = await this.chat({
            model: model || 'Qwen-72B-Chat',
            messages,
            max_tokens: 1000,
            temperature: 0.3,
        });

        return response.choices[0].message.content;
    }

    /**
     * 重构代码
     */
    async refactorCode(code: string, language: string, instructions?: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个代码重构专家。请根据指令重构代码，使其更加简洁、高效、可维护。只输出重构后的代码，不要包含解释。'
            },
            {
                role: 'user',
                content: instructions
                    ? `请根据以下指令重构 ${language} 代码：${instructions}\n\n\`\`\`${language}\n${code}\n\`\`\``
                    : `请重构以下 ${language} 代码，使其更加简洁高效：\n\n\`\`\`${language}\n${code}\n\`\`\``
            }
        ];

        const response = await this.chat({
            model: 'DeepSeek-Coder-33B',
            messages,
            max_tokens: 2000,
            temperature: 0.2,
        });

        return response.choices[0].message.content;
    }

    /**
     * 生成单元测试
     */
    async generateTests(code: string, language: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个测试代码生成专家。请为给定的代码生成完整的单元测试，包括正常场景和边界情况的测试用例。'
            },
            {
                role: 'user',
                content: `请为以下 ${language} 代码生成完整的单元测试：\n\n\`\`\`${language}\n${code}\n\`\`\``
            }
        ];

        const response = await this.chat({
            model: 'DeepSeek-Coder-33B',
            messages,
            max_tokens: 2000,
            temperature: 0.3,
        });

        return response.choices[0].message.content;
    }

    /**
     * 查找代码问题
     */
    async findBugs(code: string, language: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个代码审查专家。请仔细检查代码中的潜在问题、bug、安全漏洞和性能问题。'
            },
            {
                role: 'user',
                content: `请审查以下 ${language} 代码，指出其中可能存在的问题：\n\n\`\`\`${language}\n${code}\n\`\`\``
            }
        ];

        const response = await this.chat({
            model: 'Qwen-72B-Chat',
            messages,
            max_tokens: 1500,
            temperature: 0.3,
        });

        return response.choices[0].message.content;
    }

    /**
     * 优化代码
     */
    async optimizeCode(code: string, language: string): Promise<string> {
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: '你是一个代码优化专家。请从性能、可读性和可维护性等方面优化代码。'
            },
            {
                role: 'user',
                content: `请优化以下 ${language} 代码：\n\n\`\`\`${language}\n${code}\n\`\`\``
            }
        ];

        const response = await this.chat({
            model: 'DeepSeek-Coder-33B',
            messages,
            max_tokens: 2000,
            temperature: 0.2,
        });

        return response.choices[0].message.content;
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
}
