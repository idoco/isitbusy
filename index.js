const express = require('express');
const http = require('http');
const got = require('got');
const jsonpath = require('jsonpath');

const app = express();
const server = http.createServer(app);
app.use(express.json());

const port = process.env.PORT || process.argv[2] || 3000;
const MILLISECONDS_IN_A_DAY = 86400000;
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// todo: move to redis
const jobs = {};

app.get('/job', (_, res) => {
    res.statusCode = 200;
    res.json(jobs);
});

app.post('/job', (req, res) => {
    const {chatId, slug} = req.body
    jobs[chatId] = slug;
    res.statusCode = 200;
    res.end('ok');
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

                const restaurant = await getRestaurant(slug);

                if (isClosedForDelivery(restaurant)) {
                    sendTelegramMessage(chatId, `It seems that the restaurant is currently closed, let's try a different one 🤔`);
                } else if (restaurant.online) {
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

const getRestaurant = async (slug) => {
    const response = await got.get(`https://restaurant-api.wolt.com/v3/venues/slug/${slug}`)
        .json();
    return response.results[0]
}

const getTimeOfDayInMillis = (timezone) => Date.now(timezone || "Asia/Jerusalem") % MILLISECONDS_IN_A_DAY;

const getDeliveryHours = (restaurant) => {

    const weekday = new Date().toLocaleString("en-US", {
        timeZone: restaurant.timezone || "Asia/Jerusalem",
        weekday: 'long'
    }).toLocaleLowerCase()

    const schedule = restaurant.delivery_specs.delivery_times;

    const open = jsonpath.query(schedule, `$['${weekday}'][?(@.type == 'open')].value['$date']`)[0] || MILLISECONDS_IN_A_DAY;
    const close = jsonpath.query(schedule, `$['${weekday}'][?(@.type == 'close')].value['$date']`)[0] || 0;

    return { open, close };
}

const isClosedForDelivery = (restaurant) => {
    const timeOfDayInMillis = getTimeOfDayInMillis(restaurant.timezone)
    const { open, close } = getDeliveryHours(restaurant);

    console.log('isClosedForDelivery', timeOfDayInMillis, open, close);

    return timeOfDayInMillis < open || timeOfDayInMillis > close;
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
        console.log(`checking restaurant ${slug} for chatId ${chatId}`);

        const restaurant = await getRestaurant(slug);

        if (isClosedForDelivery(restaurant)) {
            sendTelegramMessage(chatId, `It seems that the restaurant is closed for today 😢`);
            delete jobs[chatId];
        } else if (restaurant.online) {
            sendTelegramMessage(chatId, `The restaurant is back online! Go 🏃`);
            delete jobs[chatId];
        } else {
            sendTelegramMessage(chatId, `Still offline 😔`);
        }
    }
}

server.listen(port, () => console.log(`Proxy dashboard listening on port ${port}!`));

setInterval(theLoop, 60000);
