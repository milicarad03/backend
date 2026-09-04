# IoT Backend

This NestJS application connects users, devices, versioned device models,
telemetry, attributes, commands, and dynamically generated dashboards. MQTT is
the default device transport, and CoAP is available as a local experimental
request/response transport.

The backend uses PostgreSQL through Prisma ORM, Redis for short-lived device
profile caching, and Socket.IO for real-time telemetry and status delivery.

## Responsibilities

- user registration and login with JWT authentication;
- administrator approval or rejection of user accounts;
- role-based and device-ownership authorization;
- device registration, filtering, deletion, reassignment, and bulk import;
- upload and validation of versioned JSON Schema and mapping documents;
- MQTT ingestion of telemetry, attributes, status, and command responses;
- local CoAP ingestion and direct command request/response handling;
- telemetry normalization and persistence;
- storage of the latest static device attribute snapshot;
- correlated command dispatch with persistent `CommandAudit` records;
- device model-version switching with staged simulator updates;
- authorized Socket.IO rooms for telemetry and status updates;
- heartbeat, Last Will, and timeout-based device presence tracking.

## Prerequisites

- Node.js and npm;
- PostgreSQL;
- Redis;
- Mosquitto or another MQTT broker;
- the server plugin in the sibling `../plugin` directory.

## Installation

Build the local server plugin before installing the backend:

```bash
cd ../plugin
npm install
npm run build

cd ../backend
npm install
```

The package relationship is declared as:

```json
{
  "dependencies": {
    "serverplugin": "file:../plugin"
  }
}
```

## Database

Development and system-test databases must be separate:

```sql
CREATE USER iot_user WITH PASSWORD 'iot_password';
CREATE DATABASE iot_db OWNER iot_user;
CREATE DATABASE iot_test_db OWNER iot_user;
```

Apply the existing migrations and generate the Prisma client:

```bash
npx prisma migrate deploy
npx prisma generate
```

Use `npx prisma migrate dev` only when creating a new migration. Use
`npx prisma migrate deploy` to apply committed migration history on another
machine.

## Configuration

The local `.env` file must not be committed. Minimal development settings:

```dotenv
DATABASE_URL=postgresql://iot_user:iot_password@localhost:5432/iot_db?schema=public
TOKEN_SECRET=replace-with-a-long-random-secret
MQTT_BROKER_URL=mqtt://localhost:1883
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174
DEVICE_PRESENCE_ENABLED=true
DEVICE_PRESENCE_TIMEOUT_MS=45000
DEVICE_PRESENCE_SWEEP_INTERVAL_MS=10000
COAP_ENABLED=false
COAP_HOST=127.0.0.1
COAP_PORT=5683
```

Create `.env.test.local` from `.env.system-e2e.example` for system tests. The
runner rejects execution unless the database name is exactly `iot_test_db`.

## Running the backend

Start PostgreSQL, Redis, and Mosquitto first, then run:

```bash
npm run start:dev
```

HTTP and Socket.IO are available at `http://localhost:3000` by default.

## Device model definition

A model version contains two JSON documents:

- `schema` describes device telemetry, attributes, commands, and reporting
  metadata;
- `mapping` translates device fields into stable normalized keys and contains
  the dashboard layout.

Schema example:

```json
{
  "type": "object",
  "properties": {
    "schemaId": { "type": "string", "const": "modelC" },
    "metrics": {
      "type": "object",
      "properties": {
        "flowRate": { "type": "number" }
      }
    },
    "attributes": {
      "type": "object",
      "required": ["serialNumber", "firmware", "hardwareModel"],
      "properties": {
        "serialNumber": { "type": "string" },
        "firmware": { "type": "string" },
        "hardwareModel": { "type": "string" }
      }
    }
  }
}
```

Mapping example:

```json
{
  "fields": {
    "flowRate": { "path": "metrics.flowRate" },
    "firmware": { "path": "attributes.firmware" }
  },
  "dashboard": {
    "sections": [
      {
        "id": "overview",
        "title": "Overview",
        "columns": 2,
        "items": [
          {
            "id": "flow-rate",
            "component": "value-card",
            "bind": "flowRate",
            "colSpan": 1
          }
        ]
      }
    ]
  }
}
```

