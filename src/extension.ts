'use strict';
import * as vscode from 'vscode';
import { extname, basename, join, sep } from 'path';
import * as fs from 'fs-extra';
import * as mailparser from 'mailparser';
import * as prettyBytes from 'pretty-bytes';
import MSGReader from 'msgreader';

// TODO: Handle not operating in a workspace
export function activate(context: vscode.ExtensionContext) {
    const emailFileSystemProvider = new EmailFileSystemProvider();
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('eml', emailFileSystemProvider, { isCaseSensitive: true, isReadonly: true }));
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('msg', emailFileSystemProvider, { isCaseSensitive: true, isReadonly: true }));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => tryPreviewEmailDocument(document)));
    if (vscode.window.activeTextEditor !== undefined) {
        tryPreviewEmailDocument(vscode.window.activeTextEditor.document);
    }
}

function tryPreviewEmailDocument(document: vscode.TextDocument) {
    const extension = extname(document.uri.path).substr(1).toLowerCase();
    switch (document.uri.scheme) {
        // TODO: Default this if we find a VS Code API for reading a binary (FS provider?) and can ditch `fs` which only works on `file:`
        case 'file': {
            if (extension !== 'eml' && extension !== 'msg') {
                return;
            }

            const path = vscode.workspace.asRelativePath(document.uri, true);
            const uri = vscode.Uri.parse(`${extension}:${path}`);
            const name = basename(document.uri.path);
            if (vscode.workspace.getWorkspaceFolder(uri) === undefined) {
                vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri, name });
            }

            // Preview by opening the index HTML document in the email with leading slash (required by VS Code)
            const previewUri = vscode.Uri.parse(`${extension}:/${join(path, basename(vscode.workspace.asRelativePath(document.uri), extension) + 'html')}`);
            vscode.commands.executeCommand('vscode.previewHtml', previewUri);
            break;
        }
        case 'eml': {
            if (extension === 'html') {
                vscode.commands.executeCommand('vscode.previewHtml', document.uri);
            }

            break;
        }
        case 'msg': {
            if (extension === 'html') {
                vscode.commands.executeCommand('vscode.previewHtml', document.uri);
            }

            break;
        }
    }
}

type Email = {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments: {
        name: string;
        size: number;
        content: Buffer;
    }[];
    ctime: number;
    mtime: number;
    size: number;
};

