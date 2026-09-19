import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderProfile, RUNNER_HOST_CONTRACT } from "../render.mjs";

const example = JSON.parse(await readFile(new URL("../examples/profile.json", import.meta.url), "utf8"));

test("renders a deterministic digest-pinned deployment and service", () => {
  const first = renderProfile(example);
  const second = renderProfile(structuredClone(example));
  assert.deepEqual(first, second);
  assert.equal(first.items[0].spec.template.spec.containers[0].image, example.image);
  assert.deepEqual(first.items[0].spec.template.spec.containers[0].ports, [
    { name: "api", containerPort: 8080 }, { name: "health", containerPort: 8081 },
  ]);
  assert.deepEqual(first.items[0].spec.template.spec.containers[0].env, [
    { name: "RUNNER_HOST_ADDR", value: "0.0.0.0:8080" },
    { name: "RUNNER_HOST_HEALTH_ADDR", value: "0.0.0.0:8081" },
  ]);
  assert.equal(first.items[0].spec.template.spec.containers[0].readinessProbe.httpGet.port, "health");
  assert.equal(first.items[0].spec.template.spec.containers[0].securityContext.runAsUser, RUNNER_HOST_CONTRACT.runAsUser);
  assert.equal(first.items[0].spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem, true);
  assert.deepEqual(first.items[0].spec.template.spec.containers[0].envFrom, [
    { configMapRef: { name: "runner-host-config" } },
    { secretRef: { name: "runner-host-secrets" } },
  ]);
  assert.equal(first.items.some(item => item.kind === "Secret" || item.kind === "ConfigMap"), false);
});

test("rejects tags, foreign repositories, and unexpected profile fields", () => {
  for (const image of [
    "ghcr.io/dx-corp/platform/runner-host:latest",
    "ghcr.io/acme/runner-host@sha256:" + "1".repeat(64),
  ]) assert.throws(() => renderProfile({ ...example, image }), /digest|repository/);
  assert.throws(() => renderProfile({ ...example, tenantId: "customer" }), /unexpected profile key/);
});
