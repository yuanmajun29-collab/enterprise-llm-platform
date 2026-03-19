/**
 * Authentication Client
 * 认证客户端 - 支持用户名密码登录 / OAuth2 / Token 管理
 */

import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

/**
 * 登录响应
 */
export interface LoginResponse {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
    username: string;
    email?: string;
}

/**
 * 注册响应
 */
export interface RegisterResponse {
    message: string;
    user_id: string;
}

/**
 * JWT Payload（解码后的部分信息）
 */
interface JWTPayload {
    sub: string;
    username: string;
    email?: string;
    exp: number;
    iat: number;
    roles?: string[];
}

/**
 * 认证客户端类
 *
 * 提供登录、注册、登出、Token 刷新、密码修改等功能。
 * Token 使用 VSCode SecretStorage 安全存储。
 */
export class AuthClient extends EventEmitter {
    private secretStorage: vscode.SecretStorage;
    private apiClient: AxiosInstance;
    private currentToken: string = '';
    private currentRefreshToken: string = '';
    private tokenExpiry: number = 0;
    private refreshTimer: NodeJS.Timeout | null = null;
    private authUrl: string;

    constructor(context: vscode.ExtensionContext) {
        super();
        this.secretStorage = context.secrets;

        // 从配置读取 API 基础 URL
        const config = vscode.workspace.getConfiguration('llm-assistant');
        this.authUrl = config.get<string>('apiUrl', 'http://localhost:8443');

        // 创建 HTTP 客户端
        this.apiClient = axios.create({
            baseURL: this.authUrl,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // ==================== 认证操作 ====================

    /**
     * 用户名密码登录
     * POST /api/auth/login
     */
    async login(username: string, password: string): Promise<LoginResponse> {
        const response = await this.apiClient.post<LoginResponse>('/api/auth/login', {
            username,
            password,
        });

        await this.handleTokenResponse(response.data);
        return response.data;
    }

    /**
     * 用户注册
     * POST /api/auth/register
     */
    async register(username: string, email: string, password: string): Promise<RegisterResponse> {
        const response = await this.apiClient.post<RegisterResponse>('/api/auth/register', {
            username,
            email,
            password,
        });
        return response.data;
    }

    /**
     * 登出
     * POST /api/auth/logout
     */
    async logout(): Promise<void> {
        try {
            if (this.currentToken) {
                await this.apiClient.post('/api/auth/logout', null, {
                    headers: this.getAuthHeaders(),
                });
            }
        } catch (error) {
            // 即使登出请求失败，也要清理本地状态
            console.warn('Logout request failed, clearing local state anyway');
        }
        await this.clearStoredToken();
        this.emit('authChange', false);
    }

    /**
     * 刷新 Token
     * POST /api/auth/refresh
     */
    async refreshToken(): Promise<LoginResponse> {
        if (!this.currentRefreshToken) {
            throw new Error('没有可用的刷新令牌，请重新登录');
        }

        const response = await this.apiClient.post<LoginResponse>('/api/auth/refresh', {
            refresh_token: this.currentRefreshToken,
        });

        await this.handleTokenResponse(response.data);
        return response.data;
    }

    /**
     * 修改密码
     * PUT /api/auth/password
     */
    async changePassword(oldPassword: string, newPassword: string): Promise<void> {
        if (!this.isAuthenticated()) {
            throw new Error('请先登录');
        }

        await this.apiClient.put('/api/auth/password', {
            old_password: oldPassword,
            new_password: newPassword,
        }, {
            headers: this.getAuthHeaders(),
        });

        vscode.window.showInformationMessage('密码修改成功');
    }

    // ==================== Token 管理 ====================

    /**
     * 获取已存储的 Token
     */
    async getStoredToken(): Promise<string> {
        return this.currentToken;
    }

    /**
     * 存储 Token
     */
    async setStoredToken(token: string): Promise<void> {
        await this.secretStorage.store('llm-assistant.access-token', token);
        this.currentToken = token;
    }

    /**
     * 清除已存储的 Token
     */
    async clearStoredToken(): Promise<void> {
        this.currentToken = '';
        this.currentRefreshToken = '';
        this.tokenExpiry = 0;

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        await Promise.all([
            this.secretStorage.delete('llm-assistant.access-token'),
            this.secretStorage.delete('llm-assistant.refresh-token'),
            this.secretStorage.delete('llm-assistant.token-expiry'),
        ]);
    }

    /**
     * 从 SecretStorage 加载 Token
     */
    async loadStoredToken(): Promise<boolean> {
        try {
            const [token, refreshToken, expiryStr] = await Promise.all([
                this.secretStorage.get('llm-assistant.access-token'),
                this.secretStorage.get('llm-assistant.refresh-token'),
                this.secretStorage.get('llm-assistant.token-expiry'),
            ]);

            if (!token) {
                return false;
            }

            this.currentToken = token;
            this.currentRefreshToken = refreshToken || '';
            this.tokenExpiry = expiryStr ? parseInt(expiryStr, 10) : 0;

            if (this.isAuthenticated()) {
                this.setupAutoRefresh();
                this.emit('authChange', true);
                return true;
            } else if (this.currentRefreshToken) {
                // Token 已过期，尝试刷新
                try {
                    await this.refreshToken();
                    this.emit('authChange', true);
                    return true;
                } catch {
                    await this.clearStoredToken();
                    return false;
                }
            }

            return false;
        } catch (error) {
            console.error('Failed to load stored token:', error);
            return false;
        }
    }

    // ==================== 状态检查 ====================

    /**
     * 检查是否已认证（Token 存在且未过期）
     * 解码 JWT 检查 exp 字段
     */
    isAuthenticated(): boolean {
        if (!this.currentToken) {
            return false;
        }

        try {
            const payload = this.decodeJWT(this.currentToken);
            if (!payload || !payload.exp) {
                return false;
            }
            // 检查是否已过期（留 30 秒缓冲）
            return Date.now() < (payload.exp * 1000) - 30000;
        } catch {
            return false;
        }
    }

    /**
     * 获取当前 Token
     */
    getAccessToken(): string {
        return this.currentToken;
    }

    /**
     * 获取认证 Headers
     */
    getAuthHeaders(): Record<string, string> {
        if (!this.currentToken) {
            return {};
        }
        return {
            'Authorization': `Bearer ${this.currentToken}`,
        };
    }

    /**
     * 监听认证状态变化
     */
    onAuthChange(callback: (isAuthenticated: boolean) => void): void {
        this.on('authChange', callback);
    }

    // ==================== 内部方法 ====================

    /**
     * 解码 JWT（仅解码 payload，不做签名验证）
     */
    private decodeJWT(token: string): JWTPayload | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            // Base64Url 解码
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
            return JSON.parse(jsonStr) as JWTPayload;
        } catch {
            return null;
        }
    }

    /**
     * 处理 Token 响应
     */
    private async handleTokenResponse(response: LoginResponse): Promise<void> {
        this.currentToken = response.access_token;
        this.currentRefreshToken = response.refresh_token || '';
        this.tokenExpiry = Date.now() + (response.expires_in * 1000);

        // 安全存储
        await Promise.all([
            this.secretStorage.store('llm-assistant.access-token', this.currentToken),
            this.secretStorage.store('llm-assistant.refresh-token', this.currentRefreshToken),
            this.secretStorage.store('llm-assistant.token-expiry', this.tokenExpiry.toString()),
        ]);

        // 设置自动刷新（在过期前 5 分钟刷新）
        this.setupAutoRefresh();

        this.emit('authChange', true);
    }

    /**
     * 设置自动刷新定时器
     */
    private setupAutoRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const refreshDelay = Math.max(0, this.tokenExpiry - Date.now() - 5 * 60 * 1000);
        if (refreshDelay <= 0) {
            // 已经过期，立即刷新
            this.refreshToken().catch(() => {
                console.warn('Auto token refresh failed');
            });
            return;
        }

        this.refreshTimer = setTimeout(async () => {
            try {
                await this.refreshToken();
            } catch (error) {
                console.error('Auto token refresh failed:', error);
                this.emit('authChange', false);
            }
        }, refreshDelay);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.removeAllListeners();
    }
}
