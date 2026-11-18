import * as vscode from 'vscode';

type GhostTraceToolInput = {
	targetLine?: number;
	filePaths?: string[];
};

type FileContext = {
	uri: vscode.Uri;
	name: string;
	source: string;
	diagnostics: readonly vscode.Diagnostic[];
};

function formatNumberedSource(document: vscode.TextDocument): string {
	return Array.from(
		{ length: document.lineCount },
		(_, index) => `${index + 1}: ${document.lineAt(index).text}`,
	).join('\n');
}

function getFileName(uri: vscode.Uri): string {
	return vscode.workspace.asRelativePath(uri, false);
}

async function collectFileContext(uri: vscode.Uri): Promise<FileContext> {
	const document = await vscode.workspace.openTextDocument(uri);
	return {
		uri,
		name: getFileName(uri),
		source: formatNumberedSource(document),
		diagnostics: vscode.languages.getDiagnostics(uri),
	};
}

function formatDiagnostics(diagnostics: readonly vscode.Diagnostic[]): string {
	if (diagnostics.length === 0) {
		return 'No diagnostics are currently reported.';
	}

	return diagnostics.map(diagnostic => {
		const severity = vscode.DiagnosticSeverity[diagnostic.severity];
		const location = `Line ${diagnostic.range.start.line + 1}, column ${diagnostic.range.start.character + 1}`;
		return `${severity} ${location}: ${diagnostic.message}`;
	}).join('\n');
}

function formatLineLink(uri: vscode.Uri, line: number): string {
	const argumentsJson = JSON.stringify([{ uri: uri.toString(), line }]);
	return `[Line ${line}](command:ghost-trace.jumpToLine?${encodeURIComponent(argumentsJson)})`;
}

function formatFileContext(file: FileContext): string {
	return [
		`### File: \`${file.name}\``,
		`URI: ${file.uri.toString()}`,
		`Clickable line-link example: ${formatLineLink(file.uri, 1)}`,
		'Numbered source:',
		file.source,
		'Diagnostics:',
		formatDiagnostics(file.diagnostics),
	].join('\n');
}

function getChatReferenceUris(references: readonly vscode.ChatPromptReference[]): vscode.Uri[] {
	const uris = references.flatMap(reference => {
		if (reference.value instanceof vscode.Uri) {
			return [reference.value];
		}
		if (reference.value instanceof vscode.Location) {
			return [reference.value.uri];
		}
		return [];
	});
	return [...new Map(uris.map(uri => [uri.toString(), uri])).values()];
}

async function resolveFileUris(filePaths: readonly string[]): Promise<vscode.Uri[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	const uris: vscode.Uri[] = [];

	for (const filePath of filePaths) {
		if (filePath.startsWith('file:')) {
			uris.push(vscode.Uri.parse(filePath));
			continue;
		}
		if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(filePath)) {
			uris.push(vscode.Uri.file(filePath));
			continue;
		}
		if (workspaceFolders.length === 0) {
			throw new Error(`Cannot resolve workspace-relative file path without an open workspace: ${filePath}`);
		}

		const relativePath = filePath.replace(/\\/g, '/');
		let found = false;
		for (const folder of workspaceFolders) {
			const matches = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, relativePath),
				undefined,
				1,
			);
			if (matches.length > 0) {
				uris.push(matches[0]);
				found = true;
			}
		}
		if (!found) {
			uris.push(vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath));
		}
	}

	return [...new Map(uris.map(uri => [uri.toString(), uri])).values()];
}

