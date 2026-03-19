package com.company.aiassistant.config

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

/**
 * AI 助手配置状态
 */
@State(
    name = "AIAssistantConfig",
    storages = [Storage("AIAssistantConfig.xml")]
)
data class AIAssistantConfig(
    var apiUrl: String = "https://api.company.com",
    var apiKey: String = "",
    var accessToken: String = "",
    var model: String = "Qwen-72B-Chat",
    var temperature: Double = 0.7,
    var maxTokens: Int = 2048,
    var enableStream: Boolean = true,
    var enableAutocomplete: Boolean = true,
    var autocompleteDebounce: Int = 300,
    var systemPrompt: String = "你是一个专业的编程助手，擅长代码编写、重构和问题解决。",
    var enableTelemetry: Boolean = false
) : PersistentStateComponent<AIAssistantConfig> {

    companion object {
        @JvmStatic
        fun getInstance(): AIAssistantConfig {
            return ApplicationManager.getApplication().getService(AIAssistantConfig::class.java)
                ?: AIAssistantConfig()
        }
    }

    override fun getState(): AIAssistantConfig {
        return this
    }

    override fun loadState(state: AIAssistantConfig) {
        apiUrl = state.apiUrl
        apiKey = state.apiKey
        accessToken = state.accessToken
        model = state.model
        temperature = state.temperature
        maxTokens = state.maxTokens
        enableStream = state.enableStream
        enableAutocomplete = state.enableAutocomplete
        autocompleteDebounce = state.autocompleteDebounce
        systemPrompt = state.systemPrompt
        enableTelemetry = state.enableTelemetry
    }
}
