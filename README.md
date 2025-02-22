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
The polyfill adds a mutation observer to document.body that monitors for any
elements with the `interesttarget` attribute. On those elements, it attaches
event listeners for mouse/keyboard events, and fires `interest` and
`loseinterest` events on the target of the `interesttarget` attribute. If the
target is a popover, it also handles showing or hiding the popover.

## Tests

The `test/test.html` file exercises the various parts of this feature and tests
for correctness. This is a manual test, since hovering and de-hovering cannot
be done programmatically. The test is capable of testing either the polyfill or
the native feature. You can run tests directly from this repo, [here](https://mfreed7.github.io/interesttarget/test/test.html).

## Things that don't (yet?) work

These things are currently not handled correctly by this polyfill:

- changing the `id` on a node such that it is the new target of an `interesttarget` element.
- Hovering and then de-hovering an interest target for "not long enough" still fires events in some cases.
- Keyboard handling is not yet implemented.
- Touchscreen handling is not yet implemented (and might be tough/impossible).
- The CSS properties for the polyfill are custom properties, so their names start with `--`: `--interest-target-show-delay` and `--interest-target-hide-delay`.
- There is no support for the `interest-target-delay` shorthand.
- There is no support yet for the `:has-interest` pseudo class. This might need to be done via an attribute like `[has-interest]`.
- The tests do not exercise the CSS delay values.

## Improvements / Bugs

If you find issues with the polyfill, feel free to file them [here](https://github.com/mfreed7/interesttarget/issues).
Even better, if you would like to contribute to this polyfill, I'm happy to review [pull requests](https://github.com/mfreed7/interesttarget/pulls).
Thanks in advance!
