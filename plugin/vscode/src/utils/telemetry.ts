/**
 * Telemetry Module
 * 遥测数据收集模块
 */

import { getConfigManager } from '../client/config';

/**
 * 遥测事件类型
 */
export enum TelemetryEventType {
    AUTH_START = 'auth_start',
    AUTH_SUCCESS = 'auth_success',
    AUTH_FAILURE = 'auth_failure',
    LOGOUT = 'logout',
    REQUEST_START = 'request_start',
    REQUEST_SUCCESS = 'request_success',
    REQUEST_ERROR = 'request_error',
    CHAT_OPEN = 'chat_open',
    CHAT_SEND = 'chat_send',
    CODE_COMPLETE = 'code_complete',
    CODE_EXPLAIN = 'code_explain',
    CODE_REFACTOR = 'code_refactor',
    TEST_GENERATE = 'test_generate',
    BUG_FIND = 'bug_find',
    CODE_OPTIMIZE = 'code_optimize',
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
        this.flushInterval = setInterval(() => this.flush(), 30000);
    }

    static getInstance(): TelemetryManager {
        if (!TelemetryManager.instance) {
            TelemetryManager.instance = new TelemetryManager();
        }
        return TelemetryManager.instance;
    }

    track(type: TelemetryEventType, data: Record<string, any> = {}): void {
        if (!getConfigManager().isTelemetryEnabled()) return;

        this.events.push({ type, timestamp: Date.now(), data });

        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }

        console.log('[Telemetry]', type, data);
    }

    private async flush(): Promise<void> {
        if (this.events.length === 0) return;
        const toSend = [...this.events];
        this.events = [];
        try {
            console.log('[Telemetry] Flushed', toSend.length, 'events');
        } catch (error) {
            this.events = [...toSend, ...this.events];
        }
    }

    async flushNow(): Promise<void> {
        await this.flush();
    }

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
    const map: Record<string, TelemetryEventType> = {
        start: TelemetryEventType.AUTH_START,
        success: TelemetryEventType.AUTH_SUCCESS,
        failure: TelemetryEventType.AUTH_FAILURE,
        logout: TelemetryEventType.LOGOUT,
    };
    TelemetryManager.getInstance().track(map[type], data);
}

/**
 * 辅助函数：记录功能使用事件
 */
export function trackFeature(
    feature: 'chat_open' | 'chat_send' | 'code_complete' | 'code_explain' | 'code_refactor' | 'test_generate' | 'bug_find' | 'code_optimize',
    data?: Record<string, any>
): void {
    const map: Record<string, TelemetryEventType> = {
        chat_open: TelemetryEventType.CHAT_OPEN,
        chat_send: TelemetryEventType.CHAT_SEND,
        code_complete: TelemetryEventType.CODE_COMPLETE,
        code_explain: TelemetryEventType.CODE_EXPLAIN,
        code_refactor: TelemetryEventType.CODE_REFACTOR,
        test_generate: TelemetryEventType.TEST_GENERATE,
        bug_find: TelemetryEventType.BUG_FIND,
        code_optimize: TelemetryEventType.CODE_OPTIMIZE,
    };
    TelemetryManager.getInstance().track(map[feature], data);
}