Administrators upload both files to `POST /model-versions/upload` as multipart
fields named `schema` and `mapping`, together with `modelName`, `version`, and
an optional `description`.

## MQTT contract

The backend subscribes to:

```text
iot/devices/+/telemetry
iot/devices/+/status
iot/devices/+/response
iot/devices/+/attributes
```

Commands are published to `iot/devices/<deviceId>/commands`. A device response
must contain the matching correlation ID. Unknown IDs are ignored. Timeouts,
publish failures, and module shutdown all remove the pending response entry.

Attributes are complete snapshots and are processed separately from telemetry.
After server-plugin validation, the latest snapshot is stored in the
`Device.attributes` JSONB field and is not added to telemetry history.

## Device presence

The simulator publishes an immediate `online` status and periodic heartbeat
statuses. Every fresh status updates `lastseen`. The presence service scans for
devices that remain `ONLINE` without a fresh message for longer than
`DEVICE_PRESENCE_TIMEOUT_MS` and conditionally changes them to `OFFLINE`.

The conditional database update prevents a newly received heartbeat from being
overwritten by an older sweep result. Retained `ONLINE` is ignored after a
subscription because it does not prove the process is still running. Retained
`OFFLINE` is accepted so an MQTT Last Will can repair stale database state after
a backend restart.

## Experimental CoAP transport

CoAP adds another transport boundary without introducing a second schema,
mapping, REST API, or frontend. CoAP telemetry, attributes, and status are
forwarded to the same server-plugin methods used by MQTT, so validation,
normalization, PostgreSQL persistence, and Socket.IO delivery stay identical.

Enable the local CoAP server using `.env.coap.example`:

```dotenv
COAP_ENABLED=true
COAP_HOST=127.0.0.1
COAP_PORT=5683
```

The simulator sends `POST` requests to:

```text
coap://127.0.0.1:5683/devices/<deviceId>/telemetry
coap://127.0.0.1:5683/devices/<deviceId>/attributes
coap://127.0.0.1:5683/devices/<deviceId>/status
```

An `online` status advertises the simulator's `/commands` endpoint. The backend
then routes commands for that device through CoAP; devices without an active
registry entry use MQTT. A command completes through the original CoAP response
and carries the same `correlationId`. An `offline` status or a newer MQTT status
removes a stale CoAP registry entry.

`STAGE_MODEL_VERSION` can carry a schema and mapping larger than one CoAP
packet. The backend therefore uses standard Block1 transfer with 1024-byte
blocks for command bodies above 1024 bytes. The simulator receives the
reassembled `request.payload`, enforces a 64 KB total limit, and only then parses
the JSON. Ordinary commands remain a single CoAP request.

This experiment does not use DTLS and is not intended as a production security
configuration. MQTT remains the default transport.

## Command audit and redundancy

`DeviceController` wraps each command action with
`DeviceCommandAuditService.execute()`. The audit service creates a correlation
ID and a persistent `PENDING` record before authorization and dispatch. It then
records `SUCCESS`, `NOOP`, or `FAILURE` together with timing and error details.

The server plugin serializes commands per device so concurrent requests cannot
bypass the redundancy check. The command service validates the active model and
payload, asks `CommandRedundancyService` whether the requested confirmed state
is already active, and returns `NOOP` when no device action is required.
Confirmed state is remembered only after a successful device response.

