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
  const showDelayProp = "--interest-delay-start";
  const hideDelayProp = "--interest-delay-end";
  const dataField = "__interestForData";
  const targetDataField = "__interestForTargetData";
  const invokersWithInterest = new Set();

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
    const delay = getDelaySeconds(invoker, showDelayProp) * 1000;
    if (!isFinite(delay) || delay < 0) {
      return;
    }
    invoker[dataField].clearGainedTask();
    invoker[dataField].gainedTimer = setTimeout(() => {
      GainOrLoseInterest(invoker, GetInterestForTarget(invoker), newState);
    }, delay);
  }

  function ScheduleInterestLostTask(invoker) {
    const delay = getDelaySeconds(invoker, hideDelayProp) * 1000;
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

  function getDelaySeconds(el, prop) {
    const raw = getComputedStyle(el).getPropertyValue(prop).trim();
    const m = raw.match(/^([\d.]+)s$/);
    if (m) {
      return parseFloat(m[1]);
    }
    return parseFloat(raw) || 0;
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
        invokersWithInterest.add(invoker);
        invoker.classList.add("interest-source");
        target.classList.add("interest-target");
        restoreFocusable(target);
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
      target[targetDataField] = null;
      invokersWithInterest.delete(invoker);
      invoker.classList.remove("interest-source");
      target.classList.remove("interest-target");
      restoreFocusable(target);
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
  function disableFocusable(root) {
    root.querySelectorAll(focusableSelector).forEach((el) => {
      if (el.hasAttribute("data-original-tabindex")) {
        return;
      }
      const orig = el.getAttribute("tabindex");
      el.setAttribute("data-original-tabindex", orig === null ? "none" : orig);
      el.setAttribute("tabindex", "-1");
    });
  }
  function restoreFocusable(root) {
    root.querySelectorAll("[data-original-tabindex]").forEach((el) => {
      const orig = el.getAttribute("data-original-tabindex");
      if (orig === "none") {
        el.removeAttribute("tabindex");
      } else {
        el.setAttribute("tabindex", orig);
      }
      el.removeAttribute("data-original-tabindex");
    });
  }

  function HandleInterestHoverOrFocus(el, source) {
    if (!el.isConnected) {
      return;
    }
    const target = GetInterestForTarget(el);
    if (!target) {
      return;
    }
    let data = el[dataField];
    if (!data) {
      el[dataField] = {
        state: InterestState.NoInterest,
        gainedTimer: null,
        lostTimer: null,
        clearGainedTask() {
          clearTimeout(this.gainedTimer);
        },
        clearLostTask() {
          clearTimeout(this.lostTimer);
        },
      };
      data = el[dataField];
    }
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
    document.body.addEventListener("mouseover", (e) =>
      HandleInterestHoverOrFocus(e.target, Source.Hover)
    );
    document.body.addEventListener("mouseout", (e) =>
      HandleInterestHoverOrFocus(e.target, Source.DeHover)
    );
    document.body.addEventListener("focusin", (e) =>
      HandleInterestHoverOrFocus(e.target, Source.Focus)
    );
    document.body.addEventListener("focusout", (e) =>
      HandleInterestHoverOrFocus(e.target, Source.Blur)
    );
    document.body.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        invokersWithInterest.forEach((invoker) => {
          e.preventDefault();
          clearState(invoker);
        });
      }
    });
  }

  // CSS registration
  function registerCustomProperties() {
    const style = document.createElement("style");
    style.textContent = `@property ${showDelayProp} {syntax: "<time>"; inherits: false; initial-value: 0.5s;}
      @property ${hideDelayProp} {syntax: "<time>"; inherits: false; initial-value: 0.5s;}`;
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
