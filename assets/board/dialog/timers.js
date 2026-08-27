export function createTimeoutScheduler() {
    const timers = new Set();

    function schedule(callback, delay) {
        const timer = window.setTimeout(() => {
            timers.delete(timer);
            callback();
        }, delay);
        timers.add(timer);

        return timer;
    }

    function clear() {
        timers.forEach(timer => window.clearTimeout(timer));
        timers.clear();
    }

    return { schedule, clear };
}
