-- 迁移 003: 补充 API Server 索引
-- 创建时间: 2026-03-19

-- ========================================
-- api_keys 补充索引
-- ========================================

-- 按 key_prefix 查询索引
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);

-- 按过期时间查询索引（用于定时清理过期 Key）
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at)
WHERE deleted_at IS NULL AND is_active = true;

-- 用户活跃 Key 联合索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys(user_id, is_active)
WHERE deleted_at IS NULL;

-- ========================================
-- audit_logs 补充索引
-- ========================================

-- 按资源类型和状态查询索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_status ON audit_logs(resource_type, status);

-- 按创建时间范围查询索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_range ON audit_logs(created_at DESC);

-- 按用户和动作查询索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action);

-- ========================================
-- usage_records 补充索引
// ========================================

-- 按用户和日期联合查询索引
CREATE INDEX IF NOT EXISTS idx_usage_records_user_date ON usage_records(user_id, created_at DESC);

-- 按模型和使用状态联合索引
CREATE INDEX IF NOT EXISTS idx_usage_records_model_status ON usage_records(model_name, status);

-- ========================================
-- conversations 补充索引
// ========================================

-- 按用户和归档状态查询
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived)
WHERE deleted_at IS NULL;

-- 按模型查询
CREATE INDEX IF NOT EXISTS idx_conversations_model_id ON conversations(model_id)
WHERE model_id IS NOT NULL AND deleted_at IS NULL;

-- ========================================
-- sensitive_patterns 补充索引
// ========================================

-- 按类型和活跃状态查询
CREATE INDEX IF NOT EXISTS idx_sensitive_patterns_active ON sensitive_patterns(is_active)
WHERE is_active = true;

-- 按严重级别查询
CREATE INDEX IF NOT EXISTS idx_sensitive_patterns_severity ON sensitive_patterns(severity, is_active);

-- ========================================
-- user_quotas 补充索引
// ========================================

-- 按配额类型查询
CREATE INDEX IF NOT EXISTS idx_user_quotas_type ON user_quotas(quota_type);
