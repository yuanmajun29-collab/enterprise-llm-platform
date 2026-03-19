import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { queryOne } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { logger } from '../utils/logger';

// ========================================
// 类型扩展
// ========================================

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        isAdmin: boolean;
        authType: 'jwt' | 'api_key';
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// ========================================
// JWT 认证中间件
// ========================================

/**
 * 验证 Bearer Token（JWT）
 */
function authenticateByJWT(token: string): Express['Request']['user'] | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
      isAdmin: boolean;
    };

    if (!decoded.userId || !decoded.username) {
      return null;
    }

    return {
      userId: decoded.userId,
      username: decoded.username,
      isAdmin: decoded.isAdmin || false,
      authType: 'jwt',
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      logger.debug('JWT token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.debug('JWT token invalid');
    }
    return null;
  }
}

/**
 * 验证 API Key
 */
async function authenticateByApiKey(apiKey: string): Promise<Express['Request']['user'] | null> {
  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = apiKey.substring(0, 12);

    // 查询数据库验证 API Key
    const record = await queryOne(`
      SELECT ak.id, ak.user_id, ak.is_active, ak.expires_at,
             u.username, u.is_active AS user_active, u.is_admin
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = $1 AND ak.key_prefix = $2 AND ak.deleted_at IS NULL
    `, [keyHash, keyPrefix]);

    if (!record) {
      logger.debug('API Key not found in database');
      return null;
    }

    // 检查 key 是否被禁用
    if (!record.is_active) {
      logger.debug('API Key is deactivated', { keyId: record.id });
      return null;
    }

    // 检查用户是否被禁用
    if (!record.user_active) {
      logger.debug('API Key owner is deactivated', { userId: record.user_id });
      return null;
    }

    // 检查是否过期
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      logger.debug('API Key expired', { keyId: record.id });
      return null;
    }

    // 更新最后使用时间（异步，不阻塞请求）
    (global as any).dbPool.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [record.id]
    ).catch(() => { /* 忽略更新失败 */ });

    return {
      userId: record.user_id,
      username: record.username,
      isAdmin: record.is_admin || false,
      authType: 'api_key',
    };
  } catch (error) {
    logger.error('API Key authentication error:', error);
    return null;
  }
}

/**
 * 统一认证中间件
 * 支持 JWT Bearer Token 和 API Key 认证
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: '缺少认证信息，请提供 Authorization header',
        type: 'unauthorized',
        code: 'AUTH_001',
      },
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return res.status(401).json({
      error: {
        message: 'Authorization header 格式错误',
        type: 'unauthorized',
        code: 'AUTH_002',
      },
    });
  }

  const scheme = parts[0];
  const credentials = parts[1];

  if (scheme === 'Bearer') {
    // JWT 认证
    const user = authenticateByJWT(credentials);
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Token 无效或已过期，请重新登录',
          type: 'unauthorized',
          code: 'AUTH_003',
        },
      });
    }
    req.user = user;
    return next();
  }

  if (scheme === 'ApiKey') {
    // API Key 认证
    const user = await authenticateByApiKey(credentials);
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'API Key 无效、已过期或已被撤销',
          type: 'unauthorized',
          code: 'AUTH_004',
        },
      });
    }
    req.user = user;
    return next();
  }

  return res.status(401).json({
    error: {
      message: `不支持的认证方式: ${scheme}，请使用 Bearer 或 ApiKey`,
      type: 'unauthorized',
      code: 'AUTH_005',
    },
  });
}

/**
 * 可选认证中间件
 * 尝试认证但不强制，如果无 token 则继续但不设置 req.user
 */
export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return next();
  }

  const scheme = parts[0];
  const credentials = parts[1];

  if (scheme === 'Bearer') {
    const user = authenticateByJWT(credentials);
    if (user) {
      req.user = user;
    }
  } else if (scheme === 'ApiKey') {
    const user = await authenticateByApiKey(credentials);
    if (user) {
      req.user = user;
    }
  }

  next();
}

// ========================================
// 管理员权限检查中间件
// ========================================

/**
 * 要求管理员权限
 * 必须在 authenticate 中间件之后使用
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: '未认证，请先登录',
        type: 'unauthorized',
        code: 'AUTH_001',
      },
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      error: {
        message: '权限不足，需要管理员权限',
        type: 'forbidden',
        code: 'AUTH_010',
      },
    });
  }

  next();
}

// ========================================
// 限流中间件（基于 Redis）
// ========================================

interface RateLimitOptions {
  /** 时间窗口（秒） */
  windowSeconds: number;
  /** 时间窗口内最大请求数 */
  maxRequests: number;
  /** 限流维度：'ip' | 'user' | 'api_key' */
  keyType?: 'ip' | 'user' | 'api_key';
  /** 自定义错误消息 */
  message?: string;
}

/**
 * 基于 Redis 的滑动窗口限流
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowSeconds,
    maxRequests,
    keyType = 'ip',
    message,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = (await import('../config/redis')).getRedisClient();
      if (!client) {
        // Redis 不可用时跳过限流
        logger.warn('Redis not available, skipping rate limit');
        return next();
      }

      // 确定限流 key
      let identifier: string;
      if (keyType === 'user' && req.user) {
        identifier = `user:${req.user.userId}`;
      } else if (keyType === 'api_key' && req.user?.authType === 'api_key') {
        identifier = `apikey:${req.user.userId}`;
      } else {
        identifier = `ip:${req.ip || 'unknown'}`;
      }

      const rateLimitKey = `ratelimit:${identifier}:${req.path}`;
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - windowSeconds;

      // 使用 Redis sorted set 实现滑动窗口
      const multi = client.multi();
      multi.zRemRangeByScore(rateLimitKey, 0, windowStart);
      multi.zAdd(rateLimitKey, [{ score: now, value: `${now}-${Math.random()}` }]);
      multi.zCard(rateLimitKey);
      multi.expire(rateLimitKey, windowSeconds + 1);
      const results = await multi.exec();

      const currentCount = results?.[2]?.[1] as number || 0;

      // 设置限流响应头
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - currentCount)));
      res.setHeader('X-RateLimit-Reset', String(now + windowSeconds));

      if (currentCount > maxRequests) {
        return res.status(429).json({
          error: {
            message: message || '请求过于频繁，请稍后再试',
            type: 'rate_limited',
            code: 'RATE_001',
          },
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limit error:', error);
      // 限流出错时不阻塞请求
      next();
    }
  };
}

/**
 * 通用 API 限流（IP 维度）
 */
export const apiRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests: 100,
  keyType: 'ip',
});

/**
 * 认证接口限流（防止暴力破解）
 */
export const authRateLimit = rateLimit({
  windowSeconds: 900, // 15分钟
  maxRequests: 10,
  keyType: 'ip',
  message: '登录尝试次数过多，请15分钟后再试',
});

/**
 * 用户操作限流
 */
export const userRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests: 60,
  keyType: 'user',
});
