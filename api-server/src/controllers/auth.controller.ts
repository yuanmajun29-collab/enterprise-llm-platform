import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, insert, queryOne, update } from '../config/database';
import { cacheSet, cacheDelete, cacheGet } from '../config/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * 用户登录
 */
export async function login(username: string, password: string) {
  // 查询用户
  const user = await queryOne(`
    SELECT id, username, email, password_hash, is_active, is_admin
    FROM users
    WHERE username = $1 AND is_active = true
  `, [username]);

  if (!user) {
    throw { status: 401, message: '用户名或密码错误', type: 'unauthorized' };
  }

  // 验证密码
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw { status: 401, message: '用户名或密码错误', type: 'unauthorized' };
  }

  // 生成 JWT
  const accessToken = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, tokenType: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  // 缓存 token
  await cacheSet(`auth:token:${user.id}`, accessToken, 86400);
  await cacheSet(`auth:refresh:${user.id}`, refreshToken, 2592000);

  // 更新最后登录时间
  await update(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [user.id]);

  return {
    accessToken,
    refreshToken,
    expiresIn: 86400,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.is_admin,
    },
  };
}

/**
 * 用户注册
 */
export async function register(userData: any) {
  const { username, email, password, displayName, department, position, employeeId } = userData;

  if (!username || !email || !password) {
    throw { status: 400, message: '用户名、邮箱和密码为必填项', type: 'validation_error' };
  }

  if (password.length < 8) {
    throw { status: 400, message: '密码长度至少为8位', type: 'validation_error' };
  }

  // 检查用户名是否已存在
  const existingUser = await queryOne(`
    SELECT id, username, email FROM users WHERE username = $1 OR email = $2
  `, [username, email]);

  if (existingUser) {
    if (existingUser.username === username) {
      throw { status: 409, message: '用户名已存在', type: 'conflict' };
    }
    throw { status: 409, message: '邮箱已被注册', type: 'conflict' };
  }

  // 加密密码
  const passwordHash = await bcrypt.hash(password, 10);

  // 插入用户
  const user = await insert(`
    INSERT INTO users (id, username, email, display_name, password_hash, department, position, employee_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, username, email, display_name, department, position, is_active, is_admin, created_at
  `, [uuidv4(), username, email, displayName, passwordHash, department, position, employeeId]);

  // 为新用户创建默认配额
  await query(`
    INSERT INTO user_quotas (id, user_id, quota_type, daily_limit, hourly_limit, monthly_limit)
    VALUES
      ($1, $2, 'default', 100000, 1000, 3000000),
      ($3, $2, 'premium', 500000, 5000, 15000000)
    ON CONFLICT DO NOTHING
  `, [uuidv4(), user.id, uuidv4()]);

  return user;
}

/**
 * 刷新 Token
 */
export async function refreshToken(refreshToken: string) {
  if (!refreshToken) {
    throw { status: 401, message: '缺少刷新令牌', type: 'unauthorized' };
  }

  try {
    const decoded: any = jwt.verify(refreshToken, REFRESH_SECRET);

    if (decoded.tokenType !== 'refresh') {
      throw { status: 401, message: '无效的刷新令牌类型', type: 'unauthorized' };
    }

    const userId = decoded.userId;

    // 检查 Redis 中缓存的 refresh token 是否匹配
    const cachedRefresh = await cacheGet(`auth:refresh:${userId}`);
    if (cachedRefresh && cachedRefresh !== refreshToken) {
      // Token 不匹配，可能已被撤销
      throw { status: 401, message: '刷新令牌已被撤销', type: 'unauthorized' };
    }

    // 查询用户
    const user = await queryOne(`
      SELECT id, username, email, is_active, is_admin
      FROM users
      WHERE id = $1 AND is_active = true
    `, [userId]);

    if (!user) {
      throw { status: 401, message: '用户不存在或已被禁用', type: 'unauthorized' };
    }

    // 生成新 Access Token
    const newAccessToken = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 缓存新 token
    await cacheSet(`auth:token:${user.id}`, newAccessToken, 86400);

    return { accessToken: newAccessToken, expiresIn: 86400 };
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      throw { status: 401, message: '无效的刷新令牌', type: 'unauthorized' };
    }
    if (error.name === 'TokenExpiredError') {
      throw { status: 401, message: '刷新令牌已过期，请重新登录', type: 'unauthorized' };
    }
    throw error;
  }
}

/**
 * 登出
 */
export async function logout(userId: string) {
  if (!userId) return;
  // 删除缓存的 token
  await cacheDelete(`auth:token:${userId}`);
  await cacheDelete(`auth:refresh:${userId}`);
}

/**
 * 修改密码
 */
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  if (!oldPassword || !newPassword) {
    throw { status: 400, message: '旧密码和新密码为必填项', type: 'validation_error' };
  }

  if (newPassword.length < 8) {
    throw { status: 400, message: '新密码长度至少为8位', type: 'validation_error' };
  }

  const user = await queryOne(`
    SELECT id, password_hash FROM users WHERE id = $1 AND is_active = true
  `, [userId]);

  if (!user) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isValidPassword) {
    throw { status: 401, message: '旧密码错误', type: 'unauthorized' };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await update(`
    UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
  `, [newPasswordHash, userId]);

  // 密码修改后撤销所有 token
  await cacheDelete(`auth:token:${userId}`);
  await cacheDelete(`auth:refresh:${userId}`);

  return { message: '密码修改成功，请重新登录' };
}

/**
 * 发起密码重置（通过邮箱）
 */
export async function requestPasswordReset(email: string) {
  const user = await queryOne(`
    SELECT id, email, username FROM users WHERE email = $1 AND is_active = true
  `, [email]);

  if (!user) {
    // 不暴露用户是否存在
    return { message: '如果该邮箱已注册，重置链接已发送' };
  }

  // 生成重置 token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + 3600000); // 1小时后过期

  await update(`
    UPDATE users
    SET password_reset_token = $1, password_reset_expires = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [resetToken, resetExpires, user.id]);

  // 缓存重置 token
  await cacheSet(`auth:reset:${resetToken}`, user.id, 3600);

  // TODO: 集成邮件服务发送重置链接
  // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  return { message: '如果该邮箱已注册，重置链接已发送' };
}

/**
 * 执行密码重置
 */
export async function resetPassword(token: string, newPassword: string) {
  if (!token || !newPassword) {
    throw { status: 400, message: '重置令牌和新密码为必填项', type: 'validation_error' };
  }

  if (newPassword.length < 8) {
    throw { status: 400, message: '新密码长度至少为8位', type: 'validation_error' };
  }

  // 从缓存中查找 token 对应的用户
  const userId = await cacheGet(`auth:reset:${token}`);
  if (!userId) {
    throw { status: 400, message: '重置链接无效或已过期', type: 'validation_error' };
  }

  const user = await queryOne(`
    SELECT id, password_reset_expires FROM users
    WHERE id = $1 AND password_reset_token = $2 AND is_active = true
  `, [userId, token]);

  if (!user) {
    throw { status: 400, message: '重置链接无效', type: 'validation_error' };
  }

  if (new Date(user.password_reset_expires) < new Date()) {
    throw { status: 400, message: '重置链接已过期', type: 'validation_error' };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await update(`
    UPDATE users
    SET password_hash = $1,
        password_reset_token = NULL,
        password_reset_expires = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [newPasswordHash, userId]);

  // 撤销所有 token
  await cacheDelete(`auth:reset:${token}`);
  await cacheDelete(`auth:token:${userId}`);
  await cacheDelete(`auth:refresh:${userId}`);

  return { message: '密码重置成功，请使用新密码登录' };
}
