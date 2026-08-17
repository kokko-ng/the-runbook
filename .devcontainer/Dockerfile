# Base image pinned by digest for reproducible builds. The tag is kept for
# readability; the digest is what the build resolves. Dependabot (docker
# ecosystem) proposes digest bumps.
FROM mcr.microsoft.com/devcontainers/python:3.14-bookworm@sha256:29f5e05ad69bdec17b27b353b034000a7b9fecf7bd29b759e16954ab059ee46d

# Install uv globally, pinned (npm/node not available yet - added by features layer).
# NOTE: Dependabot cannot see this pin (its docker ecosystem only bumps FROM
# digests) — check for a newer uv manually; see MANAGING.md -> Pin audit.
RUN pip install --no-cache-dir uv==0.12.1

# Fail piped RUN commands if any pipeline stage fails (hadolint DL4006).
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# jq is a HARD dependency of post-create.sh — the settings merge, roster prune,
# and plugin bootstrap all parse JSON with it. fzf + fd-find back the bundled
# shell config.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq fzf fd-find \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create host-path symlink so macOS absolute paths in Claude plugin configs
# (e.g. /Users/<username>/.claude/...) resolve inside the container.
# The actual username is injected at build time by devcontainer.json via
# ${localEnv:USER}; the default covers direct `docker build` AND an empty
# build arg (an unset localEnv:USER arrives as "").
ARG HOST_USER=vscode
RUN HU="${HOST_USER:-vscode}"; mkdir -p /Users && ln -sfn /home/vscode "/Users/$HU"

# Install host CA certificates so curl/npm/pip trust corporate proxies.
# certs/ always exists in git (.gitkeep), so plain `docker build` works even
# before init-host-certs.sh has populated it.
COPY certs/ /usr/local/share/ca-certificates/host/
RUN update-ca-certificates

# Claude Code native binary, baked into the image so every rebuild does not
# re-download it in post-create (it needs no node — the installer drops a
# standalone binary in ~/.local/bin, owned by vscode, hence the USER switch).
# Placed after the CA layer so corporate-proxy certs are already trusted.
# post-create.sh keeps its `command -v claude` fallback for images built
# before this layer existed. The npm-based CLIs (copilot, playwright) CANNOT
# move here: node arrives via a devcontainer feature, which layers after this
# Dockerfile.
#
# DL3066 (non-numeric user-id) is ignored on both USER lines below. `vscode` is
# the account the devcontainer base image creates, and devcontainer.json's
# `remoteUser` names it as a string — hardcoding its uid here would duplicate a
# mapping the base image owns and silently rot when that image changes it.
# hadolint ignore=DL3066
USER vscode
RUN curl -fsSL https://claude.ai/install.sh | bash
# Devcontainer features and any later build steps expect to run as root
# (remoteUser=vscode handles the runtime switch).
# hadolint ignore=DL3002,DL3066
USER root
