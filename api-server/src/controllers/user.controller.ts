import { query, queryOne } from '../config/database';
import { cacheDelete } from '../config/redis';

/**
 * 获取用户信息
 */
export async function getUserInfo(userId: string) {
  const user = await queryOne(`
    SELECT id, username, email, display_name, department, position, employee_id,
           avatar_url, is_active, is_admin, created_at, last_login_at
    FROM users
    WHERE id = $1
  `, [userId]);

  if (!user) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  return user;
}

/**
 * 更新用户信息
 */
export async function updateUser(userId: string, updates: any) {
  const { displayName, department, position, avatarUrl } = updates;
  const updated = await queryOne(`
    UPDATE users
    SET display_name = COALESCE($2, display_name),
        department = COALESCE($3, department),
        position = COALESCE($4, position),
        avatar_url = COALESCE($5, avatar_url),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, username, email, display_name, department, position, avatar_url, is_active, is_admin, updated_at
  `, [userId, displayName, department, position, avatarUrl]);

  if (!updated) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  return updated;
}

/**
 * 获取用户配额
 */
export async function getUserQuota(userId: string) {
  const quotas = await query(`
    SELECT quota_type, daily_limit, hourly_limit, monthly_limit
    FROM user_quotas
    WHERE user_id = $1
  `, [userId]);

  // 获取今日使用量
  const todayUsage = await queryOne(`
    SELECT total_tokens, total_requests
    FROM daily_usage_summary
    WHERE user_id = $1 AND date = CURRENT_DATE
  `, [userId]);

  // 获取本月使用量
  const monthUsage = await queryOne(`
    SELECT COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(total_requests), 0) as total_requests
    FROM daily_usage_summary
    WHERE user_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
  `, [userId]);

  return {
    userId,
    quotas: quotas.reduce((acc: any, q: any) => {
      acc[q.quota_type] = {
        dailyLimit: q.daily_limit,
        hourlyLimit: q.hourly_limit,
        monthlyLimit: q.monthly_limit,
      };
      return acc;
    }, {}),
    usage: {
      today: {
        tokens: parseInt(todayUsage?.total_tokens || '0'),
        requests: parseInt(todayUsage?.total_requests || '0'),
      },
      month: {
        tokens: parseInt(monthUsage?.total_tokens || '0'),
        requests: parseInt(monthUsage?.total_requests || '0'),
      },
    },
  };
}

/**
 * 获取用户列表（管理员）
 */
export async function listUsers(options: any) {
  const { page = 1, pageSize = 20, search, department, isActive, sortBy = 'created_at', sortOrder = 'DESC' } = options;

  const offset = (page - 1) * pageSize;
  const allowedSortColumns = ['username', 'email', 'department', 'created_at', 'last_login_at'];
  const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let whereClause = 'WHERE deleted_at IS NULL';
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR display_name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (department) {
    whereClause += ` AND department = $${paramIndex}`;
    params.push(department);
    paramIndex++;
  }

  if (isActive !== undefined && isActive !== null) {
    whereClause += ` AND is_active = $${paramIndex}`;
    params.push(isActive);
    paramIndex++;
  }

  // 查询总数
  const countResult = await queryOne(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
  const total = parseInt(countResult?.total || '0');

  // 查询用户列表
  const users = await query(`
    SELECT id, username, email, display_name, department, position, employee_id,
           is_active, is_admin, created_at, last_login_at
    FROM users
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, pageSize, offset]);

  return {
    data: users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 管理员更新用户状态
 */
export async function updateUserStatus(adminUserId: string, targetUserId: string, isActive: boolean) {
  if (adminUserId === targetUserId) {
    throw { status: 400, message: '不能修改自己的状态', type: 'validation_error' };
  }

  const updated = await queryOne(`
    UPDATE users
    SET is_active = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, username, is_active, updated_at
  `, [targetUserId, isActive]);

  if (!updated) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  // 禁用用户时清除其 token
  if (!isActive) {
    await cacheDelete(`auth:token:${targetUserId}`);
    await cacheDelete(`auth:refresh:${targetUserId}`);
  }

  return updated;
}

/**
 * 管理员设置用户角色
 */
export async function setUserRole(adminUserId: string, targetUserId: string, isAdmin: boolean) {
  if (adminUserId === targetUserId) {
    throw { status: 400, message: '不能修改自己的角色', type: 'validation_error' };
  }

  const updated = await queryOne(`
    UPDATE users
    SET is_admin = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, username, is_admin, updated_at
  `, [targetUserId, isAdmin]);

  if (!updated) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  return updated;
}

/**
 * 管理员设置用户配额
 */
export async function setUserQuota(_adminUserId: string, targetUserId: string, quotaType: string, limits: any) {
  const { dailyLimit, hourlyLimit, monthlyLimit } = limits;

  const result = await queryOne(`
    INSERT INTO user_quotas (id, user_id, quota_type, daily_limit, hourly_limit, monthly_limit)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, quota_type) DO UPDATE SET
      daily_limit = EXCLUDED.daily_limit,
      hourly_limit = EXCLUDED.hourly_limit,
      monthly_limit = EXCLUDED.monthly_limit,
      updated_at = CURRENT_TIMESTAMP
    RETURNING user_id, quota_type, daily_limit, hourly_limit, monthly_limit, updated_at
  `, [
    require('uuid').v4(),
    targetUserId,
    quotaType,
    dailyLimit || 0,
    hourlyLimit || 0,
    monthlyLimit || 0,
  ]);

  return result;
}

/**
 * 删除用户（软删除）
 */
export async function deleteUser(adminUserId: string, targetUserId: string) {
  if (adminUserId === targetUserId) {
    throw { status: 400, message: '不能删除自己', type: 'validation_error' };
  }

  const result = await queryOne(`
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP, is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, username
  `, [targetUserId]);

  if (!result) {
    throw { status: 404, message: '用户不存在', type: 'not_found' };
  }

  // 清除 token
  await cacheDelete(`auth:token:${targetUserId}`);
  await cacheDelete(`auth:refresh:${targetUserId}`);

  return { message: `用户 ${result.username} 已删除` };
}

/**
 * 获取所有部门列表
 */
export async function getDepartments() {
  const result = await query(`
    SELECT DISTINCT department
    FROM users
    WHERE department IS NOT NULL AND deleted_at IS NULL AND is_active = true
    ORDER BY department
  `);

  return result.map((r: any) => r.department);
}
