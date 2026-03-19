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
 * 可取消的防抖函数
 */
export function debounceWithCancel<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): {
    fn: (...args: Parameters<T>) => void;
    cancel: () => void;
} {
    let timeout: NodeJS.Timeout | null = null;

    const fn = (...args: Parameters<T>) => {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };

    const cancel = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return { fn, cancel };
}

/**
 * 异步防抖函数
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
    func: T,
    wait: number
): {
    fn: (...args: Parameters<T>) => Promise<ReturnType<T>>;
    cancel: () => void;
} {
    let timeout: NodeJS.Timeout | null = null;
    let currentPromise: Promise<ReturnType<T>> | null = null;

    const fn = (...args: Parameters<T>): Promise<ReturnType<T>> => {
        return new Promise((resolve, reject) => {
            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(async () => {
                try {
                    const result = await func(...args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, wait);
        });
    };

    const cancel = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        currentPromise = null;
    };

    return { fn, cancel };
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
