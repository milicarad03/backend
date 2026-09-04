import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const outputPath = resolve(projectRoot, 'PERFORMANCE-RESULTS.md');

const reportPaths = {
  transports:
    'projectserver/backend/performance-results/coap-vs-mqtt.json',
  telemetry:
    'devicesimulator/devicesimulator/performance-results/telemetry-size.json',
  dashboard:
    'dynamic-device-dashboard/performance-results/dashboard-performance.json',
  system:
    'projects/bscrad/my-app/performance-results/system-performance.json',
};

const readReport = async (relativePath) => {
  try {
    return JSON.parse(
      await readFile(resolve(projectRoot, relativePath), 'utf8'),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${relativePath}: ${error.message}`);
  }
};

const reports = Object.fromEntries(
  await Promise.all(
    Object.entries(reportPaths).map(async ([name, relativePath]) => [
      name,
      await readReport(relativePath),
    ]),
  ),
);

const format = (value, digits = 3) =>
  value === null || value === undefined
    ? '-'
    : Number(value).toFixed(digits);

const lines = [
  '# Performance Results',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This document combines the latest JSON result produced by each independent performance measurement.',
  '',
];

if (reports.transports) {
  lines.push(
    '## MQTT vs CoAP Command Round Trip',
    '',
    '| Transport | Samples | Min (ms) | Average (ms) | Median (ms) | p95 (ms) | Max (ms) | Success |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const [transport, result] of Object.entries(
    reports.transports.results,
  )) {
    lines.push(
      `| ${transport.toUpperCase()} | ${result.samples} | ${format(result.minimumMs)} | ${format(result.averageMs)} | ${format(result.medianMs)} | ${format(result.p95Ms)} | ${format(result.maximumMs)} | ${format(result.successRatePercentage, 2)}% |`,
    );
  }

  lines.push(
    '',
    `Conclusion: ${reports.transports.comparison.conclusion}`,
    '',
  );
}

if (reports.telemetry) {
  lines.push(
    '## Full vs Delta Telemetry Size',
    '',
    '| Scenario | Format | Samples | Average (B) | Median (B) | p95 (B) | Min (B) | Max (B) | Average savings |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const comparison of reports.telemetry.comparisons) {
    for (const formatName of ['full', 'delta']) {
      const result = comparison[formatName];
      const savings =
        formatName === 'delta'
          ? `${format(comparison.savings.averageBytes, 2)} B (${format(comparison.savings.percentage, 2)}%)`
          : '-';
      lines.push(
        `| ${comparison.name} | ${formatName.toUpperCase()} | ${result.samples} | ${format(result.averageBytes, 2)} | ${format(result.medianBytes, 2)} | ${format(result.p95Bytes, 2)} | ${format(result.minimumBytes, 2)} | ${format(result.maximumBytes, 2)} | ${savings} |`,
      );
    }
  }
  lines.push('');
}

if (reports.dashboard) {
  lines.push(
    '## Dynamic Dashboard Rendering',
    '',
    `Components: ${reports.dashboard.dashboardComponents}; warm-up iterations: ${reports.dashboard.warmupIterations}.`,
    '',
    '| Measurement | Samples | Min (ms) | Average (ms) | Median (ms) | p95 (ms) | Max (ms) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const [label, result] of [
    ['Initial generation', reports.dashboard.initialDashboardGeneration],
    ['Telemetry refresh', reports.dashboard.telemetryRefresh],
  ]) {
    lines.push(
      `| ${label} | ${result.samples} | ${format(result.minimumMs)} | ${format(result.averageMs)} | ${format(result.medianMs)} | ${format(result.p95Ms)} | ${format(result.maximumMs)} |`,
    );
  }
  lines.push('');
}

if (reports.system) {
  const result = reports.system.uiCommandToBackendController;
  lines.push(
    '## System UI Measurement',
    '',
    `Device: ${reports.system.deviceId}; command: ${reports.system.command}.`,
    '',
    `Initial dashboard availability: **${format(reports.system.initialDashboardAvailabilityMs)} ms**.`,
    '',
    '| Measurement | Samples | Min (ms) | Average (ms) | Median (ms) | p95 (ms) | Max (ms) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| UI command to backend controller | ${result.samples} | ${format(result.minimumMs)} | ${format(result.averageMs)} | ${format(result.medianMs)} | ${format(result.p95Ms)} | ${format(result.maximumMs)} |`,
    '',
  );
}

const missingReports = Object.entries(reports)
  .filter(([, report]) => report === null)
  .map(([name]) => reportPaths[name]);

if (missingReports.length > 0) {
  lines.push(
    '## Missing Results',
    '',
    ...missingReports.map((path) => `- \`${path}\``),
    '',
    'Run the corresponding performance measurement, then generate this report again.',
    '',
  );
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log('\nCombined performance report');
console.table(
  Object.fromEntries(
    Object.entries(reports).map(([name, report]) => [
      name,
      {
        status: report ? 'available' : 'missing',
        source: reportPaths[name],
      },
    ]),
  ),
);
console.log(`Markdown report: ${outputPath}`);
