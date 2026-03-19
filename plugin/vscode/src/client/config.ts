/**
 * Configuration Manager
 * 配置管理模块
 */

import * as vscode from 'vscode';

/**
 * 配置键枚举
 */
export enum ConfigKey {
    API_URL = 'llm.apiUrl',
    API_KEY = 'llm.apiKey',
    MODEL = 'llm.model',
    TEMPERATURE = 'llm.temperature',
    MAX_TOKENS = 'llm.maxTokens',
    ENABLE_STREAM = 'llm.enableStream',
    ENABLE_AUTOCOMPLETE = 'llm.enableAutocomplete',
    AUTOCOMPLETE_DEBOUNCE = 'llm.autocompleteDebounce',
    SYSTEM_PROMPT = 'llm.systemPrompt',
    PROXY_URL = 'llm.proxyUrl',
    ENABLE_TELEMETRY = 'llm.enableTelemetry',
}

/**
 * 配置值类型
 */
export type ConfigValue = string | number | boolean;

/**
 * 配置管理器类
 */
export class ConfigManager {
    private config: vscode.WorkspaceConfiguration;
    private disposables: vscode.Disposable[] = [];
    private onChangeCallbacks: Map<ConfigKey, ((value: ConfigValue) => void)[]> = new Map();

    constructor() {
        this.config = vscode.workspace.getConfiguration('llm');
        this.setupConfigWatcher();
    }

    /**
     * 设置配置监听器
     */
    private setupConfigWatcher(): void {
        const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('llm')) {
                this.config = vscode.workspace.getConfiguration('llm');

                // 通知所有回调
                this.onChangeCallbacks.forEach((callbacks, key) => {
                    const value = this.get(key);
                    callbacks.forEach(callback => callback(value));
                });
            }
        });

        this.disposables.push(disposable);
    }

    /**
     * 获取配置值
     */
    get<T = ConfigValue>(key: ConfigKey, defaultValue?: T): T {
        const value = this.config.get<T>(key, defaultValue as T);
        return value;
    }

    /**
     * 设置配置值
     */
    async set<T = ConfigValue>(key: ConfigKey, value: T, target = vscode.ConfigurationTarget.Global): Promise<void> {
        await this.config.update(key, value, target);
    }

    /**
     * 获取 API URL
     */
    getApiUrl(): string {
        return this.get<string>(ConfigKey.API_URL, 'https://api.company.com');
    }

    /**
     * 获取 API Key
     */
    getApiKey(): string {
        return this.get<string>(ConfigKey.API_KEY, '');
    }

    /**
     * 获取模型
     */
    getModel(): string {
        return this.get<string>(ConfigKey.MODEL, 'Qwen-72B-Chat');
    }

    /**
     * 获取温度
     */
    getTemperature(): number {
        return this.get<number>(ConfigKey.TEMPERATURE, 0.7);
    }

    /**
     * 获取最大 Token 数
     */
    getMaxTokens(): number {
        return this.get<number>(ConfigKey.MAX_TOKENS, 2048);
    }

    /**
     * 是否启用流式
     */
    isStreamEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_STREAM, true);
    }

    /**
     * 是否启用自动补全
     */
    isAutocompleteEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_AUTOCOMPLETE, true);
    }

    /**
     * 获取自动补全防抖时间
     */
    getAutocompleteDebounce(): number {
        return this.get<number>(ConfigKey.AUTOCOMPLETE_DEBOUNCE, 300);
    }

    /**
     * 获取系统提示词
     */
    getSystemPrompt(): string {
        return this.get<string>(
            ConfigKey.SYSTEM_PROMPT,
            '你是一个专业的编程助手，擅长代码编写、重构和问题解决。'
        );
    }

    /**
     * 获取代理 URL
     */
    getProxyUrl(): string {
        return this.get<string>(ConfigKey.PROXY_URL, '');
    }

    /**
     * 是否启用遥测
     */
    isTelemetryEnabled(): boolean {
        return this.get<boolean>(ConfigKey.ENABLE_TELEMETRY, false);
    }

    /**
     * 注册配置变更回调
     */
    onChange(key: ConfigKey, callback: (value: ConfigValue) => void): void {
        if (!this.onChangeCallbacks.has(key)) {
            this.onChangeCallbacks.set(key, []);
        }
        this.onChangeCallbacks.get(key)!.push(callback);
    }

    /**
     * 移除配置变更回调
     */
    offChange(key: ConfigKey, callback: (value: ConfigValue) => void): void {
        const callbacks = this.onChangeCallbacks.get(key);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 获取所有配置
     */
    getAll(): Record<string, ConfigValue> {
        return {
            apiUrl: this.getApiUrl(),
            apiKey: this.getApiKey(),
            model: this.getModel(),
            temperature: this.getTemperature(),
            maxTokens: this.getMaxTokens(),
            enableStream: this.isStreamEnabled(),
            enableAutocomplete: this.isAutocompleteEnabled(),
            autocompleteDebounce: this.getAutocompleteDebounce(),
            systemPrompt: this.getSystemPrompt(),
            proxyUrl: this.getProxyUrl(),
            enableTelemetry: this.isTelemetryEnabled(),
        };
    }

    /**
     * 更新多个配置
     */
    async updateMany(config: Partial<Record<ConfigKey, ConfigValue>>): Promise<void> {
        const updates = Object.entries(config).map(([key, value]) =>
            this.set(key as ConfigKey, value as ConfigValue)
        );
        await Promise.all(updates);
    }

    /**
     * 重置为默认配置
     */
    async reset(): Promise<void> {
        await this.set(ConfigKey.API_URL, 'https://api.company.com');
        await this.set(ConfigKey.MODEL, 'Qwen-72B-Chat');
        await this.set(ConfigKey.TEMPERATURE, 0.7);
        await this.set(ConfigKey.MAX_TOKENS, 2048);
        await this.set(ConfigKey.ENABLE_STREAM, true);
        await this.set(ConfigKey.ENABLE_AUTOCOMPLETE, true);
        await this.set(ConfigKey.AUTOCOMPLETE_DEBOUNCE, 300);
        await this.set(ConfigKey.SYSTEM_PROMPT, '你是一个专业的编程助手，擅长代码编写、重构和问题解决。');
        await this.set(ConfigKey.ENABLE_TELEMETRY, false);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.onChangeCallbacks.clear();
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
