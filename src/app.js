import os from 'os'; // native node.js module
import fs from 'fs';
import { remote } from 'electron'; // native electron module
import jetpack from 'fs-jetpack'; // module loaded from npm
import path from 'path';
import settings from 'electron-settings';
import jQuery from 'jquery';
import SteamID from 'steamid';
import SteamApi from 'steam-api';
import async from 'async';
import D2gsi from 'dota2-gsi';
import monitor from 'active-window';
import robot from 'kbm-robot';

const DotaHelper = require('./lib/dota.js');

const app = remote.app;
const globalShortcut = remote.globalShortcut;
const clipboard = remote.clipboard;
const dialog = remote.dialog;
const appDir = jetpack.cwd(app.getAppPath());
const manifest = appDir.read('package.json', 'json');

const dotaHelper = new DotaHelper();
const gsiListener = new D2gsi({port: 3222});
let steamApiKey = '';
let steamUser;
let serverLogPath;
let heroesListCache;

let dotaGsiClockTime;
let dotaRoshanInterval;
let dotaRoshanRespawnTime;
let dotaAegisInterval;
let dotaAegisExpireTime;

// load global stuff for Vue
const globalData = {
    title: manifest.productName + " v" + manifest.version
};
new Vue({
    el: 'nav',
    data: globalData
});
new Vue({
    el: 'head',
    data: globalData
});
const radiantPlayers = {
    players: []
};
const radiantVue = new Vue({
    el: '#radiant',
    data: radiantPlayers,
    watch: {
        'players': function() {
            $('.collapsible').collapsible();
            $('main').perfectScrollbar('update');
        }
    }
});
const direPlayers = {
    players: []
};
const direVue = new Vue({
    el: '#dire',
    data: direPlayers,
    watch: {
        'players': function() {
            $('.collapsible').collapsible();
            $('main').perfectScrollbar('update');
        }
    }
});

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

// load settings
settings.get('server_log_path').then(val => {
    if (val !== undefined) {
        let ok = false;
        try {
            fs.accessSync(val, fs.F_OK);
            $('#serverlog-path').val(val);
            serverLogPath = val;
            ok = true;
        } catch (e) {
            console.log(e);
            // todo: dialog
            settings.delete('server_log_path');
        }
        if (ok) {
            dotaHelper.watchServerLog(val, renderPlayers);
            updateServerLogStatus('Waiting for game to start...');
        }
    }
});

settings.get('steam_api_key').then(val => {
    if (val !== undefined) {
        steamApiKey = val;
        steamUser = new SteamApi.User(val);
        $('#steam-api-key').val(val);
        getHeroesList();
    }
});

// bind titlebar stuff
$('.minimize').click(function() {
    remote.getCurrentWindow().minimize();
});
$('.maximize').click(function() {
    let window = remote.getCurrentWindow();
    if (window.isMaximized()) {
        window.unmaximize();
        $(this).find('i').text('expand_less');
    } else {
        window.maximize();
        $(this).find('i').text('expand_more');
    }
});
$('.close').click(function() {
    remote.getCurrentWindow().close();
});
$(window).resize(function() {
    if (remote.getCurrentWindow().isMaximized()) {
        $('.maximize').find('i').text('expand_more');
    } else {
        $('.maximize').find('i').text('expand_less');
    }
});

robot.startJar();

$(document).ready(function() {
    $('main').perfectScrollbar();
});

$(document).on('click', 'a[target="_blank"]', function(e) {
    e.preventDefault();
    remote.shell.openExternal(this.href);
});

// steam api key input
$('#steam-api-key').change(function() {
    let key = $(this).val();
    settings.get('steam_api_key').then(val => {
        if (val === undefined) {
            steamApiKey = key;
            steamUser = new SteamApi.User(key);
        }
        settings.set('steam_api_key', key);
        Materialize.toast('Steam API key saved!', 5000, 'rounded');
        getHeroesList();
    });
});

