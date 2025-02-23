const vscode = require('vscode');
const axios = require('axios');
const apiClient = require('./api_client');

// 全局变量
let outputChannel;
let loadingDecoration;
let translating = false;
let lastTranslationRange = null; // 记录最后一次插入译文的范围
const translationCache = new Map();

function activate(context) {
    try {
        // 创建输出通道
        outputChannel = vscode.window.createOutputChannel('Comment Translator');

        // 注册悬浮提供器
        const hoverProvider = vscode.languages.registerHoverProvider('*', {
            provideHover(document, position, token) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return;

                const line = document.lineAt(position.line);
                const lineText = line.text;

                // 检查是否是注释，传入当前文档的语言ID
                if (!isComment(lineText, document.languageId)) return;

                // 获取缓存的翻译结果
                const cacheKey = `${document.uri.toString()}-${position.line}`;
                const cachedTranslation = translationCache.get(cacheKey);

                if (cachedTranslation) {
                    const content = new vscode.MarkdownString();
                    content.appendMarkdown('### 译文\n');
                    content.appendMarkdown(cachedTranslation.join('\n\n'));
                    return new vscode.Hover(content);
                }
            }
        });

        // 创建加载中的装饰器类型
        loadingDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: '#1e1e1e10',
            isWholeLine: true,
            after: {
                contentText: '正在翻译...',
                color: '#666666',
                margin: '0 0 0 1em'
            }
        });

        // 注册命令
        // 这里的命令名要和package.json中的command一致
        const commandDisposable = vscode.commands.registerCommand('comment-translator.translate', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                const selection = editor.selection;
                if (selection.isEmpty) {
                    vscode.window.showInformationMessage('请先选择要翻译的注释文本');
                    return;
                }

                const text = editor.document.getText(selection);
                if (!text.trim()) {
                    vscode.window.showInformationMessage('选中的文本为空');
                    return;
                }

                if (translating) {
                    vscode.window.showInformationMessage('正在翻译中，请稍候...');
                    return;
                }

                // 检查是否是注释，传入当前文档的语言ID
                const lines = text.split('\n');
                if (!lines.some(line => isComment(line, editor.document.languageId))) {
                    vscode.window.showInformationMessage('请选择注释文本进行翻译');
                    return;
                }

                await translateAndStore(editor, text);
                vscode.window.showInformationMessage('翻译完成，请将鼠标悬停在注释上查看译文');
            } catch (error) {
                vscode.window.showErrorMessage('Translation failed: ' + error.message);
            }
        });

        // 注册到上下文
        context.subscriptions.push(commandDisposable, hoverProvider);
        
        // 添加清理函数
        context.subscriptions.push({
            dispose: () => {
                if (outputChannel) {
                    outputChannel.dispose();
                }
                if (loadingDecoration) {
                    loadingDecoration.dispose();
                }
            }
        });

    } catch (error) {
        console.error('Activation error:', error);
        vscode.window.showErrorMessage('Extension activation failed: ' + error.message);
    }
}

// 停用函数
function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
    if (loadingDecoration) {
        loadingDecoration.dispose();
    }
}

// 翻译并存储结果
async function translateAndStore(editor, text) {
    try {
        translating = true;
        
        // 显示加载中状态
        showLoadingDecoration(editor);
        
        const startTime = Date.now();
        const cleanText = removeCommentSymbols(text);

        // 调用翻译 API
        const resData = await apiClient.callTranslationAPI(cleanText);
        const endTime = Date.now();

        if (!resData?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response from translation API');
        }

        const translatedText = resData.choices[0].message.content;
        
        // 处理翻译结果
        const processedLines = processTranslatedText(translatedText);
        
        // 清除加载中的装饰
        editor.setDecorations(loadingDecoration, []);

        // 创建悬浮框内容
        const content = new vscode.MarkdownString();
        content.appendMarkdown('### 译文\n');
        content.appendMarkdown(processedLines.join('\n\n'));

        // 获取选中文本的位置
        const position = editor.selection.active;
        
        // 创建悬浮框
        const hover = new vscode.Hover(content);
        
        // 显示悬浮框
        // 注意：这是一个非公开API，但目前是显示悬浮框最直接的方式
        await vscode.commands.executeCommand('editor.action.showHover');

        // 存储翻译结果到缓存
        const startLine = editor.selection.start.line;
        const endLine = editor.selection.end.line;
        for (let i = startLine; i <= endLine; i++) {
            const cacheKey = `${editor.document.uri.toString()}-${i}`;
            translationCache.set(cacheKey, processedLines);
        }

        // 记录日志
        logAPI('Translation Result', {
            original: text,
            cleaned: cleanText,
            translated: translatedText,
            duration: `${endTime - startTime}ms`
        });

    } catch (error) {
        console.error('Translation error:', error);
        vscode.window.showErrorMessage('翻译失败: ' + error.message);
        editor.setDecorations(loadingDecoration, []);
    } finally {
        translating = false;
    }
}

