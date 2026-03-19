import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * 数据库查询辅助函数
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await (global as any).dbPool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Slow query (${duration}ms): ${text}`);
    }
    return result.rows;
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
}

/**
 * 数据库单条查询辅助函数
 */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 数据库插入辅助函数
 */
export async function insert<T = any>(
  text: string,
  params?: any[]
): Promise<T> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * 数据库更新辅助函数
 */
export async function update(
  text: string,
  params?: any[]
): Promise<number> {
  const result = await (global as any).dbPool.query(text, params);
  return result.rowCount || 0;
}

/**
 * 数据库删除辅助函数
 */
export async function remove(
  text: string,
  params?: any[]
): Promise<number> {
  return await update(text, params);
}

/**
 * 开始事务
 */
export async function beginTransaction() {
  return await (global as any).dbPool.connect();
}
