const express = require('express');
const http = require('http');
const got = require('got');
const moment = require('moment-timezone');
const redis = require('redis');
const { promisify } = require("util");

const port = process.env.PORT || process.argv[2] || 3000;
const MILLISECONDS_IN_A_DAY = 86400000;
const IMPLICIT_OPEN_EVENT = {
    "type": "open",
    "value": { "$date": 0 }
}
const IMPLICIT_CLOSE_EVENT = {
    "type": "close",
    "value": { "$date": MILLISECONDS_IN_A_DAY }
}

const app = express();
const server = http.createServer(app);
app.use(express.json());

const client = redis.createClient(process.env.REDIS_URL);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);
const keysAsync = promisify(client.keys).bind(client);

const getJobs = async () => await keysAsync("jobs.*");

const addJob = async (chatId, slug) => await setAsync(`jobs.${chatId}.${slug}`, 1);

const deleteJob = async (chatId, slug) => await delAsync(`jobs.${chatId}.${slug}`);

const deleteAllChatJobs = async (chatId) => {
    const keys = await keysAsync(`jobs.${chatId}`);
    for (const key of keys) {
        await delAsync(key)
    }
}

app.get('/job', async (_, res) => {
    res.statusCode = 200;
    res.json(await getJobs());
});

app.post('/job', async ({ body: { chatId, slug }, query: { key } }, res) => {
    if (process.env.KEY == key) {
        await addJob(chatId, slug);
        res.status(200).end('ok');
    } else {
        res.status(401).end('nope');
    }
});

app.delete('/job', async ({ body: { chatId }, query: { key } }, res) => {
    if (process.env.KEY == key) {
        await deleteJob(chatId);
        res.status(200).end('ok');
    } else {
        res.status(401).end('nope');
    }
});

app.post('/contact', async ({ body: { chatIds, message }, query: { key } }, res) => {
    if (process.env.KEY == key) {
        for (const chatId of chatIds) {
            sendTelegramMessage(chatId, message);
        }
        res.status(200).end('ok');
    } else {
        res.status(401).end('nope');
    }
});

app.post('/hook', async (req, res) => {
    try {
        const message = req.body.message || req.body.channel_post;
        const chatId = message.chat.id;
        const text = (message.text || "empty").trim();

        if (text.startsWith("/start")) {
            console.log(`/start chatId ${chatId}`);
            sendTelegramMessage(chatId,
                '*Is it busy?*\n' +
                'Share a busy wolt restaurant page with me ' +
                'and I\'ll message you when it comes back online\n' +
                '🌯 🍔 😋 🍕 🥡\n\n' +
                '[Demo](https://youtu.be/jZCJEwmy0vk)');

        } else if (text.startsWith("/stop")) {
            console.log(`/stop chatId ${chatId}`);
            await deleteAllChatJobs(chatId);
            sendTelegramMessage(chatId, `Stopping. Home cooked meals are the best 😏`);

        } else if (text) {
            console.log(`incoming request for "${text}" from ${chatId}`)
            try {
                const parts = text.split('\n');
                const url = new URL(parts[parts.length - 1].trim());
                const slug = url.pathname.split('/').pop();

                const restaurant = await getRestaurant(slug);

                if (isClosedForDelivery(restaurant)) {
                    console.log(`${slug} is closed`);
                    sendTelegramMessage(chatId, `This restaurant is outside working hours, let's try a different one 🤔`);
                } else if (isDelivering(restaurant)) {
                    console.log(`${slug} is online`);
                    sendTelegramMessage(chatId, `Quickly! It is currently taking orders 🚴‍♂️`);
                } else {
                    console.log(`${slug} is having a rush. Adding a job`);
                    sendTelegramMessage(chatId, `Oh, I see that it is currently offline. I'll ping you when it comes back online 🙃`);
                    await addJob(chatId, slug)
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
    return response.results[0];
}

const getTimeOfDayInMillis = (timezone) => {
    const nowUTC = Date.now();
    const offsetInMinutes = moment.tz.zone(timezone || 'Asia/Jerusalem').utcOffset(nowUTC)
    const offsetInMillis = offsetInMinutes * 60 * 1000;
    return (nowUTC - offsetInMillis) % MILLISECONDS_IN_A_DAY;
}

const isOpenNow = (now, schedule) => {

    if (schedule.length == 0) return false;

    const firstEventIsClose = schedule[0].type == 'close'
    const lastEventIsOpen = schedule[schedule.length - 1].type == 'open'

    if (firstEventIsClose) {
        schedule = [IMPLICIT_OPEN_EVENT, ...schedule];
    }

    if (lastEventIsOpen) {
        schedule = [...schedule, IMPLICIT_CLOSE_EVENT];
    }

    for (let i = 0; i < schedule.length; i = i + 2) {
        const open = schedule[i].value.$date;
        const close = schedule[i + 1].value.$date;

        if (open < now && now < close) {
            return true;
        }
    }

    return false;
}

const getDeliverySchedule = (restaurant) => {

    const weekday = new Date().toLocaleString("en-US", {
        timeZone: restaurant.timezone || "Asia/Jerusalem",
        weekday: 'long'
    }).toLocaleLowerCase()

    const todaysSchedule = restaurant.delivery_specs.delivery_times[weekday];

    return todaysSchedule;
}

const isClosedForDelivery = (restaurant) => {
    const timeOfDayInMillis = getTimeOfDayInMillis(restaurant.timezone);
    const schedule = getDeliverySchedule(restaurant);
    const isOpen = isOpenNow(timeOfDayInMillis, schedule);

    return !isOpen;
}

const isDelivering = (restaurant) => 
    restaurant.online && restaurant.delivery_specs.delivery_enabled;

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
    const jobs = await getJobs();
    for (const job of jobs) {
        const [, chatId, slug] = job.split('.');
        try {
            console.log(`checking ${slug} for chatId ${chatId}`);
            const restaurant = await getRestaurant(slug);

            if (isClosedForDelivery(restaurant)) {
                console.log(`${slug} is now closed`);
                sendTelegramMessage(chatId, `It seems that ${slug} is closed for today 😢`);
                await deleteJob(chatId, slug);
            } else if (isDelivering(restaurant)) {
                console.log(`${slug} is back online`);
                sendTelegramMessage(chatId, `${slug} is back online! Go 🏃`);
                await deleteJob(chatId, slug);
            } else {
                console.log(`${slug} is still offline`);
            }
        } catch (e) {
            console.error("loop error", e);
        }
    }
}

server.listen(port, () => console.log(`isitbusy listening on port ${port}!`));

setInterval(theLoop, 60000);
