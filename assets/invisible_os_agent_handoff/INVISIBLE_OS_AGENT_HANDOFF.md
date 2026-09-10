# Invisible OS — Agent Implementation Handoff

**Status:** Approved visual direction / implementation reference
**Purpose:** Give a product/design/coding agent enough information to build the mobile experience without inventing a different visual language.

---

## 1. Product definition

**Invisible OS is a portal to a personal AI assistant.**

It is not primarily a chat app and it should not look like a conventional SaaS dashboard. It is a **control centre for an AI system** that can:

- work autonomously through agents;
- expose what it is doing and what it has completed;
- request approvals;
- retain and organize memory/knowledge;
- accept direct natural-language commands;
- create, rearrange, and populate modular graphical widgets;
- let the user create persistent widgets through their AI agent.

The signature idea is:

> **The AI and the interface are one system.**

The AI does not live inside a chat bubble. Its presence is expressed through the canvas itself: information surfaces, widgets appear, relationships connect, and the UI reorganizes when the system is working.

---

## 2. Canonical asset order

Use the assets in this folder in the following priority order.

| File | Role | Authority |
|---|---|---|
| `00_reference_direction.png` | **Approved visual direction.** Overall tone, spacing, monochrome treatment, navigation rail, widgets, AI-presence sketches. | Highest |
| `01_design_system.png` | Tokens, typography, spacing, radii, elevation, iconography, component examples. | High |
| `02_core_mobile_screens.png` | Functional screen coverage and information architecture. | High |
| `03_widget_library.png` | Widget types, states, compact/expanded variants. | High |
| `04_interaction_states.png` | AI-presence states, transitions, widget emergence, motion concepts. | High |
| `05_app_assets.png` | App icon ideas, loading states, empty states, notifications, quick actions, onboarding references. | Supporting |
| `06_visual_usage_guide.png` | Summary/reference board. | Supporting |

### Conflict rule

Generated visual boards contain exploratory variants. If two boards disagree:

1. Follow `00_reference_direction.png`.
2. Follow the rules in this Markdown file.
3. Use later boards only to fill gaps.

Do **not** average conflicting designs together.

---

## 3. Visual target

The desired experience is:

- **futuristic**
- **minimalist**
- **intelligent**
- **crisp**
- calm, but not soft or playful;
- premium, but not ornamental;
- highly digital, without looking like generic "AI software."

### Positioning scales

These are the intended design characteristics:

- Technical ↔ Human: **4/5 toward Human**
- Minimal ↔ Expressive: **2/5**
- Digital ↔ Tactile: **2/5**
- Warm ↔ Clinical: **4/5 toward Clinical**
- Familiar ↔ Futuristic: **5/5**

The interface should feel like a product from several years ahead while remaining immediately understandable.

---

## 4. Non-negotiable design rules

### 4.1 Monochrome first

The base product is monochrome.

- Light mode: warm, soft off-white with near-black text.
- Dark mode: near-black with warm-white text.
- Default accent: **none / monochrome**.
- Accent colour is a user personalization option, not a core part of the brand UI.

A screen should still look finished with the accent colour entirely disabled.

### 4.2 Accent colour is a signal, not decoration

The user's chosen accent may appear in:

- active AI-presence states;
- current focus;
- selected controls;
- a single live chart series;
- progress/status indication;
- connection nodes;
- subtle focus glow;
- a newly generated widget;
- temporary transitions.

Do **not** recolour entire cards, navigation bars, large backgrounds, or every icon.

Target: **90–95% neutral UI** even when an accent is enabled.

### 4.3 Crisp, not "soft UI"

Neumorphism may inform **interaction**, but must not become the base aesthetic.

Correct:
- almost-flat surface;
- slight emergence on hover/focus/active state;
- restrained inner/outer shadow during interaction;
- small depth change when a widget becomes interactive.

Incorrect:
- inflated pillow buttons;
- bubbly cards;
- heavy blur;
- obvious embossed controls;
- every panel floating above the page.

### 4.4 No decorative nature graphics

