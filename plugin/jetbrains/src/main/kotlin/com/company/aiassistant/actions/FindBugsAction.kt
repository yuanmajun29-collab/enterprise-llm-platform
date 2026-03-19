package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * 查找问题 Action
 */
class FindBugsAction : BaseAIAction("AI 查找问题") {
    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "查找代码问题", {
            aiService.findBugs(selectedText, language).get()
        }) { result ->
            showResult(project, "代码问题分析", result)
        }
    }
}
