import axios from 'axios';
import { queryOne, insert, update } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { logger } from '../utils/logger';

// ========================================
// Keycloak 配置
// ========================================

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'llm-platform';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'llm-api';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

const ADMIN_TOKEN_CACHE_KEY = `keycloak:admin_token`;
const ADMIN_TOKEN_TTL = 50; // 缓存50秒，Keycloak 默认60秒过期

// ========================================
// Keycloak HTTP 客户端
// ========================================

const keycloakClient = axios.create({
  baseURL: `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ========================================
// 管理 Token
// ========================================

/**
 * 获取 Keycloak Admin Token（使用 Redis 缓存）
 */
export async function getKeycloakAdminToken(): Promise<string> {
  // 尝试从 Redis 缓存获取
  const cached = await cacheGet(ADMIN_TOKEN_CACHE_KEY);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    const { access_token } = response.data;

    // 缓存到 Redis
    await cacheSet(ADMIN_TOKEN_CACHE_KEY, access_token, ADMIN_TOKEN_TTL);

    return access_token;
  } catch (error: any) {
    logger.error('Failed to get Keycloak admin token:', error.message);
    throw {
      status: 502,
      message: '无法连接 Keycloak 认证服务',
      type: 'external_service_error',
    };
  }
}

/**
 * 获取带 Admin Token 的请求头
 */
async function getAdminHeaders(): Promise<{ Authorization: string }> {
  const token = await getKeycloakAdminToken();
  return { Authorization: `Bearer ${token}` };
}

// ========================================
// 用户信息查询
// ========================================

/**
 * 通过 Access Token 获取用户信息（调用 userinfo endpoint）
 */
export async function getUserByToken(accessToken: string): Promise<any> {
  try {
    const response = await axios.get(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      logger.debug('Keycloak token invalid or expired');
      throw { status: 401, message: 'Token 无效或已过期', type: 'unauthorized' };
    }
    logger.error('Failed to get user info from Keycloak:', error.message);
    throw {
      status: 502,
      message: '无法验证用户身份',
      type: 'external_service_error',
    };
  }
}

/**
 * 通过 Admin API 获取用户详情（包含角色信息）
 */
export async function getUserDetail(keycloakUserId: string): Promise<any> {
  try {
    const headers = await getAdminHeaders();
    const response = await keycloakClient.get(`/users/${keycloakUserId}`, { headers });
    return response.data;
  } catch (error: any) {
    logger.error('Failed to get user detail from Keycloak:', error.message);
    throw {
      status: 502,
      message: '无法获取用户详情',
      type: 'external_service_error',
    };
  }
}

/**
 * 获取用户的 Realm Roles
 */
export async function getUserRoles(keycloakUserId: string): Promise<string[]> {
  try {
    const headers = await getAdminHeaders();
    const response = await keycloakClient.get(
      `/users/${keycloakUserId}/role-mappings/realm`,
      { headers }
    );
    return (response.data || []).map((role: any) => role.name);
  } catch (error: any) {
    logger.error('Failed to get user roles from Keycloak:', error.message);
    return [];
  }
}

// ========================================
// 用户同步
// ========================================

/**
 * 将 Keycloak 用户同步到本地 users 表（upsert）
 */
export async function syncUserFromKeycloak(keycloakUser: any): Promise<any> {
  const sub = keycloakUser.sub;
  if (!sub) {
    throw { status: 400, message: '缺少 Keycloak 用户 ID', type: 'validation_error' };
  }

  // 获取用户的 realm roles
  let roles: string[] = [];
  try {
    roles = await getUserRoles(sub);
  } catch {
    // 获取角色失败不影响主流程
    logger.warn('Failed to fetch roles for user sync, defaulting to empty');
  }

  const isAdmin = roles.includes('admin');

  // 尝试更新已有用户
  const existingUser = await queryOne(`
    SELECT id, username, email FROM users WHERE keycloak_id = $1
  `, [sub]);

  if (existingUser) {
    // 更新已有用户信息
    await update(`
      UPDATE users
      SET username = $1,
          email = $2,
          display_name = $3,
          is_admin = $4,
          department = $5,
          position = $6,
          last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE keycloak_id = $7
    `, [
      keycloakUser.preferred_username || keycloakUser.username || existingUser.username,
      keycloakUser.email || existingUser.email,
      keycloakUser.given_name && keycloakUser.family_name
        ? `${keycloakUser.given_name}${keycloakUser.family_name}`
        : null,
      isAdmin,
      keycloakUser.department || null,
      keycloakUser.position || null,
      sub,
    ]);

    return {
      id: existingUser.id,
      username: keycloakUser.preferred_username || existingUser.username,
      email: keycloakUser.email || existingUser.email,
      isAdmin,
    };
  }

  // 新用户：插入本地数据库
  const user = await insert(`
    INSERT INTO users (
      id, username, email, display_name,
      is_admin, is_active, keycloak_id,
      department, position, employee_id
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3,
      $4, true, $5,
      $6, $7, $8
    )
    ON CONFLICT (username) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      is_admin = EXCLUDED.is_admin,
      keycloak_id = EXCLUDED.keycloak_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, username, email, display_name, is_admin
  `, [
    keycloakUser.preferred_username || keycloakUser.username || `kc_${sub.substring(0, 8)}`,
    keycloakUser.email || null,
    keycloakUser.given_name && keycloakUser.family_name
      ? `${keycloakUser.given_name}${keycloakUser.family_name}`
      : null,
    isAdmin,
    sub,
    keycloakUser.department || null,
    keycloakUser.position || null,
    keycloakUser.employee_id || null,
  ]);

  // 为新用户创建默认配额
  try {
    await queryOne(`
      INSERT INTO user_quotas (id, user_id, quota_type, daily_limit, hourly_limit, monthly_limit)
      VALUES (gen_random_uuid(), $1, 'default', 100000, 1000, 3000000)
      ON CONFLICT DO NOTHING
    `, [user.id]);

    await queryOne(`
      INSERT INTO user_quotas (id, user_id, quota_type, daily_limit, hourly_limit, monthly_limit)
      VALUES (gen_random_uuid(), $1, 'premium', 500000, 5000, 15000000)
      ON CONFLICT DO NOTHING
    `, [user.id]);
  } catch (error) {
    logger.warn('Failed to create default quotas for synced user:', error);
  }

  return user;
}

// ========================================
// 用户管理（Admin API）
// ========================================

/**
 * 在 Keycloak 中创建用户
 */
export async function createUserInKeycloak(userData: {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
}): Promise<string> {
  try {
    const headers = await getAdminHeaders();

    const payload: any = {
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      enabled: userData.enabled !== false,
      credentials: [
        {
          type: 'password',
          value: userData.password,
          temporary: true,
        },
      ],
    };

    if (userData.attributes) {
      payload.attributes = userData.attributes;
    }

    const response = await keycloakClient.post('/users', payload, { headers });

    // Keycloak 创建用户返回 201，Location header 包含用户 ID
    const location = response.headers['location'] as string | undefined;
    if (location) {
      const userId = location.split('/').pop()!;
      logger.info(`Keycloak user created: ${userData.username} (${userId})`);
      return userId;
    }

    throw { status: 502, message: 'Keycloak 创建用户后未返回用户 ID', type: 'external_service_error' };
  } catch (error: any) {
    if (error.response?.status === 409) {
      throw { status: 409, message: '用户名或邮箱已存在', type: 'conflict' };
    }
    logger.error('Failed to create user in Keycloak:', error.message);
    throw {
      status: 502,
      message: 'Keycloak 创建用户失败',
      type: 'external_service_error',
    };
  }
}

/**
 * 分配 Realm Role 给用户
 */
export async function assignUserRole(keycloakUserId: string, roleName: string): Promise<void> {
  try {
    const headers = await getAdminHeaders();

    // 先获取可用角色列表以确认角色存在
    const rolesResponse = await keycloakClient.get('/roles', { headers });
    const availableRoles = rolesResponse.data || [];
    const targetRole = availableRoles.find((r: any) => r.name === roleName);

    if (!targetRole) {
      throw { status: 404, message: `角色 "${roleName}" 不存在`, type: 'not_found' };
    }

    await keycloakClient.post(
      `/users/${keycloakUserId}/role-mappings/realm`,
      [targetRole],
      { headers }
    );

    logger.info(`Assigned role "${roleName}" to Keycloak user ${keycloakUserId}`);
  } catch (error: any) {
    if (error.status) throw error;
    logger.error('Failed to assign user role in Keycloak:', error.message);
    throw {
      status: 502,
      message: 'Keycloak 分配角色失败',
      type: 'external_service_error',
    };
  }
}

/**
 * 删除 Keycloak 用户
 */
export async function deleteUserInKeycloak(keycloakUserId: string): Promise<void> {
  try {
    const headers = await getAdminHeaders();
    await keycloakClient.delete(`/users/${keycloakUserId}`, { headers });
    logger.info(`Keycloak user deleted: ${keycloakUserId}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn(`Keycloak user not found for deletion: ${keycloakUserId}`);
      return;
    }
    logger.error('Failed to delete user in Keycloak:', error.message);
    throw {
      status: 502,
      message: 'Keycloak 删除用户失败',
      type: 'external_service_error',
    };
  }
}

