AMITERU FLOW v6.9 FIXED
Based directly on v6.8.

Added:
- Harvest Scan
- All-Seeing Eye naming/UI
- ChatGPT consultation flow

Demand forecast fixes:
1. Buyer closing-date correction:
   Only the last auction before the 15th/month-end is -4,
   and the second-last is -2.
2. Import-supply signal is now actually included in the final forecast score.
3. Length-specific historical learning now uses the same auction-date correction
   as the overall forecast.
4. PWA service-worker/cache version updated to v690 to prevent stale forecast files.

Existing v6.8 forecast engine remains in place:
weather, holidays, bridal/events, Tokyo market signal, producer weather,
import signal, historical sales learning, confidence/range, length forecasts.


v6.9.1 calendar fix
- Demand forecast calendar initialization is now independent from IndexedDB/sales DB.
- Calendar renders immediately when the page loads.
- After sales DB finishes loading, forecasts are re-rendered with historical sales learning.
- External API failures no longer prevent the calendar itself from appearing.
- PWA cache bumped to v691.


v6.9.2 forecast detail
- Tap/click a forecast calendar date to open a day-specific breakdown.
- Shows total score, holiday/bridal/weather/producer-weather/market/import/event/closing-date/history contributions.
- Shows length-specific forecast cards.
- PWA cache bumped to v692.


v6.9.3 weekday participation calibration
- Initial auction-day participation order changed to Sunday > Thursday > Tuesday.
- Base weekday scores: Sunday +9, Thursday +6, Tuesday +4.
- After at least 3 auction dates of sales data, weekday performance learns from:
  average unit price, unique buyer count, and special-sale rate.
- Learned weekday correction is capped at +/-5 points.
- Sunday bridal multiplier relaxed from 0.30 to 0.78.
- Sunday event multiplier relaxed from 0.45 to 0.88.
- Length-history weekday matching uses corrected auction date consistently.


v6.9.4 click + calendar color fix
- Fixed forecast-date click: removed broken alternate detail renderer using undefined forecastDay().
- Auction-day click now always calls the existing showForecastDetail().
- Keyboard Enter/Space also opens details.
- Saturday cells are blue.
- Sunday and Japanese holiday cells are red/pink.
- Holiday fallback dates are colored even when the external holiday-name API is unavailable.
- PWA cache bumped to v694.


v6.9.5 other-market summary
- Added a persistent "他市場の直近市況" card directly below the forecast calendars.
- Shows Ota Market latest recognized date/update status.
- Shows recent price/quantity, prior-period change, year-over-year price/quantity.
- Shows market comment, producer-weather signal, import-supply signal, and All-Seeing Eye market correction.
- The card refreshes whenever the forecast calendar is redrawn.


v6.9.6 stability fix
- Fixed the forecast initialization crash introduced by the other-market summary card.
- dashboard.js now has its own HTML-escape helper and no longer depends on app.js load order.
- Other-market summary rendering is isolated in try/catch and can never remove the forecast calendar.
- Tokyo market / import fetch failures are treated as auxiliary-source limitations, not forecast-engine failures.
- Calendar continues using cached or neutral/seasonal fallback data when browser CORS blocks public sites.
- PWA cache bumped to v696.
