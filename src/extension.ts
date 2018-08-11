'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as mailparser from 'mailparser';

export async function activate(context: vscode.ExtensionContext) {
    vscode.workspace.registerTextDocumentContentProvider('eml', new EmailContentProvider());

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async document => await tryPreviewEmlDocument(document)));

    if (vscode.window.activeTextEditor) {
        await tryPreviewEmlDocument(vscode.window.activeTextEditor.document);
    }
}

async function tryPreviewEmlDocument(document: vscode.TextDocument) {
    if (document.uri.scheme === 'file' && path.extname(document.uri.fsPath).toUpperCase() === '.EML') {
        vscode.commands.executeCommand('vscode.previewHtml', document.uri.with({ scheme: 'eml' }), 1, path.basename(document.uri.fsPath));
    }
}

class EmailContentProvider implements vscode.TextDocumentContentProvider {
    onDidChange?: vscode.Event<vscode.Uri> | undefined;

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                let html = '';
                let attachmentCount = 0;

                const mailParser = new mailparser.MailParser();

                mailParser.on('data', data => {
                    switch (data.type) {
                        case 'text': {
                            if (data.html) {
                                html += data.html;
                            } else if (data.textAsHtml) {
                                html += data.textAsHtml;
                            }

                            break;
                        }
                        case 'attachment': {
                            attachmentCount++;
                            break;
                        }
                        default: {
                            throw new Error(`Unexpected data type '${(data as mailparser.AttachmentStream | mailparser.MessageText).type}'`);
                        }
                    }
                });

                mailParser.on('end', () => {
                    if (attachmentCount > 0) {
                        html = `
                    This email has ${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}, but this extension doesn't allow displaying those yet.
                    If you'd like to see this feature implemented, please let me know at tomas@hubelbauer.net.
                    <hr />` + html;
                    }


                    resolve(html);
                });

                mailParser.end(await fs.readFile(uri.fsPath));
            } catch (error) {
                reject(error);
            }
        });
    }
}
