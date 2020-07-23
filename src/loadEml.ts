import * as vscode from 'vscode';
import * as mailparser from 'mailparser';

export default async function loadEml(uri: vscode.Uri) {
  const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));

  const mail = await mailparser.simpleParser(buffer);
  const { ctime, mtime } = await vscode.workspace.fs.stat(uri);
  const email: Email = {
    ctime,
    mtime,
    from: mail.from?.html,
    to: mail.to?.html,
    subject: mail.subject,
    html: mail.html || mail.textAsHtml || mail.text,
    attachments: [],
  };

  for (const { filename: name, size, content } of mail.attachments) {
    email.attachments.push({ name, size, content });
  }

  return email;
}
