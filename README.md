# Deixic Private Runner

This repository prepares a digest-pinned Kubernetes deployment for the Deixic
Runner Host image published from `dx-corp/mono`. It does not contain the
Runner Host service source, credentials, or customer configuration.

Choose a published Runner Host digest, verify its keyless signature, then copy
the example profile and replace the illustrative digest and resource names:

```sh
./verify-image.sh ghcr.io/dx-corp/platform/runner-host@sha256:<digest>
cp examples/profile.json runner.json
node render.mjs --profile runner.json --output runner-manifest.json
kubectl apply --dry-run=server -f runner-manifest.json
kubectl apply -f runner-manifest.json
```

The renderer accepts only the Mono-owned Runner Host image repository and an
immutable SHA-256 digest. It references an existing ConfigMap and Secret and
does not place their values in generated output. The service account must also
exist before applying the manifest.

`verify-image.sh` recognizes signatures issued to Mono's `publish.yml`
workflow on `main`. The example digest is deliberately illustrative and will
not resolve. An actual release digest, required environment values, network
policy, database, and workload identity are supplied through the supported
customer delivery process.

Local projection validation renders the example, runs its tests, and never
contacts a cluster:

```sh
node scripts/distribution-validation.mjs --name private-runner --target .
```

A successful local validation proves the package shape and deterministic
render only. Image publication, signature availability, configuration
correctness, and a live rollout remain separate checks.
