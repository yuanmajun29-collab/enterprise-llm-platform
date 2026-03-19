/**
 * Debounce Utility
 * 防抖工具类
 */

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}

/**
 * 异步防抖函数
 * 返回 { fn, cancel } 对象
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
    func: T,
    wait: number
): {
    (...args: Parameters<T>): Promise<ReturnType<T>>;
    cancel: () => void;
} {
    let timeout: NodeJS.Timeout | null = null;
    let currentRejector: ((reason?: any) => void) | null = null;

    const debouncedFn = (...args: Parameters<T>): Promise<ReturnType<T>> => {
        // 取消之前的请求
        if (timeout !== null) {
            clearTimeout(timeout);
            if (currentRejector) {
                currentRejector(new Error('Debounced: cancelled'));
            }
        }

        return new Promise<ReturnType<T>>((resolve, reject) => {
            currentRejector = reject;

            timeout = setTimeout(async () => {
                timeout = null;
                currentRejector = null;
                try {
                    const result = await func(...args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, wait);
        });
    };

    debouncedFn.cancel = () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
        if (currentRejector) {
            currentRejector(new Error('Debounced: cancelled'));
            currentRejector = null;
        }
    };

    return debouncedFn;
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return function executedFunction(...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