Do not add:
- leaves;
- botanical illustrations;
- organic decorative backgrounds;
- earthy motifs used as decoration.

Warm off-white is a surface choice, not a nature theme.

### 4.5 Avoid generic SaaS visual language

Do not default to:
- a greeting + grid of cards;
- colourful icon tiles;
- large gradient hero banners;
- oversized assistant avatar;
- chat bubbles as the dominant pattern;
- dashboard cards everywhere;
- purple/blue "AI gradients."

The interface should stand out through **space, motion, system behaviour, and information architecture**.

---

## 5. Canonical colour system

These values are implementation starting points. Maintain the relationships even if platform rendering requires minor adjustments.

### Light mode

```css
--bg:              #F7F6F2;
--surface:         #FBFAF7;
--surface-raised:  #FFFFFF;
--text-primary:    #111111;
--text-secondary:  #686868;
--text-tertiary:   #989898;
--line-subtle:     rgba(17,17,17,0.08);
--line-strong:     rgba(17,17,17,0.16);
--shadow:          rgba(0,0,0,0.06);
```

### Dark mode

```css
--bg:              #111111;
--surface:         #171717;
--surface-raised:  #1D1D1D;
--text-primary:    #F4F3EF;
--text-secondary:  #A6A6A2;
--text-tertiary:   #727270;
--line-subtle:     rgba(255,255,255,0.08);
--line-strong:     rgba(255,255,255,0.15);
--shadow:          rgba(0,0,0,0.28);
```

### Optional user accents

These are deliberately muted. They are **examples**, not mandatory brand colours.

```css
--accent-lavender: #C7C0E8;
--accent-blue:     #B8CAD8;
--accent-sage:     #BBCDBE;
--accent-sand:     #DEC9AE;
--accent-blush:    #DFC0C3;
```

Default selection = **monochrome**.

Every accent-aware component must also have a correct neutral state.

---

## 6. Typography

Primary recommendation:

```text
Inter Variable
fallback: SF Pro / system-ui / sans-serif
```

Typography should be clean and editorial rather than "techno."

### Suggested scale

| Token | Size / Line | Weight | Use |
|---|---:|---:|---|
| Display | 40 / 46 | 300–400 | Rare editorial statement |
| H1 | 28 / 34 | 400 | Screen headline |
| H2 | 22 / 28 | 450 | Major section |
| H3 | 18 / 24 | 500 | Card/widget heading |
| Body | 16 / 24 | 400 | Standard copy |
| UI | 14 / 20 | 450–500 | Controls/list rows |
| Caption | 12 / 16 | 400 | Metadata |
| Overline | 10 / 14 | 550 | Sparse labels only |

Rules:

- Never use more than three text sizes in one small mobile region.
- Use weight, spacing, and whitespace before adding colour.
- Avoid excessive bold.
- Use sentence case.
- Avoid overly conversational headings.

---

## 7. Copy style

The UI is system-like, calm, and concise.

### Preferred

- `Portal`
- `Everything in flow`
- `4 agents active`
- `2 approvals`
- `Research complete`
- `Waiting for approval`
- `Memory`
- `Recent activity`
- `Ask anything`
- `Create widget`
- `Build a widget from this`
- `Pin to Portal`
- `Pause agent`
- `Review`
- `Approve`
- `Dismiss`

### Avoid

- `Good morning, Alex`
- `Hello! How can I help you today?`
- overly friendly assistant chatter;
- motivational copy;
- long explanations where a status label will do.

The user explicitly rejected the personalized "Good morning, Alex" treatment.

---

## 8. Information architecture

### 8.1 Portal

The Portal is the product's primary space.

It should contain:

- AI presence / system field;
- current work;
- useful persistent widgets;
- pending approvals;
- relevant memory/research summaries;
- a universal AI command entry;
- contextual "next" items.

It is **not** a static dashboard. Its composition can evolve.

The AI may:
- suggest a widget;
- create a temporary widget;
- reorganize related information;
- surface a result;
- ask to pin a generated widget;
- collapse stale widgets.