// server_log.txt stuff
$('#serverlog-locate').click(function() {
    dialog.showOpenDialog({
        filters: [
            {name: 'server_log.txt', extensions: ['txt']}
        ]
    }, function onSetServerLogPath(fileNames) {
        if (fileNames === undefined) return;
        let fileName = fileNames[0];
        if (path.basename(fileName) != 'server_log.txt') {
            // todo: dialog
            return;
        }
        settings.set('server_log_path', fileName);
        $('#serverlog-path').val(fileName);
        serverLogPath = fileName;
        dotaHelper.watchServerLog(fileName, renderPlayers);
        updateServerLogStatus('Waiting for game to start...');
    });
});

$(document).on('click.collapse', '.collapsible-header', function(e) {
    if ($(e.target).get(0).tagName == "A" && $(e.target).attr('target') == "_blank") {
        $(this).trigger('click.collapse');
    }
});

$('.collapsible .header').click(function() {
    if ($(this).data('state') == 'open') {
        $(this).parent().find('.active').trigger('click.collapse');
        $(this).data('state', 'closed');
    } else {
        $(this).parent().find('.collapsible-header:not(.active)').trigger('click');
        $(this).data('state', 'open');
    }
});

$('#reparse').click(function() {
    renderPlayers(dotaHelper.readServerLog(serverLogPath, true));
});

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

document.addEventListener("keydown", function (e) {
    if (e.which === 123) {
        remote.getCurrentWindow().toggleDevTools();
    } else if (e.which === 116) {
        location.reload();
    }
});

function cacheHeroesList(callback) {
    jQuery.get('http://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1?key='+steamApiKey)
    .done(function(res) {
        heroesListCache = {
            timestamp: Math.round(Date.now()/1000),
            response: res
        };
        fs.writeFileSync(__dirname + '/heroes.json', JSON.stringify(heroesListCache));
        if (typeof callback === 'function') callback(res);
    });
}

function getHeroesList() {
    if (heroesListCache === undefined) {
        try {
            fs.accessSync(__dirname + '/heroes.json', fs.F_OK);
            heroesListCache = JSON.parse(fs.readFileSync(__dirname + '/heroes.json').toString());
            if (Math.round(Date.now()/1000) - heroesListCache.timestamp > 24 * 60 * 60) cacheHeroesList();
        } catch (e) {
            cacheHeroesList();
        }
    } else {
        return heroesListCache.response.result;
    }
    return null;
}

function getHeroById(id) {
    let heroesList = getHeroesList();
    let res;
    $.each(heroesList.heroes, function(index, hero) {
        if (hero.id == id) {
            res = hero;
            return false;
        }
    });
    return res;
}

