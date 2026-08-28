import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const baseUrl =
  process.env.TRANSPORT_PERFORMANCE_URL ?? 'http://127.0.0.1:3000';
const token = process.env.TRANSPORT_PERFORMANCE_TOKEN;
const samples = Number(process.env.TRANSPORT_PERFORMANCE_SAMPLES ?? 30);
const outputPath = resolve(
  process.env.TRANSPORT_PERFORMANCE_OUTPUT ??
    'performance-results/coap-vs-mqtt.json',
);
const timeoutMs = Number(
  process.env.TRANSPORT_PERFORMANCE_TIMEOUT_MS ?? 15_000,
);

const targets = [
  {
    transport: 'mqtt',
    deviceId: process.env.TRANSPORT_PERFORMANCE_MQTT_DEVICE_ID,
  },
  {
    transport: 'coap',
    deviceId: process.env.TRANSPORT_PERFORMANCE_COAP_DEVICE_ID,
  },
];

if (!token) {
  throw new Error('TRANSPORT_PERFORMANCE_TOKEN is required.');
}
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error('TRANSPORT_PERFORMANCE_SAMPLES must be a positive integer.');
}
for (const target of targets) {
  if (!target.deviceId) {
    throw new Error(
      `TRANSPORT_PERFORMANCE_${target.transport.toUpperCase()}_DEVICE_ID is required.`,
    );
  }
}

const percentile = (values, percentage) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentage / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
};

const summarize = (values) => {
  if (!values.length) {
    return {
      samples: 0,
      minimumMs: null,
      maximumMs: null,
      averageMs: null,
      medianMs: null,
      p95Ms: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    samples: values.length,
    minimumMs: Number(sorted[0].toFixed(3)),
    maximumMs: Number(sorted.at(-1).toFixed(3)),
    averageMs: Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
        3,
      ),
    ),
    medianMs: Number(median.toFixed(3)),
    p95Ms: Number(percentile(values, 95).toFixed(3)),
  };
};

const sendLedCommand = async (target, value) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${baseUrl}/device/${encodeURIComponent(target.deviceId)}/command`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: 'SET_LED',
          payload: { value },
        }),
        signal: controller.signal,
      },
    );
    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}:${JSON.stringify(body)}`,
      );
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const measurements = new Map(
  targets.map((target) => [
    target.transport,
    {
      deviceId: target.deviceId,
      values: [],
      attempts: 0,
      timeouts: 0,
      failures: 0,
      noops: 0,
      transportMismatches: 0,
      nextValue: true,
    },
  ]),
);

// Warm both paths and leave each device in a known, opposite state.
for (const target of targets) {
  for (const value of [true, false]) {
    try {
      await sendLedCommand(target, value);
    } catch {
      // Warm-up calls are intentionally excluded from the report.
    }
  }
  measurements.get(target.transport).nextValue = true;
}

for (let sample = 0; sample < samples; sample += 1) {
  for (const target of targets) {
    const measurement = measurements.get(target.transport);
    const value = measurement.nextValue;
    measurement.nextValue = !value;
    measurement.attempts += 1;

    try {
      const body = await sendLedCommand(target, value);

      if (body.status === 'NOOP') {
        measurement.noops += 1;
        continue;
      }

      if (body.transportPerformance?.transport !== target.transport) {
        measurement.transportMismatches += 1;
        continue;
      }

      const roundTripMs = Number(body.transportPerformance?.roundTripMs);
      if (!Number.isFinite(roundTripMs)) {
        measurement.failures += 1;
        continue;
      }

      measurement.values.push(roundTripMs);
    } catch (error) {
      if (
        error?.name === 'AbortError' ||
        String(error?.message ?? error).includes('TIMEOUT')
      ) {
        measurement.timeouts += 1;
      } else {
        measurement.failures += 1;
      }
    }
  }
}

const results = {};
for (const target of targets) {
  const measurement = measurements.get(target.transport);
  const successfulResponses = measurement.values.length;
  results[target.transport] = {
    deviceId: measurement.deviceId,
    ...summarize(measurement.values),
    attempts: measurement.attempts,
    successfulResponses,
    timeouts: measurement.timeouts,
    failures: measurement.failures,
    noops: measurement.noops,
    transportMismatches: measurement.transportMismatches,
    successRatePercentage: Number(
      ((successfulResponses / measurement.attempts) * 100).toFixed(2),
    ),
  };
}

const mqttAverage = results.mqtt.averageMs;
const coapAverage = results.coap.averageMs;
let comparison = {
  available: false,
  conclusion: 'There are not enough successful responses for comparison.',
};

if (mqttAverage !== null && coapAverage !== null) {
  const differenceMs = coapAverage - mqttAverage;
  const differencePercentage =
    mqttAverage === 0 ? 0 : (differenceMs / mqttAverage) * 100;
  const fasterTransport =
    Math.abs(differenceMs) < 0.001
      ? 'equal'
      : differenceMs < 0
        ? 'coap'
        : 'mqtt';

  comparison = {
    available: true,
    coapMinusMqttAverageMs: Number(differenceMs.toFixed(3)),
    coapVsMqttAveragePercentage: Number(
      differencePercentage.toFixed(2),
    ),
    fasterTransport,
    conclusion:
      fasterTransport === 'equal'
        ? 'The measured average round trips are effectively equal.'
        : `${fasterTransport.toUpperCase()} had the lower local average round trip. This non-DTLS experiment is not a production-network conclusion.`,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  measurement:
    'backend transport send to matching device acknowledgement',
  command: 'SET_LED',
  plannedSamplesPerTransport: samples,
  warmupCommandsPerTransport: 2,
  security: 'Local CoAP experiment without DTLS; MQTT remains the default.',
  results,
  comparison,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
console.log(`Saved transport comparison: ${outputPath}`);
