package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * AI 优化代码 Action
 *
 * 获取选中代码 → "优化以下代码的性能" → 显示结果
 */
class OptimizeCodeAction : BaseAIAction("AI 优化代码", "使用 AI 优化选中代码的性能") {

    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "优化代码") {
            aiService.optimizeCode(selectedText, language).get()
        }
    }
}
