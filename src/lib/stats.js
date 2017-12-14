const co = require('co');
const fs = require('fs');
const path = require('path');
const remote = require('electron').remote;
const request = require('request');
const settings = require('electron-settings');
const DotaHelper = require('./dota');
const SteamApi = require('steam-api');

const dialog = remote.dialog;
const dotaHelper = new DotaHelper();

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

let steamApiKey = '';
let steamUser;
let serverLogPath;
let heroesListCache;

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

$('#reparse').click(function() {
    renderPlayers(dotaHelper.readServerLog(serverLogPath, true));
});

function cacheHeroesList(callback) {
    callback = callback || function() {};
    request.get('http://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1?key='+steamApiKey, (err, res, body) => {
        if (err) {
            console.log(err);
            return callback(null);
        }
        if (res.statusCode != 200) {
            console.log(res.statusCode, body);
            return callback(null);
        }
        heroesListCache = {
            timestamp: Math.round(Date.now()/1000),
            response: JSON.parse(body)
        };
        fs.writeFileSync(__dirname + '/heroes.json', JSON.stringify(heroesListCache));
        callback(body);
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
    let res = null;
    for (let i = 0; i < heroesList.heroes.length; i++) {
        let hero = heroesList.heroes[i];
        if (hero.id != id) continue;
        res = hero;
        break;
    }
    return res;
}

function renderPlayers(steamIds) {
    co(function* () {
        if (steamIds.length == 0 || steamApiKey == '') return;
        updateServerLogStatus('Lobby found, retrieving player details...');
        radiantPlayers.players = [];
        direPlayers.players = [];
        for (let i = 0; i < 5; i++) {
            radiantPlayers.players.push(initialPlayerState());
            direPlayers.players.push(initialPlayerState());
        }
        let steamId64s = [];
        for (let i = 0; i < steamIds.length; i++) {
            steamId64s.push(steamIds[i].getSteamID64());
        }
        try {
            const playerSummariesResult = new Promise((resolve, reject) => {
                request.get('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + steamApiKey + '&steamids=' + steamId64s.join(), (err, res, body) => {
                    if (err) return reject(err);
                    if (res.statusCode != 200) return reject(res.statusCode + "\n" + body);
                    resolve(JSON.parse(body));
                });
            });
            let res = yield playerSummariesResult;
            if (res.response === undefined || res.response.players === undefined) {
                return setTimeout(() => renderPlayers(steamIds), 2000);
            }
            let players = res.response.players;
            let playerIndex = 0;
            let radiantIndex = 0;
            let direIndex = 0;
            for (let i = 0; i < steamIds.length; i++) {
                let steamId = steamIds[i];
                for (let j = 0; j < players.length; j++) {
                    let player = players[j];
                    if (player.steamid != steamId.getSteamID64()) continue;
                    if (playerIndex > 4) {
                        renderMatchHistory(steamIds.length, playerIndex, direIndex, steamId, player, false);
                        direIndex++;
                    } else {
                        renderMatchHistory(steamIds.length, playerIndex, radiantIndex, steamId, player, true);
                        radiantIndex++;
                    }
                    break;
                }
                playerIndex++;
            }
            updateServerLogStatus('Waiting for game to start...');
        } catch (err) {
            setTimeout(() => renderPlayers(steamIds), 2000);
        }
    });
}

function renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback) {
    co(function* () {
        const matchHistoryResults = new Promise((resolve, reject) => {
            request.get('https://api.opendota.com/api/players/' + steamId.accountid + '/recentMatches', (err, res, body) => {
                if (err) return reject(err);
                if (res.statusCode != 200) return reject(res.statusCode + "\n" + body);
                resolve(JSON.parse(body));
            });
        });
        let result;
        try {
            result = yield matchHistoryResults;
        } catch (err) {
            console.log(err);
            return setTimeout(() => renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback), 2000);
        }
        let heroes = [];
        for (let i = 0; i < 20; i++) {
            heroes.push(initialHeroState());
        }
        let playerObject = {
            user: player,
            accountId: steamId.accountid,
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
            return setTimeout(() => renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback), 2000);
        }
        updateMmr(playerObject, steamId);
        for (let matchIndex = 0; matchIndex < result.length; matchIndex++) {
            let match = result[matchIndex];
            new Promise(resolve => {
                getMatchDetails(match.match_id, details => resolve(details));
            }).then(details => {
                let kda = 'N/A';
                let xpm = 0;
                let gpm = 0;
                let win = true;
                for (let i = 0; i < details.players.length; i++) {
                    let detailPlayer = details.players[i];
                    if (detailPlayer.account_id != steamId.accountid) continue;
                    kda = detailPlayer.kills + '/' + detailPlayer.deaths + '/' + detailPlayer.assists;
                    xpm = detailPlayer.xp_per_min;
                    gpm = detailPlayer.gold_per_min;
                    let radiant = detailPlayer.player_slot <= 4;
                    win = details.radiant_win == radiant;
                    break;
                }
                let hero = getHeroById(match.hero_id);
                let heroName = hero.name.replace('npc_dota_hero_', '');
                try {
                    playerObject.heroes.$set(matchIndex, {
                        img: 'http://cdn.dota2.com/apps/dota2/images/heroes/' + heroName + '_lg.png',
                        kda: kda,
                        win: win,
                        gpm: gpm,
                        xpm: xpm,
                        match_id: match.match_id
                    });
                } catch (err) {
                    console.log(err);
                    return setTimeout(() => renderMatchHistory(numPlayers, playerIndex, teamIndex, steamId, player, radiant, callback), 2000);
                }
            });            
        }
    });
}

function updateMmr(playerObject, steamId, fail) {
    fail = fail | 1;
    request.get('https://api.opendota.com/api/players/' + steamId.accountid, (err, response, body) => {
        if (err || response.statusCode != 200) return setTimeout(function() {
            updateMmr(playerObject, steamId, fail + 1);
        }, fail * 1000);
        let res = JSON.parse(body);
        if (res.solo_competitive_rank != null) {
            Vue.set(playerObject, 'solo_mmr', res.solo_competitive_rank);
        }
        if (res.competitive_rank != null) {
            Vue.set(playerObject, 'party_mmr', res.competitive_rank);
        }
        if (res.mmr_estimate != null && res.mmr_estimate.n != 0) {
            Vue.set(playerObject, 'estimated_mmr', res.mmr_estimate.estimate);
        }
    });
}

let matchDetails = {};
function getMatchDetails(matchId, callback) {
    if (matchDetails.hasOwnProperty(matchId)) {
        callback(matchDetails[matchId]);
    } else {
        request.get('http://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1?key='+steamApiKey+'&match_id='+matchId, (err, response, body) => {
            if (err || response.statusCode != 200) return setTimeout(function() {
                getMatchDetails(matchId, callback);
            }, 2000);
            let res = JSON.parse(body);
            matchDetails[matchId] = res.result;
            callback(res.result);
        });
    }
}

function updateServerLogStatus(message) {
    $('#serverlog-status').html(message);
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
        gpm: undefined,
        xpm: undefined,
        img: undefined,
        match_id: undefined,
    };
}
