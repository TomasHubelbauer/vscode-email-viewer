'use strict';
import * as vscode from 'vscode';
import { extname, basename, join, dirname } from 'path';
import * as fs from 'fs-extra';
import * as mailparser from 'mailparser';
import * as prettyBytes from 'pretty-bytes';

// TODO: Handle not operating in a workspace
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('eml', new EmailFileSystemProvider(), { isCaseSensitive: true, isReadonly: true }));
    vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: vscode.workspace.workspaceFolders![0].uri.with({ scheme: 'eml' }), name: 'Email Virtual File System' });

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => tryPreviewEmlDocument(document)));

    if (vscode.window.activeTextEditor) {
        tryPreviewEmlDocument(vscode.window.activeTextEditor.document);
    }
}

function tryPreviewEmlDocument(document: vscode.TextDocument) {
    if (extname(document.uri.fsPath).toUpperCase() === '.EML') {
        vscode.commands.executeCommand('vscode.previewHtml', document.uri.with({ scheme: 'eml', path: document.uri.path.slice(0, -'.EML'.length) }));
    }
}

class EmailFileSystemProvider implements vscode.FileSystemProvider {
    private cache: { [path: string]: mailparser.ParsedMail } = {};
    private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new class {
            dispose() {
                debugger;
                throw new Error("Method not implemented.");
            }
        };
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (uri.fsPath === vscode.workspace.workspaceFolders![0].uri.fsPath) {
            return { ctime: Date.now(), mtime: Date.now(), size: 0, type: vscode.FileType.Directory };
        }

        if (extname(uri.fsPath).toUpperCase() === '.EML') {
            // Obtain the actual email file stats
            const { ctime, mtime, size } = await fs.stat(uri.fsPath);
            return { ctime: Number(ctime), mtime: Number(mtime), size, type: vscode.FileType.File };
        }

        if (await fs.pathExists(uri.fsPath + '.eml')) {
            // Obtain the virtual email directory stats - inherit the actual email file stats
            const { ctime, mtime, size } = await fs.stat(uri.fsPath + '.eml');
            return { ctime: Number(ctime), mtime: Number(mtime), size, type: vscode.FileType.Directory };
        }

        if (await fs.pathExists(dirname(uri.fsPath) + '.eml')) {
            const emlUri = vscode.Uri.file(dirname(uri.fsPath) + '.eml');
            const mail = await this.parse(emlUri);
            const attachment = mail.attachments!.find(attachment => attachment.filename === basename(uri.fsPath) && attachment.cid === uri.query);
            if (attachment !== undefined) {
                // Obtain the actual email file stats
                const { ctime, mtime } = await fs.stat(emlUri.fsPath);
                return { ctime: Number(ctime), mtime: Number(mtime), size: attachment.size, type: vscode.FileType.File };
            } else {
                debugger;
                throw new Error("Method not implemented.");
            }
        }

        debugger;
        return { ctime: Date.now(), mtime: Date.now(), size: 0, type: vscode.FileType.Unknown };
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        if (uri.fsPath === vscode.workspace.workspaceFolders![0].uri.fsPath) {
            const items: [string, vscode.FileType][] = [];
            for (const key of Object.keys(this.cache)) {
                items.push([vscode.workspace.asRelativePath(key, false).slice(0, -'.EML'.length) + '.html', vscode.FileType.File]);
                items.push([vscode.workspace.asRelativePath(key, false).slice(0, -'.EML'.length), vscode.FileType.Directory]);
            }

            return items;
        }

        if (extname(uri.fsPath).toUpperCase() === '.EML') {
            const mail = await this.parse(uri);
            return (mail.attachments || []).map(attachment => [attachment.filename!, vscode.FileType.File] as [string, vscode.FileType]);
        }

        if (await fs.pathExists(uri.fsPath + '.eml')) {
            const emlUri = vscode.Uri.file(dirname(uri.fsPath) + '.eml');
            const mail = await this.parse(emlUri);
            return (mail.attachments || []).map(attachment => [attachment.filename!, vscode.FileType.File] as [string, vscode.FileType]);
        }

