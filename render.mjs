#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const PROFILE_KEYS = new Set([
  "schemaVersion", "namespace", "name", "image", "replicas", "serviceAccountName",
  "existingConfigMap", "existingSecret",
]);
const DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
const RUNNER_IMAGE = /^ghcr\.io\/dx-corp\/platform\/runner-host@sha256:[0-9a-f]{64}$/;
export const RUNNER_HOST_CONTRACT = JSON.parse(await readFile(new URL("./runner-host-contract.json", import.meta.url), "utf8"));

function requireName(value, key) {
  if (typeof value !== "string" || !DNS_LABEL.test(value)) {
    throw new Error(`${key} must be a Kubernetes DNS label`);
  }
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("profile must be an object");
  for (const key of Object.keys(profile)) if (!PROFILE_KEYS.has(key)) throw new Error(`unexpected profile key: ${key}`);
  if (profile.schemaVersion !== "deixic.private-runner.v1") throw new Error("unsupported schemaVersion");
  for (const key of ["namespace", "name", "serviceAccountName", "existingConfigMap", "existingSecret"]) {
    requireName(profile[key], key);
  }
  if (!RUNNER_IMAGE.test(profile.image)) throw new Error("image must pin the dx-corp runner-host repository by sha256 digest");
  if (!Number.isSafeInteger(profile.replicas) || profile.replicas < 1 || profile.replicas > 20) {
    throw new Error("replicas must be an integer from 1 through 20");
  }
  return profile;
}

export function renderProfile(input) {
  const profile = validateProfile(input);
  const labels = { "app.kubernetes.io/name": profile.name, "app.kubernetes.io/part-of": "deixic-private-runner" };
  return {
    apiVersion: "v1",
    kind: "List",
    items: [
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: profile.name, namespace: profile.namespace, labels },
        spec: {
          replicas: profile.replicas,
          selector: { matchLabels: { "app.kubernetes.io/name": profile.name } },
          template: {
            metadata: { labels },
            spec: {
              serviceAccountName: profile.serviceAccountName,
              automountServiceAccountToken: false,
              containers: [{
                name: "runner-host",
                image: profile.image,
                imagePullPolicy: "IfNotPresent",
                ports: [
                  { name: "api", containerPort: RUNNER_HOST_CONTRACT.api.port },
                  { name: "health", containerPort: RUNNER_HOST_CONTRACT.health.port },
                ],
                envFrom: [
                  { configMapRef: { name: profile.existingConfigMap } },
                  { secretRef: { name: profile.existingSecret } },
                ],
                env: [
                  { name: RUNNER_HOST_CONTRACT.api.environment, value: `0.0.0.0:${RUNNER_HOST_CONTRACT.api.port}` },
                  { name: RUNNER_HOST_CONTRACT.health.environment, value: `0.0.0.0:${RUNNER_HOST_CONTRACT.health.port}` },
                ],
                livenessProbe: { httpGet: { path: RUNNER_HOST_CONTRACT.health.livenessPath, port: "health" } },
                readinessProbe: { httpGet: { path: RUNNER_HOST_CONTRACT.health.readinessPath, port: "health" } },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                  readOnlyRootFilesystem: RUNNER_HOST_CONTRACT.readOnlyRootFilesystem,
                  runAsGroup: RUNNER_HOST_CONTRACT.runAsGroup,
                  runAsNonRoot: true,
                  runAsUser: RUNNER_HOST_CONTRACT.runAsUser,
                  seccompProfile: { type: "RuntimeDefault" },
                },
                resources: {
                  requests: { cpu: "250m", memory: "512Mi" },
                  limits: { cpu: "1000m", memory: "1Gi" },
                },
              }],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: profile.name, namespace: profile.namespace, labels },
        spec: {
          type: "ClusterIP",
          selector: { "app.kubernetes.io/name": profile.name },
          ports: [{ name: "api", port: RUNNER_HOST_CONTRACT.api.port, targetPort: "api" }],
        },
      },
    ],
  };
}

async function main() {
  const { values } = parseArgs({ options: { profile: { type: "string" }, output: { type: "string" } } });
  if (!values.profile) throw new Error("usage: node render.mjs --profile <profile.json> [--output <manifest.json>]");
  const profile = JSON.parse(await readFile(values.profile, "utf8"));
  const rendered = JSON.stringify(renderProfile(profile), null, 2) + "\n";
  if (values.output) await writeFile(values.output, rendered, { flag: "wx" });
  else process.stdout.write(rendered);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
