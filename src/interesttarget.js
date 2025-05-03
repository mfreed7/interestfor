// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill of the `interesttarget` attribute, as described here:
//   https://open-ui.org/components/interest-invokers.explainer/

(function () {
  const attributeName = "interesttarget";
  const showDelayProp = "--interest-target-show-delay";
  const hideDelayProp = "--interest-target-hide-delay";
  const dataField = "__interesttargetData";
  const targetDataField = "__interesttargetTargetData";

  // Feature detection
  if (window.interesttargetPolyfillInstalled) {
    return;
  }
  window.interesttargetPolyfillInstalled = true;
  const nativeSupported = HTMLButtonElement.prototype.hasOwnProperty(
    "interestTargetElement"
  );
  if (nativeSupported && !window.interesttargetUsePolyfillAlways) {
    return;
  }

  // Enum-like state and source
  const InterestState = {
    NoInterest: "none",
    PartialInterest: "partial",
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
      GetInterestTarget(invoker) !== target ||
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
          if (!invoker.isConnected || GetInterestTarget(invoker) !== target) {
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
      GainOrLoseInterest(invoker, GetInterestTarget(invoker), newState);
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
        GetInterestTarget(invoker),
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
  function GetInterestTarget(el) {
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
    const target = GetInterestTarget(invoker);
    switch (newState) {
      case InterestState.PartialInterest:
        if (data.state === InterestState.NoInterest) {
          if (!target.dispatchEvent(new Event("interest"))) {
            return;
          }
          try {
            target.showPopover();
          } catch {}
        }
        data.state = InterestState.PartialInterest;
        if (!target[targetDataField]) {
          target[targetDataField] = {};
        }
        target[targetDataField].invoker = invoker;
        invoker.classList.add("has-partial-interest", "has-interest");
        target.classList.add(
          "target-of-partial-interest",
          "target-of-interest"
        );
        disableFocusable(target);
        break;
      case InterestState.FullInterest:
        if (data.state !== InterestState.PartialInterest) {
          if (!target.dispatchEvent(new Event("interest"))) {
            return;
          }
          try {
            target.showPopover();
          } catch {}
        }
        data.state = InterestState.FullInterest;
        if (!target[targetDataField]) {
          target[targetDataField] = {};
        }
        target[targetDataField].invoker = invoker;
        invoker.classList.remove("has-partial-interest");
        invoker.classList.add("has-interest");
        target.classList.remove("target-of-partial-interest");
        target.classList.add("target-of-interest");
        restoreFocusable(target);
        break;
    }
    return true;
  }

  function clearState(invoker) {
    const data = invoker[dataField];
    clearTimeout(data.gainedTimer);
    clearTimeout(data.lostTimer);
    if (data.state !== InterestState.NoInterest) {
      const target = GetInterestTarget(invoker);
      if (!target.dispatchEvent(new Event("loseinterest"))) {
        return;
      }
      try {
        target.hidePopover();
      } catch {}
      target[targetDataField] = null;
      invoker.classList.remove("has-partial-interest", "has-interest");
      target.classList.remove(
        "target-of-partial-interest",
        "target-of-interest"
      );
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

  function HandleInterestTargetHoverOrFocus(el, source) {
    if (!el.isConnected) {
      return;
    }
    const target = GetInterestTarget(el);
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
        if (
          upstreamInvoker[dataField].state === InterestState.PartialInterest
        ) {
          applyState(upstreamInvoker, InterestState.FullInterest);
        }
      }
      const needsPartialInterest =
        source === Source.Focus &&
        target.matches(":has(" + focusableSelector + ")");
      ScheduleInterestGainedTask(
        el,
        needsPartialInterest
          ? InterestState.PartialInterest
          : InterestState.FullInterest
      );
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
      HandleInterestTargetHoverOrFocus(e.target, Source.Hover)
    );
    document.body.addEventListener("mouseout", (e) =>
      HandleInterestTargetHoverOrFocus(e.target, Source.DeHover)
    );
    document.body.addEventListener("focusin", (e) =>
      HandleInterestTargetHoverOrFocus(e.target, Source.Focus)
    );
    document.body.addEventListener("focusout", (e) =>
      HandleInterestTargetHoverOrFocus(e.target, Source.Blur)
    );
    document.body.addEventListener("keydown", (e) => {
      let data = e.target[dataField];
      if (!data) {
        return;
      }
      if (data.state !== InterestState.PartialInterest) {
        return;
      }
      if (
        e.key === "ArrowUp" &&
        e.altKey &&
        data.state === InterestState.PartialInterest
      ) {
        e.preventDefault();
        applyState(e.target, InterestState.FullInterest);
      }
      if (e.key === "Escape" && data.state !== InterestState.NoInterest) {
        e.preventDefault();
        clearState(e.target);
      }
    });
  }

  // CSS registration
  function registerCustomProperties() {
    const style = document.createElement("style");
    style.textContent = `
      @property ${showDelayProp} {
        syntax: "<time>"; inherits: false; initial-value: 0.5s;
      }
      @property ${hideDelayProp} {
        syntax: "<time>"; inherits: false; initial-value: 0.5s;
      }
    `;
    document.head.appendChild(style);
    document[dataField] = { globalPropsStyle: style };
  }
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .target-of-partial-interest::after {
        content: "{Press Alt+UpArrow to activate}";
        display: block; color: darkgrey; font-size: 0.8em;
      }
    `;
    document.head.appendChild(style);
    document[dataField].globalHintStyle = style;
  }

  // Initialize
  function init() {
    registerCustomProperties();
    injectStyles();
    addEventHandlers();
    console.log(
      `interesttarget polyfill installed (native: ${nativeSupported}).`
    );
  }
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