        debugger;
        throw new Error("Method not implemented.");
    }

    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (extname(uri.fsPath).toUpperCase() === '.EML') {
            const mail = await this.parse(uri);
            let html = `<i>From</i>: ${mail.from.html}<br/><i>To</i>: ${mail.to.html}<br/><i>Subject</i>: ${mail.subject}<hr />`;
            if (mail.attachments && mail.attachments.length > 0) {
                for (const attachment of mail.attachments) {
                    const attachmentUri = uri.with({ path: join(basename(uri.fsPath, extname(uri.fsPath)), attachment.filename!), query: attachment.cid });
                    html += `<a download='${attachment.filename}' href='${attachmentUri.toString()}'>${attachment.filename} (${prettyBytes(attachment.size)})</a>; `;
                }

                html += '<hr />';
            }

            if (mail.html !== false) {
                html += mail.html;
            } else {
                html += mail.textAsHtml;
            }

            return Buffer.from(html, 'utf8');
        }

        if (await fs.pathExists(dirname(uri.fsPath) + '.eml')) {
            const mail = await this.parse(vscode.Uri.file(dirname(uri.fsPath) + '.eml'));
            const attachment = mail.attachments!.find(attachment => attachment.filename === basename(uri.fsPath) && attachment.cid === uri.query);
            if (attachment !== undefined) {
                return attachment.content;
            } else {
                debugger;
                throw new Error("Method not implemented.");
            }
        }

        debugger;
        throw new Error("Method not implemented.");
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

    private parse(uri: vscode.Uri): Promise<mailparser.ParsedMail> {
        return new Promise(async (resolve, reject) => {
            const cached = this.cache[uri.fsPath];
            if (cached !== undefined) {
                resolve(cached);
                return;
            }

            try {
                mailparser.simpleParser(await fs.readFile(uri.fsPath), (err, mail) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    this.cache[uri.fsPath] = mail;
                    resolve(mail);
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}


// mailparser.simpleParser(await fs.readFile(document.uri.fsPath), (err, mail) => {
//     if (err) {
//         return;
//     }

//     const name = basename(document.uri.fsPath);
//     const path = vscode.workspace.asRelativePath(document.uri, true);
//     const uri = document.uri.with({ scheme: 'eml', path });
//     emailFileSystemProvider.createDirectory(uri);

//     let html = `<i>From</i>: ${mail.from.html}<br/><i>To</i>: ${mail.to.html}<br/><i>Subject</i>: ${mail.subject}<hr />`;
//     if (mail.attachments && mail.attachments.length > 0) {
//         for (const attachment of mail.attachments) {
//             const attachmentUri = uri.with({ path: join(path, attachment.filename!) });
//             emailFileSystemProvider.writeFile(attachmentUri, attachment.content, { create: true, overwrite: true });
//             html += `<a download='${attachment.filename}' href='${attachmentUri.toString()}'>${attachment.filename} (${prettyBytes(attachment.size)})</a>; `;
//         }

//         html += '<hr />';
//     }

//     if (mail.html !== false) {
//         html += mail.html;
//     } else {
//         html += mail.textAsHtml;
//     }

//     emailFileSystemProvider.writeFile(uri, Buffer.from(html, 'utf8'), { create: true, overwrite: true });


// });

// provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
//     const searchParams = new URLSearchParams(uri.query);
//     const emlFilePath = searchParams.get('emlFilePath')!;
//     const attachmentCid = searchParams.get('attachmentCid')!;
//     return new Promise(async (resolve, reject) => {
//         try {
//             mailparser.simpleParser(await fs.readFile(emlFilePath), async (err, mail) => {
//                 if (err) {
//                     reject(err);
//                 }

//                 const attachment = mail.attachments!.find(attachment => attachment.cid === attachmentCid)!;

//                 try {
//                     await fs.writeFile(uri.fsPath, attachment.content);
//                     resolve(`<a href='${uri.fsPath}'>${attachment.filename}</a>`);
//                 } catch (error) {
//                     reject(error);
//                 }
//             });
//         } catch (error) {
//             reject(error);
//         }
//     });
// }
