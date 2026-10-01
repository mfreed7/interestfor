# `interestfor` Polyfill

A polyfill for the `interestfor` attribute. This is a new API for "interest
interactions" that is in the process of being implemented in browsers. It [shipped](https://chromestatus.com/feature/4530756656562176)
in Chromium browsers (e.g. Chrome, Edge) in version 142 (October 2025).
See the MDN documentation for more details:

https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using_interest_invokers

## Usage
To use this polyfill, simply load it:

```html
<script src="interestfor.min.js" async></script>

<a interestfor=foo href=bar>Link</a>
<div popover id=foo>Popover</div>
```

## Behavior Summary

Adding the `interestfor` attribute to a button or link (the "interest
invoker"), and giving it a value that is the IDREF of another element (the
"target" element), will cause the target to get "interest" and "loseinterest"
events when the user "shows interest" in the interest invoker. Showing interest
can be done by hovering the element with the mouse, or focusing it with the
keyboard. If the target is a popover, it will automatically be shown and hidden
upon receiving and losing interest.

A few more details:

- Only `<button>` (when not disabled), `<a href>`, `<area href>`, and SVG
  `<a href>` elements can be interest invokers. The `interestfor` attribute has
  no effect on other elements.
- The `interest` and `loseinterest` events are cancelable. Calling
  `preventDefault()` on `interest` prevents interest from being shown, and on
  `loseinterest` keeps interest (and the popover) in place.
- Pressing Escape makes all interest invokers lose interest. These
  `loseinterest` events are not cancelable.
- If the target popover was already open when interest was gained, it is not
  hidden when interest is lost.
- If the target popover is hidden some other way (e.g. light dismiss), the
  invoker loses interest.
- Popovers can be nested: hovering an invoker inside a popover that was shown
  via interest keeps the outer popover open.
- The `interestForElement` property is available on `HTMLButtonElement`,
  `HTMLAnchorElement`, `HTMLAreaElement`, and `SVGAElement`. It reflects the
  `interestfor` attribute as an element reference.
- The optional `::interest-button` pseudo element provides a button that shows
  interest immediately when clicked or tapped. See below.

