---
title: ARMED — Git for Ableton Sessions
tagline: A macOS menubar app over a Rust daemon that gives Ableton Live real version control — diffing the music, not the bytes. Semantic .als diff, per-song variations that never touch HEAD, and a byte-splice merge engine that edits the project XML in place. Signed, notarised and universal at 0.2.8 — and deliberately not published yet.
order: 8
section: music
buckets: [systems]
stack: [Rust, tokio, libgit2 (git2-rs), roxmltree, flate2, SHA-256, Unix sockets, launchd, SwiftUI, Next.js]
metrics:
  - { label: "Codebase", value: "27.5k Rust · 11.9k Swift", source: "armed: git ls-files '*.rs' → 27,450; '*.swift' → 11,999 (2026-09-11)" }
  - { label: ".als → typed AST", value: "1,443 LOC parser", source: "armed: armed-daemon/src/parsers/ableton.rs (2026-09-11)" }
  - { label: "Semantic diff", value: "22 delta variants", source: "armed: armed-daemon/src/models.rs:149 (enum SemanticDelta) (2026-09-11)" }
  - { label: "Byte-splice merge", value: "6,017 LOC engine", source: "armed: armed-daemon/src/splice.rs (2026-09-11)" }
  - { label: "Per-file branch commit", value: "HEAD/index untouched", source: "armed: armed-daemon/src/git/mod.rs:283 (commit_file_to_branch) (2026-09-11)" }
  - { label: "Tests", value: "257 daemon tests", source: "armed: grep -rE '#[test]|#[tokio::test]' armed-daemon/src armed-daemon/tests (2026-09-11)" }
  - { label: "Merge fuzz soak", value: "2,160 cases, 0 CRITICAL", source: "armed: docs/devlog/2026-08-24-fifth-reading.md:31 — 115 real .als sets, 36 songs (2026-09-11)" }
  - { label: "Build state", value: "0.2.8, unpublished", source: "armed: armed-app/project.yml:39 + armed-website/lib/release.ts:8 (2026-09-11)" }
role: Sole author. Built the whole system end to end — the Rust daemon (FS watcher, async/sync IPC boundary, git object layer, per-song ref namespaces, project discovery, launchd integration), the 1,443-LOC Ableton gzip-XML parser, the semantic differ, the 6k-LOC byte-splice merge engine and its corpus fuzzer, the clap CLI, the SwiftUI menubar app and standalone window, the signed/notarised release pipeline, and the static marketing site.
status: working
repo: { kind: private }
dates: "2026"
---

Ableton Live has no real version control. Producers ship `Final_v3_REAL_final.als` because the `.als` is an opaque gzip blob: `git diff` says "binary files differ", and a one-line lyric tweak collides with a parallel mixdown into an unmergeable mess.
ARMED treats this as a systems problem: **diff the music, not the bytes.**
It is a background daemon that watches your Ableton folders and, on every save, decides from the *musical* content of the project whether anything worth committing actually changed.

It shipped under the name **DAWgit** until 2026-06-22, when the rename went through the whole tree — CLI binary `armed`, state directory `~/.armed`, bundle id `io.armed.app` — and the repo moved to `~/Projects/armed` on 2026-07-08. The slug here is unchanged; the name on the app is not. What was a two-crate daemon + CLI is now a Rust workspace (`armed-daemon`, `armed-cli`), a SwiftUI app (`armed-app`, menubar panel plus a standalone window), and a static Next.js site (`armed-website`), with 291 commits since May.

## The hard part: a save is mostly noise

An `.als` is gzip-compressed XML, and Ableton rewrites large chunks of it on every save that have nothing to do with the music: scroll positions, the currently-selected note view, an `OverwriteProtectionNumber` counter, and fresh `Uuid`s sprinkled across clips.
A byte-diff fires on all of it. The whole project hinges on telling signal from noise.

