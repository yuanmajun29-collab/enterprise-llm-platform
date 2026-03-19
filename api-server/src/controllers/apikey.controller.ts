import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, insert, update } from '../config/database';

// ========================================
// 类型定义
// ========================================

export interface CreateApiKeyInput {
  name?: string;
  description?: string;
  expiresAt?: string;
  ipWhitelist?: string[];
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
}

export interface ApiKeyRecord {
  id: string;
  key_prefix: string;
  name: string;
  description: string;
  is_active: boolean;
  last_used_at: string;
  expires_at: string;
  created_at: string;
  ip_whitelist: string[];
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
}

// ========================================
// API Key 管理
// ========================================

/**
 * 生成 API Key
 * 格式: cqfz_<32字符随机hex>（共37字符）
 * 返回完整 key（仅在创建时返回一次）
 */
function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(24); // 24 bytes = 48 hex chars
  const rawKey = `cqfz_${randomBytes.toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12);
  return { rawKey, keyHash, keyPrefix };
}

/**
 * 创建 API Key
 * 生成随机 Key，存储 key_hash 和 key_prefix，完整 Key 仅返回一次
 */
export async function createApiKey(userId: string, input: CreateApiKeyInput) {
  const {
    name,
    description,
    expiresAt,
    ipWhitelist,
    rateLimitPerHour = 60,
    rateLimitPerDay = 1000,
  } = input;

  // 检查用户 API Key 数量限制（最多 10 个活跃 Key）
  const activeCount = await queryOne<{ count: string }>(`
    SELECT COUNT(*) as count
    FROM api_keys
    WHERE user_id = $1 AND is_active = true AND deleted_at IS NULL
  `, [userId]);

  if (activeCount && parseInt(activeCount.count) >= 10) {
    throw {
      status: 400,
      message: '已达 API Key 数量上限（最多 10 个活跃 Key）',
      type: 'validation_error',
      code: 'APIKEY_001',
    };
  }

  // 生成 API Key
  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  // 写入数据库
  const record = await insert<ApiKeyRecord & { user_id: string }>(`
    INSERT INTO api_keys (id, key_hash, key_prefix, user_id, name, description, expires_at, ip_whitelist, rate_limit_per_hour, rate_limit_per_day)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, key_prefix, name, description, is_active, last_used_at, expires_at, created_at, ip_whitelist, rate_limit_per_hour, rate_limit_per_day, user_id
  `, [
    uuidv4(),
    keyHash,
    keyPrefix,
    userId,
    name || `API Key ${new Date().toISOString().split('T')[0]}`,
    description || null,
    expiresAt ? new Date(expiresAt).toISOString() : null,
    ipWhitelist && ipWhitelist.length > 0 ? ipWhitelist : null,
    rateLimitPerHour,
    rateLimitPerDay,
  ]);

  return {
    id: record.id,
    key: rawKey, // 完整 Key 仅返回一次
    keyPrefix: record.key_prefix,
    name: record.name,
    description: record.description,
    isActive: record.is_active,
    expiresAt: record.expires_at,
    createdAt: record.created_at,
    ipWhitelist: record.ip_whitelist,
    rateLimitPerHour: record.rate_limit_per_hour,
    rateLimitPerDay: record.rate_limit_per_day,
  };
}

/**
 * 列出用户的所有 API Key
 * 只返回 key_prefix，不返回完整 key
 */
export async function listApiKeys(userId: string) {
  const keys = await query<ApiKeyRecord>(`
    SELECT id, key_prefix, name, description, is_active, last_used_at, expires_at, created_at, ip_whitelist, rate_limit_per_hour, rate_limit_per_day
    FROM api_keys
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
  `, [userId]);

  return {
    data: keys.map((k) => ({
      id: k.id,
      keyPrefix: k.key_prefix,
      name: k.name,
      description: k.description,
      isActive: k.is_active,
      lastUsedAt: k.last_used_at,
      expiresAt: k.expires_at,
      createdAt: k.created_at,
      ipWhitelist: k.ip_whitelist,
      rateLimitPerHour: k.rate_limit_per_hour,
      rateLimitPerDay: k.rate_limit_per_day,
    })),
  };
}

/**
 * 撤销 API Key（软删除）
 */
export async function revokeApiKey(userId: string, keyId: string) {
  // 验证 Key 属于当前用户
  const existing = await queryOne<{ id: string }>(`
    SELECT id FROM api_keys
    WHERE id = $1 AND user_id = $2 AND is_active = true AND deleted_at IS NULL
  `, [keyId, userId]);

  if (!existing) {
    throw {
      status: 404,
      message: 'API Key 不存在、已被撤销或无权操作',
      type: 'not_found',
      code: 'APIKEY_002',
    };
  }

  await update(`
    UPDATE api_keys
    SET is_active = false, deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [keyId]);

  return { message: 'API Key 已撤销', id: keyId };
}

/**
 * 获取 API Key 详情
 */
export async function getApiKeyInfo(userId: string, keyId: string) {
  const key = await queryOne<ApiKeyRecord & { user_id: string }>(`
    SELECT id, key_prefix, name, description, is_active, last_used_at, expires_at, created_at, ip_whitelist, rate_limit_per_hour, rate_limit_per_day, user_id
    FROM api_keys
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `, [keyId, userId]);

  if (!key) {
    throw {
      status: 404,
      message: 'API Key 不存在或无权访问',
      type: 'not_found',
      code: 'APIKEY_003',
    };
  }

  return {
    id: key.id,
    keyPrefix: key.key_prefix,
    name: key.name,
    description: key.description,
    isActive: key.is_active,
    lastUsedAt: key.last_used_at,
    expiresAt: key.expires_at,
    createdAt: key.created_at,
    ipWhitelist: key.ip_whitelist,
    rateLimitPerHour: key.rate_limit_per_hour,
    rateLimitPerDay: key.rate_limit_per_day,
  };
}
