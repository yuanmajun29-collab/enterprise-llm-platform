/**
 * Configuration Manager
 * 配置管理模块
 */

import * as vscode from 'vscode';

/**
 * 配置键枚举
 */
export enum ConfigKey {
    API_URL = 'apiUrl',
    API_KEY = 'apiKey',
    DEFAULT_MODEL = 'defaultModel',
    MAX_TOKENS = 'maxTokens',
    TEMPERATURE = 'temperature',
    AUTH_MODE = 'authMode',
    ENABLE_STREAM = 'enableStream',
    ENABLE_AUTOCOMPLETE = 'enableAutocomplete',
    AUTOCOMPLETE_DEBOUNCE = 'autocompleteDebounce',
    SYSTEM_PROMPT = 'systemPrompt',
    PROXY_URL = 'proxyUrl',
    ENABLE_TELEMETRY = 'enableTelemetry',
}

/**
 * 配置管理器类
 */
export class ConfigManager {
    private config: vscode.WorkspaceConfiguration;
    private disposables: vscode.Disposable[] = [];
    private section = 'llm-assistant';

    constructor() {
        this.config = vscode.workspace.getConfiguration(this.section);
    }

    /**
     * 获取配置值
     */
    get<T>(key: ConfigKey, defaultValue?: T): T {
        return this.config.get<T>(key, defaultValue as T);
    }

    /**
     * 设置配置值
     */
    async set<T>(key: ConfigKey, value: T, target = vscode.ConfigurationTarget.Global): Promise<void> {
        await this.config.update(key, value, target);
    }

    // ==================== 快捷方法 ====================

    getApiUrl(): string {
        return this.get<string>(ConfigKey.API_URL, 'http://localhost:8443');
    }

    getApiKey(): string {
        return this.get<string>(ConfigKey.API_KEY, '');
    }

    getDefaultModel(): string {
        return this.get<string>(ConfigKey.DEFAULT_MODEL, 'Qwen-72B-Chat');
    }

    getTemperature(): number {
        return this.get<number>(ConfigKey.TEMPERATURE, 0.7);
    }

    getMaxTokens(): number {
        return this.get<number>(ConfigKey.MAX_TOKENS, 2000);
    }

    getAuthMode(): string {
        return this.get<string>(ConfigKey.AUTH_MODE, 'token');
    }

    isStreamEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_STREAM, true);
    }

    isAutocompleteEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_AUTOCOMPLETE, true);
    }

    getAutocompleteDebounce(): number {
        return this.get<number>(ConfigKey.AUTOCOMPLETE_DEBOUNCE, 500);
    }

    getSystemPrompt(): string {
        return this.get<string>(
            ConfigKey.SYSTEM_PROMPT,
            '你是一个专业的编程助手，擅长代码编写、重构和问题解决。'
        );
    }

    getProxyUrl(): string {
        return this.get<string>(ConfigKey.PROXY_URL, '');
    }

    isTelemetryEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_TELEMETRY, false);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

/**
 * 全局配置管理器实例
 */
let configManagerInstance: ConfigManager | null = null;

/**
 * 获取配置管理器实例
 */
export function getConfigManager(): ConfigManager {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager();
    }
    return configManagerInstance;
}
