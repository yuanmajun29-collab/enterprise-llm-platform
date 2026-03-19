import { Router, Request, Response } from 'express';
import * as authController from '../controllers/auth.controller';
import keycloakRoutes from './keycloak.routes';

const router = Router();

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: { message: '用户名和密码为必填项', type: 'validation_error' } });
    }
    const result = await authController.login(username, password);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    const result = await authController.register(userData);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 刷新 Token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const result = await authController.refreshToken(refreshToken);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 登出
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    await authController.logout(userId);
    return res.json({ message: '已成功登出' });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 修改密码
 * PUT /api/auth/password
 */
router.put('/password', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { oldPassword, newPassword } = req.body;
    const result = await authController.changePassword(userId, oldPassword, newPassword);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 发起密码重置
 * POST /api/auth/reset-request
 */
router.post('/reset-request', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await authController.requestPasswordReset(email);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 执行密码重置
 * POST /api/auth/reset
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authController.resetPassword(token, newPassword);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

// Keycloak 认证子路由
router.use('/keycloak', keycloakRoutes);

export default router;
