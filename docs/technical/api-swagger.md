# API Swagger Documentation - Technical Documentation

**Repository:** [LCARS47](https://github.com/SkyeRangerDelta/LCARS47)
**Related Issue:** [#127](https://github.com/SkyeRangerDelta/LCARS47/issues/127)
**Tech Stack:** TypeScript, Node.js >=24, Express 5, swagger-ui-express, OpenAPI 3.1

---

## Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Architecture](#architecture)
4. [Adding a Documented Route](#adding-a-documented-route)
5. [Response Envelope](#response-envelope)
6. [Authentication](#authentication)
7. [Request Logging](#request-logging)
8. [Test Guarantees](#test-guarantees)
9. [Known Lint Warnings](#known-lint-warnings)

---

## Overview

The LCARS47 API serves an OpenAPI 3.1 document describing every route it exposes, plus
a Swagger UI explorer for reading and exercising it.

The document is **assembled at boot from the route modules themselves**. It is not a
hand-maintained file sitting alongside the code, and it is not produced by scanning source
comments. Each route module under `Src/Subsystems/API/v1/` carries its own OpenAPI fragment
on the object it already exports, and the route loader merges those fragments as it wires
up the router. A route therefore cannot be registered without also contributing its docs —
and if it is, the build fails (see [Test Guarantees](#test-guarantees)).

**Access points:**

| Path | Purpose |
| --- | --- |
| `/api/docs` | Swagger UI explorer |
| `/api/openapi.json` | Raw OpenAPI 3.1 document |

The UI is pointed at the JSON endpoint rather than being handed a baked-in copy of the
document, so it always renders the spec the running process actually assembled.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api` | None | Index; reports operational state and discovered route modules |
| `GET` | `/api/openapi.json` | None | This specification, as JSON |
| `GET` | `/api/v1/stats` | None | Live bot telemetry — uptime, counters, memory, latency, media player state |
| `POST` | `/api/v1/sendMessage` | `x-lcars-auth` | Posts a message to a Discord text channel as LCARS47 |

## Architecture

### Files

| File | Responsibility |
| --- | --- |
| `Src/Subsystems/API/OpenAPIInterfaces.ts` | Minimal OpenAPI 3.1 type vocabulary — only the subset the bot uses |
| `Src/Subsystems/API/OpenAPISpec.ts` | Path constants, shared component schemas, and `buildDocument()` |
| `Src/Subsystems/API/RouterInterfaces.ts` | The `Route` contract, extended with the optional `spec` property |
| `Src/Subsystems/API/RouteLoader.ts` | Discovers route modules; merges their routers **and** their specs |
| `Src/Subsystems/API/APICore.ts` | Mounts the router, the JSON endpoint, and Swagger UI |

### Assembly flow

```
        Src/Subsystems/API/v1/*.ts
        each exports: { name, router, spec }
                    │
                    ▼
        RouteLoader.loadRoutes()
        ├── router.use( rt.router( LCARS47 ) )
        └── paths[ '/api/v1' + path ] = rt.spec[ path ]
                    │
                    ▼
        APICore  ──►  buildDocument( paths, server )
                          │
                          ├── info / servers / tags
                          ├── components.schemas
                          ├── components.securitySchemes
                          └── paths: base routes + collected route paths
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
          GET /api/openapi.json                 GET /api/docs
          (serves the document)                 (Swagger UI, fetches the above)
```

`loadRoutes()` returns `{ router, paths }`. The path prefix (`/api/v1`) is applied by the
loader from the shared `API_V1_PREFIX` constant, which `APICore` also uses for the actual
`app.use()` mount — so the documented path and the served path cannot drift apart.

A route module that registers a router but declares no `spec` logs a warning at boot rather
than failing silently.

### The document as the route registry

`GET /api` reports its `loadedRoutes` by filtering the assembled document for paths under
`/api/v1/`, rather than scanning the source tree. Two reasons:

- It reports what actually **loaded**, not what files happen to be on disk.
- The runtime container has no source tree. `Dockerfile` copies only `Deploy/`,
  `node_modules/` and `package*.json` from the build stage, so any request-time read of
  `./Src/...` fails with `ENOENT` in production while working fine on a dev machine.

## Adding a Documented Route

Add the `spec` property to the object the module already default-exports. Paths are declared
**relative to the version prefix**; the loader adds `/api/v1`.

```ts
import type { Route } from '../RouterInterfaces';
import { NO_AUTH_REQUIRED, envelopeResponse } from '../OpenAPISpec';

const example: Route = {
  name: 'example',
  router: loadRoute,
  spec: {
    '/example': {
      get: {
        summary: 'Short human-readable label',
        description: 'What this route does and any caveats.',
        operationId: 'getExample',
        tags: ['Telemetry'],
        security: NO_AUTH_REQUIRED,
        responses: {
          '200': {
            description: 'Success.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/StatusResponse' } }
            }
          },
          '500': envelopeResponse( 'Something went wrong.' )
        }
      }
    }
  }
};

export default example;
```

Requirements enforced by the test suite:

- `spec` must be present and non-empty.
- Every operation needs an `operationId`, at least one tag, and at least one response.
- Every operation must declare `security` explicitly — `NO_AUTH_REQUIRED` for public routes,
  or `[{ [API_SECURITY_SCHEME]: [] }]` for protected ones.
- Every `$ref` must resolve to a schema declared in `OpenAPISpec.ts`.

New shared schemas belong in `OpenAPISpec.ts` under `components.schemas`, referenced by
`$ref` rather than inlined, so they stay reusable across routes.

## Response Envelope

Every error — and every operation with no payload of its own — is delivered in one shape:

```json
{ "ERROR": true, "MESSAGE": "Not Found: Channel does not exist or is not text-based." }
```

Use `envelopeResponse( 'description' )` in specs rather than hand-writing the reference.

`STATE` is **not** part of the error contract. It appears only inside the `/api/v1/stats`
payload, where it describes whether the bot client is ready — a property of the bot, not of
the request.

## Authentication

Protected routes require a shared secret in the `x-lcars-auth` header, declared in the
specification as an `apiKey` security scheme named `LCARSAuth`. The token comes from the
`API_AUTH_TOKEN` environment variable; if unset, a session token is generated at boot and
logged by `EnvUtils`.

In Swagger UI, use **Authorize** to supply the token before exercising `POST /api/v1/sendMessage`.

The API — including the docs — is LAN-only and is not exposed to the public internet. The
docs and index routes are deliberately unauthenticated; they publish no secrets, and the
specification marks them with an explicit empty `security` array so that this is a stated
decision rather than an omission.

## Request Logging

`APICore.loadMiddleware()` logs every incoming request. Swagger UI is a static bundle, so a
single docs page view is really eight HTTP requests — the page, six assets, and the spec
fetch that `swagger-ui-init.js` performs.

The logger skips the assets via `isDocsAsset()` in `OpenAPISpec.ts`, leaving two lines per
page view:

```
[API] GET : /api/docs/
[API] GET : /api/openapi.json
```

Both are real events worth seeing — someone opened the docs, and something read the spec.
The stylesheet, favicons and script bundles are not. The predicate matches only paths *below*
`/api/docs/`, so the page itself (with or without a trailing slash, with or without a query
string) still logs, and no other route is affected.

## Known Lint Warnings

Validating the emitted document with Redocly's recommended ruleset reports zero errors and
three `operation-4xx-response` warnings, against the three `GET` routes. Those routes take
no parameters and require no auth, so they have no 4xx path to document. The warnings are
left standing rather than satisfied with responses the API never returns.
