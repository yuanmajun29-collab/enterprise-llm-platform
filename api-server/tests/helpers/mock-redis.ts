/**
 * Redis Mock 客户端
 * 内存 Map 实现 get/set/del/exists
 */

class MockRedisClient {
  private store: Map<string, { value: string; expiresAt: number | null }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string): Promise<string | null> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async setEx(key: string, seconds: number, value: string): Promise<string | null> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return 0;
    }
    return 1;
  }

  async keys(pattern: string): Promise<string[]> {
    if (pattern === '*') {
      return Array.from(this.store.keys());
    }
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  // Redis multi 支持（简化版，用于限流中间件测试）
  multi() {
    const self = this;
    const commands: Array<{ fn: string; args: any[] }> = [];
    const multiObj = {
      zRemRangeByScore(key: string, min: number, max: number) {
        commands.push({ fn: 'zRemRangeByScore', args: [key, min, max] });
        return multiObj;
      },
      zAdd(key: string, members: Array<{ score: number; value: string }>) {
        commands.push({ fn: 'zAdd', args: [key, members] });
        return multiObj;
      },
      zCard(key: string) {
        commands.push({ fn: 'zCard', args: [key] });
        return multiObj;
      },
      expire(key: string, seconds: number) {
        commands.push({ fn: 'expire', args: [key, seconds] });
        return multiObj;
      },
      async exec() {
        // 简化返回：每条命令返回 [null, 结果]
        return commands.map(() => [null, 0]);
      },
    };
    return multiObj;
  }

  /**
   * 清空所有数据
   */
  clear() {
    this.store.clear();
  }

  /**
   * 获取当前存储的 key 数量
   */
  get size(): number {
    return this.store.size;
  }
}

let currentClient: MockRedisClient;

/**
 * 获取当前 mock Redis 客户端
 */
export function getMockRedisClient(): MockRedisClient {
  if (!currentClient) {
    currentClient = new MockRedisClient();
  }
  return currentClient;
}

/**
 * 设置 Redis mock 客户端到 redis 模块
 */
export function setupMockRedis() {
  const client = getMockRedisClient();
  const { setRedisClient } = require('../../src/config/redis');
  setRedisClient(client as any);
  return client;
}

/**
 * 重置 Redis mock 数据（在每个测试之前调用）
 */
export function resetRedisMocks() {
  getMockRedisClient().clear();
}
