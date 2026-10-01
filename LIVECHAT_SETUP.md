# Human live chat: how replies and transcripts work

## Where the support executive replies
1. Create an agent login once (same accounts as the admin panel): `cd backend && npm run create-admin`
2. Open **https://YOUR-SITE/agent** (also linked as "Live chat" at the top of the admin panel) and sign in.
3. New visitors appear on the left instantly with a sound alert. Click one, read it and type a reply
   (Enter sends, Shift+Enter = new line). The visitor sees the reply in their chat window straight away.
4. Click **End chat & email transcript** when finished. Visitors can also end the chat themselves,
   and chats are closed automatically after 30 minutes of silence.

## Where transcripts go
Open **/agent > Settings**:
- **Forward transcripts to**: one or more emails (comma separated). Every finished chat is sent there.
- **Email a copy to the visitor**: only if the visitor typed an email (the chat box no longer asks for one).
- **Email when a new chat starts**: sends the first message + a link to /agent so nobody misses a chat.

Until you save these settings, `LIVECHAT_EMAIL_TO` (or `EMAIL_TO`) in `backend/.env` is used.
Email sending needs the mail settings (Brevo/Resend/SMTP) already described in `.env.example`.

## Only one chat open at a time
Opening the live chat collapses the AI assistant box, and using the assistant box minimises the live chat.