// 显示加载中的装饰
function showLoadingDecoration(editor) {
    const loadingDecorationOptions = [{
        range: new vscode.Range(
            editor.selection.start.line,
            0,
            editor.selection.end.line,
            editor.document.lineAt(editor.selection.end.line).text.length
        )
    }];
    editor.setDecorations(loadingDecoration, loadingDecorationOptions);
}

// 去除注释符号
function removeCommentSymbols(text) {
    // 如果是 HTML 注释
    const trimmedText = text.trim();
    if (trimmedText.startsWith('<!--') || trimmedText.includes('<!--')) {
        // 处理多行 HTML 注释
        let content = trimmedText;
        
        // 将多行注释合并成一行，保留换行符
        content = content.replace(/<!--[\s\S]*?-->/g, match => {
            // 移除开始和结束的注释标记
            return match
                .replace(/<!--/, '')  // 移除开始标记
                .replace(/-->/, '')   // 移除结束标记
                .split('\n')          // 按行分割
                .map(line => {
                    // 移除每行的空白和缩进
                    line = line.trim();
                    // 移除每行开头可能的装饰字符（*、-、>）和空白
                    return line.replace(/^[*\s->]*\s*/, '');
                })
                .filter(line => line.length > 0) // 移除空行
                .join('\n');
        });
        
        return content.trim();
    }

    // 处理其他语言的注释
    return text
        .split('\n')
        .map(line => {
            line = line.trim();
            
            // 移除单行注释符号
            if (line.startsWith('//')) {
                return line.substring(2).trim();
            }
            if (line.startsWith('#')) {
                return line.substring(1).trim();
            }
            if (line.startsWith('--')) {
                return line.substring(2).trim();
            }
            if (line.startsWith('%')) {
                return line.substring(1).trim();
            }
            if (line.startsWith(';')) {
                return line.substring(1).trim();
            }
            
            // 移除多行注释符号
            if (line.startsWith('/*')) {
                line = line.substring(2);
            }
            if (line.endsWith('*/')) {
                line = line.slice(0, -2);
            }
            if (line.startsWith('*')) {
                line = line.substring(1);
            }
            
            // 处理其他特殊的多行注释
            if (line.startsWith('"""') || line.startsWith("'''")) {
                line = line.substring(3);
            }
            if (line.endsWith('"""') || line.endsWith("'''")) {
                line = line.slice(0, -3);
            }
            if (line.startsWith('--[[')) {
                line = line.substring(4);
            }
            if (line.endsWith(']]')) {
                line = line.slice(0, -2);
            }
            if (line.startsWith('%{')) {
                line = line.substring(2);
            }
            if (line.endsWith('%}')) {
                line = line.slice(0, -2);
            }
            if (line.startsWith('=begin') || line.startsWith('=end')) {
                return '';
            }
            
            return line.trim();
        })
        .filter(line => line.length > 0)
        .join('\n');
}

// 记录API调用日志
function logAPI(action, data) {
    if (outputChannel) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            action,
            ...data
        };
        outputChannel.appendLine(JSON.stringify(logEntry, null, 2));
    }
}

