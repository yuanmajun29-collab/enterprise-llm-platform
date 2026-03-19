import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

// Redis 客户端（从 index.ts 导入）
let redisClient: RedisClientType | null = null;

export function setRedisClient(client: RedisClientType) {
  redisClient = client;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * Redis 缓存辅助函数
 */
export async function cacheGet(key: string): Promise<string | null> {
  if (!redisClient) {
    return null;
  }
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.error('Redis GET error:', error);
    return null;
  }
}

/**
 * Redis 缓存设置函数
 */
export async function cacheSet(
  key: string,
  value: string,
  ttl?: number
): Promise<void> {
  if (!redisClient) {
    return;
  }
  try {
    if (ttl) {
      await redisClient.setEx(key, ttl, value);
    } else {
      await redisClient.set(key, value);
    }
  } catch (error) {
    logger.error('Redis SET error:', error);
  }
}

/**
 * Redis 缓存删除函数
 */
export async function cacheDelete(key: string): Promise<void> {
  if (!redisClient) {
    return;
  }
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error('Redis DEL error:', error);
  }
}

/**
 * Redis 检查键是否存在
 */
export async function cacheExists(key: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }
  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis EXISTS error:', error);
    return false;
  }
}
