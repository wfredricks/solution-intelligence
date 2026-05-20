# iLabs Deploy — Chunks B + C Sub-Agent Brief

*Build the SI build SIG viewer image and register it as an ECS service. Do NOT touch the ALB or Route 53 — that is Chunk D and is reserved for the orchestrator + user.*

**Spawned:** 2026-05-20 11:54 EDT, after the user (Bill) approved Chunks B + C as a sub-agent.

## What you are doing

You are the implementation half of the deployment of Solution Intelligence to iLabs. You will:

- **Chunk B:** Build a Docker image for the SI build SIG viewer (PolyGraph + polygraph-viz + the LevelDB data + `--title "Solution Intel"`) on the iLabs Graviton ARM64 build server, push to ECR.
- **Chunk C:** Register an ECS task definition and create an ECS service for that image in `udt-m2-cluster`. The service will NOT yet be routable from the internet — that is Chunk D.

When you are done, **report back exactly** the image URI you pushed, the task definition revision, and the ECS service name. The orchestrator will then do Chunk D in-session.

## READ FIRST — In this order

1. `~/.openclaw/workspace/knowledge/DEPLOY-PLAYBOOK.md` — IN FULL. This is the canonical procedure. Do not improvise.
2. `~/.openclaw/workspace/artifacts/solution-intelligence/sig-build/Dockerfile.viz` — the local Dockerfile we have been using; you will adapt it for iLabs.
3. `~/.openclaw/workspace/artifacts/solution-intelligence/sig-build/docker-compose.yml` — to understand which paths / volumes the local container uses.

## Already done — DO NOT repeat

- ACM cert for `si.credence-ilabs.ai`: `arn:aws:acm:us-east-1:153717966029:certificate/4ad3413c-1d9a-446c-990f-d771c5ad985a` — ISSUED.
- ECR repo `udt-m2/si-build-sig` exists in `us-east-1`.
- Route 53 zone `credence-ilabs.ai` (`Z01424554UH5OPTY3ILZ`) exists.

## Infrastructure facts

- AWS profile: `credence-ilabs`
- Account: `153717966029`
- Region: `us-east-1`
- ECR registry: `153717966029.dkr.ecr.us-east-1.amazonaws.com`
- ECS cluster: `udt-m2-cluster`
- Graviton build server: `ec2-user@54.242.228.85` (ARM64 t4g.medium)
- LevelDB data lives in Docker volume `si-sig-data` on the user's Mac mini (NOT on the Graviton server)

## Chunk B — Build & push the image

### Strategy

The local `si-sig-viz` container uses a Docker named volume `si-sig-data` to hold the LevelDB graph. For iLabs we want **a self-contained image** with the LevelDB data baked in: one container, no volume mount, no separate ingest step. This way, deploys are reproducible from the image alone.

Strategy: extract the LevelDB data from the local Docker volume into a tarball, push to the Graviton build server, build an image that COPYs the data into `/data/`, push to ECR.

### Step-by-step

1. **Extract the LevelDB data on the Mac mini** (you have host shell access here):
   ```bash
   mkdir -p /tmp/si-sig-data-export
   docker run --rm \
     -v si-sig-data:/source:ro \
     -v /tmp/si-sig-data-export:/dest \
     alpine:3.20 \
     sh -c 'cp -a /source/. /dest/'
   ls -la /tmp/si-sig-data-export
   ```
   The output should include a `CURRENT` file, `MANIFEST-*`, `LOG`, and one or more `*.ldb` files. Total size should be ~250 KB.

2. **Verify the build server is reachable**:
   ```bash
   ssh -o StrictHostKeyChecking=accept-new ec2-user@54.242.228.85 'echo ok && uname -m && docker --version'
   ```
   You must see `aarch64` (ARM64) confirming Graviton.