Again, this is a quick summary. For the complete details, please [read the
OpenUI explainer](https://open-ui.org/components/interest-invokers.explainer),
the [HTML spec PR](https://github.com/whatwg/html/pull/11006), and the CSSWG
specs for [the pseudo classes](https://drafts.csswg.org/selectors-5/#interest-pseudos)
and [CSS properties](https://drafts.csswg.org/css-ui-4/#interest).

## The `::interest-button` pseudo element

An interest invoker can have an `::interest-button` pseudo element, which is
a small button rendered just after the invoker. Clicking (or tapping) it shows
interest immediately, without waiting for any delay. Interest shown this way is
not lost when the mouse leaves the invoker or the invoker loses focus. It is
lost when the user clicks outside the popover, presses Escape, or hovers and
then leaves the target popover. The pseudo element is only rendered if its
`content` property is set.

The polyfill can't add a real pseudo element, so it inserts a
`<span class="interest-button" aria-hidden="true">` element as the next sibling
of the invoker. Set the `--interest-button-content` custom property on the
invoker to the value you'd use for `content`, and use `+ .interest-button` to
style it. These must be separate rules, because a browser that doesn't
recognize `::interest-button` will drop the entire rule containing it:

```css
/* Native */
[interestfor]::interest-button {
  content: "?";
}
/* Polyfill */
[interestfor] {
  --interest-button-content: "?";
}
[interestfor] + .interest-button {
  /* Additional polyfill-only styles */
}
```

Both the native pseudo element and the polyfill element get these default
styles, which can be overridden: `display: inline-block`,
`vertical-align: middle`, `min-inline-size: 24px`,
`min-block-size: max(24px, 1lh)`, `cursor: help`, a transparent background, and
a slightly tinted background on `:hover` and `:active`.

Because the interest button can be tapped, it provides a way for touchscreen
users to show interest in links (see below). Note that the polyfill implements
this as a `<span>` with a click handler on purpose - that makes it non-focusable,
which is correct, because the invoker itself will show interest if focused, so
there should not be two focus stops. See [this section of the explainer](https://open-ui.org/components/interest-invokers.explainer/#rich-hints-aka-hovercards-or-other:~:text=Importantly%2C%20this%20new%20pseudo%20element%20is%20not%20keyboard%20focusable)
for more details.

## Touchscreen support

This polyfill provides limited touchscreen support. On a touchscreen,
long-pressing a `<button>` element that has an `interestfor` attribute will show
interest in the target. As with the interest button, this interest is not lost
when the button loses hover or focus.

However, long-pressing a link (`<a>` element) is **not** supported. This is
because on today's browsers, long-pressing a link element brings up a useful
context menu that contains items like "Share" and "Open in new tab". In order
for the polyfill to support interest on links, that context menu would need to
be surpressed completely. There is currently no way to provide access to the
long-press context menu and *also* provide a way to show interest. Since the
context menu contains items that users often use, eliminating access to the
context menu is not what most people want. So this polyfill will not support
long-press on links. To let touchscreen users show interest in a link, give it
an interest button (see the `::interest-button` section above).

This is one of the primary motivations for Chromium championing this as a
native API in all browsers: to support all users, including those using
touchscreens. If you'd like to weigh in on the need for this native API,
please feel free to comment on the standards positions for the non-supporting
browsers:

- WebKit: https://github.com/WebKit/standards-positions/issues/464
- Mozilla: https://github.com/mozilla/standards-positions/issues/1181


## Implementation
The polyfill adds event listeners to document.body that monitor for hover
or keyboard events relevant for the `interestfor` API. When interesting
events happen to elements with the `interestfor` attribute or elements that
are the targets of those elements, it fires `interest` and `loseinterest`
events on the target of the `interestfor` attribute. If the
target is a popover, it also handles showing or hiding the popover.

Because this is a polyfill, a few things are slightly different than the
native feature:

- The CSS properties for controlling delays are implemented as custom
  properties, so you'll want to add both the regular property and the custom
  property, prefixed with `--`, to your stylesheet:

  ```css
  [interestfor] {
    interest-delay-start: 400ms;
    --interest-delay-start: 400ms;
    interest-delay-end: 200ms;
    --interest-delay-end: 200ms;
  }
  /* Or, use the shorthand: */
  [interestfor] {
    interest-delay: 400ms 200ms;
    --interest-delay: 400ms 200ms;
  }
  /* The keyword `normal` can also be used to specify the default delay: */
  [interestfor] {
    interest-delay-end: normal;
    --interest-delay-end: normal;
  }
  ```

- The CSS pseudo classes for detecting invoker and target interest states are
  implemented as regular class names, so again add both to your stylesheet:

  ```css
  :is([interestfor]:interest-source),
  [interestfor].interest-source {
    /* invoker styles */
  }
  :is([popover]:interest-target),
  [popover].interest-target {
    /* target popover styles */
  }
  ```

  Note the `:is()` wrapped around the "normal" selector for the real pseudo
  class names. This is to avoid the entire selector being invalidated if the
  browser does not recognize the native pseudo class (e.g. `:interest-source`).

- The `::interest-button` pseudo element is implemented as a real
  `<span class="interest-button">` element, inserted after the invoker, and
  configured with the `--interest-button-content` custom property (see above).
  Because it is a real element:
  - It inherits styles from the invoker's parent, not from the invoker.
  - It can affect sibling selectors such as `+` and `:nth-child()`.
  - Click listeners on the invoker don't see clicks on the interest button.
  - It is not implicitly anchored to the invoker for anchor positioning.
- The polyfill only re-reads `--interest-button-content` when the DOM or the
  `interestfor`, `id`, `href`, or `disabled` attributes change. Changes caused
  only by styles (e.g. class changes, `:hover`, media queries) are not
  detected.
- Interest buttons are not created for invokers inside shadow roots, or for
  `<area>` or SVG `<a>` invokers.
- Clicking the interest button while the target popover is open causes the
  popover to be light dismissed and then shown again, which fires an extra
  pair of `loseinterest` and `interest` events.
- The polyfill does not run in browsers that natively support `interestfor`.
  In browsers that support `interestfor` but not `::interest-button`, no
  interest button is shown.
- The polyfill installs a `MutationObserver` on the document to keep interest
  buttons up to date, and prepends a `<style>` element to `<head>` containing
  the default styles for interest invokers and interest buttons.


## Tests

The `test/test.html` file exercises the various parts of this feature and tests
for correctness. This is a manual test, since hovering, keyboard-focusing, etc.
cannot be done programmatically. The test is capable of testing either the
polyfill (optionally minified) or the native feature. You can run tests directly
from this repo,
[here](https://mfreed7.github.io/interestfor/test/test.html).

## Browser Compatibility

This polyfill uses all standard APIs, and is therefore compatible with all
modern browsers, including Safari and Firefox.

## Improvements / Bugs

If you find issues with the polyfill, feel free to file them [here](https://github.com/mfreed7/interestfor/issues).
Even better, if you would like to contribute to this polyfill, I'm happy to review [pull requests](https://github.com/mfreed7/interestfor/pulls).
Thanks in advance!
