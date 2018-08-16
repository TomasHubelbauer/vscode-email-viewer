'use strict';
import * as vscode from 'vscode';
import { extname, basename } from 'path';
import * as fs from 'fs-extra';
import * as mailparser from 'mailparser';
import * as prettyBytes from 'pretty-bytes';

// Keep track of registered file system providers by scheme to avoid double registration error
const registered = new Set();

// TODO: Handle not operating in a workspace
export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async document => await tryPreviewEmlDocument(document, context)));

    if (vscode.window.activeTextEditor) {
        await tryPreviewEmlDocument(vscode.window.activeTextEditor.document, context);
    }
}

async function tryPreviewEmlDocument(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (document.uri.scheme === 'file' && extname(document.uri.fsPath).toUpperCase() === '.EML') {
        // https://stackoverflow.com/a/3641782/2715716
        // https://en.wikipedia.org/wiki/Base64#Base64_table
        // VS Code will "normalize" URIs by making the scheme lowercase so we instead double up the uppercase letters to keep a consistent and unique scheme
        const scheme = Buffer.from(document.uri.fsPath).toString('base64').replace(/\\/g, '-').replace(/=/g, '.').replace(/([A-Z])/g, l => l.toLowerCase() + l.toLowerCase());
        if (!registered.has(scheme)) {
            context.subscriptions.push(vscode.workspace.registerFileSystemProvider(scheme, await EmailFileSystemProvider.cache(document.uri.fsPath), { isCaseSensitive: true, isReadonly: true }));
            registered.add(scheme);
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: vscode.Uri.parse(scheme + ':/'), name: basename(document.uri.fsPath) + ' Email Attachments' });
        }

        await vscode.commands.executeCommand('vscode.previewHtml', document.uri.with({ scheme, path: '/' + basename(document.uri.fsPath) + '.html' }));
    }
}

class EmailFileSystemProvider implements vscode.FileSystemProvider {
    private readonly mail: mailparser.ParsedMail;
    private readonly ctime: number;
    private readonly mtime: number;
    private readonly size: number;
    private readonly index: string;

    private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    private constructor(mail: mailparser.ParsedMail, ctime: number, mtime: number, size: number, index: string) {
        this.mail = mail;
        this.ctime = ctime;
        this.mtime = mtime;
        this.size = size;
        this.index = index;
    }

    public static cache(path: string): Promise<EmailFileSystemProvider> {
        return new Promise(async (resolve, reject) => {
            try {
                mailparser.simpleParser(await fs.readFile(path), async (err, mail) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const { ctime, mtime, size } = await fs.stat(path);
                    resolve(new EmailFileSystemProvider(mail, ctime.valueOf(), mtime.valueOf(), size, basename(path) + '.html'));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        try {
            if (uri.path === '/' + this.index || uri.path === this.index || uri.path === '/') {
                return new class {
                    dispose() {
                    }
                };
            }

            const attachment = (this.mail.attachments || []).find(attachment => attachment.filename === uri.path.substr('/'.length));
            if (attachment === undefined) {
                debugger;
                throw new Error('Attachment not found by file name');
            }

            return new class {
                dispose() {
                }
            };
        } catch (error) {
            vscode.window.showErrorMessage(error.stack || error.message || error.toString());
            throw error;
        }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            const { ctime, mtime, size } = this;

            if (uri.path === '/') {
                return { type: vscode.FileType.Directory, ctime, mtime, size };
            }

            if (uri.path === '/' + this.index || uri.path === this.index) {
                return { type: vscode.FileType.File, ctime, mtime, size };
            }

            // This happens when there are multiple workspace directories
            if (uri.path === '/.vscode') {
                return { type: vscode.FileType.Unknown, ctime, mtime, size };
            }

            const attachment = (this.mail.attachments || []).find(attachment => attachment.filename === uri.path.substr('/'.length));
            if (attachment === undefined) {
                debugger;
                throw new Error('Attachment not found by file name');
            }

            return { type: vscode.FileType.File, ctime, mtime, size: attachment.size };
        } catch (error) {
            await vscode.window.showErrorMessage(error.stack || error.message || error.toString());
            throw error;
        }
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        try {
            if (uri.path === '/') {
                if (this.mail.attachments === undefined) {
                    return [];
                }

                const entries: [string, vscode.FileType][] = [];
                const names = new Set();

                // TODO: Figure out how to resolve this name colliding with attachment file names
                names.add(this.index);
                entries.push([this.index, vscode.FileType.File]);

                for (const attachment of this.mail.attachments) {
                    if (attachment.filename === undefined) {
                        throw new Error('Does not support attachments without file names');
                    }

                    if (names.has(attachment.filename)) {
                        throw new Error('Does not support multiple attachments with the same file names');
                    }

                    names.add(attachment.filename);
                    entries.push([attachment.filename, vscode.FileType.File]);
                }

                return entries;
            }

            debugger;
            throw new Error('Does not allow reading directories other than root');
        } catch (error) {
            await vscode.window.showErrorMessage(error.stack || error.message || error.toString());
            throw error;
        }
    }

    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        try {
            if (uri.path === '/' + this.index || uri.path === this.index) {
                let html = `<i>From</i>: ${this.mail.from.html}<br/><i>To</i>: ${this.mail.to.html}<br/><i>Subject</i>: ${this.mail.subject}<hr />`;
                if (this.mail.attachments && this.mail.attachments.length > 0) {
                    for (const attachment of this.mail.attachments) {
                        html += `<a href='${uri.with({ path: '/' + attachment.filename }).toString()}'>${attachment.filename} (${prettyBytes(attachment.size)})</a>; `;
                    }

                    html += '<hr />';
                }

                if (this.mail.html !== false) {
                    html += this.mail.html;
                } else {
                    html += this.mail.textAsHtml;
                }

                return Buffer.from(html);
            }

            const attachment = (this.mail.attachments || []).find(attachment => attachment.filename === uri.path.substr('/'.length));
            if (attachment === undefined) {
                debugger;
                throw new Error('Attachment not found by file name');
            }

            return attachment.content;
        } catch (error) {
            await vscode.window.showErrorMessage(error.stack || error.message || error.toString());
            throw error;
        }
    }

    public writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }
}