// 语言注释前缀映射
const languageCommentPrefixes = {
    // C-style languages
    'javascript': ['//', '/*', '*', '*/'],
    'typescript': ['//', '/*', '*', '*/'],
    'java': ['//', '/*', '*', '*/'],
    'c': ['//', '/*', '*', '*/'],
    'cpp': ['//', '/*', '*', '*/'],
    'csharp': ['//', '/*', '*', '*/'],
    // Scripting languages
    'python': ['#', '"""', "'''"],
    'ruby': ['#', '=begin', '=end'],
    'perl': ['#'],
    'shell': ['#'],
    'bash': ['#'],
    // Web languages
    'html': ['<!--', '-->'],
    'xml': ['<!--', '-->'],
    'php': ['//', '#', '/*', '*', '*/'],
    // Other languages
    'lua': ['--', '--[[', ']]'],
    'haskell': ['--', '{-', '-}'],
    'sql': ['--', '/*', '*', '*/'],
    'r': ['#'],
    'matlab': ['%', '%{', '%}'],
    'lisp': [';'],
    'rust': ['//', '/*', '*', '*/'],
    'go': ['//', '/*', '*', '*/'],
    'swift': ['//', '/*', '*', '*/'],
    'kotlin': ['//', '/*', '*', '*/'],
    // Default fallback
    'default': ['//', '/*', '*', '*/', '#', '--', ';']
};

// 检查是否是注释
function isComment(text, languageId = 'default') {
    const trimmed = text.trim();
    if (!trimmed) return false;

    // 获取当前语言的注释前缀，如果没有则使用默认值
    const commentPrefixes = languageCommentPrefixes[languageId] || languageCommentPrefixes['default'];
    
    // 检查是否以任何注释前缀开始
    return commentPrefixes.some(prefix => {
        if (languageId === 'html' || languageId === 'xml') {
            // 特殊处理 HTML/XML 注释
            // 检查当前行是否在多行注释内
            const isInMultilineComment = (
                trimmed.includes('<!--') || 
                trimmed.includes('-->') || 
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment;
        } else if (languageId === 'lua') {
            // 特殊处理 Lua 的多行注释
            const isInMultilineComment = (
                trimmed.startsWith('--[[') || 
                trimmed.endsWith(']]') ||
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment || trimmed.startsWith('--');
        } else if (languageId === 'python') {
            // 特殊处理 Python 的多行注释（文档字符串）
            const isInMultilineComment = (
                trimmed.startsWith('"""') || 
                trimmed.endsWith('"""') ||
                trimmed.startsWith("'''") || 
                trimmed.endsWith("'''") ||
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment || trimmed.startsWith('#');
        } else if (languageId === 'ruby') {
            // 特殊处理 Ruby 的多行注释
            const isInMultilineComment = (
                trimmed === '=begin' || 
                trimmed === '=end' ||
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment || trimmed.startsWith('#');
        } else if (languageId === 'sql') {
            // 特殊处理 SQL 的多行注释
            const isInMultilineComment = (
                trimmed.startsWith('/*') || 
                trimmed.endsWith('*/') ||
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment || trimmed.startsWith('--');
        } else if (languageId === 'go') {
            // 特殊处理 Go 的多行注释
            const isInMultilineComment = (
                trimmed.startsWith('/*') || 
                trimmed.endsWith('*/') ||
                // 检查是否是注释内容（允许任意缩进和内容）
                /^\s*[A-Za-z0-9\s*\-_]+.*$/.test(text)
            );
            return isInMultilineComment || trimmed.startsWith('//');
        } else if (prefix.length === 1) {
            // 单字符注释前缀（如 #, ;）需要精确匹配行首
            return trimmed.startsWith(prefix);
        } else {
            // 多字符注释前缀（如 //, /*）可以在行中出现
            return trimmed.includes(prefix);
        }
    });
}

// 处理翻译文本的辅助函数
function processTranslatedText(translatedText) {
    // 按句子分割文本
    const sentences = translatedText.split(/([。！？])/);
    const processedLines = [];
    let currentLine = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (!sentence) continue;
        
        // 如果是标点符号，直接添加到当前行
        if (/[。！？]/.test(sentence)) {
            currentLine += sentence;
            if (currentLine) {
                processedLines.push(currentLine);
                currentLine = '';
            }
        } else {
            // 如果当前行为空，直接添加句子
            if (!currentLine) {
                currentLine = sentence;
            } else {
                // 如果当前行加上新句子不会太长，则添加到当前行
                if (currentLine.length + sentence.length <= 60) {
                    currentLine += sentence;
                } else {
                    // 否则开始新行
                    processedLines.push(currentLine);
                    currentLine = sentence;
                }
            }
        }
    }
    
    // 确保最后一行也被添加
    if (currentLine) {
        processedLines.push(currentLine);
    }
    
    return processedLines;
}

module.exports = {
    activate,
    deactivate
};