3. **Copy the polygraph-viz source + polygraph source + sig-build/ + the LevelDB data to the build server**. Use a clean directory `~/repos/si-build/` on the server so we do not interfere with the UDT M2 build tree.
   ```bash
   ssh ec2-user@54.242.228.85 'mkdir -p ~/repos/si-build/src'
   rsync -avz --exclude=node_modules --exclude=dist \
     ~/.openclaw/workspace/artifacts/polygraph \
     ~/.openclaw/workspace/artifacts/polygraph-viz \
     ec2-user@54.242.228.85:~/repos/si-build/src/
   rsync -avz \
     ~/.openclaw/workspace/artifacts/solution-intelligence/sig-build \
     ec2-user@54.242.228.85:~/repos/si-build/src/solution-intelligence/
   rsync -avz /tmp/si-sig-data-export/ \
     ec2-user@54.242.228.85:~/repos/si-build/leveldb-seed/
   ```

   IMPORTANT: the existing Dockerfile.viz `COPY` paths are relative to the build context `solution-intelligence/sig-build/Dockerfile.viz` was built with context `../..` (the `artifacts/` directory). Replicate that layout on the build server. On the server, run `ls ~/repos/si-build/src` and confirm you see `polygraph`, `polygraph-viz`, and `solution-intelligence/sig-build/`.

4. **Build polygraph-viz's dist + public bundles on the server** (the Dockerfile.viz expects `polygraph-viz/dist` and `polygraph-viz/public/client.js` already built):
   ```bash
   ssh ec2-user@54.242.228.85 'cd ~/repos/si-build/src/polygraph-viz && npm install && npm run build'
   ssh ec2-user@54.242.228.85 'cd ~/repos/si-build/src/polygraph && npm install && npm run build || true'
   ```
   If polygraph does not have a `build` script, that is fine — its `dist/` may already be committed.

5. **Also reproduce the `prod-deps/` directory** that the Dockerfile.viz expects. Look at how the local Mac mini has it; replicate the same pattern. Typically:
   ```bash
   ssh ec2-user@54.242.228.85 'cd ~/repos/si-build/src/polygraph-viz && mkdir -p prod-deps && cp package.json prod-deps/ && cd prod-deps && npm install --omit=dev --ignore-scripts --no-package-lock'
   ssh ec2-user@54.242.228.85 'cd ~/repos/si-build/src/polygraph && mkdir -p prod-deps && cp package.json prod-deps/ && cd prod-deps && npm install --omit=dev --ignore-scripts --no-package-lock'
   ```

6. **Write a small iLabs-specific Dockerfile** that copies the LevelDB seed data into `/data/` so the image is self-contained:
   ```bash
   ssh ec2-user@54.242.228.85 'cat > ~/repos/si-build/src/solution-intelligence/sig-build/Dockerfile.viz.ilabs' <<'EOF'
   # Same as Dockerfile.viz but with the LevelDB seed data baked in.
   # Result: a self-contained image; no volume mount needed.
   FROM node:20-alpine

   WORKDIR /app

   COPY polygraph-viz/prod-deps/node_modules /app/node_modules
   RUN rm -rf /app/node_modules/polygraph-viz && mkdir -p /app/node_modules/polygraph-viz
   COPY polygraph-viz/dist /app/node_modules/polygraph-viz/dist
   COPY polygraph-viz/public /app/node_modules/polygraph-viz/public
   COPY polygraph-viz/package.json /app/node_modules/polygraph-viz/package.json

   RUN rm -rf /app/node_modules/polygraph-db && mkdir -p /app/node_modules/polygraph-db
   COPY polygraph/dist /app/node_modules/polygraph-db/dist
   COPY polygraph/package.json /app/node_modules/polygraph-db/package.json

   COPY polygraph/prod-deps/node_modules /app/node_modules-pg-extra
   RUN cp -rn /app/node_modules-pg-extra/. /app/node_modules/ && rm -rf /app/node_modules-pg-extra

   COPY solution-intelligence/sig-build/viz/package.json /app/package.json

   # Seed the graph data INTO the image.
   COPY --from=sig-data / /data/

   EXPOSE 4444

   CMD ["node", "/app/node_modules/polygraph-viz/dist/cli.js", "--path", "/data", "--port", "4444", "--title", "Solution Intel"]
   EOF
   ```

   That `COPY --from=sig-data` trick requires a multi-stage build with the seed as the first stage. Adjust to:
   ```
   # Stage 1: just hold the seed data
   FROM alpine:3.20 AS sig-data
   COPY leveldb-seed/ /
   ```
   Place this BEFORE the `FROM node:20-alpine` line. The build context must include `leveldb-seed/` at the top level.

   Adjust the build context accordingly when invoking `docker build`.

