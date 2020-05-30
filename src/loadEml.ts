import * as mailparser from 'mailparser';

export default async function loadEml(buffer: Buffer) {
  const mail = await mailparser.simpleParser(buffer);
  const email: Email = {
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
