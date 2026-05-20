# si-sig-viz — NL-enabled variant (v0.3.x viewer).
#
# Same as Dockerfile.viz but:
#   1. Bakes the embed cache into /data/embeddings-seed.json so first
#      boot doesn't burn 37s rebuilding it on every redeploy.
#   2. CMD passes --nl-search bedrock (no --aws-profile; the Fargate
#      task role provides credentials transparently via instance metadata).
#   3. POLYGRAPH_VIZ_EMBED_CACHE env var points the server at the seeded
#      cache so it loads from disk on boot instead of rebuilding.
#   4. POLYGRAPH_VIZ_KB env var points the KB at a writable /data location.
#
# Auth: the ECS task definition attaches the si-build-sig-task-role IAM
# role; the AWS SDK reads ECS container metadata to assume that role at
# runtime. No credentials need to be baked into the image.

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
# Merge polygraph prod deps INTO /app/node_modules without clobbering
# packages already there. Why a per-entry loop instead of cp -rn: on
# busybox / alpine `cp -rn` doesn't recurse into existing destination
# directories cleanly, which caused msgpackr/classic-level/etc to be
# silently skipped at runtime (ERR_MODULE_NOT_FOUND on container boot).
RUN set -eux; \
    for entry in /app/node_modules-pg-extra/*; do \
      name=$(basename "$entry"); \
      if [ ! -e "/app/node_modules/$name" ]; then \
        cp -r "$entry" /app/node_modules/; \
      fi; \
    done; \
    rm -rf /app/node_modules-pg-extra

COPY solution-intelligence/sig-build/viz/package.json /app/package.json

# Seed: pre-built LevelDB data baked at /data, plus the precomputed
# embedding cache so first boot skips the 37-second rebuild.
# Why: the build context (~/repos/si-build/src) holds leveldb-seed/
# which was extracted from the local docker volume during the morning
# sub-agent build. We bake it in the same way to preserve a stable
# /data layout across image versions.
RUN mkdir -p /data
COPY leveldb-seed/ /data/
COPY polygraph-viz/embeddings-seed.json /data/embeddings-seed.json

EXPOSE 4444

ENV POLYGRAPH_VIZ_EMBED_CACHE=/data/embeddings-seed.json
ENV POLYGRAPH_VIZ_KB=/data/kb.json
ENV AWS_REGION=us-east-1

CMD ["node", "/app/node_modules/polygraph-viz/dist/cli.js", \
     "--path", "/data", \
     "--port", "4444", \
     "--title", "Solution Intel", \
     "--nl-search", "bedrock"]
