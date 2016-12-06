const co = require('co');
const monitor = require('active-window');
const remote = require('electron').remote;
const robot = require('kbm-robot');
const settings = require('electron-settings');
const D2gsi = require('dota2-gsi');
const DotaTimer = require('./dota_timer');

const clipboard = remote.clipboard;
const globalShortcut = remote.globalShortcut;
const gsiListener = new D2gsi({port: 3222});

let dotaGsiClockTime;
let dotaRoshanInterval;
let dotaRoshanClipboard;
let dotaRoshanRespawnTime;
let dotaRoshanLastGsiClockTime;
let dotaAegisInterval;
let dotaAegisClipboard;
let dotaAegisExpireTime;
let dotaAegisLastGsiClockTime;
let dotaRoshanTimer;
let dotaAegisTimer;

settings.get('disable_timers').then(val => {
    val = val || false;
    $('#disable-timers').prop('checked', val);
    if (val) {
        $('#disable-chat-macros').attr('disabled', '');
    }
    return settings.get('disable_chat_macros');
}).then(val => {
    val = val || false;
    $('#disable-chat-macros').prop('checked', val);
    if (!$('#disable-timers').prop('checked') && !val) {
        robot.startJar();
        console.log('kbm-robot started.');
    }
});

window.onbeforeunload = () => {
    try {
        robot.stopJar();
        console.log('kbm-robot stopped.');
    } catch(err) {

    }
};

