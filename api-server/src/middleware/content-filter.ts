import { Request, Response, NextFunction } from 'express';
import { query, insert } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { logger } from '../utils/logger';

// ========================================
// 敏感词过滤中间件
// ========================================

const REDIS_CACHE_KEY = 'content_filter:patterns';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

interface SensitivePattern {
  id: string;
  pattern: string;
  pattern_type: string;
  severity: string;
  category: string;
  is_active: boolean;
}

/**
 * 缓存的正则表达式列表
 */
let cachedPatterns: { regex: RegExp; category: string; severity: string }[] = [];
let lastRefreshTime = 0;

/**
 * 从数据库加载敏感词模式
 */
async function loadPatternsFromDB(): Promise<SensitivePattern[]> {
  try {
    const rows = await query<SensitivePattern>(`
      SELECT id, pattern, pattern_type, severity, category, is_active
      FROM sensitive_patterns
      WHERE is_active = true
    `);
    return rows;
  } catch (error) {
    logger.error('Failed to load sensitive patterns from database:', error);
    return [];
  }
}

/**
 * 刷新正则缓存
 * 优先从 Redis 读取，不存在则从数据库加载并写入 Redis
 */
async function refreshPatterns(): Promise<void> {
  const now = Date.now();

  // 避免频繁刷新
  if (now - lastRefreshTime < 60000) { // 至少间隔 1 分钟
    return;
  }

  try {
    // 尝试从 Redis 获取
    const cached = await cacheGet(REDIS_CACHE_KEY);
    if (cached) {
      cachedPatterns = parsePatterns(JSON.parse(cached));
      lastRefreshTime = now;
      logger.debug('Sensitive patterns loaded from Redis cache');
      return;
    }

    // 从数据库加载
    const patterns = await loadPatternsFromDB();
    if (patterns.length > 0) {
      // 写入 Redis，TTL = 5 分钟
      await cacheSet(REDIS_CACHE_KEY, JSON.stringify(patterns), 300);
      cachedPatterns = parsePatterns(patterns);
      lastRefreshTime = now;
      logger.info(`Loaded ${patterns.length} sensitive patterns from database`);
    }
  } catch (error) {
    logger.error('Failed to refresh sensitive patterns:', error);
  }
}

/**
 * 将数据库记录解析为正则对象
 */
function parsePatterns(patterns: SensitivePattern[]): { regex: RegExp; category: string; severity: string }[] {
  return patterns
    .filter((p) => p.is_active)
    .map((p) => {
      try {
        return {
          regex: new RegExp(p.pattern, 'gi'),
          category: p.category,
          severity: p.severity,
        };
      } catch (error) {
        logger.warn(`Invalid regex pattern: ${p.pattern} (id: ${p.id})`, error);
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

/**
 * 检查文本是否命中敏感词
 */
function checkContent(text: string): { hits: number; matchedCategories: string[] } {
  const matchedCategories = new Set<string>();
  let hits = 0;

  for (const { regex, category } of cachedPatterns) {
    regex.lastIndex = 0; // 重置正则状态
    if (regex.test(text)) {
      hits++;
      matchedCategories.add(category);
    }
  }

  return { hits, matchedCategories: Array.from(matchedCategories) };
}

/**
 * 从请求体中提取需要检查的文本内容
 */
function extractTextsFromBody(body: any): string[] {
  const texts: string[] = [];

  if (!body || typeof body !== 'object') {
    return texts;
  }

  // 检查 messages[].content（聊天请求格式）
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg && typeof msg.content === 'string') {
        texts.push(msg.content);
      }
    }
  }

  // 检查 prompt 字段
  if (typeof body.prompt === 'string') {
    texts.push(body.prompt);
  }

  return texts;
}

/**
 * 定时刷新缓存（后台任务）
 */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动定时刷新
 */
export function startContentFilterRefresh(): void {
  // 立即加载一次
  refreshPatterns();

  // 每 5 分钟刷新一次
  refreshTimer = setInterval(() => {
    refreshPatterns();
  }, REFRESH_INTERVAL_MS);

  logger.info('Content filter refresh started, interval: 5min');
}

/**
 * 停止定时刷新
 */
export function stopContentFilterRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info('Content filter refresh stopped');
  }
}

/**
 * 敏感词过滤中间件
 * 不阻止请求，命中时在响应头添加 X-Content-Filter-Hits，并写入审计日志
 */
export async function contentFilter(req: Request, res: Response, next: NextFunction) {
  try {
    // 确保缓存已初始化
    if (cachedPatterns.length === 0) {
      await refreshPatterns();
    }

    // 只检查有请求体的 POST/PUT/PATCH 请求
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return next();
    }

    // 提取文本内容
    const texts = extractTextsFromBody(req.body);
    if (texts.length === 0) {
      return next();
    }

    // 检查所有文本
    let totalHits = 0;
    const allMatchedCategories = new Set<string>();

    for (const text of texts) {
      const result = checkContent(text);
      totalHits += result.hits;
      result.matchedCategories.forEach((c) => allMatchedCategories.add(c));
    }

    // 命中时添加响应头
    if (totalHits > 0) {
      res.setHeader('X-Content-Filter-Hits', String(totalHits));
      res.setHeader('X-Content-Filter-Categories', Array.from(allMatchedCategories).join(','));

      // 异步写入审计日志
      const userId = req.user?.userId || null;
      const ip = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.get('User-Agent') || null;

      insert(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent, status)
        VALUES ($1::uuid, 'content_filter.hit', 'content', NULL, $2, $3::inet, $4, 'success')
      `, [
        userId,
        JSON.stringify({
          hits: totalHits,
          categories: Array.from(allMatchedCategories),
          path: req.path,
          method: req.method,
        }),
        ip,
        userAgent,
      ]).catch((error) => {
        logger.error('Failed to write content filter audit log:', error);
      });
    }
  } catch (error) {
    logger.error('Content filter error:', error);
    // 过滤出错不阻塞请求
  }

  next();
}
