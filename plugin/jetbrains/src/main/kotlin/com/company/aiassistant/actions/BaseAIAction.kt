package com.company.aiassistant.actions

import com.company.aiassistant.config.AIAssistantSettings
import com.company.aiassistant.service.AIService
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.SelectionModel
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection

/**
 * AI Action 基类
 *
 * 提供通用的：
 * - 认证检查
 * - 选中文本获取
 * - 进度指示器
 * - 结果展示（Notification + 复制/替换）
 */
abstract class BaseAIAction(
    private val actionName: String,
    private val actionDescription: String = actionName
) : AnAction(actionName, actionDescription, null) {

    protected val aiService: AIService = AIService.getInstance()
    protected val settings: AIAssistantSettings = AIAssistantSettings.getInstance()

    final override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: run {
            showWarning("请先打开一个项目")
            return
        }

        val editor = e.dataContext.getData(CommonDataKeys.EDITOR)
        if (editor == null) {
            showWarning("请先打开一个文件")
            return
        }

        val selectedText = editor.selectionModel.selectedText
        if (selectedText.isNullOrBlank()) {
            showWarning("请先选择要处理的代码")
            return
        }

        if (!aiService.isConfigured()) {
            showWarning("请先配置 AI API（Settings → Tools → AI Assistant）")
            return
        }

        executeAction(project, editor, selectedText)
    }

    override fun update(e: AnActionEvent) {
        val editor = e.dataContext.getData(CommonDataKeys.EDITOR)
        val hasSelection = editor?.selectionModel?.selectedText?.isNotBlank() == true
        e.presentation.isEnabledAndVisible = editor != null && hasSelection
    }

    /**
     * 子类实现具体的 AI 操作
     */
    protected abstract fun executeAction(project: Project, editor: Editor, selectedText: String)

    /**
     * 异步执行 AI 请求，自动显示进度和结果
     */
    protected fun executeAIRequest(
        project: Project,
        title: String,
        request: () -> String
    ) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, true) {
            private var result: String? = null
            private var error: Throwable? = null

            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                indicator.text = "$title 中..."
                try {
                    result = request()
                } catch (e: Exception) {
                    if (e.cause?.message?.contains("cancelled") == true) return
                    error = e
                }
            }

            override fun onSuccess() {
                if (error != null) {
                    Messages.showErrorDialog(project, "操作失败: ${error?.message}", title)
                } else if (result != null) {
                    showResultDialog(project, title, result!!)
                }
            }
        })
    }

    /**
     * 显示结果对话框（支持复制和替换）
     */
    protected fun showResultDialog(project: Project, title: String, content: String) {
        // 同时发送 Notification
        showNotification(project, "$title 完成", "点击查看结果", NotificationType.INFORMATION)

        val dialogResult = Messages.showDialog(
            project,
            content,
            title,
            arrayOf("复制到剪贴板", "替换选中代码", "关闭"),
            2,
            Messages.getInformationIcon()
        )

        when (dialogResult) {
            0 -> copyToClipboard(content)
            1 -> replaceSelection(project, content)
        }
    }

    /**
     * 使用 Notification 显示结果（轻量级）
     */
    protected fun showNotification(project: Project?, title: String, content: String, type: NotificationType) {
        ApplicationManager.getApplication().invokeLater {
            try {
                NotificationGroupManager.getInstance()
                    .getNotificationGroup("AI Assistant Notifications")
                    .createNotification(title, content, type)
                    .notify(project)
            } catch (e: Exception) {
                // Notification group 可能未注册，忽略
            }
        }
    }

    private fun copyToClipboard(content: String) {
        val clipboard = Toolkit.getDefaultToolkit().systemClipboard
        clipboard.setContents(StringSelection(content), null)
        Messages.showInfoMessage("已复制到剪贴板", "AI 助手")
    }

    private fun replaceSelection(project: Project, content: String) {
        val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return
        WriteCommandAction.runWriteCommandAction(project, "AI 替换代码", null, {
            val selectionModel: SelectionModel = editor.selectionModel
            val document = editor.document
            document.replaceString(selectionModel.selectionStart, selectionModel.selectionEnd, content)
        })
    }

    private fun showWarning(message: String) {
        Messages.showWarningMessage(message, "AI 助手")
    }
}
