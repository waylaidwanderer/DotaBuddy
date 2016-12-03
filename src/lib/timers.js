const monitor = require('active-window');
const remote = require('electron').remote;
const robot = require('kbm-robot');
const D2gsi = require('dota2-gsi');

const clipboard = remote.clipboard;
const globalShortcut = remote.globalShortcut;
const gsiListener = new D2gsi({port: 3222});

let dotaGsiClockTime;
let dotaRoshanInterval;
let dotaRoshanRespawnTime;
let dotaAegisInterval;
let dotaAegisExpireTime;

robot.startJar();

window.onbeforeunload = () => {
    robot.stopJar();
};

monitor.getActiveWindow(function(window) {
    const RoshanAndAegisShortcut = 'Insert';
    const RoshanShortcut = 'Alt+Insert';
    const AegisShortcut = 'Home';
    const ClearRoshanAndAegisShortcut = 'CmdOrCtrl+Alt+Insert';
    const ClearAegisShortcut = 'CmdOrCtrl+Alt+Home';
    try {
        if (window.app == 'dota2') {
            if (!globalShortcut.isRegistered(RoshanAndAegisShortcut)) {
                const ret = globalShortcut.register(RoshanAndAegisShortcut, function() {
                    startRoshanTimer(true);
                });
                if (!ret) {
                    console.log('"' + RoshanAndAegisShortcut + '" registration failed');
                }
            }
            if (!globalShortcut.isRegistered(RoshanShortcut)) {
                const ret = globalShortcut.register(RoshanShortcut, startRoshanTimer);
                if (!ret) {
                    console.log('"' + RoshanShortcut + '" registration failed');
                }
            }
            if (!globalShortcut.isRegistered(AegisShortcut)) {
                const ret = globalShortcut.register(AegisShortcut, startAegisTimer);
                if (!ret) {
                    console.log('"' + AegisShortcut + '" registration failed');
                }
            }
            if (!globalShortcut.isRegistered(ClearRoshanAndAegisShortcut)) {
                const ret = globalShortcut.register(ClearRoshanAndAegisShortcut, clearTimers);
                if (!ret) {
                    console.log('"' + ClearRoshanAndAegisShortcut + '" registration failed');
                }
            }
            if (!globalShortcut.isRegistered(ClearAegisShortcut)) {
                const ret = globalShortcut.register(ClearAegisShortcut, clearAegisTimer);
                if (!ret) {
                    console.log('"' + ClearAegisShortcut + '" registration failed');
                }
            }
        } else {
            globalShortcut.unregisterAll();
        }
    } catch(err) {
        console.log(err);
    }
}, -1, 1);

gsiListener.events.on('newclient', function(client) {
    updateGsiStatus('listening for events...');
    client.on('newdata', function(data) {
        if (data.map === undefined) return;
        if (data.map.game_state == "DOTA_GAMERULES_STATE_PRE_GAME" || data.map.game_state == "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS") {
            dotaGsiClockTime = data.map.clock_time;
        } else {
            dotaGsiClockTime = undefined;
        }
    });
});

function updateGsiStatus(message) {
    $('#gsi-status').html(message);
}

function startRoshanTimer(shouldStartAegisTimer) {
    shouldStartAegisTimer = shouldStartAegisTimer || false;
    if (dotaGsiClockTime === undefined) {
        console.log('Game not in progress');
        return;
    }
    $('ul.tabs').tabs('select_tab', 'timers');
    let roshanMinSpawnTime = dotaGsiClockTime + 480;
    let roshanMinSpawnTimeHuman = toHHMMSS(roshanMinSpawnTime);
    let roshanMaxSpawnTime = dotaGsiClockTime + 660;
    let roshanMaxSpawnTimeHuman = toHHMMSS(roshanMaxSpawnTime);
    let output = '▶ ';
    if (dotaRoshanInterval) {
        output += '(Reminder) ';
        roshanMinSpawnTimeHuman = toHHMMSS(dotaRoshanRespawnTime);
        roshanMaxSpawnTimeHuman = toHHMMSS(dotaRoshanRespawnTime + 180);
        if (!dotaAegisInterval) {
            shouldStartAegisTimer = false;
        }
    } else {
        dotaRoshanRespawnTime = roshanMinSpawnTime;
        dotaRoshanInterval = setInterval(onRoshanTimerTick, 750);
    }
    output += 'Roshan respawn: ' + roshanMinSpawnTimeHuman + ' - ' + roshanMaxSpawnTimeHuman;
    clipboard.writeText(output);
    pasteToChatBox();
    if (shouldStartAegisTimer) {
        (function(dotaGsiClockTime) {
            setTimeout(function() {
                startAegisTimer(dotaGsiClockTime + 300)
            }, 1000);
        })(dotaGsiClockTime);
    }
}

function startAegisTimer(time) {
    if (dotaGsiClockTime === undefined) {
        console.log('Game not in progress');
        return;
    }
    $('ul.tabs').tabs('select_tab', 'timers');
    time = time || dotaGsiClockTime + 300;
    let output = '▶ ';
    let aegisSpawnTime = toHHMMSS(time);
    if (dotaAegisInterval) {
        output += '(Reminder) ';
        aegisSpawnTime = toHHMMSS(dotaAegisExpireTime);
    } else {
        dotaAegisExpireTime = time;
        dotaAegisInterval = setInterval(onAegisTimerTick, 750);
    }
    output += 'Aegis expires: ' + aegisSpawnTime;
    clipboard.writeText(output);
    pasteToChatBox();
}

function onRoshanTimerTick() {
    if (dotaRoshanRespawnTime - dotaGsiClockTime == 0) {
        clearInterval(dotaRoshanInterval);
        dotaRoshanInterval = null;
        let output = '▶ Roshan minimum spawn time reached!';
        clipboard.writeText(output);
        pasteToChatBox();
    }
}

function onAegisTimerTick() {
    let secondsLeft = dotaAegisExpireTime  - dotaGsiClockTime;
    if (secondsLeft == 180) {
        let output = '▶ Aegis expires in 3 minutes.';
        clipboard.writeText(output);
        pasteToChatBox();
    } else if (secondsLeft == 60) {
        let output = '▶ Aegis expires in 1 minute!';
        clipboard.writeText(output);
        pasteToChatBox();
    } else if (secondsLeft == 0) {
        clearInterval(dotaAegisInterval);
        dotaAegisInterval = null;
        let output = '▶ Aegis expired!';
        clipboard.writeText(output);
        pasteToChatBox();
    }
}

function clearTimers() {
    clearRoshanTimer();
    clearAegisTimer();
}

function clearRoshanTimer() {
    if (dotaRoshanInterval) {
        clearInterval(dotaRoshanInterval);
        dotaRoshanInterval = null;
    }
}

function clearAegisTimer() {
    if (dotaAegisInterval) {
        clearInterval(dotaAegisInterval);
        dotaAegisInterval = null;
    }
}

function pasteToChatBox() {
    robot.type("enter", 50).press("ctrl").type("v", 10).release("ctrl").sleep(50).type("enter").go();
}

function toHHMMSS(number) {
    let sec_num = parseInt(number, 10); // don't forget the second param
    let hours   = Math.floor(sec_num / 3600);
    let minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    let seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    hours = hours > 0 ? hours+':' : '';
    return hours+minutes+':'+seconds;
}
