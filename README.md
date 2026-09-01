# CardSwipe MTG v3

A phone-first Progressive Web App for discovering Magic: The Gathering cards. Swipe right to save, left to skip, filter the pool, undo a swipe, inspect card details, and export your saved cards as a simple deck-list format.

## Features

- Tinder-style left/right card swiping
- Scryfall card images and current card metadata
- Commander, Standard, Modern, Pioneer, and Pauper legality filters
- Color, type, rarity, mana value, and USD price filters
- Saved-card gallery
- Undo last swipe
- Prevents reviewed cards from immediately returning
- Local-only persistence using `localStorage`
- Export/share saved list
- Installable to an iPhone Home Screen as a PWA
- Basic offline app shell; card data/images still require internet

## Fastest way to use it on your iPhone

PWAs need to be served over HTTPS to install properly. The easiest free route is GitHub Pages, Netlify, Cloudflare Pages, or another static host.

### Option A — GitHub Pages

1. Create a new GitHub repository.
2. Upload every file/folder from this project.
3. In the repository, open Settings → Pages.
4. Set the deployment source to the main branch/root.
5. Open the HTTPS Pages URL in Safari on your iPhone.
6. Tap Share → Add to Home Screen.

### Option B — any static host

Upload the contents of this folder as a static site. Then open its HTTPS URL in Safari and choose Add to Home Screen.

## Local testing on a computer

From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Reset your reviewed-card history

Safari/iPhone: remove the site's stored website data, or run this in a browser console:

```js
localStorage.removeItem('cardswipe-mtg-v1')
```

Reload afterward. This also clears saved cards and filters.

## How card discovery works

The app uses Scryfall's public card-search API. It fetches a search result, chooses a random result page, shuffles cards locally, and keeps a queue so it does not request one card per swipe. Reviewed Scryfall card IDs are stored locally to reduce repeats.

Scryfall asks API clients to stay below 10 requests per second. This app deliberately uses a low request rate and batch loading.

## Project files

- `index.html` — application structure
- `styles.css` — mobile UI
- `app.js` — swipe gestures, filters, data loading, saves, exports
- `sw.js` — service worker/app-shell caching
- `manifest.webmanifest` — PWA installation metadata
- `icons/` — Home Screen icons

## Notes

Magic: The Gathering is a trademark of Wizards of the Coast. This fan project is not affiliated with or endorsed by Wizards of the Coast. Card data/images are retrieved from Scryfall.


## Version 2 color filters
- Quick color buttons on the Discover screen: All, W, U, B, R, G, C.
- Advanced multi-color filtering under Filters.
- Three matching modes: contains any selected color, only uses selected colors, or exact colors.


## v3 color filtering
The Discover screen now has an always-visible color filter. Tap W/U/B/R/G/C to toggle one or more colors. Choose Any, All selected, or Exact to control how multicolor cards are matched. Tap All to clear the color filter.