monitor.getActiveWindow(function(window) {
    const RoshanAndAegisShortcut = 'Insert';
    const RoshanShortcut = 'Alt+Insert';
    const AegisShortcut = 'Home';
    const ClearRoshanAndAegisShortcut = 'CmdOrCtrl+Alt+Insert';
    const ClearAegisShortcut = 'CmdOrCtrl+Alt+Home';
    try {
        if (window.app == 'dota2' && !$('#disable-timers').prop('checked')) {
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
    let lastEvent = 0;
    updateGsiStatus('listening for events...');
    client.on('newdata', function(data) {
        lastEvent = Date.now();
        updateGsiStatus('listening for events...');
        (function(timestamp) {
            setTimeout(() => {
                if (timestamp != lastEvent) return;
                // cleanup after game ends
                updateGsiStatus('inactive');
                clearTimers();
            }, 30500); // heartbeat is 30s
        }(lastEvent));
        if (data.map === undefined) return;
        if (data.map.game_state == "DOTA_GAMERULES_STATE_PRE_GAME" || data.map.game_state == "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS") {
            dotaGsiClockTime = data.map.clock_time;
            if (dotaRoshanTimer.timer._paused) dotaRoshanTimer.timer.resume();
            if (dotaAegisTimer.timer._paused) dotaAegisTimer.timer.resume();
        } else {
            dotaGsiClockTime = undefined;
        }
    });
});

$('a[href="#timers"]').click(() => {
    resizeWindow();
    function resizeWindow() {
        if ($('#timers').css('display') == 'none') return setTimeout(resizeWindow, 1);
        $(window).resize();
    }
});
$(window).resize(() => {
    const $dotaTimer = $('.dota-timer');
    const $contentContainer = $dotaTimer.find('.content-container');
    const $timerProgress = $dotaTimer.find('.timer-progress');
    $contentContainer.width($timerProgress.width());
    $contentContainer.find('img').animate({'opacity': 0.6});
});

dotaRoshanTimer = new DotaTimer('#roshan-timer .timer-progress');
dotaAegisTimer = new DotaTimer('#aegis-timer .timer-progress');

$('#disable-timers').change(function() {
    settings.set('disable_timers', this.checked);
    if (this.checked) {
        $('#disable-chat-macros').attr('disabled', '');
        globalShortcut.unregisterAll();
        robot.stopJar();
        console.log('kbm-robot stopped.');
    } else {
        $('#disable-chat-macros').removeAttr('disabled');
        robot.startJar();
        console.log('kbm-robot started.');
    }
});
$('#disable-chat-macros').change(function() {
    settings.set('disable_chat_macros', this.checked);
    if (this.checked) {
        robot.stopJar();
        console.log('kbm-robot stopped.');
    } else {
        robot.startJar();
        console.log('kbm-robot started.');
    }
});

function updateGsiStatus(message) {
    $('#gsi-status').html(message);
}

function startRoshanTimer(shouldStartAegisTimer) {
    co(function*() {
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
            dotaRoshanInterval = setInterval(onRoshanTimerTick, 1000);
            dotaRoshanTimer.timer.tick(function(tick) {
                $('#roshan-timer').find('.progressbar-text').text(toHHMMSS(tick, true));
            }).countdown(480);
        }
        const str = 'Roshan respawn: ' + roshanMinSpawnTimeHuman + ' - ' + roshanMaxSpawnTimeHuman;
        output += str;
        dotaRoshanClipboard = str;
        clipboard.writeText(output);
        let pasteResult = pasteToChatBox();
        if (shouldStartAegisTimer) {
            yield startAegisTimer(dotaGsiClockTime + 300, true);
        } else {
            yield pasteResult;
            clipboard.writeText(buildClipboardText());
        }
    });
}

function startAegisTimer(time, wait) {
    return co(function*() {
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
            dotaAegisInterval = setInterval(onAegisTimerTick, 1000);
            dotaAegisTimer.timer.tick(function(tick) {
                $('#aegis-timer').find('.progressbar-text').text(toHHMMSS(tick, true));
            }).countdown(300);
        }
        const str = 'Aegis expires: ' + aegisSpawnTime;
        output += str;
        dotaAegisClipboard = str;
        if (wait) {
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        clipboard.writeText(output);
        yield pasteToChatBox();
        clipboard.writeText(buildClipboardText());
    });
}

function onRoshanTimerTick() {
    co(function*() {
        if (dotaGsiClockTime == dotaRoshanLastGsiClockTime && !dotaRoshanTimer.timer._paused) {
            dotaRoshanTimer.timer.pause();
        }
        dotaRoshanLastGsiClockTime = dotaGsiClockTime;
        if (dotaRoshanRespawnTime - dotaGsiClockTime == 0) {
            clearInterval(dotaRoshanInterval);
            dotaRoshanInterval = null;
            let output = '▶ Roshan minimum spawn time reached!';
            clipboard.writeText(output);
            yield pasteToChatBox();
        }
        clipboard.writeText(buildClipboardText());
    });
}

function onAegisTimerTick() {
    co(function*() {
        if (dotaGsiClockTime == dotaAegisLastGsiClockTime && !dotaAegisTimer.timer._paused) {
            dotaAegisTimer.timer.pause();
        }
        dotaAegisLastGsiClockTime = dotaGsiClockTime;
        let secondsLeft = dotaAegisExpireTime - dotaGsiClockTime;
        if (secondsLeft == 180) {
            let output = '▶ Aegis expires in 3 minutes.';
            clipboard.writeText(output);
            yield pasteToChatBox();
        } else if (secondsLeft == 60) {
            let output = '▶ Aegis expires in 1 minute!';
            clipboard.writeText(output);
            yield pasteToChatBox();
        } else if (secondsLeft == 0) {
            clearInterval(dotaAegisInterval);
            dotaAegisInterval = null;
            let output = '▶ Aegis expired!';
            clipboard.writeText(output);
            yield pasteToChatBox();
        }
        clipboard.writeText(buildClipboardText());
    });
}

function clearTimers() {
    clearRoshanTimer();
    clearAegisTimer();
}

function clearRoshanTimer() {
    if (dotaRoshanInterval) {
        clearInterval(dotaRoshanInterval);
        dotaRoshanInterval = null;
        dotaRoshanClipboard = null;
        dotaRoshanTimer.stop();
    }
}

function clearAegisTimer() {
    if (dotaAegisInterval) {
        clearInterval(dotaAegisInterval);
        dotaAegisInterval = null;
        dotaAegisClipboard = null;
        dotaAegisTimer.stop();
    }
}

function buildClipboardText() {
    let output = dotaRoshanClipboard;
    if (dotaAegisClipboard) {
        output += ', ' + dotaAegisClipboard;
    }
    return output;
}

function pasteToChatBox() {
    try {
        return robot.type("enter", 50).press("ctrl").type("v", 10).release("ctrl").sleep(50).type("enter").go();
    } catch (err) {
        // ignored, disabled
    }
    return Promise.resolve();
}

function toHHMMSS(number, milliseconds, precision = 0) {
    if (milliseconds) number /= 1000;
    let sec_num =  parseFloat(number);
    if (milliseconds && precision == 0) {
        sec_num = Math.ceil(sec_num);
    }
    let hours   = Math.floor(sec_num / 3600);
    let minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    let seconds = sec_num - (hours * 3600) - (minutes * 60);
    if (milliseconds) {
        seconds = seconds.toFixed(precision);
    }

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    hours = hours > 0 ? hours+':' : '';
    return hours+minutes+':'+seconds;
}
