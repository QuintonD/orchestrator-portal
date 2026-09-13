# Critical comparison with Astra computer use

Reviewed 13 September 2026 against the current feature worktree, retained QA
artifacts and fetched official OpenAI documentation. This is an assessment and
proposed work order, not an implementation or a new acceptance result. It leaves
the existing QA source snapshot and failed experiments intact.

Our strongest work is the guarded Android action layer: identity binding,
revocation, replay handling, protected-window rejection and explicit uncertainty.
Our weakest area is useful autonomous task completion. The present component is
an alpha device driver, policy broker and supervision interface, with a small
source-client SDK. Calling it a peer of the complete Astra desktop experience
would overstate the evidence.

Astra is also a model we can use through our harness. The useful comparison is
the same model with different environments, tools, permissions and verification,
followed by a separately labelled comparison of complete desktop/phone products.
We cannot infer ChatGPT's private implementation or relative performance from
documentation alone.

Officially, Astra supports computer use through persistent code execution or
structured actions, and existing function/MCP interfaces can be retained. Code
can compose operations and conditions within a call. The execution environment
and permission enforcement remain the integrator's responsibility.
[Computer-use API guide](https://developers.openai.com/api/docs/guides/tools-computer-use)

The ChatGPT desktop product adds approved-app workflows, saved app permissions,
visual interaction and access to other tools. Windows control uses the foreground;
supported macOS setups have background and optional locked-use behavior. Terminal
automation through Computer Use and approval of OS security prompts are excluded.
Its broader file/shell tools have separate controls. We should not describe Astra
as an unrestricted desktop agent or promise macOS behavior on Android.
[ChatGPT Computer Use](https://learn.chatgpt.com/docs/computer-use),
[local security boundaries](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security)

| Area | Our present implementation | Assessment |
| --- | --- | --- |
| Input | Tap, long press, swipe, pinch, click/scroll nodes, whole-field text replacement, Back/Home and app launch | Enough primitives for demonstrations; incomplete mobile editing and workflow support |
| Code-driven use | CLI, MCP and composable Node SDK | Useful foundation; no supplied isolated persistent execution adapter or complete task runner |
| Observation | Window PNG and bounded accessibility tree | Fragile on layout transitions; no unified visual/semantic grounding or incremental state feed |
| Authority | App, operation, device and session scope; generic per-action biometrics | Does not enforce a document, recipient, account or natural-language task restriction |
| Recovery | Fresh bindings, replay protection, unknown quarantine and Stop | Strong refusal behavior; limited supported path back to useful work |
| Verification | Good synthetic/Markor owner-side checks | Production requests still establish dispatch, not independently verified task completion |
| Supervision | Portal setup, snapshots, recent receipts and Stop | Needs task progress, structured intervention events, takeover and bounded handoff |
| Evidence | Primitive coverage and a small number of real app runs | No demonstrated Astra parity or broad live-agent competence |

The following gaps should determine the next work, in priority order.

1. **Establish a real deployment boundary.** An unrestricted source agent running
   under the owner account can potentially reach owner files, ADB and other paths
   outside the broker. Encrypting files beside a key readable by that account and
   filtering child environment variables do not isolate such an agent. The
   [VM deployment proposal](phone-control-security-review.md) is untested. Provide
   a supported isolated source-runtime deployment with only its scoped broker
   channel, then test owner-file, process, native-port, USB and ADB denial from
   inside the actual runtime. This is required before claiming the allowlist is
   an effective boundary against that runtime.

2. **Authorize useful effects, not just input methods.** `node.click` targets a
   control more precisely than a coordinate; it does not establish that clicking
   it is permitted by a task such as editing one draft without sending it.
   Android Activity class names are not authoritative resource identities either.
   Introduce reviewed capabilities for specific resources and effects, such as
   editing one owner-selected document under a pinned provider/object identity
   and expected revision. A task grant needs permitted effects, disclosure scope,
   expiry, budgets and escalation conditions. For apps where those restrictions
   cannot be enforced, retain explicit handoff. Do not implement a standing
   "never send" grant using button-label classification.

   Per-action biometric review currently makes the owner participate in every
   ordinary mutation. More subtly, opening its Activity pauses the target and can
   trigger app behavior such as autosave before the requested mutation is
   approved. Therefore, "no injected action" is not a universal "no side effect"
   promise. The Home contract is a defensible narrow change, but adding exceptions
   for each troublesome app is not a general solution. Establish task authority
   before its execution where effects can be enforced. A service overlay is not
   an established public-API replacement for the current crypto authentication.
   [Consent investigation](phone-control-consent-lifecycle.md)

3. **Close the gap between test helpers and real agents.** The
   [Markor probe](../apps/phone-android/app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/DocumentProbe.java)
   already knows the original document and complete replacement string. Owner
   tooling opens, force-stops and reopens the file, then checks persisted bytes.
   This is useful native conformance evidence, but it does not demonstrate a
   model discovering a file, reading its existing content, making a requested
   edit and verifying persistence through its permitted tools.

   Editable values are omitted from the tree; opt-in screenshots can still show
   them. Native `type` replaces the entire field and is limited to 2,000
   characters. We lack authorized full-document readback, range edits, selection,
   revision checks and verified save semantics. Adding an unchecked append button
   or clipboard channel would not fix preservation. First implement one complete,
   resource-scoped editing capability, including a verifier outside the agent's
   write authority; then test documents whose contents the agent was not given.

4. **Model transitions and recovery explicitly.** Full-tree equality mixes
   meaningful target changes with unrelated rendering changes. Conversely,
   identical accessibility metadata does not prove identical custom-drawn pixels.
   Our SDK's `waitFor` ends on a failed read, whereas the test-only readiness
   helper now records and recovers from selected observation refusals. That
   engineering convenience is not yet a product recovery feature.

   Define operation-specific preconditions, structured transition reasons and
   bounded fresh-read recovery. Preserve exact target/resource authority for
   edits and content-dependent actions; never transplant an approved mutation
   onto a newly guessed target. Expose a read-only action-status/reconciliation
   path so uncertain acknowledgements can be investigated without resending the
   mutation. Resume requires independent evidence or human handoff; a new
   screenshot alone must not clear uncertainty.

   Independent review also reproduced a concrete SDK defect using a local mock:
   a definite HTTP `403 scope_forbidden` for `app.launch` becomes
   `outcome_unknown` and sets `PhonePilot.uncertain`. The
   [client](../components/phone-control/src/client.mjs) preserves the error, but
   the [SDK mutation catch](../components/phone-control/src/pilot.mjs) discards
   that distinction. Fix this with a trustworthy broker-origin/pre-dispatch
   classification, not by declaring every 4xx response safe to retry. No fix was
   applied during this review.

5. **Supply the missing source-runtime integration.** Keep planning in the source
   runtime, consistent with Orchestrator's architecture. Supply a reference
   adapter with a persistent isolated code workspace, typed phone library,
   aggregate action/time/model budgets, durable task checkpoints and structured
   pending-consent/progress events. Our library can already be composed in code;
   the missing piece is a supported, tested execution environment around it.
   Restarting a task must require reconciliation and fresh authority, not replay
   old inputs. Astra's documented asynchronous tools and mid-turn steering can
   support this integration; those capabilities do not make our device requests
   asynchronous or resumable automatically.
   [Astra integration capabilities](https://developers.openai.com/api/docs/guides/latest-model)

   Multiple agents may plan and inspect independently, but one phone UI needs a
   single active executor with an explicit bounded task lease. Per-call exclusion
   alone does not prevent two workflows competing between steps. Owner Stop and
   takeover must bypass that lease. The portal should display the current task,
   affected resource, pending decision and verified outcome, rather than requiring
   the operator to infer progress from primitive receipts.

6. **Improve observation and mobile coverage without widening authority.** Add
   event-driven state updates, bounded semantic differences, useful relational
   selectors and visual grounding for controls lacking accessibility semantics.
   Candidate matching may use more information, but authorization must stay with
   trusted identity and current preconditions. Native observations currently
   visit at most 300 nodes and depth 24; large legitimate screens can exceed that
   bound. Solve bounded observation deliberately, including privacy checks,
   instead of silently treating an incomplete tree as complete.

   Missing editing interactions, IME handling, system-picker handoff, permitted
   file/content-provider operations, multi-app transitions and practical device
   reconnect behavior matter more than additional variations of the fixture
   counter. An explicit drag API with tested hold/move semantics is also different
   from assuming an existing swipe is a reliable drag. Keep protected prompts,
   credentials and unsupported system surfaces under human control. Stock-phone
   background UI control is not an assumed capability.

7. **Make disclosure an owner capability.** Today a caller with `observe` can
   request `includeScreenshot: true`; this is caller opt-in under the existing
   broad disclosure, not a separately attenuated owner pixel grant. Separate
   semantic text, editable content, pixels and resource-specific results.
   Metadata flags cannot detect every private value in ordinary labels or custom
   rendering. Enforce provider/egress restrictions in the isolated runtime and
   minimize what leaves the phone. Labels promising a destination cannot constrain
   a process that can retransmit the returned data. This limitation also appears
   in the [current security review](phone-control-security-review.md).

8. **Make the evaluation measure the product.** The latest strict document run is
   2/3 and scripted. The later 45-assertion functional pass includes one explicitly
   retained read-only geometry recovery. Thirty successful steady-state captures
   are useful diagnostics, not a reliability estimate for long, changing tasks.
   Most current tests verify components or supplied synthetic records. Good test
   discipline should not be presented as agent competence.

   Use held-out multi-step tasks across several apps, with unfamiliar document
   contents and complete independent oracles. Count owner setup and verification
   separately; any owner execution or recovery during the task is an intervention.
   Include denied actions, state transitions, network loss, app updates, malicious
   content, owner takeover and locked-device handoff. Measure legitimate completion,
   interventions, unauthorized effects, false success, ambiguous outcomes, total
   wall time including consent, tokens/cost and capture failures. Keep all failed
   attempts and report uncertainty across task families.

We could exceed a generic desktop harness on specific, measurable dimensions:

- **Fewer interventions within enforceable limits:** a resource/effect grant can
  permit a complete useful task while exposing no send/delete capability. This
  requires app-specific integration; a generic tap allowlist cannot supply it.
- **Stronger evidence:** trusted app/provider checks can verify persisted bytes,
  exact record revisions and unchanged protected resources. A screenshot or a
  second model's agreement is insufficient evidence for these claims. UI rollback
  is not universally possible; offer compensation only where its semantics are
  known and testable.
- **Less data exposure and lower overhead:** local processing, selective
  disclosure and authorized structured operations can avoid repeated full-frame
  transfers. These gains must be measured with equivalent task scope and privacy
  rules. Hybrid GUI/API use alone is not novel; Astra already supports it.
- **Safer parallel preparation:** use separate synthetic emulator environments to
  compare plans or test app adapters, then serialize actual phone execution.
  Cloning a live phone's credentials is not the proposed method. Extra reviewers
  help find mistakes but do not become authorization oracles.
- **Portable ownership:** keep task contracts, adapters, permission semantics and
  verifier records usable by multiple source runtimes/models, with explicit
  recipient controls. This is a useful product differentiator, not proof that
  another product cannot implement it.

The recommended comparison has three Android configurations: Astra with a
restricted visual-action baseline, Astra with today's harness, and Astra with
the proposed resource/effect adapters. Hold the model, task state, allowed
effects and evaluation conditions constant where possible; report changes to
approval mechanisms explicitly and use ablations to isolate their effects.
Separately compare matched user intents with the ChatGPT desktop product and
disclose OS/app/tool differences. Do not attribute every cross-platform difference
to our harness or claim a canonical external benchmark score from a ported subset.

My recommended sequence is isolation and narrow disclosure, one complete useful
task capability, source-runtime/verification integration, transition recovery,
then held-out evaluation and broader app/device coverage. More primitives and
more worker agents should follow evidence that this sequence improves completed
tasks. The [readiness record](android-phone-control-readiness.md) remains the
source of truth for acceptance; none of these recommendations promotes the stage.

## Implementation follow-up, 13 September 2026

The assessment above is preserved as the review-time snapshot. Subsequent source
work now implements several prerequisites; it does not resolve the complete
resource/effect task or establish Astra parity.

- The [isolated deployment](phone-control-isolation.md) supplies a tested local
  Linux container with no host mounts, devices, ADB or network egress. A bounded
  host relay exposes only scoped broker routes and retains the bearer token.
  Actual container probes exercise owner-file/process/device/port denial and
  permitted broker access. This is an offline source-code execution profile;
  an unrestricted planner running under the owner account outside it remains
  uncontained. Provider access requires a separate reviewed disclosure channel.
- Broker replies now have full response authentication under an owner-provisioned
  Ed25519 public pin. The signature binds a nonce, method, route, exact request
  bytes, HTTP status and exact response bytes. Only a signed request-bound
  `not_dispatched` refusal preserves a definite rejection; forged HTTP success,
  arbitrary 4xx and lost acknowledgements cannot clear mutation uncertainty.
  Existing unsigned installations have an explicit offline `broker-identity`
  migration; keys are not silently replaced.
- Screenshots require separate phone, broker-session and credential grants,
  each defaulting to deny, plus explicit request opt-in. This narrows pixel
  disclosure; it does not prove that all semantic labels are free of private
  data or implement resource-specific document disclosure.
- Every mutation except Stop requires a bounded per-device executor lease.
  Acquire it before observing the mutation target: acquisition invalidates older
  observations. The lease serializes workflows and budgets action attempts; it
  does not authorize a document, recipient or downstream effect. Owner Stop
  bypasses the lease. Read-only status/receipt inspection never resumes a task.
- The [source SDK and checkpoint adapter](phone-control-source-sdk.md) now provide
  aggregate budgets, structured source-reported progress/handoff, metadata-only
  intent checkpoints, cancellation and bounded recovery for selected transient
  reads. Recovery records failed attempts, preserves privacy/authority failures
  and never retries a mutation. Old checkpoints are inspection-only. Provider
  budgets remain cooperative obligations of the source's provider adapter.

An independent resource-scoped editing capability and outcome verifier remain
unimplemented. A signed dispatch receipt, released lease, checkpoint or new
screenshot is not proof of a persisted document edit or completed user task.
`SourcePhoneTask.finish()` therefore reports `awaiting_verification` and
`independentlyVerified: false`. These changes provide a stronger environment for
the proposed held-out evaluation; they are not that evaluation, a production
certification or an approved change from alpha. Consult the current
[readiness record](android-phone-control-readiness.md) for native/emulator and
distribution evidence separately from the original review above.
