type Email = {
  ctime: number;
  mtime: number;
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  attachments: Attachment[];
};
