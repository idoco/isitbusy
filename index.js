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

app.post('/hook', async (req, res) => {
    try {
        const message = req.body.message || req.body.channel_post;
        const chatId = message.chat.id;
        const text = message.text || "empty";

        if (text.startsWith("/start")) {
            console.log("/start chatId " + chatId);
            sendTelegramMessage(chatId,
                '*Is it busy?*\n' +
                'Share a busy wolt restaurant page with me\n' +
                'and I\'ll message you when it comes back online');
        } else if (text) {
            console.log(`incoming message ${text}`)
            try {
                const url = new URL(text.trim());
                const slug = url.pathname.split('/').pop();
                console.log(`slug ${slug}`)
                const status = await checkRestaurantStatus(slug);
                console.log(`status ${status}`)
                sendTelegramMessage(chatId,`current status is ${status}`);
            } catch (e) {
                console.error("message error", e);
                sendTelegramMessage(chatId,'nope');
            }
        }

    } catch (e) {
        console.error("hook error", e, req.body);
    }
    res.statusCode = 200;
    res.end();
});

const checkRestaurantStatus = async (slug) => {
    const res = await got.get(`https://restaurant-api.wolt.com/v3/venues/slug/${slug}`);
    return res.body.results[0].online;
}

const sendTelegramMessage = async (chat_id, text) => {
    got.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
        {
            form: {
                chat_id,
                text,
                parse_mode: "Markdown"
            }
        });
}

server.listen(port, () => console.log(`Proxy dashboard listening on port ${port}!`));
