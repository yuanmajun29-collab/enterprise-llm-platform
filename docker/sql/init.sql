-- 企业大模型平台数据库初始化脚本
-- 创建时间: 2026-03-11

-- ========================================
-- 扩展和基础设置
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- 用户和权限表
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(200),
    department VARCHAR(100),
    position VARCHAR(100),
    employee_id VARCHAR(50) UNIQUE,
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    UNIQUE(user_id, role_name)
);

-- ========================================
-- 配额和使用表
-- ========================================
CREATE TABLE IF NOT EXISTS user_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quota_type VARCHAR(50) NOT NULL, -- 'tokens_per_day', 'calls_per_hour', 'tokens_per_month'
    daily_limit INTEGER DEFAULT 0,
    hourly_limit INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, quota_type)
);

CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    request_type VARCHAR(50) NOT NULL, -- 'chat', 'completion', 'embedding'
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    duration_seconds DECIMAL(10, 3),
    status VARCHAR(50) NOT NULL, -- 'success', 'error', 'timeout'
    error_message TEXT,
    request_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 每日使用汇总表
CREATE TABLE IF NOT EXISTS daily_usage_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_tokens INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    average_duration_seconds DECIMAL(10, 3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- ========================================
-- 模型管理表
-- ========================================
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200),
    description TEXT,
    provider VARCHAR(50), -- 'qwen', 'deepseek', 'llama'
    model_path VARCHAR(500),
    version VARCHAR(50),
    parameters INTEGER, -- 模型参数量 (7B, 13B, 32B, 72B)
    context_length INTEGER DEFAULT 4096,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    cost_per_1k_tokens DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 模型权限表
CREATE TABLE IF NOT EXISTS model_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department VARCHAR(100),
    access_type VARCHAR(50) NOT NULL, -- 'read', 'fine-tune', 'deploy'
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(model_id, user_id, access_type)
);

-- ========================================
-- API 密钥表
-- ========================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    ip_whitelist TEXT[], -- 允许的IP地址列表
    rate_limit_per_hour INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 1000
);

-- ========================================
-- 会话和上下文表
-- ========================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    context_length INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'system', 'user', 'assistant'
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversation_id, order_index)
);

-- ========================================
-- 审计日志表
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(50) NOT NULL, -- 'success', 'failure'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 敏感词过滤表
-- ========================================
CREATE TABLE IF NOT EXISTS sensitive_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern VARCHAR(500) NOT NULL,
    pattern_type VARCHAR(50) NOT NULL, -- 'regex', 'keyword', 'phrase'
    severity VARCHAR(50) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    category VARCHAR(100), -- 'phone', 'email', 'password', 'token', 'api_key'
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 索引创建
-- ========================================

-- 用户表索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_is_active ON users(is_active);

-- 使用记录表索引
CREATE INDEX idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX idx_usage_records_model_name ON usage_records(model_name);
CREATE INDEX idx_usage_records_status ON usage_records(status);

-- 每日汇总索引
CREATE INDEX idx_daily_usage_user_id ON daily_usage_summary(user_id);
CREATE INDEX idx_daily_usage_date ON daily_usage_summary(date);

-- API 密钥索引
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- 会话表索引
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);

-- 审计日志索引
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ========================================
-- 触发器函数
-- ========================================

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_quotas_updated_at BEFORE UPDATE ON user_quotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_usage_updated_at BEFORE UPDATE ON daily_usage_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 初始数据
-- ========================================

-- 插入默认模型配置
INSERT INTO models (name, display_name, description, provider, parameters, context_length, cost_per_1k_tokens) VALUES
    ('Qwen-72B-Chat', 'Qwen 72B Chat', '通义千问 720亿参数对话模型', 'qwen', 72000000000, 32768, 0.005),
    ('Qwen-14B-Chat', 'Qwen 14B Chat', '通义千问 140亿参数对话模型', 'qwen', 14000000000, 16384, 0.002),
    ('DeepSeek-Coder-33B', 'DeepSeek Coder 33B', 'DeepSeek 代码专用模型', 'deepseek', 33000000000, 16384, 0.003),
    ('Llama-3-70B-Instruct', 'Llama 3 70B', 'Meta Llama 3 指令微调模型', 'llama', 70000000000, 8192, 0.004),
    ('BGE-Embedding-ZH', 'BGE 中文 Embedding', '中文文本嵌入模型', 'bge', 750000000, 512, 0.0001)
ON CONFLICT (name) DO NOTHING;

