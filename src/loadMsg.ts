import MSGReader from 'msgreader';

export default async function loadMsg(buffer: Buffer): Promise<Email> {
  const msgReader = new MSGReader(buffer);
  const fileData = msgReader.getFileData();
  if (fileData.error) {
    throw fileData.error;
  }

  const email: Email = {
    from: fileData.senderName ? `${fileData.senderName} [${fileData.senderEmail}]` : fileData.senderEmail,
    to: fileData.recipients.map((recipient: any) => recipient.name ? `${recipient.name} [${recipient.email}]` : recipient.email).join(','),
    subject: fileData.subject,
    html: `<pre>${fileData.body}</pre>`,
    attachments: []
  };

  for (const attachment of fileData.attachments) {
    const { fileName: name, content } = msgReader.getAttachment(attachment);
    email.attachments.push({ name, size: attachment.contentLength, content });
  }

  return email;
}
