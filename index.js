// const request = require('request');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
app.use(express.json());
// app.use(express.static('dist', {index: 'demo.html', maxage: '4h'}));

const port = process.env.PORT || process.argv[2] || 3000;

app.get('/test', (_, res) => {
    res.statusCode = 200;
    res.end(
        `cool yes`);
});

app.post('/test', (req, res) => {
    res.statusCode = 200;
    res.json({message: `echo: ${req.body.message}`});
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
                'and I\'ll message you when it comes back online',
                "Markdown");
        } else if (text){
            io.emit(chatId, {name, text, from: 'admin'});
        }

    } catch (e) {
        console.error("hook error", e, req.body);
    }
    res.statusCode = 200;
    res.end();
});

function sendTelegramMessage(chatId, text, parseMode) {
    // request
    //     .post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage')
    //     .form({
    //         "chat_id": chatId,
    //         "text": text,
    //         "parse_mode": parseMode
    //     });
}

server.listen(port, () => console.log(`Proxy dashboard listening on port ${port}!`));
