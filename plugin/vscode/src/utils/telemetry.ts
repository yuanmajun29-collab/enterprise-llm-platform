/**
 * Telemetry Module
 * 遥测数据收集模块
 */

import * as vscode from 'vscode';
import { getConfigManager } from '../client/config';

/**
 * 遥测事件类型
 */
export enum TelemetryEventType {
    // 认证事件
    AUTH_START = 'auth_start',
    AUTH_SUCCESS = 'auth_success',
    AUTH_FAILURE = 'auth_failure',
    LOGOUT = 'logout',

    // API 请求事件
    REQUEST_START = 'request_start',
    REQUEST_SUCCESS = 'request_success',
    REQUEST_ERROR = 'request_error',

    // 功能使用事件
    CHAT_OPEN = 'chat_open',
    CHAT_SEND = 'chat_send',
    CODE_COMPLETE = 'code_complete',
    CODE_EXPLAIN = 'code_explain',
    CODE_REFACTOR = 'code_refactor',
    TEST_GENERATE = 'test_generate',
    BUG_FIND = 'bug_find',
    CODE_OPTIMIZE = 'code_optimize',

    // 配置事件
    CONFIG_CHANGE = 'config_change',
}

/**
 * 遥测事件数据
 */
export interface TelemetryEvent {
    type: TelemetryEventType;
    timestamp: number;
    data: Record<string, any>;
}

/**
 * 遥测管理器
 */
export class TelemetryManager {
    private static instance: TelemetryManager | null = null;
    private events: TelemetryEvent[] = [];
    private flushInterval: NodeJS.Timeout | null = null;
    private maxEvents = 100;

    private constructor() {
        // 每 30 秒上报一次
        this.flushInterval = setInterval(() => this.flush(), 30000);
    }

    /**
     * 获取单例实例
     */
    static getInstance(): TelemetryManager {
        if (!TelemetryManager.instance) {
            TelemetryManager.instance = new TelemetryManager();
        }
        return TelemetryManager.instance;
    }

    /**
     * 记录遥测事件
     */
    track(type: TelemetryEventType, data: Record<string, any> = {}): void {
        // 检查是否启用遥测
        if (!getConfigManager().isTelemetryEnabled()) {
            return;
        }

        const event: TelemetryEvent = {
            type,
            timestamp: Date.now(),
            data,
        };

        this.events.push(event);

        // 限制事件数量
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }

        // 调试输出
        console.log('[Telemetry]', event);
    }

    /**
     * 上报遥测数据
     */
    private async flush(): Promise<void> {
        if (this.events.length === 0) {
            return;
        }

        const eventsToSend = [...this.events];
        this.events = [];

        try {
            // 这里可以发送到实际的遥测服务器
            // await this.sendToServer(eventsToSend);
            console.log('[Telemetry] Flushed', eventsToSend.length, 'events');
        } catch (error) {
            console.error('[Telemetry] Failed to flush events:', error);
            // 失败时重新加入队列
            this.events = [...eventsToSend, ...this.events];
        }
    }

    /**
     * 发送遥测数据到服务器
     */
    private async sendToServer(events: TelemetryEvent[]): Promise<void> {
        // 实现发送遥测数据的逻辑
        // 可以发送到内部遥测服务器或使用第三方服务
    }

    /**
     * 立即上报所有事件
     */
    async flushNow(): Promise<void> {
        await this.flush();
    }

    /**
     * 清理资源
     */
    dispose(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.flush();
    }
}

/**
 * 辅助函数：记录认证事件
 */
export function trackAuth(type: 'start' | 'success' | 'failure' | 'logout', data?: Record<string, any>): void {
    const eventType = type === 'start'
        ? TelemetryEventType.AUTH_START
        : type === 'success'
        ? TelemetryEventType.AUTH_SUCCESS
        : type === 'failure'
        ? TelemetryEventType.AUTH_FAILURE
        : TelemetryEventType.LOGOUT;

    TelemetryManager.getInstance().track(eventType, data);
}

/**
 * 辅助函数：记录请求事件
 */
export function trackRequest(type: 'start' | 'success' | 'error', data?: Record<string, any>): void {
    const eventType = type === 'start'
        ? TelemetryEventType.REQUEST_START
        : type === 'success'
        ? TelemetryEventType.REQUEST_SUCCESS
        : TelemetryEventType.REQUEST_ERROR;

    TelemetryManager.getInstance().track(eventType, data);
}

/**
 * 辅助函数：记录功能使用事件
 */
export function trackFeature(feature: 'chat_open' | 'chat_send' | 'code_complete' | 'code_explain' | 'code_refactor' | 'test_generate' | 'bug_find' | 'code_optimize', data?: Record<string, any>): void {
    const eventTypeMap: Record<string, TelemetryEventType> = {
        chat_open: TelemetryEventType.CHAT_OPEN,
        chat_send: TelemetryEventType.CHAT_SEND,
        code_complete: TelemetryEventType.CODE_COMPLETE,
        code_explain: TelemetryEventType.CODE_EXPLAIN,
        code_refactor: TelemetryEventType.CODE_REFACTOR,
        test_generate: TelemetryEventType.TEST_GENERATE,
        bug_find: TelemetryEventType.BUG_FIND,
        code_optimize: TelemetryEventType.CODE_OPTIMIZE,
    };

    TelemetryManager.getInstance().track(eventTypeMap[feature], data);
}