-- 插入默认敏感词模式
INSERT INTO sensitive_patterns (pattern, pattern_type, severity, category, description) VALUES
    -- 电话号码
    ('1[3-9]\d{9}', 'regex', 'medium', 'phone', '中国大陆手机号'),
    ('\d{3,4}-\d{7,8}', 'regex', 'medium', 'phone', '固定电话'),
    -- 邮箱
    ('\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'regex', 'medium', 'email', '邮箱地址'),
    -- API 密钥模式
    ('sk-[a-zA-Z0-9]{32,}', 'regex', 'high', 'api_key', 'OpenAI API Key'),
    ('Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'regex', 'high', 'api_key', 'Bearer Token'),
    -- 密码相关
    ('password\s*[:=]\s*[^\s]+', 'regex', 'high', 'password', '密码字段'),
    ('passwd\s*[:=]\s*[^\s]+', 'regex', 'high', 'password', '密码字段（旧式）'),
    -- 数据库连接
    ('mongodb://[^\s]+', 'regex', 'high', 'database', 'MongoDB连接字符串'),
    ('postgres://[^\s]+', 'regex', 'high', 'database', 'PostgreSQL连接字符串'),
    ('mysql://[^\s]+', 'regex', 'high', 'database', 'MySQL连接字符串'),
    -- 证书密钥
    ('-----BEGIN (RSA |PRIVATE KEY|CERTIFICATE)-----', 'regex', 'critical', 'certificate', '证书/私钥'),
    -- JWT Token
    ('eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+', 'regex', 'high', 'jwt', 'JWT Token')
ON CONFLICT DO NOTHING;

-- ========================================
-- 视图创建
-- ========================================

-- 用户使用统计视图
CREATE OR REPLACE VIEW user_usage_stats AS
SELECT
    u.id AS user_id,
    u.username,
    u.display_name,
    u.department,
    COALESCE(SUM(ur.total_tokens), 0) AS total_tokens_used,
    COALESCE(SUM(ur.total_requests), 0) AS total_requests,
    COALESCE(AVG(ur.duration_seconds), 0) AS avg_duration,
    MAX(ur.created_at) AS last_request_at
FROM users u
LEFT JOIN usage_records ur ON u.id = ur.user_id
WHERE u.is_active = true
GROUP BY u.id, u.username, u.display_name, u.department;

-- 模型使用统计视图
CREATE OR REPLACE VIEW model_usage_stats AS
SELECT
    m.id AS model_id,
    m.name,
    m.display_name,
    m.provider,
    COALESCE(SUM(ur.total_tokens), 0) AS total_tokens_used,
    COALESCE(SUM(ur.total_requests), 0) AS total_requests,
    COALESCE(AVG(ur.duration_seconds), 0) AS avg_duration,
    COALESCE(SUM(ur.prompt_tokens), 0) AS total_prompt_tokens,
    COALESCE(SUM(ur.completion_tokens), 0) AS total_completion_tokens
FROM models m
LEFT JOIN usage_records ur ON m.name = ur.model_name
WHERE m.is_active = true
GROUP BY m.id, m.name, m.display_name, m.provider;

-- 部门使用统计视图
CREATE OR REPLACE VIEW department_usage_stats AS
SELECT
    u.department,
    COUNT(DISTINCT u.id) AS active_users,
    COALESCE(SUM(ur.total_tokens), 0) AS total_tokens_used,
    COALESCE(SUM(ur.total_requests), 0) AS total_requests,
    COALESCE(AVG(ur.duration_seconds), 0) AS avg_duration
FROM users u
LEFT JOIN usage_records ur ON u.id = ur.user_id
WHERE u.is_active = true AND u.department IS NOT NULL
GROUP BY u.department
ORDER BY total_tokens_used DESC;

-- 今日使用统计
CREATE OR REPLACE VIEW today_usage_summary AS
SELECT
    COUNT(DISTINCT user_id) AS active_users_today,
    SUM(total_tokens) AS total_tokens_today,
    SUM(total_requests) AS total_requests_today,
    SUM(successful_requests) AS successful_requests_today,
    SUM(failed_requests) AS failed_requests_today
FROM daily_usage_summary
WHERE date = CURRENT_DATE;

-- ========================================
-- 存储过程
-- ========================================

-- 更新每日使用汇总
CREATE OR REPLACE FUNCTION update_daily_usage_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_usage_summary (user_id, date, total_tokens, total_requests, successful_requests, failed_requests, average_duration)
    VALUES (
        NEW.user_id,
        CURRENT_DATE,
        NEW.total_tokens,
        1,
        CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END,
        CASE WHEN NEW.status != 'success' THEN 1 ELSE 0 END,
        NEW.duration_seconds
    )
    ON CONFLICT (user_id, date) DO UPDATE SET
        total_tokens = daily_usage_summary.total_tokens + EXCLUDED.total_tokens,
        total_requests = daily_usage_summary.total_requests + 1,
        successful_requests = daily_usage_summary.successful_requests + CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END,
        failed_requests = daily_usage_summary.failed_requests + CASE WHEN NEW.status != 'success' THEN 1 ELSE 0 END,
        average_duration = (
            daily_usage_summary.average_duration * daily_usage_summary.total_requests + EXCLUDED.duration_seconds
        ) / (daily_usage_summary.total_requests + 1),
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 usage_records 表创建触发器
CREATE TRIGGER trigger_update_daily_usage
AFTER INSERT ON usage_records
FOR EACH ROW
EXECUTE FUNCTION update_daily_usage_summary();

-- ========================================
-- 完成初始化
-- ========================================
