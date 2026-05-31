---
title: DAWgit — Git for Ableton Projects
tagline: A macOS daemon that gives Ableton Live real version control — diffing the music, not the bytes. Semantic .als diff, per-file branching that never touches HEAD, SHA-256 audio LFS, over a Unix-socket IPC bus.
order: 8
section: music
buckets: [systems]
stack: [Rust, tokio, libgit2 (git2-rs), roxmltree, flate2, SHA-256, Unix sockets, launchd, SwiftUI]
metrics:
  - { label: ".als → typed AST", value: "1,306 LOC parser", source: "dawgit: dawgit-daemon/src/parsers/ableton.rs" }
  - { label: "Semantic diff", value: "21 delta variants", source: "dawgit: dawgit-daemon/src/differ.rs + models.rs:139" }
  - { label: "Per-file branch commit", value: "HEAD/index untouched", source: "dawgit: dawgit-daemon/src/git/mod.rs:211" }
  - { label: "Audio LFS", value: "SHA-256 content-addressed", source: "dawgit: dawgit-daemon/src/git/lfs.rs:78" }
  - { label: "Tests", value: "52 tests", source: "cargo test -p dawgit-daemon" }
role: Sole author. Built the three-binary system end to end — Rust daemon (FS watcher, async/sync IPC boundary, git object layer, LFS, project discovery, launchd integration), the 1,306-LOC Ableton gzip-XML parser, the semantic differ, the clap CLI, and the SwiftUI menubar app that talks to the daemon over the socket.
status: working
repo: { kind: private }
dates: "2026"
---

Ableton Live has no real version control. Producers ship `Final_v3_REAL_final.als` because the `.als` is an opaque gzip blob — `git diff` shows "binary files differ" and a one-line lyric tweak collides with a parallel mixdown into an unmergeable mess.
DAWgit treats this as a systems problem: **diff the music, not the bytes.**
It is a background daemon that watches your Ableton folders, and on every save decides — from the *musical* content of the project — whether anything worth committing actually changed.

### The hard part: a save is mostly noise

An `.als` is gzip-compressed XML, and Ableton rewrites large chunks of it on every save that have nothing to do with the music: scroll positions, the currently-selected note view, an `OverwriteProtectionNumber` counter, and fresh `Uuid`s sprinkled across clips.
A byte-diff fires on all of it. The whole project hinges on telling signal from noise.

So the parser (`parsers/ableton.rs`, 1,306 LOC) decompresses with `flate2::GzDecoder` into a single XML string, hands it to `roxmltree` — which builds its DOM by *borrowing* slices of that string instead of allocating a `String` per node — and walks it into a typed `ProjectAst`: tracks (audio / MIDI / return / group), clips, devices, automation lanes, routing and sends, tempo, time signature, master chain.
Three known-noisy tags (`ScrollerTimeableView`, `DetailClipKeyMidis`, `OverwriteProtectionNumber`) are skipped during the walk, and `Uuid` attributes are excluded from every content hash.
The payoff is provable: a test mutates the protection counter and a clip `Uuid`, re-parses, and asserts the AST is byte-identical — viewport churn is invisible by construction, not by heuristic.

Per clip, the parser computes a SHA-256 over only the musically-relevant subtree — MIDI note events, the sample file reference, warp markers — so "I nudged the view" and "I rewrote the bassline" are *different* facts the rest of the system can act on.

### Diffing two snapshots of a song

The differ (`differ.rs`, 310 LOC) compares two `ProjectAst`s into a list of `SemanticDelta` — a 21-variant enum (`models.rs:139`) covering `TrackAdded`, `ClipMoved`, `DeviceParamChanged`, `TempoChanged`, and the rest.
Tracks, clips and devices are matched by their stable Ableton IDs via `HashMap`, so the diff distinguishes add / remove / modify instead of reporting a positional shuffle as wholesale change; floats compare with a `1e-6` epsilon to absorb serialisation jitter.
Each delta knows how to render itself (`~ Tempo: 128 → 135 BPM`, `+ Track added: "New Synth"`) — that string is both the CLI diff output and the auto-generated commit message.

This is what makes the headline feature honest: the daemon caches the last committed AST as JSON, diffs the new save against it, and **if the delta list is empty it does not commit.** Hit Cmd-S forty times while scrolling around and the history stays clean; change one device parameter and you get exactly one commit that says so.

### A git object layer that doesn't fight the DAW

Built directly on `libgit2` via `git2-rs` — no shelling out to `git`.
The interesting operation is `commit_file_to_branch` (`git/mod.rs:211`): it reads the branch tip's tree, swaps a single blob via a `treebuilder`, writes the new tree, and commits straight to `refs/heads/<branch>` — **without touching HEAD, the index, or the working directory.**
That is the mechanism behind per-`.als` branching: every project file carries its own branch (tracked in `scopes.json`), so you can fork the lead-synth arrangement while the drum file sits untouched on `main`, and the daemon never does a working-tree checkout behind the producer's back. (The whole-project `checkout_branch` *does* move HEAD — and is gated on a clean tree, because git2 refuses otherwise.)
Reverts use a three-way `merge_trees` (ancestor = target commit, ours = its parent, theirs = branch tip) and bail loudly on conflict rather than guessing. Paths are canonicalised first so macOS's `/var → /private/var` symlink doesn't break the in-repo path resolution.

### Audio is content-addressed, not committed

Stems are big and binary, so audio (`wav/aif/aiff/mp3/flac/ogg`) goes through an LFS layer (`git/lfs.rs`).
Each file is SHA-256 hashed, stored once at `~/.dawgit/lfs_cache/<hex>` (re-storing the same hash is a no-op — dedup by existence check), and the git tree holds a git-lfs-v1 spec pointer instead of the bytes. `dawgit init` writes the matching `.gitattributes`.

### Wiring: one daemon, many thin clients

The architectural rule is strict — **the daemon owns all VCS logic; the CLI and the macOS app are thin IPC clients.**
A `notify` watcher filters FS events down to `.als` saves and feeds the parse → diff → commit pipeline.
Clients connect over a Unix socket (`~/.dawgit/daemon.sock`) speaking newline-delimited JSON; the IPC loop (`ipc.rs`) uses `tokio::select!` to multiplex a client's inbound commands against an outbound broadcast channel, so a save detected for one client pushes a `SaveDetected` event to every connected client live.
Because libgit2 and the parser are blocking, each command runs inside `spawn_blocking` — the synchronous git work never stalls the async event loop.
On top sits a `clap` CLI (`init/status/log/branch/checkout/diff/revert/tag`, with per-track and per-project variants) and a 1,664-LOC SwiftUI menubar app (repo cards, per-file branch picker, mini commit log) with a Settings toggle to install a `launchd` agent so the daemon starts at login. A startup scanner crawls the home directory once to surface un-tracked Ableton projects for opt-in.

### Honest scope

This is Phase 1 — local-only, Ableton-only — and the boundary is deliberate, not hidden.
**Merge and conflict resolution are not implemented**: the conflict *types* are modelled in `models.rs`, and the IPC commands exist, but `Merge`, `Resolve`, `Push` and `Pull` return explicit "not yet implemented" errors, and a test pins that contract. Cloud sync (R2) and other DAWs are later phases.
Test fixtures are synthetic XML built inline rather than real `.als` files, so the parser is proven against hand-written sessions, not yet a corpus of real ones.
What does work is covered: 52 tests pass across the parser, differ, git object layer, and a full IPC integration suite that spins up the socket server and drives it end to end. The repo is a local working tree with no public remote.

_Correctness is proven, not assumed — the test for "ignore viewport noise" is the spec, and the parser passes it._