### 8.2 Activity

A chronological control surface for what the assistant has done.

Show:
- agent actions;
- task status;
- generated outputs;
- background runs;
- approval requests;
- failures;
- completed work;
- timestamps;
- source agent.

Activity should answer:

> What has my AI been doing?

### 8.3 Agents

Control centre for active and available agents.

Minimum states:
- Active
- Idle
- Scheduled
- Waiting for input
- Waiting for approval
- Paused
- Failed
- Complete

Per agent:
- name/type;
- current task;
- progress if meaningful;
- latest update;
- pause/resume;
- inspect;
- cancel;
- output;
- dependencies/sub-agents where relevant.

### 8.4 Memory

Memory is the user's organized AI brain.

Include:
- search;
- people;
- projects;
- documents;
- insights;
- contexts;
- knowledge;
- sources;
- recents;
- relationship graph.

The graph should be useful, not decorative.

Selecting a node should reveal:
- why it exists;
- connected memories;
- source/provenance;
- last used;
- associated people/projects/tasks.

### 8.5 Command

Universal direct interaction with the assistant.

The command view may include:
- free-form natural language;
- suggested commands;
- attachments/context;
- tool/server/integration selector;
- target agent/mode when needed.

Do not turn it into a conventional full-screen messenger unless a conversation genuinely benefits from that layout.

### 8.6 Widget Builder

Users and agents can both create widgets.

Inputs may include:
- natural-language goal;
- widget type;
- data source;
- refresh logic;
- persistence;
- display size;
- target location.

Example:

> "Create a widget that tracks competitor product announcements and show the last 30 days as a timeline."

The agent should be able to propose a live preview and ask:

`Pin to Portal?`

### 8.7 Appearance

Provide:

- Light / Dark / System
- Accent: monochrome + optional colours
- UI density
- Motion / reduced motion
- AI-presence intensity if later needed

Keep this screen simple.

---

## 9. Navigation

### Preferred signature: slim edge rail

`00_reference_direction.png` uses a thin left-edge navigation rail. Treat this as the preferred distinctive navigation language for the phone design.

The rail should:

- remain visually light;
- use monochrome line icons;
- indicate the active destination with a restrained state;
- avoid large labels while collapsed;
- expose labels on deliberate interaction if needed;
- never compete with content.

Suggested top-level destinations:

1. Portal
2. Activity
3. Agents
4. Memory
5. Command

Secondary screens such as Appearance, Widget Builder, and Notifications are reached contextually.

### Platform fallback

If a platform constraint or usability test makes the rail impractical, a five-item bottom navigation may be used, but it should preserve the same sparse, monochrome design.

Do not use both simultaneously.

---

## 10. The AI presence — signature behaviour

This is the most important differentiating visual element.

Use the particle/node field seen in:

- `00_reference_direction.png`
- `04_interaction_states.png`

It represents the AI **and its relationship to information**, not an avatar.

### States

#### Resting
- extremely subtle;
- sparse low-contrast points;
- minimal or no motion.

#### Aware
- central focus becomes slightly more defined;
- a small number of nodes react;
- optional accent appears at very low intensity.

#### Listening / intent detected
- local field tightens around the focus point;
- nearby information starts to become relevant.

#### Thinking
- points reorganize;
- radial/orbital relationships become visible;
- motion remains slow and deliberate.

#### Connecting
- selective hairline links form;
- relationships become legible;
- do not create a sci-fi "network wallpaper."

#### Constructing
- a widget outline may emerge from the field;
- content resolves after the shape has formed.

#### Waiting for approval
- motion settles;
- one focal action/status remains emphasized.

#### Complete
- result becomes crisp;
- AI field recedes;
- accent diminishes;
- the interface returns to calm.

### Core rule

> Motion appears because the AI is doing something, never because the screen needs decoration.

---

## 11. Motion specification

The system should feel smooth and high-quality.

### Micro interactions

```text
120–180 ms
```

Use for:
- tap state;
- icon state;
- checkbox;
- filter;
- selection;
- button response.

### Component emergence

