const express = require('express');
const http = require('http');
const got = require('got');

const app = express();
const server = http.createServer(app);
app.use(express.json());

const port = process.env.PORT || process.argv[2] || 3000;

// todo: move to redis
const jobs = {};

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
            console.log(`/start chatId ${chatId}`);
            sendTelegramMessage(chatId,
                '*Is it busy?*\n' +
                'Share a busy wolt restaurant page with me ' +
                'and I\'ll message you when it comes back online\n' +
                '🌯 🍔 😋 🍕 🥡');

        } else if (text.startsWith("/stop")) {
            console.log(`/stop chatId ${chatId}`);
            delete jobs[chatId];
            sendTelegramMessage(chatId, `Stopping. Home cooked meals are the best 😏`);

        } else if (text) {
            console.log(`incoming message "${text}" from ${chatId}`)
            try {
                const url = new URL(text.trim());
                const slug = url.pathname.split('/').pop();
                const status = await checkRestaurantStatus(slug);
                console.log(`status ${status}`)

                if (status) {
                    sendTelegramMessage(chatId, `Quickly! It is currently taking orders 🚴‍♂️`);
                } else {
                    sendTelegramMessage(chatId, `Oh, I see that it is currently offline. I'll ping you when it comes back online 🙃`);
                    jobs[chatId] = slug;
                }

            } catch (e) {
                console.error("message error", e);
                sendTelegramMessage(chatId, 'nope');
            }
        }

    } catch (e) {
        console.error("hook error", e, req.body);
    }
    res.statusCode = 200;
    res.end();
});

const checkRestaurantStatus = async (slug) => {
    const res = await got.get(`https://restaurant-api.wolt.com/v3/venues/slug/${slug}`)
        .json();
    return res.results[0].online;
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

const theLoop = async () => {

    const chatIds = Object.keys(jobs);
    for (const chatId of chatIds) {
        const slug = jobs[chatId];
        console.log(`checking chatId ${chatId} for slug ${slug}`);
        const status = await checkRestaurantStatus(slug);

        if (status) {
            sendTelegramMessage(chatId, `The restaurant is back online! Go 🏃`);
            delete jobs[chatId];
        } else {
            sendTelegramMessage(chatId, `Still offline 😔`);
        }
    }
}

server.listen(port, () => console.log(`Proxy dashboard listening on port ${port}!`));

setInterval(theLoop, 60000);
