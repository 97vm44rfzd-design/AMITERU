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