So the parser (`parsers/ableton.rs`, 1,443 LOC) decompresses with `flate2::GzDecoder` into a single XML string, hands it to `roxmltree` (which builds its DOM by *borrowing* slices of that string instead of allocating a `String` per node), and walks it into a typed `ProjectAst`: tracks (audio / MIDI / return / group), clips, devices, automation lanes, routing and sends, tempo, time signature, master chain.
Three known-noisy tags (`ScrollerTimeableView`, `DetailClipKeyMidis`, `OverwriteProtectionNumber`) are skipped during the walk, and `Uuid` attributes are excluded from every content hash.
The payoff is provable: a test mutates the protection counter and a clip `Uuid`, re-parses, and asserts the AST is byte-identical — viewport churn is invisible by construction, not by heuristic.

Per clip, the parser computes a SHA-256 over only the musically-relevant subtree (MIDI note events, the sample file reference, warp markers), so "I nudged the view" and "I rewrote the bassline" are *different* facts the rest of the system can act on.

## Diffing two snapshots of a song

The differ (`differ.rs`, 741 LOC) compares two `ProjectAst`s into a list of `SemanticDelta`, a 22-variant enum (`models.rs:149`) covering `TrackAdded`, `ClipMoved`, `DeviceParamChanged`, `TempoChanged`, and the rest.
Tracks, clips and devices are matched by their stable Ableton IDs via `HashMap`, so the diff distinguishes add / remove / modify instead of reporting a positional shuffle as wholesale change; floats compare with a `1e-6` epsilon to absorb serialisation jitter.
Each delta knows how to render itself (`~ Tempo: 128 → 135 BPM`, `+ Track added: "New Synth"`), and that string is both the CLI diff output and the auto-generated save summary.

Clip identity turned out to be the subtlest thing in the codebase. Ableton reuses clip ids *within* a track — one factory set has a track whose fifty clips all carry `Id="0"` — so clips were addressed by occurrence in document order. That address is positional: delete one clip and every clip after it re-addresses, so pairing two sides by equal address compares each clip to its *neighbour* and manufactures a tail of phantom renames, which then makes a merge refuse. The fix was smaller than the bug looked: pair by identity rather than by address (exact id first, then a best-affinity pass scoring content hash, name, start and length, with a deterministic tie-break), and the phantom clips meet their true partner, find themselves unchanged, and emit nothing. Both flaws in my first attempt at that fix were caught by its own unit tests, not by the soak.

This is what makes the headline feature honest: the daemon caches the last committed AST as JSON, diffs the new save against it, and **if the delta list is empty it does not commit.** Hit Cmd-S forty times while scrolling around and the history stays clean. Change one device parameter and you get exactly one save that says so.

```text
.als save (Cmd-S)
          |
          v
+-------------------+
| notify watcher    |   FS events filtered to .als saves
+-------------------+
          |
          v
+-------------------+   skips ScrollerTimeableView,
| parser            |   DetailClipKeyMidis,
| gzip -> XML ->    |   OverwriteProtectionNumber;
| typed ProjectAst  |   Uuid attrs never hashed
+-------------------+
          |
          v
+-------------------+
| differ            |   new AST vs cached AST (JSON)
+-------------------+
          |
          v
  delta list empty? --yes--> no commit, clean history
          |
          no
          |
          v
  exactly one commit;
  message = rendered deltas
  ("~ Tempo: 128 -> 135 BPM")
```
*Fig. 1 — the save pipeline: noise is dropped at parse time, and an empty delta list means no commit.*

## A git object layer that doesn't fight the DAW

Built directly on `libgit2` via `git2-rs` — no shelling out to `git`, and with git2's default `https` feature switched off so the binary never links a network transport it has no use for.
The interesting operation is `commit_file_to_branch` (`git/mod.rs:283`): it reads the branch tip's tree, swaps a single blob via a `treebuilder`, writes the new tree, and commits straight to `refs/heads/<branch>` without touching HEAD, the index, or the working directory.

