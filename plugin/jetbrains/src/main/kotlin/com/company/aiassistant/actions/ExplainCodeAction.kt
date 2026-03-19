package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * AI 解释代码 Action
 *
 * 获取选中代码 → 调用 AI explainCode → 显示结果
 */
class ExplainCodeAction : BaseAIAction("AI 解释代码", "使用 AI 解释选中的代码") {

    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "解释代码") {
            aiService.explainCode(selectedText, language).get()
        }
    }
}
