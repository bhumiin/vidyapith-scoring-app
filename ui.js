/**
 * Shared UI pieces — step 2 of the look overhaul
 *
 * Two things, and only two things:
 *
 *   UI.toast(message, options)          non-blocking notice, replaces alert()
 *   UI.modal.confirm(options)           yes/no, replaces confirm()
 *   UI.modal.prompt(options)            one line of text, replaces prompt()
 *   UI.modal.open(options)              the dialog shell, for anything bigger
 *
 * Everything is styled by the .vp-* rules at the bottom of styles.css, which read
 * from the design tokens at the top. This file adds no colours, sizes or fonts of
 * its own, and it does not touch the DOM outside the element it creates.
 *
 * The old alert()/confirm() calls stay until step 3 swaps them, one site at a
 * time: nothing here runs until it is called.
 */

const UI = (function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ------------------------------------------------------------------ */
    /* toast                                                              */
    /* ------------------------------------------------------------------ */

    var toastHost = null;
    var activeToasts = [];   // { el, timer, message, type }

    function host() {
        if (!toastHost) {
            toastHost = document.createElement('div');
            toastHost.className = 'vp-toasts';
            toastHost.setAttribute('data-ui', 'toasts');
            document.body.appendChild(toastHost);
        }
        return toastHost;
    }

    function removeToast(entry) {
        var index = activeToasts.indexOf(entry);
        if (index === -1) return;
        activeToasts.splice(index, 1);
        clearTimeout(entry.timer);
        entry.el.classList.remove('is-in');
        var gone = function () { if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el); };
        if (reduceMotion.matches) gone();
        else setTimeout(gone, 200);
    }

    function arm(entry, duration) {
        clearTimeout(entry.timer);
        if (duration > 0) entry.timer = setTimeout(function () { removeToast(entry); }, duration);
    }

    /**
     * @param {string} message  plain text; never treated as HTML
     * @param {{type?: 'success'|'error'|'info', duration?: number}} [options]
     *        duration in ms; 0 keeps it until dismissed. Default 3200 (6000 for error).
     * @returns {{dismiss: function}}
     */
    function toast(message, options) {
        options = options || {};
        var type = options.type === 'success' || options.type === 'error' ? options.type : 'info';
        var duration = options.duration != null ? options.duration : (type === 'error' ? 6000 : 3200);

        // the same sentence twice in a row is a double click, not two events
        for (var i = 0; i < activeToasts.length; i++) {
            var existing = activeToasts[i];
            if (existing.message === message && existing.type === type) {
                arm(existing, duration);
                return { dismiss: function () { removeToast(existing); } };
            }
        }

        var el = document.createElement('div');
        el.className = 'vp-toast vp-toast--' + type;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        el.setAttribute('aria-atomic', 'true');

        var icon = document.createElement('span');
        icon.className = 'vp-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';

        var text = document.createElement('p');
        text.className = 'vp-toast__text';
        text.textContent = message;

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'vp-toast__close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '×';

        el.appendChild(icon);
        el.appendChild(text);
        el.appendChild(close);
        host().appendChild(el);

        var entry = { el: el, timer: null, message: message, type: type };
        activeToasts.push(entry);

        // never let the stack grow past four
        if (activeToasts.length > 4) removeToast(activeToasts[0]);

        close.addEventListener('click', function () { removeToast(entry); });

        // hovering or tabbing to a toast holds it open long enough to read
        el.addEventListener('mouseenter', function () { clearTimeout(entry.timer); });
        el.addEventListener('mouseleave', function () { arm(entry, duration); });
        el.addEventListener('focusin', function () { clearTimeout(entry.timer); });
        el.addEventListener('focusout', function () { arm(entry, duration); });

        if (reduceMotion.matches) el.classList.add('is-in');
        else requestAnimationFrame(function () { el.classList.add('is-in'); });

        arm(entry, duration);
        return { dismiss: function () { removeToast(entry); } };
    }

    /* ------------------------------------------------------------------ */
    /* modal                                                              */
    /* ------------------------------------------------------------------ */

    var openModal = null;   // { backdrop, dialog, resolve, lastFocus, scroll }

    function focusable(dialog) {
        return Array.prototype.slice.call(dialog.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(function (node) { return node.offsetParent !== null; });
    }

    function lockScroll() {
        var gap = window.innerWidth - document.documentElement.clientWidth;
        var body = document.body;
        var scroll = {
            overflow: body.style.overflow,
            paddingRight: body.style.paddingRight
        };
        body.style.overflow = 'hidden';
        if (gap > 0) body.style.paddingRight = gap + 'px';
        return scroll;
    }

    function unlockScroll(scroll) {
        document.body.style.overflow = scroll.overflow;
        document.body.style.paddingRight = scroll.paddingRight;
    }

    function finish(result) {
        if (!openModal) return;
        var state = openModal;
        openModal = null;

        document.removeEventListener('keydown', state.onKeydown, true);
        state.backdrop.classList.remove('is-in');
        var app = document.getElementById('app');
        if (app) app.removeAttribute('aria-hidden');

        var drop = function () {
            if (state.backdrop.parentNode) state.backdrop.parentNode.removeChild(state.backdrop);
            unlockScroll(state.scroll);
            if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
            state.resolve(result);
        };
        if (reduceMotion.matches) drop();
        else setTimeout(drop, 150);
    }

    /**
     * @param {object} options
     * @param {string} options.title
     * @param {string} [options.message]      plain text paragraph
     * @param {function} [options.render]     (bodyEl, api) => void, for a custom body
     * @param {string} [options.confirmLabel]
     * @param {string} [options.cancelLabel]  omit to hide the cancel button
     * @param {boolean} [options.danger]      confirm button in the danger colour
     * @param {object} [options.input]        { label, value, placeholder, validate }
     * @returns {Promise<any>}  confirm/open: boolean; prompt: string|null
     */
    function modal(options) {
        options = options || {};
        if (openModal) finish(options.input ? null : false);

        var isPrompt = !!options.input;
        var lastFocus = document.activeElement;

        var backdrop = document.createElement('div');
        backdrop.className = 'vp-modal-backdrop';
        backdrop.setAttribute('data-ui', 'modal');

        var dialog = document.createElement('div');
        dialog.className = 'vp-modal';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('tabindex', '-1');

        var titleId = 'vp-modal-title-' + Date.now();
        var head = document.createElement('div');
        head.className = 'vp-modal__head';
        var title = document.createElement('h2');
        title.className = 'vp-modal__title';
        title.id = titleId;
        title.textContent = options.title || '';
        dialog.setAttribute('aria-labelledby', titleId);
        head.appendChild(title);

        var body = document.createElement('div');
        body.className = 'vp-modal__body';

        var messageEl = null;
        if (options.message) {
            messageEl = document.createElement('p');
            messageEl.textContent = options.message;
            body.appendChild(messageEl);
        }

        var inputEl = null;
        var errorEl = null;
        var formEl = null;

        if (isPrompt) {
            formEl = document.createElement('form');
            formEl.noValidate = true;

            var label = document.createElement('label');
            label.className = 'vp-modal__label';
            label.setAttribute('for', 'vp-modal-input-' + Date.now());
            label.textContent = options.input.label || 'Value';

            inputEl = document.createElement('input');
            inputEl.className = 'vp-modal__input';
            inputEl.id = label.getAttribute('for');
            inputEl.type = 'text';
            inputEl.value = options.input.value != null ? String(options.input.value) : '';
            inputEl.placeholder = options.input.placeholder || '';
            inputEl.autocomplete = 'off';
            if (options.input.maxLength) inputEl.maxLength = options.input.maxLength;

            errorEl = document.createElement('p');
            errorEl.className = 'vp-modal__error';
            errorEl.setAttribute('role', 'alert');

            formEl.appendChild(label);
            formEl.appendChild(inputEl);
            formEl.appendChild(errorEl);
            body.appendChild(formEl);
        } else if (typeof options.render === 'function') {
            options.render(body, { close: finish });
        }

        var foot = document.createElement('div');
        foot.className = 'vp-modal__foot';

        if (options.cancelLabel !== null) {
            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'vp-btn vp-btn--quiet';
            cancel.textContent = options.cancelLabel || 'Cancel';
            cancel.addEventListener('click', function () { finish(isPrompt ? null : false); });
            foot.appendChild(cancel);
        }

        var confirm = document.createElement('button');
        confirm.type = isPrompt ? 'submit' : 'button';
        confirm.className = 'vp-btn ' + (options.danger ? 'vp-btn--danger' : 'vp-btn--primary');
        confirm.textContent = options.confirmLabel || (isPrompt ? 'Save' : 'OK');

        if (isPrompt) {
            var submit = function (event) {
                if (event) event.preventDefault();
                var value = inputEl.value.trim();
                if (typeof options.input.validate === 'function') {
                    var complaint = options.input.validate(value);
                    if (complaint) {
                        errorEl.textContent = complaint;
                        inputEl.focus();
                        return;
                    }
                }
                finish(value);
            };
            formEl.addEventListener('submit', submit);
            confirm.addEventListener('click', submit);
            inputEl.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') { event.preventDefault(); submit(); }
            });
        } else {
            confirm.addEventListener('click', function () {
                if (typeof options.onConfirm === 'function') {
                    var keepOpen = options.onConfirm() === false;
                    if (keepOpen) return;
                }
                finish(true);
            });
        }

        foot.appendChild(confirm);
        dialog.appendChild(head);
        dialog.appendChild(body);
        dialog.appendChild(foot);
        backdrop.appendChild(dialog);

        var onKeydown = function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish(isPrompt ? null : false);
                return;
            }
            if (event.key !== 'Tab') return;

            var nodes = focusable(dialog);
            if (!nodes.length) { event.preventDefault(); return; }
            var first = nodes[0];
            var last = nodes[nodes.length - 1];
            var current = document.activeElement;

            if (!dialog.contains(current)) { event.preventDefault(); first.focus(); return; }
            if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); return; }
            if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
        };

        // a click that starts and ends on the backdrop closes; a drag that ends
        // there (selecting text inside) does not
        var pressedOutside = false;
        backdrop.addEventListener('pointerdown', function (event) {
            pressedOutside = event.target === backdrop;
        });
        backdrop.addEventListener('click', function (event) {
            if (pressedOutside && event.target === backdrop) finish(isPrompt ? null : false);
            pressedOutside = false;
        });

        // while a dialog is up, the page behind it is not part of the page
        var app = document.getElementById('app');
        if (app) app.setAttribute('aria-hidden', 'true');

        document.body.appendChild(backdrop);

        var scroll = lockScroll();
        document.addEventListener('keydown', onKeydown, true);

        var api = { close: finish };

        return new Promise(function (resolve) {
            openModal = {
                backdrop: backdrop,
                dialog: dialog,
                resolve: resolve,
                lastFocus: lastFocus,
                scroll: scroll,
                onKeydown: onKeydown
            };

            if (reduceMotion.matches) backdrop.classList.add('is-in');
            else requestAnimationFrame(function () { backdrop.classList.add('is-in'); });

            var target = inputEl || dialog.querySelector('[data-autofocus]') ||
                (focusable(dialog)[0] || dialog);
            // wait a frame so the element is laid out before focus moves
            requestAnimationFrame(function () { target.focus(); });
        });
    }

    function confirm(options) {
        return modal(options || {});
    }

    function prompt(options) {
        var settings = Object.assign({}, options);
        settings.input = (options && options.input) || {};
        return modal(settings);
    }

    function close(result) {
        finish(result);
    }

    function isOpen() {
        return !!openModal;
    }

    return {
        toast: toast,
        modal: {
            open: modal,
            confirm: confirm,
            prompt: prompt,
            close: close,
            isOpen: isOpen
        }
    };
})();

// The app's other modules are plain consts and refer to each other by bare name,
// which works in classic scripts. Exposing it on window as well means inline
// handlers, the console and any future module can reach it the same way.
if (typeof window !== 'undefined') window.UI = UI;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