```text
commit_file_to_branch (git/mod.rs:283)

  refs/heads/song/<slug>/<variation>    HEAD     : untouched
             |                          index    : untouched
             v                          worktree : untouched
        tip commit
             |
        read tip tree
             |
             v
  +---------------------+
  | treebuilder:        |
  | swap exactly one    |
  | blob (the new .als) |
  +---------------------+
             |
             v
  write tree, commit straight
  to refs/heads/<file-branch>
```
*Fig. 2 — commit_file_to_branch swaps one blob in the tip tree and writes straight to the ref; HEAD, index and working directory stay untouched.*

That is the mechanism behind per-song branching. Every project file carries its own branch, and since July those branches live in a per-song ref namespace (`song/<file-slug>/<variation>`), with named song versions as `armed/song/<file-slug>/<name>` tags and album versions as frozen manifests on `refs/armed/versions` pinning every song to a (variation, commit) pair. So you can fork the lead-synth arrangement while the drum file sits untouched, and the daemon never does a working-tree checkout behind the producer's back. (The whole-project `checkout_branch` *does* move HEAD, and bails on a dirty tree, because git2 refuses otherwise.)
Reverts use a three-way `merge_trees` (ancestor = target commit, ours = its parent, theirs = branch tip) and bail loudly on conflict rather than guessing. Paths are canonicalised first so macOS's `/var → /private/var` symlink doesn't break the in-repo path resolution.

None of that vocabulary reaches the user. The UI says Song, Variation, Version and Save; `branch`, `commit` and `repo` are banned from user-facing copy by a rule the doc gate enforces. The format underneath is published anyway (`docs/FORMAT.md`, mirrored at `/format` on the site) so a producer can read their entire history back with plain `git log` and `git show` and never be trapped by a closed-source app.

## Splicing a merge into the bytes

The merge is the actual product, and it is the largest single file in the repo: `splice.rs`, 6,017 LOC.

The naive approach — merge two `ProjectAst`s and serialise back to XML — would rewrite the whole document, and anything the parser doesn't model would be silently deleted on the way out. So the splice engine never serialises. It takes the two decompressed XML strings, runs a *second* `roxmltree` pass to map every `SemanticDelta` onto a byte range of the original document (`Node::range()`, `Attribute::range_value()`), and then applies the approved changes as byte edits: an attribute value is patched in place, a whole subtree is transplanted, and a self-closing `<Devices/>` slot is expanded into an open/close pair as part of the same edit rather than being bounced to a fallback. Everything ARMED doesn't understand survives untouched because it is never touched.

The invariant that runs through the whole file is that `ClipId` and `DeviceId` repeat across tracks — only `TrackId` is globally unique — so every lookup resolves the track first and searches inside that subtree. Getting that wrong caused two real corruption classes, both found and fixed: transplanted tracks landing *after* the return tracks, and an id renumbering pass that missed the `ModulationTarget` pointee family.

Because no automated test can prove Live will *open* the result, two gates sit under it. A **merge fuzzer** (`tests/merge_fuzz.rs`) takes every real set in a corpus of 115 `.als` files across 36 songs, deterministically generates hundreds of divergent mutation pairs per set, drives each through the full plan → approve → apply → validate pipeline, and then re-checks the output against Live's file invariants *independently of the engine's own gates* — 2,160 cases, currently 2,041 clean, 119 safe refusals, **zero CRITICAL** (validate said OK but the output was broken). Every case prints its seed so one failure can be replayed alone. And once, manually, the merged file was opened in Ableton Live itself and the renamed track checked by eye — the only evidence in the project that Live accepts ARMED's gzip round-trip, because every automated test compares XML to XML. Its first run failed and found a silent no-op in the engine.

## Wiring: one daemon, many thin clients

The architectural rule is strict: the daemon owns all VCS logic, and the CLI and the macOS app are thin IPC clients. Nothing that parses, diffs or writes git objects is allowed to exist in Swift.
A `notify` watcher (behind `notify-debouncer-full`) filters FS events down to `.als` saves and feeds the parse → diff → commit pipeline.
Clients connect over a Unix socket (`~/.armed/daemon.sock`) speaking newline-delimited JSON across a 48-command surface (`models.rs:703`); the IPC loop uses `tokio::select!` to multiplex a client's inbound commands against an outbound broadcast channel, so a save detected for one client pushes an event to every connected client live.
Because libgit2 and the parser are blocking, each command runs inside `spawn_blocking` — the synchronous git work never stalls the async event loop.

