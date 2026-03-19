package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * AI 查找问题 Action
 *
 * 获取选中代码 → "查找以下代码中的 Bug" → 显示结果
 */
class FindBugsAction : BaseAIAction("AI 查找问题", "使用 AI 查找选中代码中的 Bug") {

    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "查找代码问题") {
            aiService.findBugs(selectedText, language).get()
        }
    }
}
