package com.company.aiassistant.config

/**
 * AI 助手配置数据类
 *
 * @property apiUrl        API 服务地址
 * @property authToken     认证令牌
 * @property defaultModel  默认模型
 * @property maxTokens     最大生成 Token 数
 * @property temperature   生成温度
 */
data class AIConfig(
    val apiUrl: String = "http://localhost:8443",
    val authToken: String = "",
    val defaultModel: String = "Qwen-72B-Chat",
    val maxTokens: Int = 2000,
    val temperature: Double = 0.7
)
