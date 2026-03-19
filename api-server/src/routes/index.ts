import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { userRoutes } from './user.routes';
import { modelRoutes } from './model.routes';
import { conversationRoutes } from './conversation.routes';
import { usageRoutes } from './usage.routes';

const router = Router();

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Enterprise LLM Platform API',
    version: '1.0.0',
  });
});

// 子路由
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/models', modelRoutes);
router.use('/conversations', conversationRoutes);
router.use('/usage', usageRoutes);

export default router;