function renderPlayers(steamIds) {
    if (steamIds.length == 0 || steamApiKey == '') return;
    updateServerLogStatus('Lobby found, retrieving player details...');
    radiantPlayers.players = [];
    direPlayers.players = [];
    for (let i = 0; i < 5; i++) {
        radiantPlayers.players.push(initialPlayerState());
        direPlayers.players.push(initialPlayerState());
    }
    let steamId64s = [];
    steamIds.forEach(function(steamId) {
        steamId64s.push(steamId.getSteamID64());
    });
    jQuery.get('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + steamApiKey + '&steamids=' + steamId64s.join())
    .done(function(res) {
        if (res.response === undefined || res.response.players === undefined) {
            setTimeout(function() {
                renderPlayers(steamIds);
            }, 2000);
            return;
        }
        let players = res.response.players;
        let playerIndex = 0;
        let radiantIndex = 0;
        let direIndex = 0;
        steamIds.forEach(function(steamId) {
            $.each(players, function(index, player) {
                if (player.steamid == steamId.getSteamID64()) {
                    if (playerIndex > 4) {
                        renderMatchHistory(steamIds.length, playerIndex, direIndex, steamId, player, false);
                        direIndex++;
                    } else {
                        renderMatchHistory(steamIds.length, playerIndex, radiantIndex, steamId, player, true);
                        radiantIndex++;
                    }
                    return false;
                }
            });
            playerIndex++;
        });
        updateServerLogStatus('Waiting for game to start...');
    })
    .fail(function() {
        setTimeout(function() {
            renderPlayers(steamIds);
        }, 2000);
    });
}

function renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback) {
    jQuery.get('http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1?key='+steamApiKey+'&game_mode=1,2,3&account_id='+steamId.accountid+'&matches_requested=20')
    .done(function(res) {
        let result = res.result;
        let heroes = [];
        for (let i = 0; i < 20; i++) {
            heroes.push(initialHeroState());
        }
        let playerObject = {
            user: player,
            accountId: steamId.accountid,
            status: result.status,
            heroes: heroes,
            solo_mmr: 'N/A',
            party_mmr: 'N/A',
            estimated_mmr: 'N/A'
        };
        try {
            if (radiant) {
                radiantVue.players.$set(teamIndex, playerObject);
            } else {
                direVue.players.$set(teamIndex, playerObject);
            }
        } catch (err) {
            console.log(err);
            setTimeout(function() {
                renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback);
            }, 2000);
            return false;
        }
        updateMmr(playerObject, steamId);
        if (result.status != 1) return;
        $.each(result.matches, function(matchIndex, match) {
            $.each(match.players, function(matchPlayerIndex, matchPlayer) {
                if (matchPlayer.account_id != steamId.accountid) return true;
                getMatchDetails(match.match_id, function setPlayerHeroes(details) {
                    let kda = 'N/A';
                    let win = true;
                    $.each(details.players, function(dpI, detailPlayer) {
                        if (detailPlayer.account_id != steamId.accountid) return true;
                        kda = detailPlayer.kills + '/' + detailPlayer.deaths + '/' + detailPlayer.assists;
                        let radiant = detailPlayer.player_slot <= 4;
                        win = details.radiant_win == radiant;
                        return false;
                    });
                    let hero = getHeroById(matchPlayer.hero_id);
                    let heroName = hero.name.replace('npc_dota_hero_', '');
                    try {
                        playerObject.heroes.$set(matchIndex, {
                            img: 'http://cdn.dota2.com/apps/dota2/images/heroes/' + heroName + '_lg.png',
                            kda: kda,
                            win: win,
                            match_id: match.match_id
                        });
                    } catch (err) {
                        console.log(err);
                        setTimeout(function() {
                            renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback);
                        }, 2000);
                        return false;
                    }
                });
                return false;
            });
        });
    })
    .fail(function() {
        setTimeout(function() {
            renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback);
        }, 2000);
    });
}

function updateMmr(playerObject, steamId, fail) {
    fail = fail | 1;
    jQuery.get('https://api.opendota.com/api/players/' + steamId.accountid)
    .done(function(res) {
        if (res.solo_competitive_rank != null) {
            Vue.set(playerObject, 'solo_mmr', res.solo_competitive_rank);
        }
        if (res.competitive_rank != null) {
            Vue.set(playerObject, 'party_mmr', res.competitive_rank);
        }
        if (res.mmr_estimate != null && res.mmr_estimate.n != 0) {
            Vue.set(playerObject, 'estimated_mmr', res.mmr_estimate.estimate);
        }
    })
    .fail(function() {
        setTimeout(function() {
            updateMmr(playerObject, steamId, fail + 1);
        }, fail * 1000);
    });
}

let matchDetails = {};
function getMatchDetails(matchId, callback) {
    if (matchDetails.hasOwnProperty(matchId)) {
        callback(matchDetails[matchId]);
    } else {
        jQuery.get('http://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1?key='+steamApiKey+'&match_id='+matchId)
        .done(function(res) {
            matchDetails[matchId] = res.result;
            callback(res.result);
        }).fail(function() {
            setTimeout(function() {
                getMatchDetails(matchId, callback);
            }, 2000);
        });
    }
}

function updateServerLogStatus(message) {
    $('#serverlog-status').html(message);
}

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

function initialPlayerState() {
    return {
        accountId: undefined,
        heroes: [],
        status: undefined,
        user: {
            personaname: undefined,
            avatarmedium: undefined,
            profileurl: undefined,
        },
        estimated_mmr: undefined,
        party_mmr: undefined,
        solo_mmr: undefined,
    };
}

function initialHeroState() {
    return {
        win: true,
        kda: undefined,
        img: undefined,
        match_id: undefined,
    };
}
