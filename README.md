DotaBuddy
=========
DotaBuddy is a cross-platform, open-source application with helpful features for when you're playing a match of Dota 2.

Releases can be found [here](https://github.com/waylaidwanderer/DotaBuddy/releases).

## Features
* View public match history of each player when loading into a game, including hero played, win/loss and k/d/a
* Roshan/Aegis timer
    * Press **Insert** to start Roshan/Aegis timer (Press **CmdOrCtrl+Alt+Insert** to clear both Roshan/Aegis timers)
    * Press **Alt+Insert** to only start Roshan timer
    * Press **Home** to only start Aegis Timer (Press **CmdOrCtrl+Alt+Home** to clear Aegis timer)

![Main Tab](http://i.imgur.com/56qOtBf.png)
![Main Tab, players collapsed](http://i.imgur.com/bb2cZbp.png)
![Main Tab, non-public match history](http://i.imgur.com/uBwhmc6.png)
![Timers Tab](http://i.imgur.com/uW3a5Gy.png)
![Roshan/Aegis Timer, in-game](http://i.imgur.com/h5SQySB.png)
![Roshan/Aegis Timer, in-game reminder](http://i.imgur.com/sauuxMO.png)
![Aegis Timer, 3 min expiry warning](http://i.imgur.com/O576p6q.png)
![Aegis Timer, 1 min expiry warning](http://i.imgur.com/h42MRl4.png)
![Aegis Timer, expired warning](http://i.imgur.com/611sXcn.png)
![Roshan Timer, minimum spawn time warning](http://i.imgur.com/JMwa6WY.png)


# Quick start

If you're just interested in using the application, check out the [releases](https://github.com/waylaidwanderer/DotaBuddy/releases) page for download links.

The only development dependency of this project is [Node.js](https://nodejs.org). So just make sure you have it installed.
Then type few commands known to every Node developer...
```
git clone https://github.com/waylaidwanderer/DotaBuddy.git
cd DotaBuddy
npm install
npm start
```
... and boom! You have running desktop application on your screen.

# Structure of the project

## Declaring dependencies

There are **two** `package.json` files:

#### 1. `package.json` for development
Sits on path: `electron-boilerplate/package.json`. Here you declare dependencies for your development environment and build scripts. **This file is not distributed with real application!**

Also here you declare the version of Electron runtime you want to use:
```json
"devDependencies": {
  "electron": "1.3.3"
}
```
Note: [Electron authors advise](http://electron.atom.io/docs/tutorial/electron-versioning/) to use fixed version here.

#### 2. `package.json` for your application
Sits on path: `electron-boilerplate/app/package.json`. This is **real** manifest of your application. Declare your app dependencies here.

#### OMG, but seriously why there are two `package.json`?
1. Native npm modules (those written in C, not JavaScript) need to be compiled, and here we have two different compilation targets for them. Those used in application need to be compiled against electron runtime, and all `devDependencies` need to be compiled against your locally installed node.js. Thanks to having two files this is trivial.
2. When you package the app for distribution there is no need to add up to size of the app with your `devDependencies`. Here those are always not included (reside outside the `app` directory).

## Folders

The applicaiton is split between two main folders...

`src` - this folder is intended for files which need to be transpiled or compiled (files which can't be used directly by electron).

`app` - contains all static assets (put here images, css, html etc.) which don't need any pre-processing.

Build process compiles all stuff from `src` folder and puts it into `app` folder, so after build finished `app` contains full, runnable application.

Treat `src` and `app` folders like two halves of one bigger thing.

Drawback of this design is that `app` folder contains some files which should be git-ignored and some which should not (see `.gitignore` file). But thanks to this split development builds are much much faster.

# Development

### Installation

```
npm install
```
It will also download Electron runtime, and install dependencies for second `package.json` file inside `app` folder.

### Starting the app

```
npm start
```

### Adding npm modules to your app

Remember to add your dependency to `app/package.json` file, so do:
```
cd app
npm install name_of_npm_module --save
```

### Working with modules

Thanks to [rollup](https://github.com/rollup/rollup) you can (and should) use ES6 modules for all code in `src` folder. But because ES6 modules still aren't natively supported you can't use it in `app` folder.

So for file in `src` folder do this:
```js
import myStuff from './my_lib/my_stuff';
```

But in file in `app` folder the same line must look as follows:
```js
var myStuff = require('./my_lib/my_stuff');
```

# Testing

electron-boilerplate has preconfigured test environments...

### Unit tests

Using [electron-mocha](https://github.com/jprichardson/electron-mocha) test runner with the [chai](http://chaijs.com/api/assert/) assertion library. To run the tests go with standard:
```
npm test
```
Test task searches for all files in `src` directory which respect pattern `*.spec.js`.

Those tests can be plugged into [continuous integration system](https://github.com/atom/electron/blob/master/docs/tutorial/testing-on-headless-ci.md).

### End to end tests

Using [mocha](https://mochajs.org/) test runner and [spectron](http://electron.atom.io/spectron/). Run with command:
```
npm run e2e
```
The task searches for all files in `e2e` directory which respect pattern `*.e2e.js`.

# Making a release

**Note:** There are various icon and bitmap files in `resources` directory. Those are used in installers and are intended to be replaced by your own graphics.

To make ready for distribution installer use command:
```
npm run release
```
It will start the packaging process for operating system you are running this command on. Ready for distribution file will be outputted to `dist` directory.

You can create Windows installer only when running on Windows, the same is true for Linux and OSX. So to generate all three installers you need all three operating systems.

All packaging actions are handled by [electron-builder](https://github.com/electron-userland/electron-builder). See docs of this tool if you want to customize something.

# License

Released under the GPLv3 license. Built on top of electron-boilerplate (MIT).