7. **Build the image on the Graviton server**:
   ```bash
   ssh ec2-user@54.242.228.85 'cd ~/repos/si-build/src && docker build -t si-build-sig:latest -f solution-intelligence/sig-build/Dockerfile.viz.ilabs --build-context leveldb-seed=../../leveldb-seed .'
   ```
   If `--build-context` doesn't work cleanly with your layout, restructure: copy `~/repos/si-build/leveldb-seed/` into `~/repos/si-build/src/leveldb-seed/` and reference it directly in the Dockerfile without `--build-context`.

8. **Verify the image is ARM64**:
   ```bash
   ssh ec2-user@54.242.228.85 'docker inspect si-build-sig:latest --format "{{.Architecture}}"'
   ```
   Must report `arm64`.

9. **Smoke-test the image** on the build server:
   ```bash
   ssh ec2-user@54.242.228.85 'docker run --rm -d --name si-test -p 30200:4444 si-build-sig:latest && sleep 5 && curl -s http://localhost:30200/api/stats && docker stop si-test'
   ```
   Expected output: a JSON object with `"nodeCount": 160` and `"edgeCount": 433`. If the counts are wrong, the seed data didn't bake correctly. Surface the actual counts in your report.

10. **Login to ECR, tag, push**:
    ```bash
    ssh ec2-user@54.242.228.85 '
      aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 153717966029.dkr.ecr.us-east-1.amazonaws.com
      TAG=v$(date +%Y%m%d-%H%M%S)-arm64
      docker tag si-build-sig:latest 153717966029.dkr.ecr.us-east-1.amazonaws.com/udt-m2/si-build-sig:$TAG
      docker push 153717966029.dkr.ecr.us-east-1.amazonaws.com/udt-m2/si-build-sig:$TAG
      echo "PUSHED_TAG=$TAG"
    '
    ```
    Capture the `PUSHED_TAG` value — you need it for Chunk C.

## Chunk C — Register ECS task definition + service

Use the user's Mac mini (where `aws --profile credence-ilabs` is configured), not the Graviton server, for these AWS API calls.

### Step-by-step

1. **Look at an existing task definition** for shape:
   ```bash
   aws --profile credence-ilabs ecs describe-task-definition --task-definition udt-m2-bangauth --query 'taskDefinition' > /tmp/sample-taskdef.json
   ```
   Use that as a template; do not copy task-role / execution-role ARNs verbatim from `udt-m2-ui` unless it's known to be the same role.

