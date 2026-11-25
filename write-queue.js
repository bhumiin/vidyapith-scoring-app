/**
 * WriteQueue — a judge's taps survive the network.
 *
 * Every score and note change is queued here the moment it is tapped, then
 * sent. The queue is:
 *
 *   coalesced    the last value for a criterion wins, so tapping 1-2-3-4-5
 *                sends one write, not five
 *   durable      it is kept in localStorage, so a closed tab, a dropped
 *                tablet or a reload does not take the taps with it
 *   retried      a failed send is retried with backoff, and again the moment
 *                the browser comes back online
 *
 * Every operation it runs is idempotent — an upsert, or a delete that treats
 * "already gone" as success — so retrying after a response that never arrived
 * is always safe.
 *
 * The judge screen reads it through subscribe() to show what is still on the
 * device; nothing else needs to know the network exists.
 */
const WriteQueue = (function () {
    'use strict';

    var STORAGE_KEY = 'vp.writeQueue.v1';
    var DEBOUNCE_MS = 700;      // taps coalesce into one burst of writes
    var RETRY_MS = 8000;        // after a failed burst, wait before trying again
    var MAX_ATTEMPTS = 3;       // attempts within one burst

    var items = [];             // [{ key, type, payload }] — coalesced by key
    var listeners = [];
    var flushing = null;        // in-flight flush promise, or null
    var debounceTimer = null;
    var retryTimer = null;
    var blocked = false;        // auth refused: wait for a new login, not a timer
    var status = 'idle';        // idle | sending | waiting
    var failures = [];          // messages worth showing a person, newest first

    /* ------------------------------------------------------------------ */
    /* persistence                                                         */
    /* ------------------------------------------------------------------ */

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            items = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            items = [];
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            // Private mode or a full disk: the queue still works in memory,
            // it just will not survive a reload.
        }
    }

    /* ------------------------------------------------------------------ */
    /* state                                                               */
    /* ------------------------------------------------------------------ */

    function state() {
        return {
            pending: items.length,
            status: status,
            blocked: blocked,
            failures: failures.slice(0, 3)
        };
    }

    function notify() {
        var snapshot = state();
        listeners.forEach(function (fn) {
            try { fn(snapshot); } catch (error) { console.error('WriteQueue listener failed:', error); }
        });
    }

    /* ------------------------------------------------------------------ */
    /* queue                                                               */
    /* ------------------------------------------------------------------ */

    function keyFor(type, payload) {
        return type + '|' + payload.studentId + '|' + payload.judgeId +
            (payload.criterionId ? '|' + payload.criterionId : '');
    }

    /**
     * Queue one write. The same key replaces what was there before, so a
     * criterion tapped five times is still one queued row.
     */
    function enqueue(type, payload) {
        var key = keyFor(type, payload);
        var item = { key: key, type: type, payload: payload };
        var existing = -1;
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === key) { existing = i; break; }
        }
        if (existing >= 0) items[existing] = item;
        else items.push(item);

        // A new write is a fresh attempt even if an earlier one was refused.
        blocked = false;
        save();
        notify();
        scheduleFlush();
        return key;
    }

    function pendingFor(studentId, judgeId) {
        return items.filter(function (item) {
            return item.payload.studentId === studentId &&
                (!judgeId || item.payload.judgeId === judgeId);
        });
    }

    /* ------------------------------------------------------------------ */
    /* sending                                                             */
    /* ------------------------------------------------------------------ */

    function run(item) {
        var p = item.payload;
        if (item.type === 'score') {
            return (p.value === null || p.value === undefined)
                ? SupabaseService.deleteScore(p.studentId, p.judgeId, p.criterionId)
                : SupabaseService.setScore(p.studentId, p.judgeId, p.criterionId, p.value);
        }
        if (item.type === 'note') {
            return SupabaseService.setNote(p.studentId, p.judgeId, p.text);
        }
        return Promise.reject(new Error('Unknown queued write: ' + item.type));
    }

    /** Refusals that a timer will not fix: stop hammering, tell the person. */
    function isBlocked(error) {
        if (!error) return false;
        if (error.code === 'PGRST301' || error.code === '401' || error.code === '403') return true;
        if (error.code === '42501') return true;
        return /jwt|permission denied|row-level security/i.test(error.message || '');
    }

    /** The record is final — retrying cannot help, and the value is obsolete. */
    function isLocked(error) {
        if (!error) return false;
        return error.code === 'SCORE_LOCKED' || error.code === 'NOTE_LOCKED' ||
            /already submitted|is locked/i.test(error.message || '');
    }

    function isTransient(error) {
        // Fetch fails as TypeError when the network is gone; 5xx and 429 are
        // the server asking to slow down. Everything else is treated as
        // transient too, because the only cost of another attempt is a request.
        return !isBlocked(error) && !isLocked(error);
    }

    /**
     * Send everything queued for the signed-in judge. Resolves true when the
     * queue is empty, false when something is still on the device — a false
     * is never an error, it means "keep the values on screen, they will go".
     */
    function flush() {
        if (flushing) return flushing;
        if (!items.length) {
            status = 'idle';
            notify();
            return Promise.resolve(true);
        }
        if (blocked) return Promise.resolve(false);
        if (navigator.onLine === false) {
            status = 'waiting';
            notify();
            scheduleRetry();
            return Promise.resolve(false);
        }

        var session = null;
        try {
            var raw = localStorage.getItem(
                (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.sessionKey) || 'vidyapith_session');
            session = raw ? JSON.parse(raw) : null;
        } catch (error) { session = null; }

        // Writes made by a previous login stay put: sending them as this user
        // would be refused by RLS anyway, and they belong to whoever made them.
        var mine = items.filter(function (item) {
            return !session || !session.userId || item.payload.judgeId === session.userId;
        });
        if (!mine.length) return Promise.resolve(false);

        var attempts = 0;

        function attempt() {
            attempts++;
            status = 'sending';
            notify();

            return Promise.all(mine.map(function (item) {
                return run(item).then(
                    function () { return { item: item, ok: true }; },
                    function (error) { return { item: item, ok: false, error: error }; }
                );
            })).then(function (results) {
                var failed = results.filter(function (r) { return !r.ok; });
                if (!failed.length) {
                    // Everything sent: drop the sent rows, keep any other login's.
                    var sentKeys = {};
                    mine.forEach(function (item) { sentKeys[item.key] = true; });
                    items = items.filter(function (item) { return !sentKeys[item.key]; });
                    save();
                    status = items.length ? 'waiting' : 'idle';
                    blocked = false;
                    notify();
                    if (items.length) scheduleFlush();   // taps made while sending
                    return items.length === 0;
                }

                // A row stays queued unless the refusal says it can never
                // land (a locked record); everything else gets another go.
                items = items.filter(function (item) { return keepAfterFailure(item, failed); });
                save();

                var retryable = failed.filter(function (r) { return isTransient(r.error); });
                var locked = failed.filter(function (r) { return isLocked(r.error); });

                if (locked.length) {
                    failures = locked.map(function (r) {
                        return 'A saved score was refused: the student was already submitted.';
                    }).concat(failures);
                }

                if (failed.some(function (r) { return isBlocked(r.error); })) {
                    blocked = true;
                    status = 'waiting';
                    save();
                    notify();
                    return false;
                }

                if (retryable.length && attempts < MAX_ATTEMPTS) {
                    save();
                    notify();
                    return attempt();
                }

                // Out of attempts for this burst: keep what failed and try
                // again shortly (or the moment the connection returns).
                save();
                status = 'waiting';
                notify();
                scheduleRetry();
                return false;
            });
        }

        // Placeholder first: notify() runs inside attempt() and a listener
        // that calls flush() must not start a second run.
        flushing = Promise.resolve(false);
        flushing = attempt().then(function (drained) {
            flushing = null;
            notify();
            return drained;
        }, function (error) {
            flushing = null;
            console.error('WriteQueue flush failed:', error);
            status = 'waiting';
            notify();
            scheduleRetry();
            return false;
        });
        return flushing;
    }

    /** A failed row stays queued unless the refusal says it can never land. */
    function keepAfterFailure(item, failed) {
        var match = null;
        for (var i = 0; i < failed.length; i++) {
            if (failed[i].item.key === item.key) { match = failed[i]; break; }
        }
        if (!match) return true;        // not part of this attempt (other login)
        return !isLocked(match.error);  // a locked record must not be retried
    }

    /* ------------------------------------------------------------------ */
    /* scheduling                                                          */
    /* ------------------------------------------------------------------ */

    function scheduleFlush() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            flush();
        }, DEBOUNCE_MS);
    }

    function scheduleRetry() {
        if (retryTimer || blocked) return;
        retryTimer = setTimeout(function () {
            retryTimer = null;
            flush();
        }, RETRY_MS);
    }

    /* ------------------------------------------------------------------ */
    /* public                                                              */
    /* ------------------------------------------------------------------ */

    function subscribe(fn) {
        listeners.push(fn);
        fn(state());
        return function unsubscribe() {
            var index = listeners.indexOf(fn);
            if (index >= 0) listeners.splice(index, 1);
        };
    }

    load();

    window.addEventListener('online', function () {
        clearTimeout(retryTimer);
        retryTimer = null;
        flush();
    });

    // Coming back to the tab is another chance to send.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && items.length) flush();
    });

    // Anything still on the device goes out with the next load, before the
    // judge has picked a grade.
    if (items.length) setTimeout(function () { flush(); }, 500);

    return {
        enqueue: enqueue,
        flush: flush,
        pendingFor: pendingFor,
        subscribe: subscribe,
        state: state,
        pending: function () { return items.length; }
    };
})();
