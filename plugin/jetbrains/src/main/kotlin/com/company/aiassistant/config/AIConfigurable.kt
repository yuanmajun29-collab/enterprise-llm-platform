package com.company.aiassistant.config

import com.company.aiassistant.service.AIService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.UIUtil
import javax.swing.*

/**
 * AI 助手配置界面
 */
class AIConfigurable : Configurable {

    private val config: AIAssistantConfig = AIAssistantConfig.getInstance()
    private val aiService: AIService = ApplicationManager.getApplication().getService(AIService::class.java)

    private val apiUrlField = JBTextField(config.apiUrl)
    private val apiKeyField = JBPasswordField(config.apiKey)
    private val accessTokenField = JBPasswordField(config.accessToken)
    private val modelField = JBTextField(config.model)

    private val temperatureField = javax.swing.JSpinner(javax.swing.SpinnerNumberModel(config.temperature, 0.0, 2.0, 0.1))
    private val maxTokensField = javax.swing.JSpinner(javax.swing.SpinnerNumberModel(config.maxTokens, 1, 8192, 100))

    private val enableStreamCheckBox = JBCheckBox("启用流式响应", config.enableStream)
    private val enableAutocompleteCheckBox = JBCheckBox("启用代码补全", config.enableAutocomplete)
    private val autocompleteDebounceField = javax.swing.JSpinner(javax.swing.SpinnerNumberModel(config.autocompleteDebounce, 100, 2000, 50))
    private val enableTelemetryCheckBox = JBCheckBox("启用遥测数据收集", config.enableTelemetry)

    private val systemPromptArea = JBTextArea(config.systemPrompt, 5, 50).apply {
        lineWrap = true
        wrapStyleWord = true
    }

    private val testConnectionButton = JButton("测试连接")

    override fun getDisplayName(): String = "AI Assistant"

    override fun createComponent(): JComponent {
        return FormBuilder.createFormBuilder()
            .addLabeledComponent("API 地址:", apiUrlField)
            .addVerticalGap(8)
            .addLabeledComponent("API 密钥:", apiKeyField)
            .addVerticalGap(8)
            .addLabeledComponent("访问令牌 (OAuth):", accessTokenField)
            .addVerticalGap(8)
            .addLabeledComponent("默认模型:", modelField)
            .addVerticalGap(8)
            .addLabeledComponent("温度 (0-2):", temperatureField)
            .addVerticalGap(8)
            .addLabeledComponent("最大 Tokens:", maxTokensField)
            .addVerticalGap(8)
            .addComponent(enableStreamCheckBox)
            .addVerticalGap(8)
            .addComponent(enableAutocompleteCheckBox)
            .addVerticalGap(8)
            .addLabeledComponent("补全防抖 (ms):", autocompleteDebounceField)
            .addVerticalGap(8)
            .addComponent(enableTelemetryCheckBox)
            .addVerticalGap(8)
            .addLabeledComponent("系统提示词:", JScrollPane(systemPromptArea))
            .addVerticalGap(8)
            .addComponent(testConnectionButton)
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    override fun isModified(): Boolean {
        return apiUrlField.text != config.apiUrl ||
            String(apiKeyField.password) != config.apiKey ||
            String(accessTokenField.password) != config.accessToken ||
            modelField.text != config.model ||
            temperatureField.value != config.temperature ||
            maxTokensField.value != config.maxTokens ||
            enableStreamCheckBox.isSelected != config.enableStream ||
            enableAutocompleteCheckBox.isSelected != config.enableAutocomplete ||
            autocompleteDebounceField.value != config.autocompleteDebounce ||
            enableTelemetryCheckBox.isSelected != config.enableTelemetry ||
            systemPromptArea.text != config.systemPrompt
    }

    override fun apply() {
        config.apiUrl = apiUrlField.text.trim()
        config.apiKey = String(apiKeyField.password)
        config.accessToken = String(accessTokenField.password)
        config.model = modelField.text.trim()
        config.temperature = temperatureField.value as Double
        config.maxTokens = maxTokensField.value as Int
        config.enableStream = enableStreamCheckBox.isSelected
        config.enableAutocomplete = enableAutocompleteCheckBox.isSelected
        config.autocompleteDebounce = autocompleteDebounceField.value as Int
        config.enableTelemetry = enableTelemetryCheckBox.isSelected
        config.systemPrompt = systemPromptArea.text.trim()

        // 更新 AI 服务配置
        aiService.configure(
            apiUrl = config.apiUrl,
            apiKey = config.apiKey,
            accessToken = config.accessToken
        )
        aiService.setModel(config.model)
    }

    override fun reset() {
        apiUrlField.text = config.apiUrl
        apiKeyField.text = config.apiKey
        accessTokenField.text = config.accessToken
        modelField.text = config.model
        temperatureField.value = config.temperature
        maxTokensField.value = config.maxTokens
        enableStreamCheckBox.isSelected = config.enableStream
        enableAutocompleteCheckBox.isSelected = config.enableAutocomplete
        autocompleteDebounceField.value = config.autocompleteDebounce
        enableTelemetryCheckBox.isSelected = config.enableTelemetry
        systemPromptArea.text = config.systemPrompt
    }

    override fun disposeUIResources() {
        super.disposeUIResources()
    }

    init {
        testConnectionButton.addActionListener {
            testConnection()
        }
    }

    /**
     * 测试连接
     */
    private fun testConnection() {
        val apiUrl = apiUrlField.text.trim()
        val apiKey = String(apiKeyField.password)
        val accessToken = String(accessTokenField.password)

        if (apiUrl.isEmpty() || (apiKey.isEmpty() && accessToken.isEmpty())) {
            JOptionPane.showMessageDialog(
                null,
                "请填写 API 地址和认证信息",
                "配置错误",
                JOptionPane.ERROR_MESSAGE
            )
            return
        }

        // 临时配置服务
        aiService.configure(apiUrl, apiKey, accessToken)

        // 测试获取模型列表
        Thread {
            try {
                val models = aiService.getModels().get()
                SwingUtilities.invokeLater {
                    JOptionPane.showMessageDialog(
                        null,
                        "连接成功！\n可用模型: ${models.size} 个",
                        "测试成功",
                        JOptionPane.INFORMATION_MESSAGE
                    )
                }
            } catch (e: Exception) {
                SwingUtilities.invokeLater {
                    JOptionPane.showMessageDialog(
                        null,
                        "连接失败: ${e.message}",
                        "测试失败",
                        JOptionPane.ERROR_MESSAGE
                    )
                }
            }
        }.start()
    }
}