```text
220–360 ms
```

Use for:
- card expansion;
- list insertion;
- command result;
- widget preview.

### Canvas / widget reorganization

```text
360–600 ms
```

Use shared-element / morph transitions where possible.

### AI-presence transitions

```text
600–1200 ms
```

These may be slower because they represent system state rather than direct UI response.

### Easing

Preferred families:

```css
--ease-standard: cubic-bezier(.2,.8,.2,1);
--ease-enter:    cubic-bezier(.16,1,.3,1);
--ease-exit:     cubic-bezier(.4,0,1,1);
```

### Reduced motion

When reduced motion is enabled:

- no particle orbiting;
- no large reflow animation;
- crossfade/opacity instead;
- preserve state communication without motion dependence.

---

## 12. Surface and depth system

Use an 8pt spacing system.

### Radius

```text
XS      4
SM      8
MD      12
LG      16
XL      24
Pill    999
```

Most widgets/cards should use **12–16px**.

### Border

Default:

```css
1px solid rgba(17,17,17,0.08)
```

Dark mode equivalent:

```css
1px solid rgba(255,255,255,0.08)
```

### Elevation

Base UI should be nearly flat.

Suggested:

```css
/* resting surface */
box-shadow: 0 1px 2px rgba(0,0,0,.02);

/* interactive / raised */
box-shadow: 0 4px 16px rgba(0,0,0,.05);

/* temporary floating element */
box-shadow: 0 10px 32px rgba(0,0,0,.07);
```

Do not stack heavy shadows.

---

## 13. Iconography

Use:

- thin line icons;
- approximately 1.5px visual stroke;
- rounded caps;
- simple geometric construction;
- minimal interior detail;
- no filled multicolour icon tiles.

Target sizes:
- 16px metadata
- 20px controls
- 24px primary navigation

Active icons may gain:
- slightly stronger stroke;
- subtle neutral background;
- tiny accent point.

Do not fill every active icon with the user's accent.

---

## 14. Widget system

The widget system is a first-class product capability.

Reference: `03_widget_library.png`.

### Required widget categories

Initial library should support at least:

- System Pulse / system health
- Line chart
- Bar chart
- Summary
- Recent research
- Approval
- Calendar
- Task progress
- Memory graph
- Sources
- Quick command
- Activity timeline
- Document insight
- Notification
- Empty state
- Loading/progress
- User-created custom widget

### Recommended grid sizes

Think in a flexible grid rather than fixed card dimensions.

Examples:

```text
1×1  compact metric/status
2×1  short summary or progress
2×2  graph / research / activity
full  detailed report / builder / timeline
```

Widgets require:

- compact state;
- standard state;
- expanded state where relevant;
- loading;
- empty;
- error;
- stale-data indication if relevant;
- interactive/focused state.

### Widget anatomy

A widget may contain:

1. eyebrow / source;
2. title;
3. primary information;
4. optional visualization;
5. status/meta;
6. contextual action.

Do not add a header, menu, subtitle, footer, and buttons to every widget. Remove chrome when it is unnecessary.

### Agent-generated widgets

The AI may generate a widget dynamically.

Workflow:

1. User asks for information/action.
2. AI determines a widget would improve the interaction.
3. Widget emerges as a temporary surface.
4. User can interact with it.
5. AI may ask whether to persist it.
6. User can pin, resize, move, or edit.
7. Widget becomes part of Portal.

A custom widget should retain:
- original user goal;
- agent-generated specification;
- connected data/tool sources;
- refresh behavior;
- editable prompt/instructions.

---

## 15. Data visualisation

Graphs must follow the product's restraint.

Default:
- grayscale lines/bars;
- hairline axes;
- little or no chart furniture;
- labels only where useful;
- one active series may use the user accent.

Avoid:
- rainbow series;
- decorative gradients;
- excessive legends;
- 3D charts;
- strong grid lines.

Tooltips should appear as crisp lightweight surfaces.

---

## 16. Approvals and agent safety UX

Approval requests are important control-centre objects.

Every approval should clearly communicate:

