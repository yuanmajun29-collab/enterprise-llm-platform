import { Request, Response, NextFunction } from 'express';
import { getUserByToken, syncUserFromKeycloak } from '../services/keycloak.service';
import { logger } from '../utils/logger';

/**
 * 验证 Keycloak Token
 * 调用 Keycloak userinfo endpoint 验证 token 有效性
 */
export async function verifyKeycloakToken(token: string): Promise<any> {
  const userInfo = await getUserByToken(token);
  if (!userInfo || !userInfo.sub) {
    throw { status: 401, message: 'Token 无效或已过期', type: 'unauthorized' };
  }
  return userInfo;
}

/**
 * Keycloak 认证中间件
 * 从 Authorization header 提取 Bearer token，通过 Keycloak userinfo 验证，
 * 自动同步用户到本地数据库，将用户信息注入 req.user（格式与 auth.ts 一致）
 */
export async function keycloakAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: '缺少认证信息，请提供 Authorization header',
        type: 'unauthorized',
        code: 'KCAUTH_001',
      },
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: {
        message: 'Authorization header 格式错误，需要 Bearer token',
        type: 'unauthorized',
        code: 'KCAUTH_002',
      },
    });
  }

  const token = parts[1];

  try {
    // 1. 调用 Keycloak userinfo 验证 token
    const keycloakUser = await verifyKeycloakToken(token);

    // 2. 如果本地用户不存在，自动同步
    let localUser;
    try {
      localUser = await syncUserFromKeycloak(keycloakUser);
    } catch (syncError: any) {
      logger.error('Failed to sync user from Keycloak:', syncError);
      return res.status(500).json({
        error: {
          message: '用户同步失败，请联系管理员',
          type: 'internal_error',
          code: 'KCAUTH_003',
        },
      });
    }

    if (!localUser || !localUser.id) {
      return res.status(401).json({
        error: {
          message: '用户同步后无有效数据',
          type: 'unauthorized',
          code: 'KCAUTH_004',
        },
      });
    }

    // 3. 将用户信息注入 req.user（格式与 auth.ts 一致）
    req.user = {
      userId: localUser.id,
      username: localUser.username,
      isAdmin: localUser.isAdmin || false,
      authType: 'jwt' as const,
    };

    return next();
  } catch (error: any) {
    if (error.status === 401) {
      return res.status(401).json({
        error: {
          message: error.message || 'Token 无效或已过期，请重新登录',
          type: 'unauthorized',
          code: 'KCAUTH_005',
        },
      });
    }

    logger.error('Keycloak auth middleware error:', error);
    return res.status(502).json({
      error: {
        message: '认证服务暂时不可用',
        type: 'external_service_error',
        code: 'KCAUTH_006',
      },
    });
  }
}

/**
 * 可选 Keycloak 认证中间件
 * 尝试 Keycloak 认证但不强制，失败则继续但不设置 req.user
 */
export async function optionalKeycloakAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next();
  }

  const token = parts[1];

  try {
    const keycloakUser = await verifyKeycloakToken(token);
    const localUser = await syncUserFromKeycloak(keycloakUser);

    if (localUser && localUser.id) {
      req.user = {
        userId: localUser.id,
        username: localUser.username,
        isAdmin: localUser.isAdmin || false,
        authType: 'jwt' as const,
      };
    }
  } catch (error) {
    // 可选认证不阻塞请求
    logger.debug('Optional Keycloak auth failed, continuing without auth');
  }

  return next();
}
