# Changelog

All notable changes to OpenFoundry are documented here, ordered newest first.

---

## 2b347ae - QA health score 89 to 100: accessibility, UX, visual, perf, content fixes

Final polish pass bringing the QA health score to 100. Includes accessibility
improvements, UX refinements, visual consistency fixes, performance tuning, and
content corrections across the console frontend.

## 144bf0e - fix(qa): ISSUE-005 -- AIP agents endpoint: POST to GET, fix empty body 500

Changed the AIP agents listing endpoint from POST to GET to match Palantir API
conventions. Fixed a 500 error caused by sending an empty body on GET requests.

## b8fd4ef - P2-P3: AIP Chat, Workshop dashboard, Compass tree, linked objects, action UI fix

Added AIP multi-turn chat with a smart mock LLM that understands the pest control
ontology. Built the Workshop operational dashboard with live object counts. Added
the Compass resource tree browser. Implemented linked object navigation across 8
link types. Fixed action apply UI issues.

## 5458e7f - fix(qa): ISSUE-002 -- route /admin/users/getCurrent to svc-multipass

Fixed gateway routing so that the /admin/users/getCurrent endpoint correctly
proxies to the multipass authentication service instead of the admin service.

## 45b5645 - fix(qa): ISSUE-001 -- add favicon.svg to suppress 404 console errors

Added a favicon to the console frontend to eliminate 404 errors in the browser
developer console on every page load.

## 8ea8cf8 - P0-P1: OSDK-compatible Search, ObjectSet, Aggregations, OAuth2 PKCE, Links

Core API compatibility milestone. Implemented SearchJsonQueryV2 with 13 filter
operators, ObjectSet loadObjects with 7 set types, 6 aggregation metrics, OAuth2
PKCE and client_credentials authentication flows, and 8 link types with linked
object navigation.

## 6720dd6 - Fix build issues: compass port conflict, console crypto shim, missing deps

Fixed the compass service port conflict (was colliding with another service),
added a crypto shim for the console frontend build, and resolved missing
dependency declarations across several packages.

## 0c87227 - Initial commit: OpenFoundry platform -- complete implementation

Full platform scaffold: 13 microservices, 28 shared packages, Vite frontend
console, Conjure-based code generation, pest control seed ontology with 47
objects across 7 types, and a one-command startup script.