export function activate(context: vscode.ExtensionContext) {
	const lineHighlight = vscode.window.createTextEditorDecorationType({
		isWholeLine: true,
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
	});
	let highlightTimeout: ReturnType<typeof setTimeout> | undefined;
	context.subscriptions.push(lineHighlight);
	context.subscriptions.push({
		dispose: () => {
			if (highlightTimeout) {
				clearTimeout(highlightTimeout);
			}
		},
	});
	context.subscriptions.push(vscode.commands.registerCommand(
		'ghost-trace.jumpToLine',
		async (argument: { uri?: string; line: number } | string | number, legacyLine?: number) => {
			const activeUri = vscode.window.activeTextEditor?.document.uri;
			const uri = typeof argument === 'number'
				? activeUri
				: typeof argument === 'string'
					? argument
					: argument.uri
						? vscode.Uri.parse(argument.uri)
						: activeUri;
			const lineNumber = typeof argument === 'number'
				? argument
				: typeof argument === 'string'
					? legacyLine
					: argument.line;

			if (!uri || typeof lineNumber !== 'number' || !Number.isInteger(lineNumber) || lineNumber < 1) {
				await vscode.window.showErrorMessage('Ghost Trace needs a valid file and one-based line number.');
				return;
			}

			const editor = await vscode.window.showTextDocument(
				typeof uri === 'string' ? vscode.Uri.parse(uri) : uri,
			);
			if (lineNumber > editor.document.lineCount) {
				await vscode.window.showErrorMessage(`Line ${lineNumber} is outside this file.`);
				return;
			}

			const position = new vscode.Position(lineNumber - 1, 0);
			const range = new vscode.Range(position, position);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
			editor.setDecorations(lineHighlight, [range]);

			if (highlightTimeout) {
				clearTimeout(highlightTimeout);
			}
			highlightTimeout = setTimeout(() => editor.setDecorations(lineHighlight, []), 1500);
		},
	));

	context.subscriptions.push(vscode.lm.registerTool<GhostTraceToolInput>(
		'ghost_trace',
		{
			invoke: async ({ input }) => {
				const fileUris = input.filePaths?.length
					? await resolveFileUris(input.filePaths)
					: vscode.window.activeTextEditor
						? [vscode.window.activeTextEditor.document.uri]
						: [];
				if (fileUris.length === 0) {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(
							'No file paths were provided and no active text editor is open, so there is no file to diagnose. Do not edit the user\'s code.',
						),
					]);
				}

				const files = await Promise.all(fileUris.map(collectFileContext));
				const targetLine = typeof input.targetLine === 'number'
					? `\nRequested focus line: ${input.targetLine} (one-based).`
					: '';
				const result = [
					'Analyze every supplied file and its diagnostics. Start with a concise Overview stating how many files were analyzed and whether cross-file issues exist. For each file, use a clearly labeled header exactly like ### File: `relative/path/to/file.ext`, then sections labeled Status (Errors found if any error diagnostics exist; otherwise Clean, with non-error diagnostics noted when relevant), Root Cause Location (a clickable [Line X] link), Cascade Explanation (an expert explanation of how the syntax or type error propagated), and How to Fix It (guidance only). Every root-cause link must use the matching file URI and one-based line in the form command:ghost-trace.jumpToLine with encodeURIComponent(JSON.stringify([{uri:"FILE_URI",line:X}])). Use the clickable line-link example provided with each file. Identify the exact upstream root-cause line. NEVER edit, rewrite, or apply changes to user code.',
					targetLine,
					...files.map(formatFileContext),
				].join('\n\n');

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(result),
				]);
			},
		},
	));

	const participant = vscode.chat.createChatParticipant(
		'ghost-trace.trace',
		async (request, _chatContext, responseStream, token) => {
			const referencedUris = getChatReferenceUris(request.references);
			const fileUris = referencedUris.length > 0
				? referencedUris
				: vscode.window.activeTextEditor
					? [vscode.window.activeTextEditor.document.uri]
					: [];
			if (fileUris.length === 0) {
				responseStream.markdown('Attach or pin one or more files, or open a file in the editor, so I can trace its diagnostics.');
				return;
			}

			const files = await Promise.all(fileUris.map(collectFileContext));
			const prompt = [
				`Analyze all ${files.length} supplied files using language-agnostic reasoning based on each file's actual language and syntax. Diagnostics may appear on blank or unrelated lines because the parser detected the problem later than where it began. Inspect every complete numbered source and its diagnostics, paying attention to constructs or declarations in one file that could affect another.`,
				'This extension is strictly read-only: never edit, rewrite, or apply changes to user code. Only explain the cause and how to fix it.',
				`Structure the response for fast expert review. Begin with a concise **Overview** summarizing how many files were analyzed and whether cross-file issues exist. For each file, use a header exactly like ### File: \`relative/path/to/file.ext\` and include labeled sections **Status:** (Errors found if any error diagnostics exist; otherwise Clean, noting non-error diagnostics when relevant), **Root Cause Location:**, **Cascade Explanation:**, and **How to Fix It:**. Explain the likely root cause and propagation thoroughly. Never suggest applying a change automatically; provide guidance only.`,
				'Every root-cause line link must be clickable and identify that file URI and one-based line using the clickable line-link example provided with each file, updated to the actual root-cause line.',
				`User request: ${request.prompt}`,
				...files.map(formatFileContext),
			].join('\n\n');

			const modelResponse = await request.model.sendRequest(
				[vscode.LanguageModelChatMessage.User(prompt)],
				{},
				token,
			);
			let answer = '';
			for await (const part of modelResponse.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					answer += part.value;
				}
			}
			const markdown = new vscode.MarkdownString(answer);
			markdown.isTrusted = { enabledCommands: ['ghost-trace.jumpToLine'] };
			responseStream.markdown(markdown);
		},
	);
	participant.followupProvider = {
		provideFollowups: () => [
			{ prompt: 'Why does this syntax error cascade down?' },
			{ prompt: 'How can I prevent this in the future?' },
		],
	};
	context.subscriptions.push(participant);
}

export function deactivate() {}