2. **Write the SI viewer task definition**. Target:
   - Family: `udt-m2-si-build-sig`
   - Container name: `si-build-sig`
   - Image: `153717966029.dkr.ecr.us-east-1.amazonaws.com/udt-m2/si-build-sig:<TAG>` (from Chunk B step 10)
   - Port: 4444
   - CPU/memory: copy from `udt-m2-bangauth` (it is a small Node service)
   - Network mode: awsvpc (Fargate ARM64)
   - Runtime platform: `cpuArchitecture: ARM64, operatingSystemFamily: LINUX`
   - Execution role: same as `udt-m2-bangauth` task def
   - Task role: same as `udt-m2-bangauth` task def OR omit (the container doesn't need AWS API access; it serves a graph)
   - Log driver: `awslogs` with group `/ecs/udt-m2-si-build-sig`, region `us-east-1`, prefix `si-build-sig`
   - No env vars needed (the container is self-contained)

3. **Create the CloudWatch log group** first:
   ```bash
   aws --profile credence-ilabs logs create-log-group \
     --log-group-name /ecs/udt-m2-si-build-sig \
     --region us-east-1 2>&1 || true
   ```
   The `|| true` handles the "already exists" case.

4. **Register the task definition**:
   ```bash
   aws --profile credence-ilabs ecs register-task-definition \
     --cli-input-json file:///tmp/si-build-sig-taskdef.json \
     --region us-east-1
   ```

5. **Get the subnets + security group from an existing service** (so the new service joins the same network):
   ```bash
   aws --profile credence-ilabs ecs describe-services --cluster udt-m2-cluster --services bangauth --query 'services[0].networkConfiguration.awsvpcConfiguration' --region us-east-1
   ```

6. **Create the ECS service** named `si-build-sig`:
   ```bash
   aws --profile credence-ilabs ecs create-service \
     --cluster udt-m2-cluster \
     --service-name si-build-sig \
     --task-definition udt-m2-si-build-sig:1 \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=DISABLED}" \
     --region us-east-1
   ```
   Use the subnets + security groups from step 5.

   **CRITICAL: do NOT attach a load balancer here.** That is Chunk D and the orchestrator will do it.

7. **Wait for the task to start and become healthy** (at most 3 minutes):
   ```bash
   aws --profile credence-ilabs ecs describe-services --cluster udt-m2-cluster --services si-build-sig --query 'services[0].{Desired:desiredCount,Running:runningCount,Pending:pendingCount,Events:events[:3]}'
   ```
   Re-run until `Running: 1`.

8. **Verify the task is healthy via internal log inspection**:
   ```bash
   aws --profile credence-ilabs logs tail /ecs/udt-m2-si-build-sig --region us-east-1 --since 5m | head -20
   ```
   Expected: a "PolyGraph Visualizer" startup line plus a "Graph: 160 nodes, 433 edges" line.

## Failure modes to surface immediately

- **SSH to Graviton fails** — surface and stop. Bill may have credentials to share.
- **Docker build fails on Graviton** — surface the full error; do NOT fall back to building on Mac mini.
- **`docker push` to ECR fails (401, 403)** — surface; check ECR auth.
- **`aws ecs register-task-definition` rejects the JSON** — surface the validation error; show the failed JSON.
- **The ECS task starts then crash-loops** — surface the CloudWatch logs immediately; do NOT keep restarting.
- **Image is `amd64` not `arm64`** — surface. Fargate runtime platform mismatch will cause "task stopped reason: CannotPullContainerError" on launch.

## What to report

Final reply must include, in this exact format:

```
CHUNK B DONE:
  IMAGE_TAG: v20260520-115400-arm64
  IMAGE_URI: 153717966029.dkr.ecr.us-east-1.amazonaws.com/udt-m2/si-build-sig:<TAG>
  SMOKE_TEST: nodes=160 edges=433  (or actual counts)

CHUNK C DONE:
  TASK_DEF: udt-m2-si-build-sig:<rev>
  SERVICE_ARN: arn:aws:ecs:us-east-1:153717966029:service/udt-m2-cluster/si-build-sig
  RUNNING_TASKS: 1
  PRIVATE_IP: <ip from `aws ecs describe-tasks`>

READY FOR CHUNK D: yes
```

If anything fails or is in an ambiguous state, report it instead with:
```
BLOCKED:
  At step: <step number from above>
  Error: <full error message>
  What you tried: <what you did>
  What you would do next if unblocked: <plan>
```

## Time budget

Soft: 30 min. Hard: 60 min. If you are past 60 minutes, stop and surface what's done.

🖇️ Go.
