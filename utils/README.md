# utils/ — Shared Utilities

Small helper functions used across modules.

## Modules

### sleep.js (3 lines)
```javascript
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
```
Async sleep helper. Used throughout `worker/tab-manager.js` and `core/` for polling loops and delays.
