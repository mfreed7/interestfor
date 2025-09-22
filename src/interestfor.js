// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill of the `interestfor` attribute, as described here:
//   https://open-ui.org/components/interest-invokers.explainer/

(function () {
  const attributeName = "interestfor";
  const interestEventName = "interest";
  const loseInterestEventName = "loseinterest";
  const interestDelayStartProp = "--interest-delay-start";
  const interestDelayEndProp = "--interest-delay-end";
  const interestDelayProp = "--interest-delay";
  const dataField = "__interestForData";
  const targetDataField = "__interestForTargetData";
  const invokersWithInterest = new Set();
  let touchInProgress = false;

  // Feature detection
  if (window.interestForPolyfillInstalled) {
    return;
  }
  window.interestForPolyfillInstalled = true;
  const nativeSupported =
    HTMLButtonElement.prototype.hasOwnProperty("interestForElement");
  if (nativeSupported && !window.interestForUsePolyfillAlways) {
    return;
  }
  if (nativeSupported) {
    // "Break" the existing feature, so the polyfill can take effect.
    const cancel = (e) => {
      if (e.isTrusted) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.body.addEventListener(interestEventName, cancel, {
      capture: true,
    });
    document.body.addEventListener(loseInterestEventName, cancel, {
      capture: true,
    });
  }

  // Enum-like state and source
  const InterestState = {
    NoInterest: "none",
    FullInterest: "full",
  };
  const Source = {
    Hover: "hover",
    DeHover: "dehover",
    Focus: "focus",
    Blur: "blur",
    Touch: "touch",
  };

  // Gain or lose interest
  function GainOrLoseInterest(invoker, target, newState) {
    if (!invoker || !target) {
      return false;
    }
    if (
      !invoker.isConnected ||
      GetInterestForTarget(invoker) !== target ||
      (newState === InterestState.NoInterest &&
        GetInterestInvoker(target) !== invoker)
    ) {
      return false;
    }

    // If gaining, handle existing invoker
    if (newState !== InterestState.NoInterest) {
      const existing = GetInterestInvoker(target);
      if (existing) {
        if (existing === invoker) {
          existing[dataField].clearLostTask();
          return false;
        } else {
          if (!GainOrLoseInterest(existing, target, InterestState.NoInterest)) {
            return false;
          }
          // re-check preconditions
          if (
            !invoker.isConnected ||
            GetInterestForTarget(invoker) !== target
          ) {
            return false;
          }
        }
      }
      // finally apply interest
      return applyState(invoker, newState);
    }

    // losing interest
    clearState(invoker);
    return true;
  }

  // Schedule tasks
  function ScheduleInterestGainedTask(invoker, newState) {
    const delay = getDelaySeconds(invoker, interestDelayStartProp) * 1000;
    if (!isFinite(delay) || delay < 0) {
      return;
    }
    invoker[dataField].clearGainedTask();
    invoker[dataField].gainedTimer = setTimeout(() => {
      GainOrLoseInterest(invoker, GetInterestForTarget(invoker), newState);
    }, delay);
  }

  function ScheduleInterestLostTask(invoker) {
    const delay = getDelaySeconds(invoker, interestDelayEndProp) * 1000;
    if (!isFinite(delay) || delay < 0) {
      return;
    }
    invoker[dataField].clearLostTask();
    invoker[dataField].lostTimer = setTimeout(() => {
      GainOrLoseInterest(
        invoker,
        GetInterestForTarget(invoker),
        InterestState.NoInterest
      );
    }, delay);
  }

  // Helpers
  function GetInterestInvoker(target) {
    const inv = target[targetDataField]?.invoker || null;
    return inv && inv[dataField]?.state !== InterestState.NoInterest
      ? inv
      : null;
  }
  function GetInterestForTarget(el) {
    const id = el.getAttribute(attributeName);
    return document.getElementById(id);
  }

  function onPopoverToggle(e) {
    const popover = e.target;
    if (e.newState === 'closed') {
      const invoker = popover[targetDataField]?.invoker;
      if (invoker) {
        GainOrLoseInterest(invoker, popover, InterestState.NoInterest);
      }
    }
  }

  function parseTimeValue(val) {
    const s = String(val).trim();
    const m_s = s.match(/^([\d.]+)s$/);
    if (m_s) {
      return parseFloat(m_s[1]);
    }
    const m_ms = s.match(/^([\d.]+)ms$/);
    if (m_ms) {
      return parseFloat(m_ms[1]) / 1000;
    }
    return parseFloat(s) || 0;
  }

  function getDelaySeconds(el, prop) {
    const style = getComputedStyle(el);
    const longhandValue = style.getPropertyValue(prop).trim();

    // Longhand has priority. If it's not 'normal', use it.
    if (longhandValue.toLowerCase() !== 'normal') {
        return parseTimeValue(longhandValue);
    }

    // Longhand is 'normal', so check shorthand. This isn't exactly                                                           │
    // correct, since the longhand might have been explicitly set to                                                          │
    // 'normal'.   
    const shorthand = style.getPropertyValue(interestDelayProp).trim();
    if (shorthand && shorthand.toLowerCase() !== 'normal') {
        const parts = shorthand.split(/\s+/).filter((s) => s.length > 0);
        if (parts.length > 0) {
            const firstValue = parts[0];
            const secondValue = parts.length > 1 ? parts[1] : firstValue;
            let valueFromShorthand;
            if (prop === interestDelayStartProp) {
                valueFromShorthand = firstValue;
            } else { // prop === interestDelayEndProp
                valueFromShorthand = secondValue;
            }

            // If the value from the shorthand is not 'normal', use it.
            if (valueFromShorthand.toLowerCase() !== 'normal') {
                return parseTimeValue(valueFromShorthand);
            }
        }
    }

    // If we got here, the effective value is 'normal'. Return the default.
    return prop === interestDelayStartProp ? 0.5 : 0.25;
  }

  // Actual state transitions
  function applyState(invoker, newState) {
    const data = invoker[dataField];
    const target = GetInterestForTarget(invoker);
    switch (newState) {
      case InterestState.FullInterest:
        if (data.state !== InterestState.NoInterest) {
          throw new Error("Invalid state");
        }
        target.dispatchEvent(new Event(interestEventName));
        try {
          target.showPopover({ source: invoker });
        } catch {}
        data.state = InterestState.FullInterest;
        if (!target[targetDataField]) {
          target[targetDataField] = {};
        }
        target[targetDataField].invoker = invoker;
        if (target.hasAttribute('popover')) {
          target[targetDataField].toggleListener = onPopoverToggle;
          target.addEventListener('toggle', onPopoverToggle);
        }
        invokersWithInterest.add(invoker);
        invoker.classList.add("interest-source");
        target.classList.add("interest-target");
        if (!isPlainHint(target)) {
          invoker.setAttribute("aria-expanded", "true");
        }
        const anchorName = `--interest-anchor-${Math.random()
          .toString(36)
          .substring(2)}`;
        invoker.style.anchorName = anchorName;
        target.style.positionAnchor = anchorName;
        data.anchorName = anchorName;
        break;
      default:
        throw new Error("Invalid state");
    }
    return true;
  }

  function clearState(invoker) {
    const data = invoker[dataField];
    clearTimeout(data.gainedTimer);
    clearTimeout(data.lostTimer);
    if (data.state !== InterestState.NoInterest) {
      const target = GetInterestForTarget(invoker);
      target.dispatchEvent(new Event(loseInterestEventName));
      try {
        target.hidePopover();
      } catch {}
      if (target[targetDataField]?.toggleListener) {
        target.removeEventListener('toggle', target[targetDataField].toggleListener);
      }
      target[targetDataField] = null;
      invokersWithInterest.delete(invoker);
      invoker.classList.remove("interest-source");
      target.classList.remove("interest-target");
      if (!isPlainHint(target)) {
        invoker.setAttribute("aria-expanded", "false");
      }
      if (data.anchorName) {
        invoker.style.anchorName = "";
        target.style.positionAnchor = "";
        data.anchorName = null;
      }
      data.state = InterestState.NoInterest;
    }
  }

  // Focusability utilities
  const focusableSelector = [
    "a[href]",
    "area[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    "iframe",
    "object",
    "embed",
    "[contenteditable]",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  // Accessibility utilities
  function isPlainHint(target) {
    if (target.getAttribute("popover")?.toLowerCase() !== "hint") {
      return false;
    }
    // Anything focusable is not plain.
    if (target.querySelector(focusableSelector)) {
      return false;
    }
    // Common structural/semantic elements that are not focusable.
    const structuralSelector =
      "h1,h2,h3,h4,h5,h6,ul,ol,li,table,nav,header,footer,main,aside,article,section,form,blockquote,details,summary,dialog";
    if (target.querySelector(structuralSelector)) {
      return false;
    }
    // Check for ARIA roles.
    const elementsWithRoles = target.querySelectorAll("[role]");
    for (const el of elementsWithRoles) {
      const role = el.getAttribute("role").toLowerCase();
      // Allowed roles are those that don't add semantics for a screen reader to explore.
      if (!["presentation", "none", "generic", "image"].includes(role)) {
        return false;
      }
    }
    return true;
  }

  function setupAccessibility(invoker, target) {
    if (isPlainHint(target)) {
      invoker.setAttribute("aria-describedby", target.id);
    } else {
      // Rich hint
      invoker.setAttribute("aria-details", target.id);
      invoker.setAttribute("aria-expanded", "false");
      if (!target.hasAttribute("role")) {
        target.setAttribute("role", "tooltip");
      }
    }
  }

  function initializeDataField(el) {
    if (el[dataField]) return;
    el[dataField] = {
      state: InterestState.NoInterest,
      gainedTimer: null,
      lostTimer: null,
      longPressTimer: null,
      clearGainedTask() {
        clearTimeout(this.gainedTimer);
      },
      clearLostTask() {
        clearTimeout(this.lostTimer);
      },
    };
    const target = GetInterestForTarget(el);
    if (target) {
      setupAccessibility(el, target);
    }
  }

  function HandleInterestHoverOrFocus(el, source) {
    if (touchInProgress) {
      return;
    }
    if (!el.isConnected) {
      return;
    }
    const target = GetInterestForTarget(el);
    if (!target) {
      const containingTarget = el.closest(".interest-target");
      if (containingTarget) {
        const upstreamInvoker = GetInterestInvoker(containingTarget);
        if (upstreamInvoker) {
          if (source === Source.Hover || source === Source.Focus) {
            upstreamInvoker[dataField].clearLostTask();
          } else {
            if (source === Source.Blur || !el.matches(":hover")) {
              ScheduleInterestLostTask(upstreamInvoker);
            }
          }
        }
      }
      return;
    }
    initializeDataField(el);
    const data = el[dataField];
    const upstreamInvoker = GetInterestInvoker(el);

    // Hover or focus
    if (source === Source.Hover || source === Source.Focus) {
      data.clearLostTask && data.clearLostTask();
      if (upstreamInvoker) {
        upstreamInvoker[dataField].clearLostTask();
      }
      ScheduleInterestGainedTask(el, InterestState.FullInterest);
    } else {
      // Dehover or blur
      data.clearGainedTask && data.clearGainedTask();
      if (data.state !== InterestState.NoInterest) {
        ScheduleInterestLostTask(el);
      }
      if (upstreamInvoker) {
        upstreamInvoker[dataField].clearGainedTask();
        if (source === Source.Blur || !el.matches(":hover")) {
          ScheduleInterestLostTask(upstreamInvoker);
        }
      }
    }
  }

  // Attach listeners
  function addEventHandlers() {
    const handler = (e, source) => {
      for (let el = e.target; el; el = el.parentElement) {
        HandleInterestHoverOrFocus(el, source);
      }
    };
    document.body.addEventListener("mouseover", (e) => handler(e, Source.Hover));
    document.body.addEventListener("mouseout", (e) => handler(e, Source.DeHover));
    document.body.addEventListener("focusin", (e) => handler(e, Source.Focus));
    document.body.addEventListener("focusout", (e) => handler(e, Source.Blur));
    document.body.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        invokersWithInterest.forEach((invoker) => {
          clearState(invoker);
        });
      }
    });
    // Touch support
    const longPressTime = 500;
    document.body.addEventListener("touchstart", (e) => {
      touchInProgress = true;
      const invoker = e.target.closest("button[interestfor]");
      if (invoker) {
        initializeDataField(invoker);
        invoker[dataField].longPressTimer = setTimeout(() => {
          GainOrLoseInterest(invoker, GetInterestForTarget(invoker), InterestState.FullInterest);
          invoker[dataField].longPressTimer = null;
        }, longPressTime);
      }
    });
    const cancelLongPress = (e) => {
      const invoker = e.target.closest("button[interestfor]");
      if (invoker && invoker[dataField]?.longPressTimer) {
        clearTimeout(invoker[dataField].longPressTimer);
        invoker[dataField].longPressTimer = null;
      }
    };
    document.body.addEventListener("touchend", (e) => {
      cancelLongPress(e);
      touchInProgress = false;
    });
    document.body.addEventListener("touchmove", cancelLongPress);
  }

  // CSS registration
  function registerCustomProperties() {
    const style = document.createElement("style");
    style.textContent = `@property ${interestDelayStartProp} {syntax: "normal | <time>"; inherits: false; initial-value: normal;}
      @property ${interestDelayEndProp} {syntax: "normal | <time>"; inherits: false; initial-value: normal;}
      @property ${interestDelayProp} {syntax: "[ normal | <time> ]{1,2}"; inherits: false; initial-value: normal;}`;
    document.head.appendChild(style);
    document[dataField] = { globalPropsStyle: style };
  }

  // Initialize
  function init() {
    registerCustomProperties();
    addEventHandlers();
    console.log(`interestfor polyfill installed (native: ${nativeSupported}).`);
  }
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
