import * as authController from '../../../src/controllers/auth.controller';
import bcrypt from 'bcryptjs';
import { mockPool } from '../../helpers/setup';
import { mockUser, generateValidToken, generateValidRefreshToken } from '../../helpers/fixtures';
import { setupMockRedis, resetRedisMocks } from '../../helpers/mock-redis';

jest.mock('bcryptjs');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-001' }));

// 注意: setRedisClient 需要在模块加载之前设置
let mockRedisClient: any;

beforeAll(() => {
  mockRedisClient = setupMockRedis();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  resetRedisMocks();
});

describe('Auth Controller', () => {
  describe('login', () => {
    it('登录成功应返回 accessToken 和用户信息', async () => {
      // mock queryOne 查询用户
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        if (sql.includes('UPDATE users SET last_login_at')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authController.login('testuser', 'password123');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('testuser');
      expect(result.user.id).toBe('user-001');
    });

    it('用户不存在时应抛出 401 错误', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(authController.login('nouser', 'password'))
        .rejects.toMatchObject({ status: 401, type: 'unauthorized' });
    });

    it('密码错误时应抛出 401 错误', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authController.login('testuser', 'wrongpassword'))
        .rejects.toMatchObject({ status: 401, type: 'unauthorized' });
    });

    it('登录成功后应缓存 token 到 Redis', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authController.login('testuser', 'password123');

      // 验证 Redis 中有缓存
      const cachedToken = await mockRedisClient.get('auth:token:user-001');
      expect(cachedToken).toBeTruthy();
      const cachedRefresh = await mockRedisClient.get('auth:refresh:user-001');
      expect(cachedRefresh).toBeTruthy();
    });
  });

  describe('register', () => {
    const validUserData = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
      displayName: '新用户',
      department: '技术部',
    };

    it('注册成功应返回新用户信息', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username, email FROM users')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO users')) {
          return { rows: [{ ...mockUser, username: 'newuser' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashed');

      const result = await authController.register(validUserData);

      expect(result).toHaveProperty('id');
      expect(result.username).toBe('newuser');
    });

    it('用户名已存在时应抛出 409 错误', async () => {
      // 返回一个只有用户名匹配的记录（email 不同）
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username, email FROM users')) {
          return { rows: [{ id: 'existing', username: 'newuser', email: 'other@example.com' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(authController.register(validUserData))
        .rejects.toMatchObject({ status: 409, type: 'conflict', message: '用户名已存在' });
    });

    it('邮箱已注册时应抛出 409 错误', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username, email')) {
          return { rows: [{ id: 'other', username: 'otheruser', email: 'new@example.com' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(authController.register(validUserData))
        .rejects.toMatchObject({ status: 409, type: 'conflict', message: '邮箱已被注册' });
    });

    it('密码过短应抛出 400 错误', async () => {
      await expect(authController.register({ ...validUserData, password: '123' }))
        .rejects.toMatchObject({ status: 400, message: '密码长度至少为8位' });
    });

    it('缺少必填项应抛出 400 错误', async () => {
      await expect(authController.register({ username: 'test' }))
        .rejects.toMatchObject({ status: 400, message: '用户名、邮箱和密码为必填项' });
    });
  });

  describe('refreshToken', () => {
    it('有效的 refresh token 应返回新的 accessToken', async () => {
      const refreshToken = generateValidRefreshToken('user-001');

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username, email, is_active')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await authController.refreshToken(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('过期的 refresh token 应抛出 401 错误', async () => {
      const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
      const REFRESH_SECRET = process.env.REFRESH_SECRET || JWT_SECRET;
      const expiredToken = require('jsonwebtoken').sign(
        { userId: 'user-001', tokenType: 'refresh' },
        REFRESH_SECRET,
        { expiresIn: '-1s' }
      );

      await expect(authController.refreshToken(expiredToken))
        .rejects.toMatchObject({ status: 401 });
    });

    it('缺少 refresh token 应抛出 401 错误', async () => {
      await expect(authController.refreshToken(''))
        .rejects.toMatchObject({ status: 401, message: '缺少刷新令牌' });
    });

    it('无效的 token 类型应抛出 401 错误', async () => {
      const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
      const REFRESH_SECRET = process.env.REFRESH_SECRET || JWT_SECRET;
      // 生成一个 accessToken（非 refresh 类型）
      const accessToken = require('jsonwebtoken').sign(
        { userId: 'user-001', tokenType: 'access' },
        REFRESH_SECRET,
        { expiresIn: '30d' }
      );

      await expect(authController.refreshToken(accessToken))
        .rejects.toMatchObject({ status: 401, message: '无效的刷新令牌类型' });
    });

    it('用户已被禁用时应抛出 401 错误', async () => {
      const refreshToken = generateValidRefreshToken('user-001');

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, username, email, is_active')) {
          return { rows: [], rowCount: 0 }; // 用户不存在
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(authController.refreshToken(refreshToken))
        .rejects.toMatchObject({ status: 401, message: '用户不存在或已被禁用' });
    });
  });

  describe('logout', () => {
    it('登出应删除 Redis 中的 token', async () => {
      await mockRedisClient.set('auth:token:user-001', 'some-token');
      await mockRedisClient.set('auth:refresh:user-001', 'some-refresh');

      await authController.logout('user-001');

      const cachedToken = await mockRedisClient.get('auth:token:user-001');
      const cachedRefresh = await mockRedisClient.get('auth:refresh:user-001');
      expect(cachedToken).toBeNull();
      expect(cachedRefresh).toBeNull();
    });

    it('userId 为空时应正常返回', async () => {
      await expect(authController.logout('')).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    it('修改密码成功应返回成功消息', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, password_hash')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$newhash');

      const result = await authController.changePassword('user-001', 'oldpass', 'newpass12345');

      expect(result.message).toBe('密码修改成功，请重新登录');
    });

    it('旧密码错误应抛出 401', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, password_hash')) {
          return { rows: [mockUser], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authController.changePassword('user-001', 'wrongold', 'newpass12345'))
        .rejects.toMatchObject({ status: 401, message: '旧密码错误' });
    });

    it('新密码过短应抛出 400', async () => {
      await expect(authController.changePassword('user-001', 'oldpass', '123'))
        .rejects.toMatchObject({ status: 400, message: '新密码长度至少为8位' });
    });

    it('缺少旧密码应抛出 400', async () => {
      await expect(authController.changePassword('user-001', '', 'newpass12345'))
        .rejects.toMatchObject({ status: 400, message: '旧密码和新密码为必填项' });
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, password_hash')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      await expect(authController.changePassword('nonexistent', 'oldpass', 'newpass12345'))
        .rejects.toMatchObject({ status: 404, message: '用户不存在' });
    });
  });
});
