// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill of the `interesttarget` attribute, as described here:
//   https://open-ui.org/components/interest-invokers.explainer/

(function() {
  const attributeName = 'interesttarget';
  const showDelayProp = '--interest-target-show-delay';
  const hideDelayProp = '--interest-target-hide-delay';
  const polyfillDataField = '__interesttargetData';

  // Only run once
  if (window.interesttargetPolyfillInstalled) {
    return;
  }
  window.interesttargetPolyfillInstalled = true;
  // If the feature is already natively supported, use it instead.
  const nativeFeatureSupported = HTMLButtonElement.prototype.hasOwnProperty("interestTargetElement");
  if (nativeFeatureSupported && !window.interesttargetUsePolyfillAlways) {
    return;
  }
  if (nativeFeatureSupported && window.interesttargetUsePolyfillAlways) {
    // Cancel native events to force polyfill
    const cancelEvent = e => {
      if (!e.isTrusted) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.body.addEventListener('interest', cancelEvent, {capture:true});
    document.body.addEventListener('loseinterest', cancelEvent, {capture:true});
  }

  // Custom CSS properties
  function registerCustomProperties() {
    const style = document.createElement('style');
    style.textContent = `
      @property ${showDelayProp} {
        syntax: "<time>";
        inherits: false;
        initial-value: 0.5s;
      }
      @property ${hideDelayProp} {
        syntax: "<time>";
        inherits: false;
        initial-value: 0.5s;
      }
    `;
    document.head.appendChild(style);
    document[polyfillDataField] = { globalPropsStyle: style };
  }

  // Inject UA-style rules for partial activation simulation
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .target-of-partial-interest { /* focusable disabled by JS */ }
      .target-of-partial-interest::after {
        content: "{Press Alt+UpArrow to activate}";
        display: block;
        color: darkgrey;
        font-size: 0.8em;
      }
    `;
    document.head.appendChild(style);
    document[polyfillDataField].globalHintStyle = style;
  }

  // Utility to parse delays
  function getDelaySeconds(el, prop) {
    const raw = getComputedStyle(el).getPropertyValue(prop).trim();
    const match = raw.match(/^([\d.]+)s$/);
    if (match) return parseFloat(match[1]);
    return parseFloat(raw) || 0;
  }

  const focusableSelector = [
    'a[href]',
    'area[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  // Manage focusability within a subtree
  function disableFocusable(root) {
    root.querySelectorAll(focusableSelector).forEach(el => {
      if (el.hasAttribute('data-original-tabindex')) return;
      const orig = el.getAttribute('tabindex');
      el.setAttribute('data-original-tabindex', orig === null ? 'none' : orig);
      el.setAttribute('tabindex', '-1');
    });
  }
  function restoreFocusable(root) {
    root.querySelectorAll('[data-original-tabindex]').forEach(el => {
      const orig = el.getAttribute('data-original-tabindex');
      if (orig === 'none') {
        el.removeAttribute('tabindex');
      } else {
        el.setAttribute('tabindex', orig);
      }
      el.removeAttribute('data-original-tabindex');
    });
  }

  // Activation states
  function applyPartialInterest(invoker) {
    const data = invoker[polyfillDataField];
    if (data.state === 'partial' || data.state === 'full') return;
    data.state = 'partial';
    invoker.classList.add('has-partial-interest');
    data.target.classList.add('target-of-partial-interest');
    disableFocusable(data.target);
    try { data.target.showPopover(); } catch {}
    data.target.dispatchEvent(new Event('interest'));
  }

  function applyFullInterest(invoker) {
    const data = invoker[polyfillDataField];
    if (data.state === 'full') return;
    // If not yet shown, ensure popover is shown
    if (data.state !== 'partial') {
      try { data.target.showPopover(); } catch {}
    }
    data.state = 'full';
    invoker.classList.remove('has-partial-interest');
    invoker.classList.add('has-full-interest');
    data.target.classList.remove('target-of-partial-interest');
    data.target.classList.add('target-of-full-interest');
    restoreFocusable(data.target);
    try { data.target.showPopover(); } catch {}
  }

  function clearInterest(invoker) {
    const data = invoker[polyfillDataField];
    clearTimeout(data.showTimer);
    clearTimeout(data.hideTimer);
    if (data.state !== 'none') {
      invoker.classList.remove('has-partial-interest','has-full-interest');
      data.target.classList.remove('target-of-partial-interest','target-of-full-interest');
      restoreFocusable(data.target);
      try { data.target.hidePopover(); } catch {}
      data.target.dispatchEvent(new Event('loseinterest'));
      data.state = 'none';
    }
  }

  function scheduleShow(invoker) {
    const data = invoker[polyfillDataField];
    clearTimeout(data.hideTimer);
    data.showTimer = setTimeout(() => applyPartialInterest(invoker),
      getDelaySeconds(invoker, showDelayProp) * 1000);
  }
  function scheduleHide(invoker) {
    const data = invoker[polyfillDataField];
    clearTimeout(data.showTimer);
    data.hideTimer = setTimeout(() => clearInterest(invoker),
      getDelaySeconds(invoker, hideDelayProp) * 1000);
  }

  // Attach handlers to any element with [interesttarget]
  function addEventHandlers(el) {
    const targetId = el.getAttribute(attributeName);
    const target = document.getElementById(targetId);
    if (!target) return;
    el[polyfillDataField] = {
      target,
      state: 'none',
      showTimer: null,
      hideTimer: null
    };
    const signal = (new AbortController()).signal;
    el.addEventListener('mouseenter', () => scheduleShow(el), {signal});
    el.addEventListener('mouseleave', () => scheduleHide(el), {signal});
    el.addEventListener('focus', () => scheduleShow(el), {signal});
    el.addEventListener('blur', () => scheduleHide(el), {signal});
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        applyFullInterest(el);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearInterest(el);
      }
    }, {signal});
  }

  function scanAndObserve() {
    // Initial scan
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT,
      node => node.hasAttribute(attributeName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    );
    let node;
    while ((node = walker.nextNode())) {
      addEventHandlers(node);
    }
    // Observe future mutations
    const observer = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => {
            if (n.nodeType === 1 && n.hasAttribute(attributeName)) {
              addEventHandlers(n);
            }
          });
        } else if (m.type === 'attributes' && m.attributeName === attributeName) {
          const n = m.target;
          if (n.hasAttribute(attributeName)) addEventHandlers(n);
        }
      });
    });
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:[attributeName]});
    document[polyfillDataField].observer = observer;
  }

  // Initialization
  function init() {
    registerCustomProperties();
    injectStyles();
    scanAndObserve();
    console.log(`interesttarget polyfill installed (native feature: ${nativeFeatureSupported ? "supported" : "not present"}).`);
  }
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load',init);
  }
})();
