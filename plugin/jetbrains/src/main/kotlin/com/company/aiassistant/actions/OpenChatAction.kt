package com.company.aiassistant.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager

/**
 * 打开聊天窗口 Action
 */
class OpenChatAction : AnAction("AI 对话", "打开 AI 对话面板", null) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        val toolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindow = toolWindowManager.getToolWindow("AI Assistant")

        toolWindow?.show {
            // 工具窗口已显示
        }
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}
