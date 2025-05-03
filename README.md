# `interesttarget` Polyfill

A polyfill for the interesttarget attribute

See the explainer for all of the details for the "real" feature:

  https://open-ui.org/components/interest-invokers.explainer/

## Usage
To use this polyfill, simply load it:

```html
<script src="interesttarget.min.js" async></script>

<a interesttarget=foo href=bar>Link</a>
<div popover id=foo>Popover</div>
```

## Implementation / Behavior
The polyfill adds event listeners to document.body that monitor for hover
or keyboard events relevant fo the `interesttarget` API. When interesting
events happen to elements with the `interesttarget` attribute or elements that
are the targets of those elements, it fires `interest` and `loseinterest`
events on the target of the `interesttarget` attribute. If the
target is a popover, it also handles showing or hiding the popover.

## Tests

The `test/test.html` file exercises the various parts of this feature and tests
for correctness. This is a manual test, since hovering and de-hovering cannot
be done programmatically. The test is capable of testing either the polyfill or
the native feature. You can run tests directly from this repo, [here](https://mfreed7.github.io/interesttarget/test/test.html).

## Things that don't (yet?) work

These things are currently not handled correctly by this polyfill:

- Hovering and then de-hovering an interest target for "not long enough" still shows interest.
- Touchscreen handling is not yet implemented (and might be impossible to implement).
- The CSS properties for the polyfill are custom properties, so their names start with `--`: `--interest-target-show-delay` and `--interest-target-hide-delay`.
- There is no support for the `--interest-target-delay` shorthand.
- The CSS pseudo classes for the polyfill are just classes, e.g. use `button.has-interest {}` rather than `button:has-interest {}`.

## Improvements / Bugs

If you find issues with the polyfill, feel free to file them [here](https://github.com/mfreed7/interesttarget/issues).
Even better, if you would like to contribute to this polyfill, I'm happy to review [pull requests](https://github.com/mfreed7/interesttarget/pulls).
Thanks in advance!
