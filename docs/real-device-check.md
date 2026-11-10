# Real-device check before launch

The automated suite runs only in Chrome, with phone sizes emulated. It never runs iPhone Safari or a real Android phone. Do this by hand against **preview** before the first real campaign, and again after any change to the public chart, the claim form or the sign.

You need a real iPhone, a real Android phone, a printer, and an organizer login on preview. Ask the project owner to add your email to preview's Cloudflare Access list first.

## Set up

1. Log in to preview as an organizer. Read the login code at `/dev/outbox`.
2. Create a campaign with a long Hebrew name and activate it.
3. Open "Printable sign with QR code", choose your paper size and print it. Check that it is one page, and that the name, the date in English and Hebrew, the QR code and the web address are all on it.

## On each phone (iPhone Safari, then Android Chrome)

Scan the printed sign with the phone's camera, held at arm's length.

- [ ] The chart opens, with the name at the top and the map of Shas under it.
- [ ] Nothing scrolls sideways.
- [ ] Tap two masechtos. A bar appears at the bottom showing "2 selected". It sits above the phone's home indicator and is not hidden by the browser's own toolbar.
- [ ] Tap Continue. Tap the name field: the page does **not** zoom in. The keyboard does not cover the field you are typing in.
- [ ] The phone field brings up the number keypad. The email field brings up a keyboard with `@`.
- [ ] After typing, the "Take these masechtos" button can be reached without closing the keyboard, or is directly under the last field.
- [ ] Submit with a name only. The confirmation appears with "Copy the link", and copying works.
- [ ] Open your page from the confirmation. Mark one masechta finished. Give the other back, and confirm inside the page.
- [ ] Close the browser completely. Scan the sign again. "Your masechtos" appears above the chart, and its link opens your page.
- [ ] Tap "Not you? Remove from this phone". The section goes away and stays away after a reload.
- [ ] Take another masechta with a phone number, then use "Already took a masechta? Sign in" with that number. Read the code at `/dev/outbox` on a computer. On iPhone, check that the code field offers the code from Messages once real texts are on.
- [ ] Turn the phone sideways and back. The page still fits.
- [ ] In bright light, or with the screen set to grayscale, open, taken and finished masechtos can still be told apart.

## Two phones together

- [ ] On both phones, select the same open masechta and reach the form. Submit on one, then the other. The second phone says who just took it and keeps what was typed.
- [ ] Take a masechta on one phone. Within 30 seconds, or on switching back to the browser, the other phone shows it as taken.

## Record

Note the phone models, their system versions, the date, and anything that failed. A failure here blocks launch until it is fixed and this list is run again.
