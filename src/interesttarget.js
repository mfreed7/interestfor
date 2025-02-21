// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill of the `interesttarget` attribute, as described here:
//   https://open-ui.org/components/interest-invokers.explainer/

(function() {
  const attributeName = 'interesttarget';
  const interestEventName = 'interest';
  const loseInterestEventName = 'loseinterest';


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
    // "Break" the existing feature, so the polyfill takes effect.
    const cancel = (e) => {
      if (!e.isTrusted) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    document.body.addEventListener(interestEventName,cancel,{capture:true});
    document.body.addEventListener(loseInterestEventName,cancel,{capture:true});
  }

  function assert_true(cond,message) {
    message = message ?? "Assertion failed";
    if (!cond) {
      throw(message);
    }
  }
  function assert_false(cond,message) {
    assert_true(!cond,message);
  }

  window.InterestEvent = class extends CustomEvent {}

  function newInterestEvent(type) {
    return new InterestEvent(type, {
      bubbles: false,
      cancelable: true,
      composed: true,
    });
  }

  const polyfillDataField = 'polyfill_data';
  function interestGained(element) {
    const target = element[polyfillDataField].target;
    if (!target.dispatchEvent(newInterestEvent(interestEventName))) {
      return;
    }
    element[polyfillDataField].has_interest = true;
    try {
      target.showPopover();
    } catch {};
  }

  function interestLost(element) {
    const target = element[polyfillDataField].target;
    if (!target.dispatchEvent(newInterestEvent(loseInterestEventName))) {
      return;
    }
    element[polyfillDataField].has_interest = false;
    try {
      target.hidePopover();
    } catch {};
  }

  function showInterestAfterDelay(element, delaySeconds) {
    clearTimeout(element[polyfillDataField].hideInterestTask);
    element[polyfillDataField].showInterestTask = setTimeout(() => {
      interestGained(element);
    }, delaySeconds*1000);
  }

  function loseInterestAfterDelay(element, delaySeconds) {
    clearTimeout(element[polyfillDataField].showInterestTask);
    element[polyfillDataField].hideInterestTask = setTimeout(() => {
      interestLost(element);
    }, delaySeconds*1000);
  }

  function addEventHandlers(element) {
    assert_true(element.hasAttribute(attributeName));
    const targetIdref = element.getAttribute(attributeName);
    assert_true(targetIdref);
    assert_false(element.hasOwnProperty(polyfillDataField));
    element[polyfillDataField] = {};
    element[polyfillDataField].target = document.getElementById(targetIdref);
    if (!element[polyfillDataField].target) {
      return;
    }
    const controller = new AbortController();
    element[polyfillDataField].signal = controller.signal;
    element.addEventListener("mouseenter", () => {
      showInterestAfterDelay(element,
          getComputedStyle(element).getPropertyValue('--interest-target-show-delay'));
    },{signal:controller.signal});
    element.addEventListener("mouseleave", () => {
      loseInterestAfterDelay(element,
          getComputedStyle(element).getPropertyValue('--interest-target-hide-delay'));
    },{signal:controller.signal});
    element.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" && event.altKey) {
        interestGained(element);
      }
      if (event.key === "Escape") {
        interestLost(element);
      }
    },{signal:controller.signal});
  }
  function removeEventHandlers(element) {
    element[polyfillDataField]?.signal?.abort();
  }

  function registerCustomProperties() {
    const style = document.createElement('style');
    style.innerHTML = `
      @property --interest-target-hide-delay {
        syntax: "<time>";
        inherits: false;
        initial-value: 0.5s;
      }
      @property --interest-target-show-delay {
        syntax: "<time>";
        inherits: false;
        initial-value: 0.5s;
      }
    `;
    document.head.appendChild(style);
    document[polyfillDataField].globalStylesheet = style;
  }
  function unregisterCustomProperties() {
    document[polyfillDataField].globalStylesheet?.remove();
    delete document[polyfillDataField].globalStylesheet;
  }

  function enableInteresttargetPolyfill() {
    assert_true(document[polyfillDataField] === undefined);
    document[polyfillDataField] = {};
    registerCustomProperties();
    document[polyfillDataField].observer = new MutationObserver((mutations) => {
      // On any DOM mutations, add or remove the event handlers.
      mutations.forEach(function (mutation) {
        const target = mutation.target;
        switch (mutation.type) {
          case "childList":
            mutation.removedNodes.forEach(n => {
              removeEventHandlers(n);
            });
            mutation.addedNodes.forEach(n => {
              if (n.nodeType === Node.ELEMENT_NODE && n.hasAttribute(attributeName)) {
                addEventHandlers(n);
              }
            });
            break;
          case "attributes":
            assert_true(mutation.attributeName == attributeName);
            removeEventHandlers(n);
            if (n.hasAttribute(attributeName)) {
              addEventHandlers(n);
            }
            break;
          default:
            assert_true(false,'mutation type');
        }
      });
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT,
      (el) => el.hasAttribute(attributeName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP);
    let element;
    while (element = walker.nextNode()) {
      addEventHandlers(element);
    }
    document[polyfillDataField].observer.observe(document.body, {childList:true, subtree: true, attributeFilter: [attributeName]});
  }
  function disableInteresttargetPolyfill() {
    unregisterCustomProperties();
    document[polyfillDataField].observer.disconnect();
    delete document[polyfillDataField];
  }

  enableInteresttargetPolyfill();
  console.log(`interesttarget polyfill installed (native feature: ${nativeFeatureSupported ? "supported" : "not present"}).`);
})();
