package com.company.aiassistant.actions

import com.company.aiassistant.config.AIAssistantConfig
import com.company.aiassistant.service.AIService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.SelectionModel
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor

/**
 * AI Action 基类
 */
abstract class BaseAIAction(
    private val actionName: String
) : AnAction(actionName) {

    protected val aiService: AIService = ApplicationManager.getApplication().getService(AIService::class.java)
    protected val config: AIAssistantConfig = AIAssistantConfig.getInstance()

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: run {
            Messages.showWarningDialog("请先打开一个项目", "提示")
            return
        }

        val editor = e.dataContext.getData(com.intellij.openapi.actionSystem.CommonDataKeys.EDITOR)
        if (editor == null) {
            Messages.showWarningDialog("请先打开一个文件", "提示")
            return
        }

        val selectedText = editor.selectionModel.selectedText
        if (selectedText.isNullOrBlank()) {
            Messages.showWarningDialog("请先选择要处理的代码", "提示")
            return
        }

        if (!aiService.isConfigured()) {
            Messages.showWarningDialog(
                "请先配置 AI API（Tools -> AI Settings）",
                "未配置"
            )
            return
        }

        executeAction(project, editor, selectedText)
    }

    override fun update(e: AnActionEvent) {
        val editor = e.dataContext.getData(com.intellij.openapi.actionSystem.CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = editor != null &&
            !editor.selectionModel.selectedText.isNullOrBlank()
    }

    /**
     * 执行具体操作
     */
    protected abstract fun executeAction(project: Project, editor: Editor, selectedText: String)

    /**
     * 显示结果
     */
    protected fun showResult(project: Project, title: String, content: String) {
        ApplicationManager.getApplication().invokeLater {
            // 创建简单的对话框显示结果
            val dialog = Messages.showDialog(
                project,
                content,
                title,
                arrayOf("复制", "替换选中", "关闭"),
                2,
                Messages.getInformationIcon()
            )

            when (dialog) {
                0 -> copyToClipboard(content)
                1 -> replaceSelection(content)
            }
        }
    }

    /**
     * 复制到剪贴板
     */
    private fun copyToClipboard(content: String) {
        val clipboard = java.awt.Toolkit.getDefaultToolkit().systemClipboard
        clipboard.setContents(java.awt.datatransfer.StringSelection(content), null)
    }

    /**
     * 替换选中内容
     */
    private fun replaceSelection(content: String) {
        val editor = com.intellij.openapi.fileEditor.FileEditorManager.getInstance(
            com.intellij.openapi.project.ProjectManager.getInstance().openProjects.firstOrNull() ?: return
        ).selectedTextEditor ?: return

        WriteCommandAction.runWriteCommandAction(editor.project) {
            val selectionModel: SelectionModel = editor.selectionModel
            val document = editor.document
            document.replaceString(selectionModel.selectionStart, selectionModel.selectionEnd, content)
        }
    }

    /**
     * 异步执行 AI 操作
     */
    protected fun <T> executeAIRequest(
        project: Project,
        title: String,
        request: () -> T,
        onSuccess: (T) -> Unit
    ) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, true) {
            private var result: T? = null
            private var error: Throwable? = null

            override fun run(indicator: ProgressIndicator) {
                try {
                    indicator.text = "正在处理..."
                    result = request()
                } catch (e: Exception) {
                    error = e
                }
            }

            override fun onSuccess() {
                if (error != null) {
                    Messages.showErrorDialog("操作失败: ${error?.message}", title)
                } else if (result != null) {
                    onSuccess(result!!)
                }
            }
        })
    }
}
