/**
 * Authentication Client
 * 认证客户端 - 支持 OAuth2/OIDC
 */

import * as vscode from 'vscode';
import axios from 'axios';
import { EventEmitter } from 'events';

/**
 * 认证配置
 */
export interface AuthConfig {
    authUrl: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    scope: string[];
}

/**
 * Token 响应
 */
export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
    refresh_token_expires_in?: number;
    scope?: string;
}

/**
 * 用户信息
 */
export interface AuthUserInfo {
    sub: string;
    name: string;
    email: string;
    department?: string;
    employee_id?: string;
    roles: string[];
}

/**
 * 认证客户端类
 */
export class AuthClient extends EventEmitter {
    private config: AuthConfig;
    private accessToken: string = '';
    private refreshToken: string = '';
    private userInfo: AuthUserInfo | null = null;
    private tokenExpiry: number = 0;
    private refreshTimer: NodeJS.Timeout | null = null;

    constructor(config: AuthConfig) {
        super();
        this.config = config;
    }

    /**
     * 获取授权 URL
     */
    getAuthUrl(state?: string): string {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: this.config.scope.join(' '),
            state: state || this.generateState(),
        });

        return `${this.config.authUrl}/authorize?${params.toString()}`;
    }

    /**
     * 生成随机 state
     */
    private generateState(): string {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * 使用授权码换取 Token
     */
    async exchangeCodeForToken(code: string): Promise<TokenResponse> {
        try {
            const response = await axios.post<TokenResponse>(
                `${this.config.authUrl}/token`,
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.config.redirectUri,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret || '',
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            await this.handleTokenResponse(response.data);
            this.emit('authenticated');
            return response.data;
        } catch (error: any) {
            this.emit('auth-error', error);
            throw new Error(`Token exchange failed: ${error.message}`);
        }
    }

    /**
     * 刷新访问令牌
     */
    async refreshAccessToken(): Promise<TokenResponse> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await axios.post<TokenResponse>(
                `${this.config.authUrl}/token`,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret || '',
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            await this.handleTokenResponse(response.data);
            this.emit('token-refreshed');
            return response.data;
        } catch (error: any) {
            this.emit('auth-error', error);
            await this.clearSession();
            throw error;
        }
    }

    /**
     * 处理 Token 响应
     */
    private async handleTokenResponse(tokenResponse: TokenResponse): Promise<void> {
        this.accessToken = tokenResponse.access_token;
        this.refreshToken = tokenResponse.refresh_token || this.refreshToken;
        this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);

        // 保存到密钥存储
        await this.saveSession();

        // 设置自动刷新
        this.setupTokenRefresh();

        // 获取用户信息
        await this.fetchUserInfo();
    }

    /**
     * 获取用户信息
     */
    async fetchUserInfo(): Promise<AuthUserInfo> {
        try {
            const response = await axios.get<AuthUserInfo>(
                `${this.config.authUrl}/userinfo`,
                {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                }
            );

            this.userInfo = response.data;
            this.emit('user-info-updated', this.userInfo);
            return this.userInfo;
        } catch (error: any) {
            console.error('Failed to fetch user info:', error);
            throw error;
        }
    }

    /**
     * 设置自动刷新 Token
     */
    private setupTokenRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // 在过期前 5 分钟刷新
        const refreshDelay = Math.max(0, this.tokenExpiry - Date.now() - 5 * 60 * 1000);

        this.refreshTimer = setTimeout(async () => {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                this.emit('auth-error', error);
            }
        }, refreshDelay);
    }

    /**
     * 检查 Token 是否有效
     */
    isTokenValid(): boolean {
        return this.accessToken !== '' && Date.now() < this.tokenExpiry;
    }

    /**
     * 获取访问令牌
     */
    getAccessToken(): string {
        return this.accessToken;
    }

    /**
     * 获取用户信息
     */
    getUserInfo(): AuthUserInfo | null {
        return this.userInfo;
    }

    /**
     * 保存会话
     */
    private async saveSession(): Promise<void> {
        const context = vscode Secrets.workspace;
        if (context) {
            await Promise.all([
                context.store('auth_access_token', this.accessToken),
                context.store('auth_refresh_token', this.refreshToken),
                context.store('auth_token_expiry', this.tokenExpiry.toString()),
            ]);
        }
    }

    /**
     * 加载会话
     */
    async loadSession(): Promise<boolean> {
        const context = vscode Secrets.workspace;
        if (!context) {
            return false;
        }

        try {
            const [accessToken, refreshToken, tokenExpiry] = await Promise.all([
                context.get('auth_access_token'),
                context.get('auth_refresh_token'),
                context.get('auth_token_expiry'),
            ]);

            if (!accessToken) {
                return false;
            }

            this.accessToken = accessToken || '';
            this.refreshToken = refreshToken || '';
            this.tokenExpiry = parseInt(tokenExpiry || '0', 10);

            // 检查是否需要刷新
            if (this.isTokenValid()) {
                this.setupTokenRefresh();
                await this.fetchUserInfo();
                this.emit('authenticated');
                return true;
            } else if (this.refreshToken) {
                // Token 已过期，尝试刷新
                await this.refreshAccessToken();
                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to load session:', error);
            return false;
        }
    }

    /**
     * 清除会话
     */
    async clearSession(): Promise<void> {
        this.accessToken = '';
        this.refreshToken = '';
        this.userInfo = null;
        this.tokenExpiry = 0;

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        const context = vscode Secrets.workspace;
        if (context) {
            await Promise.all([
                context.delete('auth_access_token'),
                context.delete('auth_refresh_token'),
                context.delete('auth_token_expiry'),
            ]);
        }

        this.emit('logout');
    }

    /**
     * 登出
     */
    async logout(): Promise<void> {
        await this.clearSession();
    }

    /**
     * 检查用户是否有指定角色
     */
    hasRole(role: string): boolean {
        return this.userInfo?.roles.includes(role) || false;
    }

    /**
     * 检查用户是否有任一指定角色
     */
    hasAnyRole(roles: string[]): boolean {
        return roles.some(role => this.hasRole(role));
    }

    /**
     * 检查用户是否有所有指定角色
     */
    hasAllRoles(roles: string[]): boolean {
        return roles.every(role => this.hasRole(role));
    }

    /**
     * 获取用户的显示名称
     */
    getDisplayName(): string {
        if (!this.userInfo) {
            return 'Unknown';
        }
        return this.userInfo.name || this.userInfo.email || 'Unknown';
    }

    /**
     * 获取用户的部门
     */
    getDepartment(): string | undefined {
        return this.userInfo?.department;
    }

    /**
     * 获取用户的工号
     */
    getEmployeeId(): string | undefined {
        return this.userInfo?.employee_id;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.removeAllListeners();
    }
}

/**
 * 创建认证客户端实例
 */
export function createAuthClient(config: Partial<AuthConfig> = {}): AuthClient {
    const defaultConfig: AuthConfig = {
        authUrl: 'https://auth.company.com',
        clientId: 'vscode-plugin',
        redirectUri: 'vscode://company.enterprise-llm-assistant/callback',
        scope: ['openid', 'profile', 'email', 'department', 'employee_id'],
    };

    return new AuthClient({ ...defaultConfig, ...config });
}
