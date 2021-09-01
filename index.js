const express = require('express');
const http = require('http');
const got = require('got');

const app = express();
const server = http.createServer(app);
app.use(express.json());

const port = process.env.PORT || process.argv[2] || 3000;

app.get('/test', (_, res) => {
    res.statusCode = 200;
    res.end('yes, this is dog');
});

app.post('/test', (req, res) => {
    res.statusCode = 200;
    res.json({ message: `echo: ${req.body.message}` });
});

app.post('/hook', (req, res) => {
    try {
        const message = req.body.message || req.body.channel_post;
        const chatId = message.chat.id;
        const name = message.chat.first_name || message.chat.title || "admin";
        const text = message.text || "";
        const reply = message.reply_to_message;

        if (text.startsWith("/start")) {
            console.log("/start chatId " + chatId);
            sendTelegramMessage(chatId,
                '*Is it busy?*\n' +
                'Share a busy wolt restaurant page with me\n' +
                'and I\'ll message you when it comes back online');
        } else if (text) {
            console.log(`incoming message ${text}`)
        }

    } catch (e) {
        console.error("hook error", e, req.body);
    }
    res.statusCode = 200;
    res.end();
});

const sendTelegramMessage = async (chat_id, text) => {
    got.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage',
        {
            form: {
                chat_id,
                text,
                parse_mode: "Markdown"
            }
        });
}

server.listen(port, () => console.log(`Proxy dashboard listening on port ${port}!`));
