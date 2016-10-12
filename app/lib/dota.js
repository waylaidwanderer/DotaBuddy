'use strict';

var SteamID = require('steamid'),
    chokidar = require('chokidar'),
    fs = require('fs'),
    moment = require('moment'),
    path = require('path');

var DotaHelper = function(config) {
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

DotaHelper.prototype.readServerLog = function(fileName) {
    var lines = [];
    fs.readFileSync(fileName).toString().split("\n").forEach(function(line) {
        if (line === '') return;
        lines.push(line);
    });
    if (lines.length == 0) return [];
    var lastLine = lines[lines.length - 1];
    return this.parseServerLogLine(lastLine);
};

DotaHelper.prototype.parseServerLogLine = function(line) {
    var regex = /(.*?) - (.*?): (.*?) \(Lobby (\d+) (\w+) (.*?)\)/;
    var match = line.match(regex);
    if (match === null || match.length != 7) return [];
    var date = match[1];
    var time = match[2];
    var server = match[3];
    var lobbyId = match[4];
    var gameMode = match[5];
    var playersString = match[6];
    var matchDatetime = moment(date + ' ' + time, 'MM/DD/YYYY HH:mm:ss');
    var secondsDiff = moment().diff(matchDatetime, 'seconds');
    //if (secondsDiff > 30 * 60) return;
    var playersRegex = /\d:(\[U:\d:\d+])/g;
    var playersMatch;
    var steamIds = [];
    while (playersMatch = playersRegex.exec(playersString)) {
        var sid = new SteamID(playersMatch[1]);
        steamIds.push(sid);
    }
    return steamIds;
};

module.exports = DotaHelper;