```text
            +-----------------------------+
            |        armed daemon         |
            |  notify watcher (.als only) |
            |  parse -> diff -> commit    |
            |  libgit2 object layer       |
            |  byte-splice merge engine   |
            |  blocking calls wrapped in  |
            |  spawn_blocking             |
            +--------------+--------------+
                           |
                ~/.armed/daemon.sock
                newline-delimited JSON
                48 commands + events
                           |
              +------------+------------+
              |                         |
              v                         v
      +----------------+       +------------------+
      | clap CLI       |       | SwiftUI app      |
      | init / status  |       | menubar panel +  |
      | log / diff /   |       | standalone window|
      | merge / resolve|       | merge review UI  |
      +----------------+       +------------------+

     save + error events broadcast to all clients
```
*Fig. 3 — one daemon owns the VCS logic; the CLI and the macOS app are thin clients on the socket.*

On top sits a `clap` CLI (`init/status/log/branch/checkout/diff/revert/tag/merge/resolve/autosave`, with per-track and per-project variants) and an 11.9k-LOC SwiftUI app: a menubar panel for the common case, and a standalone window for the surfaces a 360 pt popover cannot carry — home, a per-song page with its commit graph, versions and variations, and the merge review panel where each change is approved or rejected individually before the splice runs. A startup scanner crawls the home directory once to surface un-tracked Ableton projects for opt-in, a Settings toggle installs a `launchd` agent so the daemon starts at login, and an opt-in autosave controller injects ⌘S into Live behind a chain of nine guards (default off, because sending keystrokes into someone's DAW is not a thing to do casually).

## Shipping discipline

0.1.0 shipped signed, notarised, stapled — and unrunnable on every machine that was not the build machine, because its bundled daemon linked Homebrew's OpenSSL at an absolute path and aborted in dyld. `spctl`, `stapler` and `codesign` all passed it; they check the wrapper, and nothing checked that the payload starts.
So `scripts/release.sh` now gates the things that actually broke: every shipped binary must carry both the arm64 and x86_64 slices (`lipo -archs`), nothing may link outside the OS, and the daemon must be executed out of the sealed DMG before the release is allowed to complete. A `check-docs.sh` gate fails a release whose site copy, DMG byte count, SHA-256 or version string disagree with what was actually built — added after an audit found 15 of 50 quantitative claims on the site were wrong.

## Honest scope

**This is not launched.** There are no users, no revenue, and no public download. 0.2.8 is built, universal, signed, notarised and stapled, and is being held back until the release channel around it is ready. The code is **closed source** by decision (2026-07-19); trust ships through the documented on-disk format instead, so a producer is never locked in by the app.

**Merge is implemented; audio versioning is not.** The splice engine, the per-change review UI and the conflict path all ship. The audio LFS layer never did: `lfs::store_blob` and `write_pointer` have no caller outside tests, no filter is registered with libgit2, and the `filter=lfs` lines were cut from `.gitattributes` in August — the file now reads exactly `*.als binary`. Audio is not versioned at all. A variation switch rewrites the `.als` and leaves every sample beside it untouched. Since 2026-08-21 the daemon at least *says so*: `audio.rs` resolves every sample reference the way Live does (absolute path, then project-relative) and raises a banner naming any file that is not on disk — two-step resolution because over the 115-set corpus the absolute path alone finds 221 of 260 references and a naive check would have called 15% of a healthy project missing. Detecting the gap is not closing it.

Cloud sync is still a wire stub (`push`/`pull`), it is Ableton-only and macOS 14+ only, and clip identity on pathological sets fails closed — a refusal, never corruption — with a real matching pass scheduled rather than written off. Test fixtures are synthetic XML plus hostile-input generators rather than committed `.als` files (size and privacy), with the real-corpus sweep run from a local folder before every release. The repo is private and closed.

_Correctness is proven, not assumed — the test for "ignore viewport noise" is the spec, and the parser passes it._
