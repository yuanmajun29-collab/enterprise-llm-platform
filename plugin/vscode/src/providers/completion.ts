/**
 * Code Completion Provider
 * 代码补全提供者
 */

import * as vscode from 'vscode';
import { AIClient } from '../client/aiClient';
import { getConfigManager, ConfigKey } from '../client/config';
import { Debouncer } from '../utils/debounce';

/**
 * 补全项类型
 */
enum CompletionType {
    Suggestion = 0,
    Snippet = 1,
    Function = 2,
}

/**
 * 内联补全项
 */
class InlineCompletion implements vscode.InlineCompletionItem {
    readonly insertText: string;
    readonly range?: vscode.Range;
    readonly command?: vscode.Command;

    constructor(text: string, range?: vscode.Range) {
        this.insertText = text;
        this.range = range;
    }
}

/**
 * AI 代码补全提供者
 */
export class AICodeCompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: AIClient;
    private debouncer: Debouncer<string>;
    private currentCompletion: InlineCompletion | null = null;
    private isCompleting = false;

    constructor(client: AIClient) {
        this.client = client;
        this.debouncer = new Debouncer<string>(
            this.requestCompletion.bind(this),
            getConfigManager().getAutocompleteDebounce()
        );

        // 监听配置变化
        getConfigManager().onChange(ConfigKey.AUTOCOMPLETE_DEBOUNCE, (value) => {
            this.debouncer.setDelay(value as number);
        });
    }

    /**
     * 提供内联补全
     */
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        // 检查是否启用自动补全
        if (!getConfigManager().isAutocompleteEnabled()) {
            return { items: [] };
        }

        // 检查是否正在补全
        if (this.isCompleting) {
            if (this.currentCompletion) {
                return { items: [this.currentCompletion] };
            }
            return { items: [] };
        }

        // 获取当前行的文本
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character);

        // 过滤不需要补全的情况
        if (!this.shouldComplete(prefix)) {
            return { items: [] };
        }

        // 取消之前的请求
        this.debouncer.cancel();
        this.currentCompletion = null;

        // 调度新的补全请求
        const completionPromise = this.debouncer.schedule(prefix);

        // 等待补全结果
        try {
            const result = await Promise.race([
                completionPromise,
                new Promise<null>((resolve) => {
                    token.onCancellationRequested(() => resolve(null));
                }),
            ]);

            if (result) {
                this.currentCompletion = new InlineCompletion(result);
                return { items: [this.currentCompletion] };
            }
        } catch (error) {
            console.error('Completion error:', error);
        }

        return { items: [] };
    }

    /**
     * 检查是否应该触发补全
     */
    private shouldComplete(prefix: string): boolean {
        // 过滤空行
        if (!prefix.trim()) {
            return false;
        }

        // 过滤注释
        const trimmed = prefix.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
            return false;
        }

        // 过滤字符串字面量
        const lastQuote = Math.max(
            prefix.lastIndexOf('"'),
            prefix.lastIndexOf("'"),
            prefix.lastIndexOf('`')
        );
        if (lastQuote !== -1 && (lastQuote > prefix.lastIndexOf('\n') + 1)) {
            // 检查是否是闭合的引号
            const afterLastQuote = prefix.substring(lastQuote + 1);
            if (afterLastQuote.indexOf(prefix[lastQuote]) === -1) {
                return false;
            }
        }

        // 过滤单字符输入
        if (prefix.length < 2) {
            return false;
        }

        return true;
    }

    /**
     * 请求补全
     */
    private async requestCompletion(prefix: string): Promise<string> {
        this.isCompleting = true;

        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return '';
            }

            const document = editor.document;
            const position = editor.selection.active;

            // 获取上下文（当前行之前的几行）
            const contextLines = this.getContextLines(document, position.line, 10);
            const suffixLines = this.getSuffixLines(document, position.line, 5);

            // 构建补全请求
            const code = contextLines + prefix;

            // 请求 AI 补全
            const completion = await this.client.codeComplete(
                code,
                document.languageId,
                prefix.length,
                'DeepSeek-Coder-33B'
            );

            // 清理补全结果（移除已输入的部分）
            const cleaned = this.cleanCompletion(completion, prefix);

            return cleaned;
        } catch (error) {
            console.error('Failed to get completion:', error);
            return '';
        } finally {
            this.isCompleting = false;
        }
    }

    /**
     * 获取上下文行
     */
    private getContextLines(document: vscode.TextDocument, currentLine: number, count: number): string {
        const lines: string[] = [];
        for (let i = Math.max(0, currentLine - count); i < currentLine; i++) {
            lines.push(document.lineAt(i).text);
        }
        return lines.join('\n') + '\n';
    }

    /**
     * 获取后缀行
     */
    private getSuffixLines(document: vscode.TextDocument, currentLine: number, count: number): string {
        const lines: string[] = [];
        for (let i = currentLine + 1; i <= Math.min(document.lineCount - 1, currentLine + count); i++) {
            lines.push(document.lineAt(i).text);
        }
        return lines.join('\n');
    }

    /**
     * 清理补全结果
     */
    private cleanCompletion(completion: string, prefix: string): string {
        // 移除已经输入的前缀
        if (completion.startsWith(prefix)) {
            completion = completion.substring(prefix.length);
        }

        // 移除多余的换行
        completion = completion.replace(/^\n+/, '');

        // 只返回第一行或第一段
        const lines = completion.split('\n');
        if (lines.length > 3) {
            completion = lines.slice(0, 3).join('\n');
        }

        return completion;
    }

    /**
     * 手动触发补全
     */
    async triggerManualCompletion(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character);

        this.debouncer.cancel();

        const completion = await this.requestCompletion(prefix);
        if (completion) {
            this.currentCompletion = new InlineCompletion(completion);
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        }
    }

    dispose(): void {
        this.debouncer.dispose();
    }
}

