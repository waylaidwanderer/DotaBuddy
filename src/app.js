"use strict";
import { remote } from 'electron'; // native electron module
import jetpack from 'fs-jetpack'; // module loaded from npm
import co from 'co';
import request from 'request';
import compareVersions from 'compare-versions';
import marked from 'marked';

const app = remote.app;
const appDir = jetpack.cwd(app.getAppPath());
const manifest = appDir.read('package.json', 'json');

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

require('./lib/stats');
require('./lib/listeners');
require('./lib/timers');

checkForUpdate();

function checkForUpdate() {
    co(function* () {
        const getLatestReleaseResult = new Promise((resolve, reject) => {
            request.get({
                url: 'https://api.github.com/repos/waylaidwanderer/DotaBuddy/releases/latest',
                headers: {
                    'User-Agent': 'DotaBuddy ' + manifest.version
                }
            }, (err, res, body) => {
                if (err) return reject(err);
                if (res.statusCode != 200) return reject(res.statusCode + "\n" + body);
                resolve(JSON.parse(body));
            });
        });
        let latestRelease;
        try {
            latestRelease = yield getLatestReleaseResult;
        } catch (err) {
            return console.log(err);
        }
        if (compareVersions(latestRelease.tag_name, manifest.version) != 1) return;
        new Vue({
            el: '#update',
            data: {
                version: latestRelease.tag_name,
                url: latestRelease.html_url,
                description: marked(latestRelease.body),
                assets: latestRelease.assets // asset.name, asset.browser_download_url, asset.bsize
            }
        });
        $('#update').openModal();
    });
}
