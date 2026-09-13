# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ../ATTRIBUTION.md.
ARG NODE_IMAGE=node@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
FROM ${NODE_IMAGE}
COPY --chown=0:0 . /opt/phone/
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/phone/deployment/guest.mjs"]
