import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { apiRoutes } from './routes';
import { errorHandler, requestLogger, notFoundHandler } from './middleware';
import { logger } from './utils/logger';
import { setRedisClient } from './config/redis';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ========================================
// 数据库连接
// ========================================
export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试数据库连接
dbPool.connect((err, client, release) => {
  if (err) {
    logger.error('Database connection error:', err);
  } else {
    logger.info('Database connected successfully');
    release();
  }
});

// ========================================
// Redis 连接
// ========================================
export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis connected successfully');
});

redisClient.connect().catch((err) => {
  logger.error('Redis connection failed:', err);
});

// 将 Redis 客户端注入到 redis 模块
setRedisClient(redisClient as any);

// ========================================
// 中间件
// ========================================
app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);

// ========================================
// 路由
// ========================================
app.use('/api', apiRoutes);

// 健康检查
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Enterprise LLM Platform API',
    version: '1.0.0',
  });
});

// ========================================
// 错误处理
// ========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ========================================
// 启动服务器
// ========================================
app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  dbPool.end(() => {
    logger.info('Database pool closed');
    redisClient.quit();
    logger.info('Redis client closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  dbPool.end(() => {
    logger.info('Database pool closed');
    redisClient.quit();
    logger.info('Redis client closed');
    process.exit(0);
  });
});

export default app;
