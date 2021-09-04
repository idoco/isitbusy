const empty = []

const open7_close24 = [
    {
        "type": "open",
        "value": {
            "$date": 7
        }
    }
]

const open0_close19 = [
    {
        "type": "close",
        "value": {
            "$date": 19
        }
    }
]

const open7_close19 = [
    {
        "type": "open",
        "value": {
            "$date": 7
        }
    },
    {
        "type": "close",
        "value": {
            "$date": 19
        }
    }
]

const open7_close14_open16_close20 = [
    {
        "type": "open",
        "value": {
            "$date": 7
        }
    },
    {
        "type": "close",
        "value": {
            "$date": 14
        }
    },
    {
        "type": "open",
        "value": {
            "$date": 16
        }
    },
    {
        "type": "close",
        "value": {
            "$date": 20
        }
    }
]

const MILLISECONDS_IN_A_DAY = 86400000;
const IMPLICIT_OPEN_EVENT = {
    "type": "open",
    "value": { "$date": 0 }
}
const IMPLICIT_CLOSE_EVENT = {
    "type": "close",
    "value": { "$date": MILLISECONDS_IN_A_DAY }
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

console.log(6, 'open7_close24', isOpenNow(6, open7_close24));
console.log(8, 'open7_close24', isOpenNow(8, open7_close24));
console.log(8, 'open0_close19', isOpenNow(8, open0_close19));
console.log(20, 'open0_close19', isOpenNow(20, open0_close19));
console.log(6, 'open7_close19', isOpenNow(6, open7_close19));
console.log(12, 'open7_close19', isOpenNow(12, open7_close19));
console.log(20, 'open7_close19', isOpenNow(20, open7_close19));
console.log(6, 'open7_close14_open16_close20', isOpenNow(6, open7_close14_open16_close20));
console.log(8, 'open7_close14_open16_close20', isOpenNow(8, open7_close14_open16_close20));
console.log(15, 'open7_close14_open16_close20', isOpenNow(15, open7_close14_open16_close20));
console.log(17, 'open7_close14_open16_close20', isOpenNow(17, open7_close14_open16_close20));
console.log(21, 'open7_close14_open16_close20', isOpenNow(21, open7_close14_open16_close20));


