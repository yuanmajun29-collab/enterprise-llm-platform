package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * AI 重构代码 Action
 *
 * 获取选中代码 → "请重构以下代码" → 显示建议
 */
class RefactorCodeAction : BaseAIAction("AI 重构代码", "使用 AI 重构选中的代码") {

    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "重构代码") {
            aiService.refactorCode(selectedText, language).get()
        }
    }
}
