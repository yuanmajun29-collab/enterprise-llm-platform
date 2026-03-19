package com.company.aiassistant.config

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.JBUI
import java.awt.Dimension
import javax.swing.*

/**
 * 持久化配置状态
 */
@State(
    name = "AIAssistantSettings",
    storages = [Storage("AIAssistantSettings.xml")]
)
class AIAssistantSettings : PersistentStateComponent<AIAssistantSettings.State> {

    data class State(
        var apiUrl: String = "http://localhost:8443",
        var authToken: String = "",
        var defaultModel: String = "Qwen-72B-Chat",
        var maxTokens: Int = 2000,
        var temperature: Double = 0.7,
        var enableStream: Boolean = true,
        var enableAutocomplete: Boolean = true,
        var systemPrompt: String = "你是一个专业的编程助手，擅长代码编写、重构和问题解决。"
    )

    private var state = State()

    companion object {
        @JvmStatic
        fun getInstance(): AIAssistantSettings {
            return ApplicationManager.getApplication().getService(AIAssistantSettings::class.java)
        }
    }

    override fun getState(): State = state

    override fun loadState(state: State) {
        this.state = state
    }

    // 便捷访问方法
    val apiUrl: String get() = state.apiUrl
    val authToken: String get() = state.authToken
    val defaultModel: String get() = state.defaultModel
    val maxTokens: Int get() = state.maxTokens
    val temperature: Double get() = state.temperature
    val enableStream: Boolean get() = state.enableStream
    val enableAutocomplete: Boolean get() = state.enableAutocomplete
    val systemPrompt: String get() = state.systemPrompt

    fun toAIConfig(): AIConfig = AIConfig(
        apiUrl = apiUrl,
        authToken = authToken,
        defaultModel = defaultModel,
        maxTokens = maxTokens,
        temperature = temperature
    )
}

/**
 * 设置界面
 */
class AIConfigurable : Configurable {

    private val settings: AIAssistantSettings = AIAssistantSettings.getInstance()

    // UI 组件
    private val apiUrlField = JBTextField(settings.apiUrl).apply { preferredSize = Dimension(400, 30) }
    private val authTokenField = JBPasswordField(settings.authToken).apply { preferredSize = Dimension(400, 30) }
    private val modelField = JBTextField(settings.defaultModel).apply { preferredSize = Dimension(400, 30) }

    private val maxTokensSpinner = JSpinner(SpinnerNumberModel(settings.maxTokens, 1, 8192, 100)).apply {
        preferredSize = Dimension(200, 30)
    }
    private val temperatureSpinner = JSpinner(SpinnerNumberModel(settings.temperature, 0.0, 2.0, 0.1)).apply {
        preferredSize = Dimension(200, 30)
        (editor as JSpinner.NumberEditor).stepSize = 0.1
    }

    private val enableStreamCheckBox = JBCheckBox("启用流式响应", settings.enableStream)
    private val enableAutocompleteCheckBox = JBCheckBox("启用代码自动补全", settings.enableAutocomplete)

    private val systemPromptArea = JTextArea(settings.systemPrompt, 4, 40).apply {
        lineWrap = true
        wrapStyleWord = true
        font = JBUI.Fonts.label()
    }

    override fun getDisplayName(): String = "AI Assistant"

    override fun createComponent(): JComponent {
        return FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("API 地址:"), apiUrlField)
            .addSeparator()
            .addLabeledComponent(JBLabel("认证令牌:"), authTokenField)
            .addSeparator()
            .addLabeledComponent(JBLabel("默认模型:"), modelField)
            .addSeparator()
            .addLabeledComponent(JBLabel("最大 Tokens:"), maxTokensSpinner)
            .addSeparator()
            .addLabeledComponent(JBLabel("温度 (0-2):"), temperatureSpinner)
            .addSeparator()
            .addComponent(enableStreamCheckBox)
            .addComponent(enableAutocompleteCheckBox)
            .addSeparator()
            .addLabeledComponent(JBLabel("系统提示词:"), JScrollPane(systemPromptArea))
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    override fun isModified(): Boolean {
        return apiUrlField.text != settings.apiUrl ||
                String(authTokenField.password) != settings.authToken ||
                modelField.text != settings.defaultModel ||
                maxTokensSpinner.value != settings.maxTokens ||
                temperatureSpinner.value != settings.temperature ||
                enableStreamCheckBox.isSelected != settings.enableStream ||
                enableAutocompleteCheckBox.isSelected != settings.enableAutocomplete ||
                systemPromptArea.text != settings.systemPrompt
    }

    @Throws(ConfigurationException::class)
    override fun apply() {
        val url = apiUrlField.text.trim()
        if (url.isEmpty()) {
            throw ConfigurationException("API 地址不能为空")
        }

        val state = settings.state
        state.apiUrl = url
        state.authToken = String(authTokenField.password)
        state.defaultModel = modelField.text.trim()
        state.maxTokens = maxTokensSpinner.value as Int
        state.temperature = temperatureSpinner.value as Double
        state.enableStream = enableStreamCheckBox.isSelected
        state.enableAutocomplete = enableAutocompleteCheckBox.isSelected
        state.systemPrompt = systemPromptArea.text.trim()
    }

    override fun reset() {
        apiUrlField.text = settings.apiUrl
        authTokenField.text = settings.authToken
        modelField.text = settings.defaultModel
        maxTokensSpinner.value = settings.maxTokens
        temperatureSpinner.value = settings.temperature
        enableStreamCheckBox.isSelected = settings.enableStream
        enableAutocompleteCheckBox.isSelected = settings.enableAutocomplete
        systemPromptArea.text = settings.systemPrompt
    }
}
