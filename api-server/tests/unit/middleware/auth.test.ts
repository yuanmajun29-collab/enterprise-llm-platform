import { Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../../../src/middleware/auth';
import { mockPool } from '../../helpers/setup';
import { mockApiKeyRecord, mockRevokedApiKeyRecord, generateValidToken, generateExpiredToken, mockAdminUser, mockUser } from '../../helpers/fixtures';
import jwt from 'jsonwebtoken';

// Mock database 模块
jest.mock('../../../src/config/database', () => ({
  queryOne: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  RequestLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { queryOne } from '../../../src/config/database';

const mockedQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// 辅助：创建 mock response 和 next
function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res;
}

function createMockNext(): NextFunction {
  return jest.fn() as NextFunction;
}

function createMockReq(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers: {
      authorization: headers.authorization,
      ...headers,
    },
    user: undefined,
  } as Partial<Request>;
}

// ========================================
// JWT 认证测试
// ========================================

describe('Auth Middleware - JWT', () => {
  it('有效的 JWT token 应通过认证', async () => {
    const token = generateValidToken(mockUser);
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe('user-001');
    expect(req.user!.username).toBe('testuser');
    expect(req.user!.authType).toBe('jwt');
  });

  it('过期的 JWT token 应返回 401', async () => {
    const token = generateExpiredToken(mockUser);
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ type: 'unauthorized' }),
      })
    );
  });

  it('缺失 Authorization header 应返回 401', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('缺少认证信息'),
        }),
      })
    );
  });

  it('格式错误的 Authorization header 应返回 401', async () => {
    const req = createMockReq({ authorization: 'InvalidFormat' });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('无效的 JWT token 应返回 401', async () => {
    const req = createMockReq({ authorization: 'Bearer invalid.jwt.token' });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ========================================
// API Key 认证测试
// ========================================

describe('Auth Middleware - API Key', () => {
  const validApiKey = 'sk-llm-abc1-xyz1234567890abcdefghijklmnop';

  it('有效的 API Key 应通过认证', async () => {
    // mock queryOne 返回有效的 API key 记录
    mockedQueryOne.mockResolvedValue(mockApiKeyRecord);

    const req = createMockReq({ authorization: `ApiKey ${validApiKey}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe('user-001');
    expect(req.user!.authType).toBe('api_key');
  });

  it('无效的 API Key 应返回 401', async () => {
    mockedQueryOne.mockResolvedValue(null);

    const req = createMockReq({ authorization: 'ApiKey invalid-key' });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('已撤销的 API Key 应返回 401', async () => {
    mockedQueryOne.mockResolvedValue(mockRevokedApiKeyRecord);

    const req = createMockReq({ authorization: `ApiKey ${validApiKey}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('用户被禁用时 API Key 应返回 401', async () => {
    mockedQueryOne.mockResolvedValue({
      ...mockApiKeyRecord,
      user_active: false,
    });

    const req = createMockReq({ authorization: `ApiKey ${validApiKey}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('过期的 API Key 应返回 401', async () => {
    mockedQueryOne.mockResolvedValue({
      ...mockApiKeyRecord,
      expires_at: '2023-01-01T00:00:00.000Z',
    });

    const req = createMockReq({ authorization: `ApiKey ${validApiKey}` });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ========================================
// 管理员权限检查测试
// ========================================

describe('Auth Middleware - requireAdmin', () => {
  it('管理员应通过权限检查', () => {
    const req = createMockReq();
    (req as any).user = {
      userId: 'admin-001',
      username: 'admin',
      isAdmin: true,
      authType: 'jwt',
    };
    const res = createMockRes();
    const next = createMockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('非管理员应被拒绝（403）', () => {
    const req = createMockReq();
    (req as any).user = {
      userId: 'user-001',
      username: 'testuser',
      isAdmin: false,
      authType: 'jwt',
    };
    const res = createMockRes();
    const next = createMockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('管理员'),
          type: 'forbidden',
        }),
      })
    );
  });

  it('未认证时应返回 401', () => {
    const req = createMockReq();
    // user 未设置
    const res = createMockRes();
    const next = createMockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ========================================
// 不支持的认证方式
// ========================================

describe('Auth Middleware - Unsupported scheme', () => {
  it('不支持的认证方式应返回 401', async () => {
    const req = createMockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = createMockRes();
    const next = createMockNext();

    await authenticate(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('不支持的认证方式'),
        }),
      })
    );
  });
});