- requested action;
- requesting agent;
- consequence;
- relevant value/amount/resource;
- approve;
- reject/dismiss;
- inspect details.

For higher-impact actions, provide enough detail before approval.

Approval UX should feel calm and deliberate, not alarming unless the actual condition is dangerous or erroneous.

---

## 17. Component inventory

The implementation agent should build reusable primitives before assembling screens.

### Foundation

- Page/screen
- Edge navigation rail
- Top bar
- Divider
- Section label
- Surface/card
- Modal/sheet
- Empty state
- Skeleton/loading state

### Inputs

- Universal command input
- Search input
- Text field
- Text area
- Filter
- Segmented control
- Toggle
- Slider
- Dropdown/context selector

### Actions

- Primary button
- Secondary button
- Ghost button
- Icon button
- FAB where contextually necessary
- Approval / reject pair
- Overflow menu

### Data

- Metric
- Progress bar
- Circular progress
- Timeline item
- Agent row
- Memory row
- Source row
- Chart primitives
- Graph node/link
- Badge/status
- Chip/tag

### Widget primitives

- Widget frame
- Widget header
- Widget state wrapper
- Compact/standard/expanded layout
- Resize affordance
- Drag handle
- Pin/unpin
- Edit/customize
- Loading/empty/error

---

## 18. Responsive behaviour

Design mobile first.

### Narrow phones

- one primary content column;
- widgets may stack;
- compact rail;
- avoid horizontal scrolling except deliberate carousels/timelines.

### Large phones

- allow two compact widgets side-by-side.

### Tablet / desktop expansion

The same system should scale into a true spatial control centre:

- persistent navigation rail;
- multi-column Portal;
- resizable widgets;
- drag/reorder;
- expanded memory graph;
- Activity + detail split view;
- agent inspector side panel.

Do not redesign the product as a different desktop dashboard.

---

## 19. Accessibility

Minimum:

- WCAG AA contrast for text and controls;
- 44×44pt minimum interactive target where possible;
- never communicate status using accent colour alone;
- dark mode maintains hierarchy;
- support system text scaling;
- visible keyboard/focus states on non-touch platforms;
- reduced motion support;
- screen-reader labels for icons and AI-presence state.

The AI particle system must never be required to understand task state. It is supplementary visualization.

---

## 20. Implementation sequence

Recommended build order:

### Phase 1 — Foundations
1. Theme tokens
2. Typography
3. spacing/radius/elevation
4. icon rules
5. light/dark mode
6. accent system
7. navigation rail

### Phase 2 — Core primitives
1. Surface/card
2. command input
3. list row
4. segmented filter
5. status/progress
6. approval actions
7. modal/sheet
8. loading/empty/error

### Phase 3 — Core screens
1. Portal
2. Activity
3. Agents
4. Memory
5. Command
6. Appearance

### Phase 4 — Widget platform
1. grid/layout engine
2. compact/standard/expanded widget contract
3. core widget library
4. reorder/resize/pin
5. Widget Builder
6. agent-generated widget definition

### Phase 5 — Signature system
1. AI presence renderer
2. state machine
3. widget emergence
4. connection visualization
5. canvas reorganization
6. reduced-motion behavior

### Phase 6 — Polish
1. transition tuning
2. dark-mode refinement
3. accessibility
4. haptics where appropriate
5. loading/performance optimization

---

## 21. Suggested data contracts

Implementation should keep AI functionality independent from presentation.

### Agent state

```ts
type AgentState =
  | "idle"
  | "active"
  | "scheduled"
  | "waiting_input"
  | "waiting_approval"
  | "paused"
  | "failed"
  | "complete";
```

### AI presence state

```ts
type AIPresenceState =
  | "resting"
  | "aware"
  | "listening"
  | "thinking"
  | "connecting"
  | "constructing"
  | "waiting_approval"
  | "complete";
```

### Widget definition

