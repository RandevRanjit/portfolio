---
title: DAWgit — Git for DAW Projects
tagline: A real macOS daemon — semantic-delta version control for Ableton sessions, with content-addressed audio LFS and Unix-socket IPC.
order: 8
buckets: [systems]
spokes:
  - { id: drone, role: flagship, blurb: "Git-backed version control for Ableton sessions: semantic diff that skips viewport noise, per-file branching without touching HEAD, SHA-256 content-addressed audio LFS." }
stack: [Rust, tokio, libgit2, roxmltree]
metrics:
  - { label: "Ableton parser", value: "gzip-XML zero-copy parse (roxmltree)", source: "audit §dawgit (parsers/ableton.rs:1306 LOC)" }
  - { label: "Audio LFS", value: "SHA-256 content-addressed store", source: "audit §dawgit (lfs.rs:78-93)" }
  - { label: "IPC", value: "Unix domain socket, newline-delimited JSON", source: "audit §dawgit (ipc.rs:94 LOC)" }
role: Sole author. Built the daemon (FS watcher, IPC, async/sync boundary), the Ableton gzip-XML parser (1,306 LOC, zero-copy), the git object layer (branch-per-file commits without touching HEAD, three-way revert via merge_trees), and the SHA-256 content-addressed audio LFS.
status: working
repo: { kind: private }
dates: "2026"
---

Version control for DAW projects — specifically Ableton Live — as a first-class engineering problem.
An `.als` file is gzip-compressed XML; the semantic content (tracks, clips, arrangement) is buried
inside viewport scroll state, UUID attributes, and per-clip noise that changes on every save.
The core engineering decision: **gate commits on semantic delta**, not raw file change.

**Daemon architecture** (`dawgit-daemon`): on `.als` save → `notify` FS event → filter `.als` →
`parsers::ableton::parse()` → `differ::diff()` → `git::commit_file_to_branch()` → broadcast IPC event.
The `spawn_blocking` boundary isolates the synchronous git/parse work from the async tokio event loop.

**Ableton parser** (`parsers/ableton.rs`, 1,306 LOC): `.als` = `GzDecoder` → `roxmltree::Document::parse`
(zero-copy; source bytes kept alive for AST lifetime) → DOM walk → `ProjectAst`.
Skips `ScrollerTimeableView`, `DetailClipKeyMidis`, `OverwriteProtectionNumber`, and Uuid clip
attributes — the viewport noise that makes naive diffs useless.

**Git layer** (`git/mod.rs`, 386 LOC): `git2` (libgit2) directly — no shelling out.
`commit_file_to_branch` reads branch-tip tree, replaces one blob, writes a new tree, commits to the
branch ref **without touching HEAD or the working directory**. Per-file branching without the normal
git checkout overhead. `revert_commit` via three-way `merge_trees`.

**Content-addressed audio LFS**: `wav/aif/mp3/flac/ogg` files stored at
`~/.dawgit/lfs_cache/{sha256_hex}`; pointer files in the git tree. Idempotent — existing hash skipped.

**IPC** (`ipc.rs`, 94 LOC): Unix domain socket `~/.dawgit/daemon.sock`; newline-delimited JSON frames;
`tokio::select!` multiplexing inbound commands + outbound broadcasts.

_Pre-release — no public repo yet. Local working tree, no remote configured._