/**
 * 获取 Keycloak 用户所属组
 */
export async function getUserGroups(keycloakUserId: string): Promise<any[]> {
  try {
    const headers = await getAdminHeaders();
    const response = await keycloakClient.get(`/users/${keycloakUserId}/groups`, { headers });
    return response.data || [];
  } catch (error: any) {
    logger.error('Failed to get user groups from Keycloak:', error.message);
    return [];
  }
}

// ========================================
// Token 端点操作
// ========================================

/**
 * 直接授权模式登录（用户名 + 密码）
 */
export async function directGrantLogin(username: string, password: string) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        username,
        password,
        scope: 'openid profile email',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      refreshExpiresIn: response.data.refresh_expires_in,
      tokenType: response.data.token_type,
      idToken: response.data.id_token,
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw { status: 401, message: '用户名或密码错误', type: 'unauthorized' };
    }
    if (error.response?.status === 400) {
      const errorDesc = error.response?.data?.error_description || '认证失败';
      throw { status: 401, message: errorDesc, type: 'unauthorized' };
    }
    logger.error('Keycloak direct grant login error:', error.message);
    throw {
      status: 502,
      message: '认证服务暂时不可用',
      type: 'external_service_error',
    };
  }
}

/**
 * 刷新 Keycloak Token
 */
export async function refreshKeycloakToken(refreshToken: string) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      refreshExpiresIn: response.data.refresh_expires_in,
      tokenType: response.data.token_type,
      idToken: response.data.id_token,
    };
  } catch (error: any) {
    if (error.response?.status === 400) {
      throw { status: 401, message: '刷新令牌无效或已过期，请重新登录', type: 'unauthorized' };
    }
    if (error.response?.status === 401) {
      throw { status: 401, message: '刷新令牌无效', type: 'unauthorized' };
    }
    logger.error('Keycloak refresh token error:', error.message);
    throw {
      status: 502,
      message: '认证服务暂时不可用',
      type: 'external_service_error',
    };
  }
}

/**
 * Keycloak 登出
 */
export async function keycloakLogout(refreshToken: string) {
  try {
    await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
      new URLSearchParams({
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );
  } catch (error: any) {
    logger.error('Keycloak logout error:', error.message);
    // 登出失败不抛异常，只记录日志
  }
}

// ========================================
// 配置信息
// ========================================

/**
 * 获取 Keycloak 公开配置
 */
export function getKeycloakConfig() {
  return {
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_CLIENT_ID,
    authUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
    tokenUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    logoutUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
    userinfoUrl: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  };
}
