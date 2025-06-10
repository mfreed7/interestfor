# `interestfor` Polyfill

A polyfill for the `interestfor` attribute. This is an emerging standard for
an API that hopes to be implemented in browsers. See the explainer for all of
the details for the "real" feature:

  https://open-ui.org/components/interest-invokers.explainer/

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

Again, this is a quick summary. For the complete details, please [read the
explainer](https://open-ui.org/components/interest-invokers.explainer).

## Touchscreen not supported

This polyfill will not provide touchscreen users with any way to show interest
in the invoker, because on touchscreen, long-press is the user-understood way to
"show interest" in an element. On today's browsers, long-pressing a link element
brings up a useful context menu that contains items like "Share" and "Open in
new tab". In order for the polyfill to support interest on mobile, that context
menu would need to be surpressed completely. There is currently no way to
provide access to the long-press context menu and *also* provide a way to show
interest. Since the context menu contains items that users often use,
eliminating access to the context menu is not what most developers want. So
this polyfill does nothing on mobile touchscreen.

This is one of the primary motivations for Chromium championing this as a
native API in all browsers: to support all users, including those using
touchscreens. If you'd like to weigh in on the need for this native API,
please feel free to comment on the standards positions for the non-supporting
browsers:

- WebKit: https://github.com/WebKit/standards-positions/issues/464
- Mozilla: https://github.com/mozilla/standards-positions/issues/1181


## Implementation
The polyfill adds event listeners to document.body that monitor for hover
or keyboard events relevant fo the `interestfor` API. When interesting
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
    interest-show-delay: 400ms;
    --interest-show-delay: 400ms;
    interest-hide-delay: 200ms;
    --interest-hide-delay: 200ms;
  }
  ```

- The CSS pseudo classes for detecting invoker and target interest states are
  implemented as regular class names, so again add both to your stylesheet:

  ```css
  :is([interestfor]:has-interest),
  [interestfor].has-interest {
    /* invoker styles */
  }
  :is([popover]:target-of-interest),
  [popover].target-of-interest {
    /* target popover styles */
  }
  ```

  Note the `:is()` wrapped around the "normal" selector for the real pseudo
  class names. This is to avoid the entire selector being invalidated if the
  browser does not recognize the native pseudo class (e.g. `:has-interest`).


## Tests

The `test/test.html` file exercises the various parts of this feature and tests
for correctness. This is a manual test, since hovering, keyboard-focusing, etc.
cannot be done programmatically. The test is capable of testing either the
polyfill (optionally minified) or the native feature. You can run tests directly
from this repo,
[here](https://mfreed7.github.io/interestfor/test/test.html).

## Things that don't (yet?) work

These things are currently not handled correctly by this polyfill:

- There is no support for the `--interest-delay` shorthand.
- There is no touchscreen support, as mentioned above.

## Improvements / Bugs

If you find issues with the polyfill, feel free to file them [here](https://github.com/mfreed7/interestfor/issues).
Even better, if you would like to contribute to this polyfill, I'm happy to review [pull requests](https://github.com/mfreed7/interestfor/pulls).
Thanks in advance!