/**
 * 智能代码片段提供者
 */
export class SmartSnippetProvider implements vscode.CompletionItemProvider {
    private client: AIClient;
    private isGenerating = false;

    constructor(client: AIClient) {
        this.client = client;
    }

    /**
     * 提供代码补全项
     */
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        // 只在显式触发时生成智能片段
        if (context.triggerKind !== vscode.CompletionTriggerKind.Invoke) {
            return [];
        }

        // 避免频繁请求
        if (this.isGenerating) {
            return [];
        }

        this.isGenerating = true;

        try {
            const lineText = document.lineAt(position.line).text;
            const prefix = lineText.substring(0, position.character).trim();

            // 检测是否是需要补全的情况
            if (!this.shouldProvideSnippet(prefix)) {
                return [];
            }

            // 生成智能补全建议
            const suggestion = await this.generateSnippet(document, position);

            if (suggestion) {
                const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Snippet);
                item.insertText = new vscode.SnippetString(suggestion.snippet);
                item.documentation = new vscode.MarkdownString(suggestion.documentation);
                item.detail = 'AI 生成';
                return [item];
            }

            return [];
        } catch (error) {
            console.error('Snippet generation error:', error);
            return [];
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * 检查是否应该提供片段
     */
    private shouldProvideSnippet(prefix: string): boolean {
        // 在函数定义、类定义、条件语句等情况下触发
        const patterns = [
            /^function\s+\w*/,
            /^class\s+\w*/,
            /^def\s+\w*/,
            /^if\s*$/,
            /^for\s*$/,
            /^while\s*$/,
            /^switch\s*$/,
            /^interface\s+\w*/,
            /^type\s+\w*/,
            /^enum\s+\w*/,
        ];

        return patterns.some(pattern => pattern.test(prefix));
    }

    /**
     * 生成智能片段
     */
    private async generateSnippet(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<{ label: string; snippet: string; documentation: string } | null> {
        const contextLines = this.getContextLines(document, position, 20);
        const language = document.languageId;

        try {
            const response = await this.client.chat({
                model: 'DeepSeek-Coder-33B',
                messages: [
                    {
                        role: 'system',
                        content: '你是代码补全专家。根据上下文提供最佳的代码补全建议。返回JSON格式：{"label": "简短描述", "snippet": "VS Code snippet格式", "documentation": "详细说明"}'
                    },
                    {
                        role: 'user',
                        content: `Language: ${language}\n\nContext:\n${contextLines}\n\nGenerate a code completion suggestion for the current cursor position.`
                    }
                ],
                max_tokens: 500,
                temperature: 0.3,
            });

            const content = response.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed;
            }
        } catch (error) {
            console.error('Failed to generate snippet:', error);
        }

        return null;
    }

    /**
     * 获取上下文
     */
    private getContextLines(document: vscode.TextDocument, position: vscode.Position, count: number): string {
        const startLine = Math.max(0, position.line - count);
        const lines: string[] = [];

        for (let i = startLine; i <= position.line; i++) {
            const line = document.lineAt(i).text;
            if (i === position.line) {
                lines.push(line.substring(0, position.character));
            } else {
                lines.push(line);
            }
        }

        return lines.join('\n');
    }

    dispose(): void {
        // 清理资源
    }
}

/**
 * 防抖工具类
 */
class Debouncer<T> {
    private delay: number;
    private timeout: NodeJS.Timeout | null = null;
    private handler: (value: T) => Promise<string>;
    private currentResolver: ((value: string) => void) | null = null;
    private currentRejector: ((reason?: any) => void) | null = null;

    constructor(handler: (value: T) => Promise<string>, delay: number) {
        this.handler = handler;
        this.delay = delay;
    }

    setDelay(delay: number): void {
        this.delay = delay;
    }

    schedule(value: T): Promise<string> {
        // 取消之前的请求
        if (this.timeout) {
            clearTimeout(this.timeout);
            if (this.currentRejector) {
                this.currentRejector(new Error('Cancelled'));
            }
        }

        return new Promise((resolve, reject) => {
            this.currentResolver = resolve;
            this.currentRejector = reject;

            this.timeout = setTimeout(async () => {
                try {
                    const result = await this.handler(value);
                    if (this.currentResolver) {
                        this.currentResolver(result);
                    }
                } catch (error) {
                    if (this.currentRejector) {
                        this.currentRejector(error);
                    }
                }
            }, this.delay);
        });
    }

    cancel(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.currentRejector) {
            this.currentRejector(new Error('Cancelled'));
            this.currentRejector = null;
        }
        this.currentResolver = null;
    }

    dispose(): void {
        this.cancel();
    }
}

// 导出防抖类
export { Debouncer };
