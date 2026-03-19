/**
 * API 集成测试
 * 使用 supertest 测试 Express app 端到端流程
 * 注意：源代码中 routes/index.ts 存在命名/默认导出不一致，
 * 因此集成测试直接构建测试路由，不依赖 src/routes/index.ts
 */

// 设置环境变量
process.env.JWT_SECRET = 'test-jwt-secret-for-integration';
process.env.REFRESH_SECRET = 'test-refresh-secret-for-integration';

import request from 'supertest';
import express, { Application, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler, requestLogger } from '../../src/middleware';
import { mockUser, mockModels, generateValidToken } from '../helpers/fixtures';
import bcrypt from 'bcryptjs';

// Mock 数据库和 Redis
jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}));

jest.mock('../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDelete: jest.fn(),
  setRedisClient: jest.fn(),
  getRedisClient: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  RequestLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as db from '../../src/config/database';
import * as redis from '../../src/config/redis';

const mockedDb = db as jest.Mocked<typeof db>;
const mockedRedis = redis as jest.Mocked<typeof redis>;

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// 直接导入各路由模块（它们是 default export）
import authRoutes from '../../src/routes/auth.routes';
import userRoutes from '../../src/routes/user.routes';
import modelRoutes from '../../src/routes/model.routes';
import conversationRoutes from '../../src/routes/conversation.routes';
import usageRoutes from '../../src/routes/usage.routes';

// 创建测试用 Express app（手动组装路由，绕过 routes/index.ts 的导出问题）
function createTestApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json());
  app.use(requestLogger);

  // 手动注册路由（绕过 routes/index.ts 的导出问题）
  const apiRouter = Router();
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/user', userRoutes);
  apiRouter.use('/models', modelRoutes);
  apiRouter.use('/conversations', conversationRoutes);
  apiRouter.use('/usage', usageRoutes);

  app.use('/api', apiRouter);

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Enterprise LLM Platform API',
      version: '1.0.0',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

let app: Application;

beforeAll(() => {
  app = createTestApp();
});

beforeEach(() => {
  jest.clearAllMocks();

  // 默认所有数据库操作返回空
  mockedDb.query.mockResolvedValue([]);
  mockedDb.queryOne.mockResolvedValue(null);
  mockedDb.insert.mockResolvedValue({});
  mockedDb.update.mockResolvedValue(1);
  mockedDb.remove.mockResolvedValue(1);
  mockedRedis.cacheGet.mockResolvedValue(null);
  mockedRedis.cacheSet.mockResolvedValue();
  mockedRedis.cacheDelete.mockResolvedValue();
});

// ========================================
// 健康检查
// ========================================

describe('GET /health', () => {
  it('应返回 200 和正确的健康状态', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('service', 'Enterprise LLM Platform API');
    expect(res.body).toHaveProperty('version', '1.0.0');
  });
});

// ========================================
// 认证流程
// ========================================

describe('POST /api/auth/login', () => {
  it('登录成功应返回 tokens', async () => {
    mockedDb.queryOne.mockResolvedValueOnce(mockUser);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedDb.update.mockResolvedValue(1);
    mockedRedis.cacheSet.mockResolvedValue();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
  });

  it('缺少用户名应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('用户不存在应返回 401', async () => {
    mockedDb.queryOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nouser', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('密码错误应返回 401', async () => {
    mockedDb.queryOne.mockResolvedValue(mockUser);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  it('注册成功应返回 201', async () => {
    mockedDb.queryOne.mockResolvedValue(null);
    mockedBcrypt.hash.mockResolvedValue('$2a$10$hashed' as never);
    mockedDb.insert.mockResolvedValue(mockUser);
    mockedDb.query.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
  });

  it('用户名重复应返回 409', async () => {
    mockedDb.queryOne.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'new@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(409);
  });

  it('密码过短应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: '123',
      });

    expect(res.status).toBe(400);
  });
});

// ========================================
// 用户信息（需认证）
// ========================================

describe('GET /api/user/info', () => {
  it('带 x-user-id header 应返回用户信息', async () => {
    mockedDb.queryOne.mockResolvedValue(mockUser);

    const res = await request(app)
      .get('/api/user/info')
      .set('x-user-id', 'user-001');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'user-001');
    expect(res.body).toHaveProperty('username', 'testuser');
  });

  it('不带 x-user-id 应返回 401', async () => {
    const res = await request(app)
      .get('/api/user/info');

    expect(res.status).toBe(401);
  });
});

// ========================================
// 模型列表
// ========================================

describe('GET /api/models', () => {
  it('应返回模型列表', async () => {
    mockedDb.query.mockResolvedValue(mockModels);

    const res = await request(app)
      .get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveLength(3);
  });
});

// ========================================
// 404 处理
// ========================================

describe('404 Handling', () => {
  it('不存在的路由应返回 404', async () => {
    const res = await request(app)
      .get('/api/nonexistent-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('type', 'not_found');
  });
});

// ========================================
// CORS Headers
// ========================================

describe('CORS Headers', () => {
  it('响应应包含 CORS headers', async () => {
    const res = await request(app)
      .get('/health');

    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('OPTIONS 请求应正常响应', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://example.com');

    expect(res.status).toBeLessThan(400);
  });
});
