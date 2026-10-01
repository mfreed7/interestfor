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
  // Stands in for the `content` property of the `::interest-button` pseudo
  // element. It is set on the invoker.
  const interestButtonContentProp = "--interest-button-content";
  // An unregistered (and therefore inherited) copy of the content value, which
  // is set on the polyfilled interest button, so that its ::before pseudo
  // element can render it.
  const interestButtonInternalContentProp =
    "--interest-button-polyfill-content";
  const interestButtonClass = "interest-button";
  const dataField = "__interestForData";
  const targetDataField = "__interestForTargetData";
  const buttonField = "__interestForButton";
  const buttonInvokerField = "__interestForButtonInvoker";
  const explicitTargetField = "__interestForExplicitTarget";
  const xlinkNamespace = "http://www.w3.org/1999/xlink";
  const invokersWithInterest = new Set();
  const invokersWithButtons = new Set();
  const invokersMissingTarget = new Set();
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
  
  if(!window.InterestEvent) {
    window.InterestEvent = class InterestEvent extends Event {
      #source;
      constructor(type, eventInit = {}) {
        super(type, eventInit);
        const { source } = eventInit;
        if (source != null && !(source instanceof Element)) {
          throw new TypeError(`source must be an element`);
        }
        this.#source = source;
      }

      get [Symbol.toStringTag]() {
        return "InterestEvent";
      }

      get source() {
        const source = this.#source;
        if (!source) return null;
        // Retarget `source` to the current event's root:
        const sourceRoot = getRootNode(source);
        if (sourceRoot !== getRootNode(this.target || document)) {
          return sourceRoot.host;
        }
        return source;
      }
    }
  }

  // Enum-like state and source
  const InterestState = {
    NoInterest: "none",
    // Interest gained via hover or focus, after a delay. This is lost when
    // the invoker is de-hovered or blurred.
    FullInterest: "full",
    // Interest gained immediately via long-press or the `::interest-button`.
    // This is not lost when the invoker itself is de-hovered or blurred.
    ExplicitInterest: "explicit",
  };
  const Source = {
    Hover: "hover",
    DeHover: "dehover",
    Focus: "focus",
    Blur: "blur",
    Touch: "touch",
  };

  function getRootNode(node) {
    if (node && typeof node.getRootNode === "function") {
      return node.getRootNode();
    }
    if (node && node.parentNode) return getRootNode(node.parentNode);
    return node;
  }

  // Gain or lose interest
  function GainOrLoseInterest(invoker, target, newState, options = {}) {
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
      initializeDataField(invoker);
      if (
        invoker[dataField].state !== InterestState.NoInterest &&
        invoker[dataField].target !== target
      ) {
        // The `interestfor` attribute changed while this invoker had interest,
        // and the mutation observer hasn't run yet.
        resetInterestState(invoker);
      }
      const existing = GetInterestInvoker(target);
      if (existing) {
        if (existing === invoker) {
          if (newState === InterestState.ExplicitInterest) {
            existing[dataField].state = InterestState.ExplicitInterest;
          }
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
      return applyState(invoker, target, newState);
    }

    // losing interest
    return clearState(invoker, options);
  }

  // Schedule tasks
  function ScheduleInterestGainedTask(invoker, newState) {
    const target = GetInterestForTarget(invoker);
    if (!target) {
      return;
    }
    const delay = getDelaySeconds(invoker, interestDelayStartProp) * 1000;
    if (!isSchedulableDelay(delay)) {
      return;
    }
    invoker[dataField].clearGainedTask();
    invoker[dataField].gainedTimer = setTimeout(() => {
      GainOrLoseInterest(invoker, target, newState);
    }, delay);
  }

  function ScheduleInterestLostTask(invoker) {
    const delay = getDelaySeconds(invoker, interestDelayEndProp) * 1000;
    if (!isSchedulableDelay(delay)) {
      return;
    }
    const data = invoker[dataField];
    data.clearLostTask();
    const target = data.target;
    data.lostTimer = setTimeout(() => {
      GainOrLoseInterest(invoker, target, InterestState.NoInterest);
    }, delay);
  }

  // Helpers
  function GetInterestInvoker(target) {
    const inv = target[targetDataField]?.invoker || null;
    if (!inv) {
      return null;
    }
    const data = inv[dataField];
    if (
      !data ||
      data.state === InterestState.NoInterest ||
      data.target !== target ||
      GetInterestForTarget(inv) !== target
    ) {
      return null;
    }
    return inv;
  }

  // Returns the target of a valid interest invoker, or null.
  function GetInterestForTarget(el) {
    if (
      !el.hasAttribute(attributeName) ||
      !el.isConnected ||
      !isValidInterestInvoker(el)
    ) {
      return null;
    }
    const target = getAttrAssociatedElement(el);
    return target && target.isConnected ? target : null;
  }

  // Only some elements can be interest invokers. This mirrors the
  // IsValidInterestInvoker() overrides in Chromium.
  function isValidInterestInvoker(el) {
    if (el instanceof HTMLButtonElement) {
      return !el.matches(":disabled");
    }
    if (el instanceof HTMLAnchorElement || el instanceof HTMLAreaElement) {
      return el.hasAttribute("href");
    }
    if (window.SVGAElement && el instanceof SVGAElement) {
      return el.hasAttribute("href") || el.hasAttributeNS(xlinkNamespace, "href");
    }
    return false;
  }

  // Resolves the `interestfor` attribute (or an element set via the
  // `interestForElement` property) within the invoker's tree scope.
  function getAttrAssociatedElement(el) {
    const id = el.getAttribute(attributeName);
    if (id === null) {
      return null;
    }
    const explicitTarget = el[explicitTargetField];
    if (explicitTarget && id === "") {
      return isInShadowIncludingAncestorTree(explicitTarget, el)
        ? explicitTarget
        : null;
    }
    if (id === "") {
      return null;
    }
    const root = getRootNode(el);
    return typeof root.getElementById === "function"
      ? root.getElementById(id)
      : null;
  }

  // Returns true if `candidate` is in the same tree as `el`, or in the tree of
  // one of `el`'s shadow hosts.
  function isInShadowIncludingAncestorTree(candidate, el) {
    const candidateRoot = getRootNode(candidate);
    let root = getRootNode(el);
    while (root) {
      if (root === candidateRoot) {
        return true;
      }
      root = root instanceof ShadowRoot ? getRootNode(root.host) : null;
    }
    return false;
  }

  function isPopoverOpen(el) {
    try {
      return el.matches(":popover-open");
    } catch {
      return false;
    }
  }

  // If the target popover is hidden by something other than the loss of
  // interest (e.g. light dismiss), the invoker loses interest. This uses
  // `beforetoggle`, since in Chromium, the loss of interest happens
  // synchronously as the popover begins to hide.
  function onPopoverBeforeToggle(e) {
    if (e.newState !== "closed") {
      return;
    }
    const popover = e.currentTarget;
    const invoker = GetInterestInvoker(popover);
    if (!invoker) {
      return;
    }
    if (popover.contains(document.activeElement)) {
      // Focus will be returned to the previously focused element after the
      // popover hides. If that is the invoker, don't show interest again
      // because of that focus.
      const data = invoker[dataField];
      data.suppressNextFocusInterest = true;
      setTimeout(() => {
        data.suppressNextFocusInterest = false;
      }, 0);
    }
    // The popover is already hiding, so don't try to hide it again.
    GainOrLoseInterest(invoker, popover, InterestState.NoInterest, {
      closePopovers: false,
    });
  }

  // Delays longer than setTimeout() supports (which would fire immediately)
  // are treated as infinite, i.e. interest is never gained or lost.
  function isSchedulableDelay(delayMs) {
    return delayMs >= 0 && delayMs <= 2147483647;
  }

  function parseTimeValue(val) {
    const s = String(val).trim();
    const m_s = s.match(/^([\d.]+(?:e[+-]?\d+)?)s$/i);
    if (m_s) {
      return parseFloat(m_s[1]);
    }
    const m_ms = s.match(/^([\d.]+(?:e[+-]?\d+)?)ms$/i);
    if (m_ms) {
      return parseFloat(m_ms[1]) / 1000;
    }
    // Values such as `calc(infinity * 1s)` mean that interest is never
    // gained or lost via hover or focus.
    if (/\b(infinity|nan)\b/i.test(s)) {
      return Infinity;
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

    // If we got here, the effective value is 'normal'. Return the Chromium default.
    return prop === interestDelayStartProp ? 0.25 : 0.15;
  }

  // Actual state transitions
  function applyState(invoker, target, newState) {
    const data = invoker[dataField];
    switch (newState) {
      case InterestState.FullInterest:
      case InterestState.ExplicitInterest:
        if (data.state !== InterestState.NoInterest) {
          throw new Error("Invalid state");
        }
        const shouldContinue = target.dispatchEvent(
          new InterestEvent(interestEventName, {
            source: invoker,
            cancelable: true,
          })
        );
        if (!shouldContinue) return false;
        data.state = newState;
        data.target = target;
        data.clearGainedTask();
        if (!target[targetDataField]) {
          target[targetDataField] = {};
        }
        target[targetDataField].invoker = invoker;
        if (target.hasAttribute('popover')) {
          target.addEventListener('beforetoggle', onPopoverBeforeToggle);
          // Only show the popover if it isn't already open. Only popovers that
          // were shown here get hidden when interest is lost.
          target[targetDataField].shownByInterest = false;
          if (!isPopoverOpen(target)) {
            try {
              target.showPopover({ source: invoker });
            } catch {}
            target[targetDataField].shownByInterest = isPopoverOpen(target);
          }
        }
        invokersWithInterest.add(invoker);
        invoker.classList.add("interest-source");
        target.classList.add("interest-target");
        if (!isPlainHint(target)) {
          invoker.setAttribute("aria-expanded", "true");
        }
        if (getComputedStyle(invoker).anchorName === 'none' &&
            getComputedStyle(target).positionAnchor === 'auto') {
          const anchorName = `--interest-anchor-${Math.random()
            .toString(36)
            .substring(2)}`;
          invoker.style.anchorName = anchorName;
          target.style.positionAnchor = anchorName;
          data.anchorName = anchorName;
        }
        break;
      default:
        throw new Error("Invalid state");
    }
    return true;
  }

  // Fires the `loseinterest` event, and if not cancelled, removes interest
  // and hides the target popover (if it was shown via interest). If `force` is
  // true, the event is not cancelable.
  function clearState(invoker, { force = false, closePopovers = true } = {}) {
    const data = invoker[dataField];
    clearTimeout(data.gainedTimer);
    clearTimeout(data.lostTimer);
    if (data.state === InterestState.NoInterest) {
      return true;
    }
    const target = data.target;
    const shouldContinue = target.dispatchEvent(
      new InterestEvent(loseInterestEventName, {
        source: invoker,
        cancelable: !force,
      })
    );
    if (!shouldContinue) return false;
    const targetData = target[targetDataField];
    const shouldHide =
      closePopovers &&
      targetData?.invoker === invoker &&
      targetData.shownByInterest;
    resetInterestState(invoker);
    if (shouldHide && isPopoverOpen(target)) {
      hideTargetPopover(invoker, target);
    }
    return true;
  }

  // Removes interest without firing events, or hiding the target. This
  // mirrors ChangeInterestState(kNoInterest) in Chromium, and is used directly
  // when the invoker or target is removed, or the `interestfor` attribute
  // changes.
  function resetInterestState(invoker) {
    const data = invoker[dataField];
    if (!data) {
      return;
    }
    clearTimeout(data.gainedTimer);
    clearTimeout(data.lostTimer);
    if (data.state === InterestState.NoInterest) {
      return;
    }
    const target = data.target;
    invokersWithInterest.delete(invoker);
    invoker.classList.remove("interest-source");
    if (target) {
      if (target[targetDataField]?.invoker === invoker) {
        target.removeEventListener('beforetoggle', onPopoverBeforeToggle);
        target[targetDataField] = null;
        target.classList.remove("interest-target");
      }
      if (!isPlainHint(target)) {
        invoker.setAttribute("aria-expanded", "false");
      }
    }
    if (data.anchorName) {
      invoker.style.anchorName = "";
      if (target) {
        target.style.positionAnchor = "";
      }
      data.anchorName = null;
    }
    data.state = InterestState.NoInterest;
    data.target = null;
  }

  function hideTargetPopover(invoker, target) {
    // If focus is within the popover, hiding it returns focus to the
    // previously focused element. If that is the invoker, don't show interest
    // again because of that focus.
    const data = invoker[dataField];
    const focusInside = target.contains(document.activeElement);
    if (focusInside) {
      data.suppressNextFocusInterest = true;
    }
    try {
      target.hidePopover();
    } catch {}
    if (focusInside) {
      data.suppressNextFocusInterest = false;
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
      target: null,
      gainedTimer: null,
      lostTimer: null,
      longPressTimer: null,
      suppressNextFocusInterest: false,
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

  // Returns the flat tree parent of `el`. The polyfilled `::interest-button`
  // is treated as a child of its invoker, for tree traversal purposes, as
  // the real pseudo element would be. (It is treated as a sibling for layout
  // tree traversal purposes only.)
  function getParentForInterest(el) {
    if (el[buttonInvokerField]) {
      return el[buttonInvokerField];
    }
    if (el.assignedSlot) {
      return el.assignedSlot;
    }
    if (el.parentElement) {
      return el.parentElement;
    }
    const parent = el.parentNode;
    return parent instanceof ShadowRoot ? parent.host : null;
  }

  // Returns all invokers that have interest in `el`, or in any of its
  // ancestors, and (recursively) all invokers that have interest in those
  // invokers or their ancestors. This mirrors AllSourceInterestInvokers() in
  // Chromium, and allows nested interest popovers to stay open while the inner
  // ones are hovered.
  function allSourceInterestInvokers(el) {
    const sources = new Set();
    if (invokersWithInterest.size === 0) {
      return sources;
    }
    const visit = (node) => {
      const upstream = GetInterestInvoker(node);
      if (upstream && !sources.has(upstream)) {
        sources.add(upstream);
        visit(upstream);
      }
      const parent = getParentForInterest(node);
      if (parent && !sources.has(parent)) {
        visit(parent);
      }
    };
    visit(el);
    return sources;
  }

  function HandleInterestHoverOrFocus(el, source) {
    if (touchInProgress) {
      return;
    }
    if (!el.isConnected) {
      return;
    }
    const target = GetInterestForTarget(el);
    if (target) {
      initializeDataField(el);
    }
    const data = el[dataField];

    // Hover or focus
    if (source === Source.Hover || source === Source.Focus) {
      let suppressFocusInterest = false;
      if (data) {
        data.clearLostTask();
        suppressFocusInterest =
          source === Source.Focus && data.suppressNextFocusInterest;
        data.suppressNextFocusInterest = false;
      }
      for (const upstreamInvoker of allSourceInterestInvokers(el)) {
        upstreamInvoker[dataField].clearLostTask();
      }
      if (
        target &&
        !suppressFocusInterest &&
        data.state === InterestState.NoInterest
      ) {
        ScheduleInterestGainedTask(el, InterestState.FullInterest);
      }
    } else {
      // Dehover or blur
      if (data) {
        data.clearGainedTask();
        // Explicit interest is not lost by de-hovering or blurring the
        // invoker itself.
        if (data.state === InterestState.FullInterest) {
          ScheduleInterestLostTask(el);
        }
      }
      if (source === Source.Blur || !el.matches(":hover")) {
        for (const upstreamInvoker of allSourceInterestInvokers(el)) {
          ScheduleInterestLostTask(upstreamInvoker);
        }
      }
    }
  }

  // `::interest-button` support. The pseudo element is polyfilled with a real
  // element, inserted as the next sibling of the invoker. It is only created
  // if the invoker has a `--interest-button-content` value other than `none`
  // or `normal`, which stands in for the `content` property on the real pseudo
  // element.
  function wantsInterestButton(invoker) {
    return (
      invoker instanceof HTMLElement &&
      invoker.localName !== "area" &&
      !!invoker.parentNode &&
      !!GetInterestForTarget(invoker)
    );
  }

  function getInterestButtonContent(invoker) {
    const value = getComputedStyle(invoker)
      .getPropertyValue(interestButtonContentProp)
      .trim();
    if (!value || value === "none" || value === "normal") {
      return null;
    }
    return value;
  }

  function onInterestButtonClick() {
    // Activating the interest button shows interest immediately, without
    // delays.
    const invoker = this[buttonInvokerField];
    if (invoker) {
      GainOrLoseInterest(
        invoker,
        GetInterestForTarget(invoker),
        InterestState.ExplicitInterest
      );
    }
  }

  function setInterestButton(invoker, content) {
    let button = invoker[buttonField];
    if (!content) {
      if (button) {
        button.remove();
        invoker[buttonField] = null;
        invokersWithButtons.delete(invoker);
      }
      return;
    }
    if (!button) {
      button = invoker.ownerDocument.createElement("span");
      button.className = interestButtonClass;
      // The real pseudo element is not exposed to accessibility, and is not
      // focusable.
      button.setAttribute("aria-hidden", "true");
      button[buttonInvokerField] = invoker;
      button.addEventListener("click", onInterestButtonClick);
      invoker[buttonField] = button;
      invokersWithButtons.add(invoker);
    }
    if (
      button.style.getPropertyValue(interestButtonInternalContentProp) !==
      content
    ) {
      button.style.setProperty(interestButtonInternalContentProp, content);
    }
    if (invoker.nextSibling !== button) {
      invoker.after(button);
    }
  }

  function updateInterestButtons(invokers) {
    // Read all styles first, and then modify the DOM, to avoid forcing a style
    // recalc for each invoker.
    const updates = [];
    for (const invoker of invokers) {
      let content = null;
      if (invoker.isConnected && invoker.hasAttribute(attributeName)) {
        if (wantsInterestButton(invoker)) {
          invokersMissingTarget.delete(invoker);
          content = getInterestButtonContent(invoker);
        } else {
          // The target might be added (or become valid) later.
          invokersMissingTarget.add(invoker);
        }
      } else {
        invokersMissingTarget.delete(invoker);
      }
      updates.push([invoker, content]);
    }
    for (const [invoker, content] of updates) {
      setInterestButton(invoker, content);
    }
  }

  function handleMutations(records) {
    const candidates = new Set();
    let recheckMissingTargets = false;
    const addInvokers = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE || node[buttonInvokerField]) {
        return;
      }
      if (node.hasAttribute(attributeName)) {
        candidates.add(node);
      }
      for (const el of node.querySelectorAll(`[${attributeName}]`)) {
        candidates.add(el);
      }
    };
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && !node[buttonInvokerField]) {
            recheckMissingTargets = true;
            addInvokers(node);
          }
        }
        continue;
      }
      const el = record.target;
      switch (record.attributeName) {
        case attributeName:
          if (record.oldValue !== null) {
            // Changing the `interestfor` attribute removes interest, without
            // firing events.
            resetInterestState(el);
          }
          if (el.getAttribute(attributeName) !== "") {
            el[explicitTargetField] = null;
          }
          candidates.add(el);
          break;
        case "id":
          recheckMissingTargets = true;
          break;
        default:
          // `href` or `disabled`, which affect invoker validity.
          addInvokers(el);
          break;
      }
    }
    // Invokers or targets that were removed from the document lose interest,
    // without firing events.
    for (const invoker of [...invokersWithInterest]) {
      const target = invoker[dataField].target;
      if (!invoker.isConnected || !target || !target.isConnected) {
        resetInterestState(invoker);
      }
    }
    if (recheckMissingTargets) {
      for (const invoker of invokersMissingTarget) {
        candidates.add(invoker);
      }
    }
    // Keep existing interest buttons next to their invokers, and remove them
    // if their invoker is no longer valid. This avoids reading styles.
    for (const invoker of [...invokersWithButtons]) {
      if (candidates.has(invoker)) {
        continue;
      }
      if (!wantsInterestButton(invoker)) {
        setInterestButton(invoker, null);
      } else if (invoker.nextSibling !== invoker[buttonField]) {
        invoker.after(invoker[buttonField]);
      }
    }
    updateInterestButtons(candidates);
  }

  function observeMutations() {
    new MutationObserver(handleMutations).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [attributeName, "id", "href", "disabled"],
    });
  }

  // Attach listeners
  function addEventHandlers() {
    const handler = (e, source) => {
      // Use the composed path, so that invokers in open shadow roots work.
      const path = e.composedPath();
      const start = path.length ? path[0] : e.target;
      if (!(start instanceof Element)) {
        return;
      }
      for (let el = start; el; el = getParentForInterest(el)) {
        HandleInterestHoverOrFocus(el, source);
      }
    };
    document.body.addEventListener("mouseover", (e) => handler(e, Source.Hover));
    document.body.addEventListener("mouseout", (e) => handler(e, Source.DeHover));
    document.body.addEventListener("focusin", (e) => handler(e, Source.Focus));
    document.body.addEventListener("focusout", (e) => handler(e, Source.Blur));
    document.body.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        // Lose interest in all invokers, most recent first. These
        // `loseinterest` events are not cancelable.
        [...invokersWithInterest].reverse().forEach((invoker) => {
          GainOrLoseInterest(
            invoker,
            invoker[dataField].target,
            InterestState.NoInterest,
            { force: true }
          );
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
          // Long-press shows interest immediately, and that interest is not
          // lost by de-hovering or blurring the invoker.
          if (invoker[dataField].state === InterestState.NoInterest) {
            GainOrLoseInterest(
              invoker,
              GetInterestForTarget(invoker),
              InterestState.ExplicitInterest
            );
          }
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
    // `@property` syntax can't express "one or two of `normal | <time>`", so
    // the shorthand uses the universal syntax. It is still registered, so that
    // it doesn't inherit.
    style.textContent = `@property ${interestDelayStartProp} {syntax: "normal | <time>"; inherits: false; initial-value: normal;}
      @property ${interestDelayEndProp} {syntax: "normal | <time>"; inherits: false; initial-value: normal;}
      @property ${interestDelayProp} {syntax: "*"; inherits: false;}
      @property ${interestButtonContentProp} {syntax: "*"; inherits: false;}`;
    document.head.appendChild(style);
    // Equivalents of the UA stylesheet rules for interest invokers. These are
    // inserted first, and use :where(), so that author styles take precedence.
    const button = `span.${interestButtonClass}[aria-hidden]`;
    const uaStyle = document.createElement("style");
    uaStyle.textContent = `:where(button[${attributeName}]) {
        -webkit-user-select: none;
        user-select: none;
      }
      :where(${button}) {
        display: inline-block;
        vertical-align: middle;
        color: inherit;
        background-color: transparent;
        box-sizing: border-box;
        min-inline-size: 24px;
        min-block-size: 24px;
        min-block-size: max(24px, 1lh);
        align-content: center;
        text-align: center;
        -webkit-user-select: none;
        user-select: none;
        cursor: help;
      }
      :where(${button}:hover) {
        background-color: color-mix(in oklab, currentColor 10%, transparent);
      }
      :where(${button}:active) {
        background-color: color-mix(in oklab, currentColor 20%, transparent);
      }
      :where(${button})::before {
        content: var(${interestButtonInternalContentProp});
      }`;
    document.head.prepend(uaStyle);
    document[dataField] = { globalPropsStyle: style, uaStyle };
  }

  // The `interestForElement` IDL attribute, which reflects the `interestfor`
  // content attribute as an element reference.
  function installInterestForElement() {
    const descriptor = {
      configurable: true,
      enumerable: true,
      get() {
        return getAttrAssociatedElement(this);
      },
      set(value) {
        if (value === null || value === undefined) {
          this[explicitTargetField] = null;
          this.removeAttribute(attributeName);
        } else if (value instanceof Element) {
          this[explicitTargetField] = value;
          this.setAttribute(attributeName, "");
        } else {
          throw new TypeError(
            "Failed to set the 'interestForElement' property: The provided value is not of type 'Element'."
          );
        }
      },
    };
    [
      window.HTMLButtonElement,
      window.HTMLAnchorElement,
      window.HTMLAreaElement,
      window.SVGAElement,
    ].forEach((iface) => {
      if (
        iface &&
        !Object.prototype.hasOwnProperty.call(iface.prototype, "interestForElement")
      ) {
        Object.defineProperty(iface.prototype, "interestForElement", descriptor);
      }
    });
  }
  installInterestForElement();

  // Initialize
  function init() {
    registerCustomProperties();
    addEventHandlers();
    observeMutations();
    updateInterestButtons(document.querySelectorAll(`[${attributeName}]`));
    console.log(`interestfor polyfill installed (native: ${nativeSupported}).`);
  }
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