## Main REST operations

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/users/login` | Authenticate and issue a JWT |
| `PATCH` | `/users/approval/:id` | Administrator account decision |
| `GET` | `/device` | Authorized device list |
| `POST` | `/device` | Register one device |
| `POST` | `/device/bulk-import` | Import devices from a JSON manifest |
| `GET` | `/device/:id/telemetry/latest` | Latest telemetry |
| `GET` | `/device/:id/telemetry` | Telemetry history |
| `GET` | `/device/:id/attributes` | Latest attribute snapshot |
| `POST` | `/device/:id/command` | Dispatch and audit a command |
| `GET` | `/device/:id/command-metadata` | Commands for the active model |
| `PATCH` | `/device/:id/model-version` | Change the assigned model version |
| `GET` | `/model-versions` | List model versions |
| `POST` | `/model-versions/upload` | Upload schema and mapping files |

Owners can access their own devices. Administrators can access all devices.
Unauthenticated requests return `401`, unauthorized requests return `403`, and
missing resources return `404`.

## Bulk device import

`POST /device/bulk-import` accepts an administrator-authenticated JSON manifest
with a target user and up to 1000 device records. The service validates duplicate
serial numbers, target user existence, and all referenced model versions before
opening the Prisma transaction. Existing serial numbers are reported as
`skipped`, so uploading the same manifest again is safe.

See [`BULK-DEVICE-IMPORT.md`](BULK-DEVICE-IMPORT.md) for the complete manifest
format and response contract.

## Socket.IO

Clients pass the JWT as `auth.token`. The default allowed local origins are the
ORIGINAL host on port `5173` and CUSTOM host on port `5174`.

- `device:subscribe { deviceId }` joins an owner or administrator to
  `device:<deviceId>`;
- `telemetry:update` delivers normalized telemetry to that room;
- `device:status_update` delivers device status changes;
- `devices:subscribe_statuses` is the administrator-only global status stream.

## Tests

Unit and integration tests use Jest mocks for repositories, Redis, transport
clients, and callbacks as appropriate:

```bash
npm test -- --runInBand
```

HTTP authentication, authorization, and model upload E2E tests run a real Nest
application and real HTTP requests. Their downstream repositories and device
transports are mocked:

```bash
npm run test:e2e -- --runInBand --runTestsByPath \
  test/auth-device.e2e-spec.ts \
  test/model-version-upload.e2e-spec.ts
```

Socket.IO authorization E2E:

```bash
npm run test:e2e -- --runInBand --detectOpenHandles \
  --runTestsByPath test/device-telemetry.gateway.e2e-spec.ts
```

System E2E tests use the real Nest HTTP or ingestion pipeline, Prisma, the
isolated PostgreSQL `iot_test_db`, Redis, and Mosquitto. The telemetry scenario
also launches a real simulator child process:

```bash
npm run test:system:e2e
npm run test:system:e2e:bulk
```

Focused transport and presence suites:

```bash
npm test -- --runInBand --runTestsByPath \
  src/coap/coap-device-registry.service.spec.ts \
  src/coap/coap-command.service.spec.ts \
  src/coap/coap-transport.service.spec.ts \
  src/device/device-command.service.spec.ts

npm test -- --runInBand --runTestsByPath \
  src/mqtt/mqtt-transport.service.spec.ts \
  src/device/device-presence.service.spec.ts \
  src/device/device-telemetry.service.spec.ts
```

Production build:

```bash
npm run build
```

## MQTT versus CoAP performance

The transport scenario requires the backend, one MQTT `SET_LED` simulator, one
CoAP `SET_LED` simulator, and a valid JWT. It sends two warm-up commands and
then alternates boolean values so redundancy detection does not turn measured
commands into `NOOP` results.

```bash
TRANSPORT_PERFORMANCE_TOKEN='<JWT>' \
TRANSPORT_PERFORMANCE_MQTT_DEVICE_ID='mqtt-led-1' \
TRANSPORT_PERFORMANCE_COAP_DEVICE_ID='coap-led-1' \
TRANSPORT_PERFORMANCE_SAMPLES=30 \
npm run performance:transports
```

`transportRoundTripMs` starts immediately before the selected transport service
sends the command and stops when the matching device response arrives. It does
not include UI rendering, incoming HTTP latency, authorization, or prior plugin
validation.

The JSON report contains minimum, maximum, average, median, p95, timeout,
failure, `NOOP`, route mismatch, and success-rate values. Results are also
printed as a terminal table. The saved local run in
`performance-results/coap-vs-mqtt.json` contains 30/30 successful responses for
both protocols with no timeouts, failures, `NOOP` results, or route mismatches.
The result is local and CoAP did not use DTLS, so it is not a general production
performance conclusion.

After all component performance reports have been generated, create a combined
Markdown report without rerunning the measurements:

```bash
npm run performance:report
```

## Directory structure

```text
prisma/             Prisma schema and migration history
schema/             example model schemas and mappings
src/certificates/   device certificate registration
src/coap/           CoAP ingress, endpoint registry, and command client
src/device/         devices, telemetry, attributes, audit, presence, and gateway
src/model-version/  model-version upload and validation
src/mqtt/           MQTT transport, publisher, and command correlation
src/users/          authentication and user management
test/               HTTP, WebSocket, system E2E, and performance runners
```
