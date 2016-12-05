const ProgressBar = require('progressbar.js');

class DotaTimer {
    constructor(container) {
        this.container = container;
        this.timer = new DotaProgressBar(container);
    }

    stop() {
        this.timer.set(0);
        this.timer._onTick.call(this.timer, 0);
        this.timer.destroy();
        this.timer = new DotaProgressBar(this.container);
        return this.timer;
    }
}
class DotaProgressBar extends ProgressBar.Circle {
    constructor(container) {
        super(container, {
            color: '#f6e444',
            trailColor: '#e0e0e0',
            duration: 0,
            strokeWidth: 3,
            trailWidth: 1,
            easing: 'linear',
            text: {
                value: '00:00',
                style: {
                    color: 'rgb(238, 238, 238)',
                    'font-size': '4em',
                    'font-weight': '300',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    padding: 0,
                    margin: 0,
                    transform: {
                        prefix: true,
                        value: 'translate(-50%, -50%)'
                    }
                }
            },
        });
        this.container = container;
        this.init();
    }

    init() {
        this._onTick = function() {};
        this._ticking = false;
        this._paused = false;
        this.seconds = 0;
        this.count = 0;
        this.progress = null;
    }

    countdown(seconds, count) {
        if (this._ticking) throw 'Timer is already ticking.';
        const interval = 100;
        let expected = Date.now() + interval;
        seconds = seconds || this.seconds;
        this.seconds = seconds;
        let milliseconds = seconds * 1000;
        count = count || milliseconds;
        this.count = count;
        this._ticking = true;
        let initialProgress = -this.progress || 0;
        this.set(initialProgress);
        this._onTick.call(this, count);
        const step = () => {
            if (this._paused) return;
            this._onTick.call(this, count);
            const dt = Date.now() - expected; // the drift (positive for overshooting)
            const wait = Math.max(0, interval - dt);
            expected += interval;
            this.progress = 1 - count / milliseconds;
            try {
                if (count != milliseconds) this.animate(-this.progress, { duration: wait });
            } catch (err) {
                return this._onTick.call(this, 0);
            }
            count -= interval;
            this.count = count;
            if (count < 0) {
                this._ticking = false;
                this.animate(0);
                return;
            }
            setTimeout(step, wait);
        };
        setTimeout(step, interval);
        return this;
    }

    tick(cb) {
        this._onTick = cb;
        return this;
    }

    pause() {
        if (this._paused || !this._ticking) throw 'Nothing to pausse.';
        this._paused = true;
        this._ticking = false;
    }

    // TODO: resume parameters so that we can catch up or rewind a second
    resume() {
        if (!this._paused) throw 'Nothing to resume.';
        this._paused = false;
        this.countdown(null, this.count);
    }
}

module.exports = DotaTimer;
