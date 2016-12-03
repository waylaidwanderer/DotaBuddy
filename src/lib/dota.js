'use strict';

const SteamID = require('steamid'),
    chokidar = require('chokidar'),
    fs = require('fs'),
    moment = require('moment'),
    path = require('path');

const DotaHelper = function(config) {
    this.watcher = undefined;
    this.gameModes = config && config.gameModes || [];
};

DotaHelper.prototype.watchServerLog = function(fileName, callback) {
    if (this.watcher !== undefined) this.watcher.close();
    this.watcher = chokidar.watch(path.dirname(fileName));
    this.watcher.on('change', path => {
        if (typeof callback === 'function') {
            callback(this.readServerLog(path));
        }
    });
};

DotaHelper.prototype.readServerLog = function(fileName, findLast) {
    findLast = findLast || false;
    let lines = [];
    fs.readFileSync(fileName).toString().split("\n").forEach(function(line) {
        if (line === '') return;
        lines.push(line);
    });
    if (lines.length == 0) return [];
    if (findLast) {
        for (let i = lines.length - 1; i >= 0; i--) {
            let line = lines[i];
            let steamIds = this.parseServerLogLine(line);
            if (steamIds.length > 0) return steamIds;
        }
        return [];
    } else {
        let lastLine = lines[lines.length - 1];
        return this.parseServerLogLine(lastLine);
    }
};

DotaHelper.prototype.parseServerLogLine = function(line) {
    let regex = /(.*?) - (.*?): (.*?) \(Lobby (\d+) (\w+) (.*?)\)/;
    let match = line.match(regex);
    if (match === null || match.length != 7) return [];
    let date = match[1];
    let time = match[2];
    let server = match[3];
    let lobbyId = match[4];
    let gameMode = match[5];
    let playersString = match[6];
    let matchDatetime = moment(date + ' ' + time, 'MM/DD/YYYY HH:mm:ss');
    let secondsDiff = moment().diff(matchDatetime, 'seconds');
    //if (secondsDiff > 30 * 60) return;
    let playersRegex = /\d:(\[U:\d:\d+])/g;
    let playersMatch;
    let steamIds = [];
    while (playersMatch = playersRegex.exec(playersString)) {
        let sid = new SteamID(playersMatch[1]);
        steamIds.push(sid);
    }
    return steamIds;
};

module.exports = DotaHelper;