```ts
interface WidgetDefinition {
  id: string;
  type: string;
  title?: string;
  size: "compact" | "standard" | "expanded";
  sourceIds: string[];
  agentId?: string;
  refreshPolicy?: string;
  persistent: boolean;
  userGoal?: string;
  generatedSpec?: Record<string, unknown>;
}
```

The renderer should map widget definitions to reusable visual components. Do not let each agent invent arbitrary UI without constraints.

---

## 22. Anti-pattern checklist

Reject an implementation if it becomes:

- a ChatGPT clone;
- a colourful dashboard;
- a card grid with a greeting at the top;
- a soft neumorphic app;
- a generic productivity SaaS;
- a purple-gradient AI product;
- a nature-themed interface;
- an interface where every AI action opens a chat;
- an interface with decorative particle animations unrelated to system state;
- a design that uses accent colour across most of the screen.

Also reject:

- `Good morning, [name]` as the primary Portal statement.
- leaf/botanical graphics.
- large friendly AI avatars.
- unnecessary gradients.
- heavy shadows.

---

## 23. Acceptance criteria

Before calling a screen complete, verify:

### Visual
- [ ] Works completely in monochrome.
- [ ] Warm off-white rather than bright blue-white.
- [ ] Dark mode is equally intentional.
- [ ] Accent is sparse and optional.
- [ ] Hairlines and typography remain crisp.
- [ ] Depth is subtle.
- [ ] No generic colourful SaaS icon blocks.
- [ ] No botanical decoration.

### Product
- [ ] User can understand what the AI is doing.
- [ ] User can control active agents.
- [ ] Pending approvals are visible.
- [ ] Memory is inspectable.
- [ ] The assistant can be commanded from the current context.
- [ ] Widgets can surface AI outputs.
- [ ] Widgets can be persisted/customized.
- [ ] Agent-generated widgets follow the same component contract.

### Signature
- [ ] AI presence changes meaningfully with system state.
- [ ] AI presence does not distract while resting.
- [ ] Motion corresponds to actual work.
- [ ] Widget emergence feels connected to the AI presence.
- [ ] The overall product is recognizable without a logo or strong brand colour.

---

## 24. Canonical visual-generation prompt

The following prompt is the canonical prompt embedded in the generated design-system direction and should be reused when generating additional design exploration for this product:

> Create a high-fidelity design-system presentation board for a mobile product called "Invisible OS." The product is a portal and control center for a personal AI assistant. The style should be ultra-clean, minimalist, futuristic editorial, with a warm soft-white background, crisp black typography, fine hairline strokes, subtle shadows, and very restrained pastel accents. Include logo variations; design principles; light and dark mode foundations; accent color options; typography scale; spacing scale; radius, elevation, and shadow guidance; icon style; UI tokens; and example components. Use neutral, premium copy such as "Portal", "Activity", "Memory", "Command", "Create widget", "Weekly summary", and "Ask anything".

### Additional constraints established after the reference was created

When using that prompt for new screens, append:

> Keep the base interface monochrome. Do not use a personalized greeting such as "Good morning, Alex." Do not use leaf or botanical graphics. Accent colour is optional and user-selectable, with monochrome as the default. Use neumorphic depth only as a subtle interaction effect, never as the overall soft-UI aesthetic. The central visual signature is an abstract particle/node field representing the AI and its relationship to information. The AI and the interface should feel like one system: widgets emerge, connect, reorganize, and settle according to meaningful AI state. Keep the result crisp, highly minimal, futuristic, intelligent, and visually distinctive rather than generic SaaS.

---

## 25. Instructions to the coding/design agent

Start by studying `00_reference_direction.png`.

Do not immediately reproduce screenshots literally. First implement the tokens and primitives in this document. Then construct the screens from reusable components.

When a design detail is absent:

1. choose the simpler solution;
2. keep it monochrome;
3. preserve whitespace;
4. prefer a hairline over a filled container;
5. prefer meaningful state/motion over decoration;
6. ask whether the element helps the user understand or control their AI.

If not, remove it.

The goal is not merely to make the app look minimal.

The goal is to make the AI feel **present, capable, organized, and under the user's control without constantly demanding attention**.