function loadEml(path: string): Promise<Email> {
    return new Promise<Email>(async (resolve, reject) => {
        try {
            mailparser.simpleParser(await fs.readFile(path), async (err, mail) => {
                if (err) {
                    reject(err);
                    return;
                }

                const { ctime, mtime, size } = await fs.stat(path);
                const email: Email = {
                    from: mail.from.html,
                    to: mail.to.html,
                    subject: mail.subject,
                    html: mail.html as string | false || mail.textAsHtml || mail.text,
                    attachments: (mail.attachments || []).map(attachment => ({
                        name: attachment.filename!,
                        size: attachment.size,
                        content: attachment.content,
                    })),
                    ctime: ctime.valueOf(),
                    mtime: mtime.valueOf(),
                    size,
                };

                resolve(email);
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function loadMsg(path: string): Promise<Email> {
    const msgReader = new MSGReader(await fs.readFile(path));
    const fileData = msgReader.getFileData();
    if (fileData.error) {
        throw fileData.error;
    }

    const { ctime, mtime, size } = await fs.stat(path);
    const email: Email = {
        from: fileData.senderName ? `${fileData.senderName} [${fileData.senderEmail}]` : fileData.senderEmail,
        to: fileData.recipients.map((recipient: any) => recipient.name ? `${recipient.name} [${recipient.email}]` : recipient.email).join(','),
        subject: fileData.subject,
        html: `<pre>${fileData.body}</pre>`,
        attachments: [],
        ctime: ctime.valueOf(),
        mtime: mtime.valueOf(),
        size
    };
    for (const attachment of fileData.attachments) {
        const { fileName: name, content } = msgReader.getAttachment(attachment);
        email.attachments.push({ name, size: attachment.contentLength, content });
    }

    return email;
}

class EmailFileSystemProvider implements vscode.FileSystemProvider {
    private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new class {
            dispose() {
                debugger;
            }
        };
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const paths = await this.split(uri);
        if (paths === undefined) {
            return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
        }

        const { absolutePath, extension, relativePath } = paths;

        const email = await this.cache(absolutePath);
        if (email === undefined) {
            return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
        }

        const { ctime, mtime, size } = email;

        if (relativePath === '.') {
            return { type: vscode.FileType.Directory, ctime, mtime, size };
        }

        const index = basename(absolutePath, extension) + 'html';
        if (relativePath === index) {
            return { type: vscode.FileType.File, ctime, mtime, size };
        }

        const attachment = email.attachments.find(attachment => attachment.name === relativePath);
        if (attachment !== undefined) {
            return { type: vscode.FileType.File, ctime, mtime, size: attachment.size };
        }

        return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const paths = await this.split(uri);
        if (paths === undefined) {
            return [];
        }

        const { absolutePath, extension, relativePath } = paths;

        const email = await this.cache(absolutePath);
        if (email === undefined) {
            return [];
        }

        if (relativePath === '.') {
            const index = basename(absolutePath, extension) + 'html';
            const entries: [string, vscode.FileType][] = [];
            const names = new Set();

            // TODO: Figure out how to resolve this name colliding with attachment file names
            names.add(index);
            entries.push([index, vscode.FileType.File]);

            for (const attachment of email.attachments) {
                if (attachment.name === undefined) {
                    throw new Error('Does not support attachments without file names');
                }

                if (names.has(attachment.name)) {
                    throw new Error('Does not support multiple attachments with the same file names');
                }

                names.add(attachment.name);
                entries.push([attachment.name, vscode.FileType.File]);
            }

            return entries;
        }

        // TODO: Send to telemetry - doesn't allow reading directories
        return [];
    }

    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const paths = await this.split(uri);
        if (paths === undefined) {
            return Buffer.from([]);
        }

        const { absolutePath, extension, relativePath } = paths;

        const email = await this.cache(absolutePath);
        if (email === undefined) {
            return Buffer.from([]);
        }

        const index = basename(absolutePath, extension) + 'html';
        if (relativePath === index) {
            let html = `<i>From</i>: ${email.from}<br/><i>To</i>: ${email.to}<br/><i>Subject</i>: ${email.subject}<hr />`;
            if (email.attachments.length > 0) {
                for (const attachment of email.attachments) {
                    const href = `${extension}:/${vscode.workspace.asRelativePath(absolutePath)}/${attachment.name}`;
                    html += `<a href='${href}'>${attachment.name} (${prettyBytes(attachment.size)})</a>; `;
                }

                html += '<hr />';
            }

            html += email.html;
            return Buffer.from(html);
        }

        const attachment = email.attachments.find(attachment => attachment.name === relativePath);
        if (attachment !== undefined) {
            return attachment.content;
        }

        return Buffer.from([]);
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

    private break(path: string) {
        if (path.startsWith('/')) {
            // Drop leading slash from the path (it is in `path` or the URI of the VS Code workspace root directory)
            path = path.slice('/'.length);
        }

        const components = path.split(/[\\/]/g);
        // Drop the trailing slash in case there is one
        if (components[components.length - 1] === '') {
            components.pop();
        }

        return components;
    }

    // TODO: Make this work with workspace directories with multi-component names
    private async split(uri: vscode.Uri): Promise<{ absolutePath: string; extension: 'eml' | 'msg'; relativePath: string; } | undefined> {
        // Verify we are operating within a workspace (need workspace root to derive the email file path)
        if (vscode.workspace.workspaceFolders === undefined) {
            return;
        }

        const absolutePart = this.break(vscode.workspace.workspaceFolders[0].uri.path);
        const relativePart = this.break(uri.path);

        // Verify the EML or MSG file is in the workspace root directory, we don't support it being elsewhere yet
        if (absolutePart.pop() /* Workspace directory name */ !== relativePart[0]) {
            // TODO: Send to telemetry to gauge interest in non-root directory support
            return undefined;
        }

        let filePath = '';
        const components = [...absolutePart, ...relativePart];
        let component: string | undefined;
        while ((component = components.shift()) !== undefined) {
            filePath += component;
            try {
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    const extension = extname(filePath).substr(1).toLowerCase();
                    if (extension === 'eml' || extension === 'msg') {
                        // Return the file absolute path of the email file and the relative path within it
                        return { absolutePath: filePath, extension, relativePath: join(...components) };
                    } else {
                        // Handle the case where we found a file but it was not an email file
                        // TODO: Send to telemetry
                        return;
                    }
                } else if (stat.isDirectory()) {
                    // Continue walking up the path until we reach the email file
                    filePath += sep;
                } else {
                    // Handle the case where we've reached something that is not a file nor a directory
                    // TODO: Send to telemetry
                    debugger;
                    return;
                }
            } catch (error) {
                // Handle the case where path ceased to exist (should never happen) or be accessible
                // TODO: Send to telemetry
                return;
            }
        }
    }
    private async cache(path: string): Promise<Email | undefined> {
        const extension = extname(path).substr(1).toLowerCase();
        let email: Email;
        try {
            switch (extension) {
                case 'eml': email = await loadEml(path); break;
                case 'msg': email = await loadMsg(path); break;
                default: return;
            }
        } catch (error) {
            // TODO: Send to telemetry
            return;
        }

        return email;
    }
}
