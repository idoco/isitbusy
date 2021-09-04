const express = require('express');
const http = require('http');
const got = require('got');
const jsonpath = require('jsonpath');
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
const getAsync = promisify(client.get).bind(client);
const delAsync = promisify(client.del).bind(client);
const keysAsync = promisify(client.keys).bind(client);

const getJobs = async () => {
    const jobs = {};
    const keys = await keysAsync("jobs.*");
    for (const key of keys) {
        jobs[key.split('.')[1]] = await getAsync(key);
    }
    return jobs;
}

const addJob = async (chatId, slug) => await setAsync(`jobs.${chatId}`, slug);

const deleteJob = async (chatId) => await delAsync(`jobs.${chatId}`);

app.get('/job', async (_, res) => {
    res.statusCode = 200;
    res.json(await getJobs());
});

app.post('/job', async ({ body: { chatId, slug } }, res) => {
    await addJob(chatId, slug);
    res.statusCode = 200;
    res.end('ok');
});

app.delete('/job', async ({ body: { chatId } }, res) => {
    await deleteJob(chatId);
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
            await deleteJob(chatId);
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

    console.log('isOpenNow1', schedule);

    if (schedule.length == 0) return false;

    const firstEventIsClose = schedule[0].type == 'close'
    const lastEventIsOpen = schedule[schedule.length - 1].type == 'open'

    if (firstEventIsClose) {
        schedule = [IMPLICIT_OPEN_EVENT, ...schedule];
    } else if (lastEventIsOpen) {
        schedule = [...schedule, IMPLICIT_CLOSE_EVENT];
    }

    console.log('isOpenNow2', schedule);

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
    schedule = getDeliverySchedule(restaurant);
    const isOpen = isOpenNow(timeOfDayInMillis, schedule);

    console.log('isClosedForDelivery', timeOfDayInMillis, schedule, isOpen);

    return !isOpen;
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

    const jobs = await getJobs();
    const chatIds = Object.keys(jobs);

    for (const chatId of chatIds) {
        try {
            const slug = jobs[chatId];
            console.log(`checking restaurant ${slug} for chatId ${chatId}`);

            const restaurant = await getRestaurant(slug);

            if (isClosedForDelivery(restaurant)) {
                console.log(`${slug} is now closed`);
                sendTelegramMessage(chatId, `It seems that the restaurant is closed for today 😢`);
                await deleteJob(chatId);
            } else if (restaurant.online) {
                console.log(`${slug} is back online`);
                sendTelegramMessage(chatId, `The restaurant is back online! Go 🏃`);
                await deleteJob(chatId);
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
