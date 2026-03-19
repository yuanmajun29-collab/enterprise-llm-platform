import { Router, Request, Response } from 'express';
import {
  directGrantLogin,
  refreshKeycloakToken,
  keycloakLogout,
  getKeycloakConfig,
  getUserByToken,
  syncUserFromKeycloak,
} from '../services/keycloak.service';

const router = Router();

/**
 * Keycloak 登录（用户名 + 密码，直接授权模式）
 * POST /api/auth/keycloak/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        error: { message: '用户名和密码为必填项', type: 'validation_error' },
      });
    }

    const result = await directGrantLogin(username, password);

    // 同步用户到本地数据库
    try {
      const userInfo = await getUserByToken(result.accessToken);
      await syncUserFromKeycloak(userInfo);
    } catch (syncError) {
      // 同步失败不影响登录
      const { logger } = await import('../utils/logger');
      logger.warn('Failed to sync user after Keycloak login:', syncError);
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: { message: error.message, type: error.type || 'internal_error' },
    });
  }
});

/**
 * 刷新 Keycloak Token
 * POST /api/auth/keycloak/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        error: { message: '缺少刷新令牌', type: 'validation_error' },
      });
    }

    const result = await refreshKeycloakToken(refreshToken);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: { message: error.message, type: error.type || 'internal_error' },
    });
  }
});

/**
 * 获取 Keycloak 登录配置
 * GET /api/auth/keycloak/config
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = getKeycloakConfig();
    return res.json(config);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: { message: error.message, type: error.type || 'internal_error' },
    });
  }
});

/**
 * Keycloak 登出
 * POST /api/auth/keycloak/logout
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        error: { message: '缺少刷新令牌', type: 'validation_error' },
      });
    }

    await keycloakLogout(refreshToken);
    return res.json({ message: '已成功登出' });
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: { message: error.message, type: error.type || 'internal_error' },
    });
  }
});

export default router;
