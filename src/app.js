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
import d2gsi from 'dota2-gsi';
import monitor from 'active-window';
import robot from 'robotjs';
var CountDownTimer = require('./lib/countdown.js');
var DotaHelper = require('./lib/dota.js');

var app = remote.app;
var globalShortcut = remote.globalShortcut;
var clipboard = remote.clipboard;
var dialog = remote.dialog;
var appDir = jetpack.cwd(app.getAppPath());
var manifest = appDir.read('package.json', 'json');

var dotaHelper = new DotaHelper();
var gsiListener = new d2gsi({port: 3222});
var steamApiKey = '';
var steamUser;
var serverLogPath;

var heroesListCache;

// load global stuff for Vue
var globalData = {
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
var radiantPlayers = {
    players: []
};
var radiantVue = new Vue({
    el: '#radiant',
    data: radiantPlayers,
    watch: {
        'players': function() {
            $('.collapsible').collapsible();
            $('main').perfectScrollbar('update');
        }
    }
});
var direPlayers = {
    players: []
};
var direVue = new Vue({
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
    try {
        if (window.app == 'dota2') {
            if (globalShortcut.isRegistered('Insert')) return;
            const ret = globalShortcut.register('Insert', startRoshanTimer);
            if (!ret) {
                console.log('registration failed');
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
        var ok = false;
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
    }
});

// bind titlebar stuff
$('.minimize').click(function() {
    remote.getCurrentWindow().minimize();
});
$('.maximize').click(function() {
    var window = remote.getCurrentWindow();
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

$(document).ready(function() {
    $('main').perfectScrollbar();
});

$(document).on('click', 'a[target="_blank"]', function(e) {
    e.preventDefault();
    remote.shell.openExternal(this.href);
});

// steam api key input
$('#steam-api-key').change(function() {
    var key = $(this).val();
    settings.get('steam_api_key').then(val => {
        if (val === undefined) {
            steamApiKey = key;
            steamUser = new SteamApi.User(key);
        }
        settings.set('steam_api_key', key);
        Materialize.toast('Steam API key saved!', 5000, 'rounded');
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
        var fileName = fileNames[0];
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

var dotaGsiClockTime;
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

function cacheHeroesList(callback) {
    jQuery.get('http://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1?key='+steamApiKey)
    .done(function(res) {
        heroesListCache = {
            timestamp: Math.round(Date.now()/1000),
            response: res
        };
        fs.writeFileSync('./heroes.json', JSON.stringify(heroesListCache));
        if (typeof callback === 'function') callback(res);
    });
}

function getHeroesList() {
    if (heroesListCache === undefined) {
        heroesListCache = JSON.parse(fs.readFileSync('./heroes.json').toString());
        if (Math.round(Date.now()/1000) - heroesListCache.timestamp > 24 * 60 * 60) cacheHeroesList();
    }
    return heroesListCache.response.result;
}

function getHeroById(id) {
    var heroesList = getHeroesList();
    var res;
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
    var i;
    for (i = 0; i < 5; i++) {
        radiantPlayers.players.push(initialPlayerState());
        direPlayers.players.push(initialPlayerState());
    }
    var steamId64s = [];
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
        var players = res.response.players;
        var playerIndex = 0;
        var radiantIndex = 0;
        var direIndex = 0;
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
        var result = res.result;
        var heroes = [];
        for (var i = 0; i < 20; i++) {
            heroes.push(initialHeroState());
        }
        var playerObject = {
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
                    var kda = 'N/A';
                    var win = true;
                    $.each(details.players, function(dpI, detailPlayer) {
                        if (detailPlayer.account_id != steamId.accountid) return true;
                        kda = detailPlayer.kills + '/' + detailPlayer.deaths + '/' + detailPlayer.assists;
                        var radiant = detailPlayer.player_slot <= 4;
                        win = details.radiant_win == radiant;
                        return false;
                    });
                    var hero = getHeroById(matchPlayer.hero_id);
                    var heroName = hero.name.replace('npc_dota_hero_', '');
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

var matchDetails = {};
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

function startRoshanTimer() {
    if (dotaGsiClockTime === undefined) {
        console.log('Game not in progress');
        return;
    }
    var roshanMinSpawnTime = dotaGsiClockTime + 480;
    var roshanMinSpawnTimeHuman = toHHMMSS(roshanMinSpawnTime);
    var roshanMaxSpawnTime = dotaGsiClockTime + 660;
    var roshanMaxSpawnTimeHuman = toHHMMSS(roshanMaxSpawnTime);
    var output = 'Roshan respawn: ' + roshanMinSpawnTimeHuman + ' - ' + roshanMaxSpawnTimeHuman;
    clipboard.writeText(output);
    console.log(output);
    robot.keyTap('enter');
    setTimeout(function() {
        robot.keyTap('v', 'control');
        setTimeout(function() {
            robot.keyTap('enter');
        }, 10);
    }, 10);
}

function toHHMMSS(number) {
    var sec_num = parseInt(number, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return hours+':'+minutes+':'+seconds;
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
