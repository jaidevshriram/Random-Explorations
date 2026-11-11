# Side-project, game, world-model and creative-AI talks at AI-engineering conferences (2023–2026), and neighbours of "Scribblenauts revived with AI"

Method note: I listed all 1,504 videos on the YouTube @aidotengineer /videos tab with yt-dlp (Nov 2026) and grepped titles for game/play/Pokémon/Minecraft/world/NPC/toy/weekend/side project/fun/hobby/music/art/creative/personal/"I built"/chess/puzzle/craft/sandbox/simulation and similar. Then I pulled the official YouTube descriptions for about 25 candidates. YouTube listing: https://www.youtube.com/@aidotengineer/videos. Conference/year comes from the description where it says so. Otherwise I give the upload date and say it is an inference. Not covered: the channel's /streams tab (only skimmed) and AI Council's archive. AI Council's talk page is JS-paginated, and yt-dlp returned nothing for @AICouncil or @DataCouncil.

## Q1. Which talks were explicitly side/personal projects?

### Takeaway
Explicitly self-described side or personal projects are rare on the AI Engineer stage. The clearest cases are:
- Jeff Schomay's "Using AI to Build an Infinite Game" (AIE Summit 2023): an indie AI-generated game.
- Lukasz Gandecki's attendee-led lightning talk "Books reimagined" (WF 2025): "got tired of waiting... built my own".
- Alex Duffy's "personally making AI play diplomacy" thread inside a benchmarks talk (WF 2025).
- Hassan El Mghari's "The Weekend AI Engineer" (Summit 2023).

Most playful talks come from employees (devrel, startup founders, big-co labs), who frame the playful build as a demo of their company's product.

### Cited Findings
- **Jeff Schomay** — "Using AI to Build an Infinite Game", AI Engineer Summit 2023 (SF). Video uploaded 2024-02-01, 11 min. The description says: "In this talk I share a number of workflows and tools I used while building out both a video game and a physical card game." Bio: "Software engineer with a decade of experience and a passion for the intersection of games, narrative and AI." — [YouTube](https://www.youtube.com/watch?v=_KFbT6eph5A)
  - The game is *Lost in an Infinite Forest*. "A scene is a JSON object describing what happens when the player discovers it." Text comes from OpenAI, and "the scene description itself works as the image prompt" for Leonardo's custom image model.
  - Architecture: "Validate the returned JSON, checking that the required keys are present". "Generate a stock of complete scenes before they are needed" and "replenish the stock whenever it falls below a threshold". Generation took "10, 20, sometimes 30 seconds".
  - Angle: demo plus lessons and workflow. — [ai.engineer talk page](https://ai.engineer/talks/_KFbT6eph5A-using-ai-build-infinite-game)
  - The talk page does not say whether this was a side project or a job. A search summary describes him as "software engineer and independent game designer", previously senior staff AI engineer at Mechanical Orchard. I did not verify that directly. — [ai.engineer speaker page](https://www.ai.engineer/speakers/jeff-schomay), [LinkedIn](https://linkedin.com/in/jeffschomay)
- **Lukasz Gandecki (TheBrain.pro)** — "Books reimagined: AI to create new experiences for things you know", AI Engineer World's Fair 2025 (SF). Format: "[last round of Attendee-Led 10min lightning talks]". Evidence: "I will showcase how I got tired of waiting for an AI assisted/no spoiler book reading experience and built my own... demo book at bookgenius.net Open Sourcing!" Angle: demo-led. — [YouTube](https://www.youtube.com/watch?v=Kcka7rzcxLk)
- **Alex Duffy (Every.to, leads AI strategy)** — "Benchmarks Are Memes: How What We Measure Shapes AI—and Us", AIE World's Fair 2025 (uploaded 2025-07-15). The description cites examples from "Every consulting in industries like finance, journalism, education, and even personally making AI play diplomacy." This is the AI Diplomacy game-benchmark project. Angle: essay/benchmarks. — [YouTube](https://www.youtube.com/watch?v=W3khHzajE04)
- **Hassan El Mghari ("Creator of RoomGPT"; affiliation not stated in the description, though the talk features Vercel AI SDK/v0)** — "The Weekend AI Engineer", AI Engineer Summit 2023. Description: "How *YOU* can - and should - build great multimodal AI apps that go viral and scale to millions in a weekend." Angle: demo plus lessons from weekend side apps. — [YouTube](https://www.youtube.com/watch?v=MarPORTD8vo)
- **Nick Nisi (leads developer and agent experience at WorkOS)** — "I Made a Fruit Fly Review My Code" (uploaded 2026-11-01; its description promotes the AIE CODE summit). He "hooked a simulated fruit fly brain, built from a full scan of its neurons, up to code review: AI turns each change into literal 'code smells,' sugar and bitter rewards..." Angle: playful demo. — [YouTube](https://www.youtube.com/watch?v=geMAe-PLJF4)
  - Inference: this is a whimsical personal hack, not a WorkOS product. The description does not say so explicitly.
- **Jeremy Adams (Senior Developer Advocate, Neo4j)** — "I Built a Personal AI Agent on a Raspberry Pi" (uploaded 2026-10-03). "Jeremy Adams runs his personal AI agent on an old Raspberry Pi he wears around his neck"; "assembles a wearable AI agent live on stage". Angle: live-build demo, but tied to the employer's product (Neo4j graph memory). — [YouTube](https://www.youtube.com/watch?v=oUZEt4EiPbk)
- **Ido Salomon (creator of AgentCraft and MCP-UI)**:
  - "AgentCraft: Putting the Orc in Orchestration" (uploaded 2026-04-25, no affiliation listed): "the game-inspired agent orchestrator". — [YouTube](https://www.youtube.com/watch?v=kR64LOqBBCU)
  - Later "We're the bottleneck, but we don't have to be — Ido Salomon, AgentCraft" (uploaded 2026-09-27): "an orchestrator styled like a strategy game. Agents appear as units on a map, your file system becomes the terrain". — [YouTube](https://www.youtube.com/watch?v=YIVkERhy8xo)
  - Inference: this probably started as a personal project. The first talk lists no employer, and by the second the speaker's affiliation is the project's own name.
- **Siddharth Ahuja** — "Blender MCP and The Future Of Creative Tools" (uploaded 2025-06-03; WF 2025 by inference). "A dive into the Blender MCP to see how it was made, what use cases for creators it unlocks". — [YouTube](https://www.youtube.com/watch?v=nnktgWtfJHE)
  - Inference: Blender MCP was widely reported as his personal open-source project. The description itself doesn't state this, and I did not verify it.
- **Stephan Steinfurt (TNG)** — "Running a Chess YouTube Channel entirely by AI" (uploaded 2026-07-08). "Daily chess puzzle explanations on YouTube: Our agent analyzes and describes chess puzzles... arrows included!" — [YouTube](https://www.youtube.com/watch?v=BqZrTdgBaPw)
  - Inference: "Our" suggests a TNG team project, so side project vs work is unclear.
- **David Hershey (Anthropic, Applied AI)** — Claude Plays Pokémon. Latent Space calls it "a fun side project" and Hershey "creator of Claude Plays Pokemon". — [Latent Space](https://latent.space/p/how-claude-plays-pokemon-was-made)
  - A ZenML LLMOps-database summary (reached via search, not opened) says it began as a side project in June 2024. — [ZenML](https://www.zenml.io/llmops-database/building-and-deploying-a-pokemon-playing-llm-agent-at-anthropic)
  - He demoed it at Anthropic's own Code w/ Claude event, not an AIE conference. — [startuphub](https://www.startuphub.ai/news/anthropics-live-demo-shows-claudes-agentic-leap)
  - No @aidotengineer video title contains "Pokémon" (yt-dlp title grep plus a channel search for "pokemon" returned nothing).

### Inferences
- The strongest precedent for the user is the **Attendee-Led 10-min lightning talks** at WF 2025 (Gandecki). A self-built project with a "got tired of waiting, built my own" framing got stage time and a recorded video.
- Jeff Schomay is the closest prior talk to "Scribblenauts with AI" in spirit: LLM-generated game content, JSON schema, validation, a pre-generation cache to hide latency. That talk is from 2023 and is about narrative scenes, not object/interaction systems.

### Gaps
- I could not see the AI Council 2024–2026 talk archive. The site is JS-paginated, and the visible 2026 entries were infra/enterprise talks: Diogo Almeida "AI: Too Good to Be True, Too Bad to Be Useful", sandbox infra, AI Launchpad startups. I found no games or side-project talk there. — [AI Council talks](https://www.aicouncil.com/talks)
- I did not watch transcripts to confirm side-project status for Nisi, Ahuja or Salomon.

## Q2. Which talks cover games, worlds and generative content, and from what angle?

### Takeaway
2026 brought a cluster of world-model and game-engine talks from startups and labs: Moonlake (Manning), General Intuition, Reactor, Nereu, Meta, NYT. Earlier years had agents playing games (Minecraft) and viral game-like apps (paint.wtf). Nearly all are company-led. Indie and passion-project game talks are almost absent after Schomay (2023).

### Cited Findings

**Research labs and startups (world models)**
- **Christopher Manning (Stanford professor; Moonlake AI)** — "World Models Need Causality, Not Pretty Pixels" (uploaded 2026-09-24, 51 min). Manning "argues that generative video like Genie 3 simulates observations but has no semantics underneath, so it can't support planning. Moonlake takes a single photo or short video and builds an action-conditioned world in code, with objects you can pick up, open and move. It even researches objects on the web to fill in what the camera can't see, like the tea bags inside a closed box." Angle: research/vision plus startup. — [YouTube](https://www.youtube.com/watch?v=4Gqg0HVe-AY)
  - Inference: this is the closest *technical* neighbour to LLM-generated object affordances, done as a startup.
- **Pim de Witte (General Intuition; team behind Medal)** — "Robots Will Be Trained on Video Games" (uploaded 2026-11-04). Models "take in frames and send out actions continuously, the way a gamer plays"; uses Medal's game clips. Angle: startup thesis. — [YouTube](https://www.youtube.com/watch?v=MpkARD5pq-M)
- **Ahmed Ahres (Reactor)** — "The Next Medium: Why Real-Time Interactive Video Changes Everything" (uploaded 2026-08-18). His world models are video "that is interactive, effectively infinite, and generated fast enough to steer"; he demos "prompting a cat into a scene while that scene is still generating". Angle: startup vision plus demo. — [YouTube](https://www.youtube.com/watch?v=5dCAmSDOAjI)
- **Jacob Kahn (FAIR, Meta)** — "Code World Model: Building World Models for Computation" (title only). — [YouTube](https://www.youtube.com/watch?v=sYgE4ppDFOQ)
- **Sander Dieleman (Google DeepMind)** — "Building Generative Image & Video models at Scale" (title only). — [YouTube](https://www.youtube.com/watch?v=xOP1PM8fwnk)

**Game engines and game creation**
- **Arturo Nunez (Nereu)** — "The Next Game Engine Won't Have a Manual" (uploaded 2026-08-18). "Everything is an asset, and you attach tags describing intent instead of implementation: character, animated, double jump. Systems then query by tag... nothing stops you tagging a building as drivable." He uses LOD-style context assembly for the model. Angle: technical architecture from a startup. — [YouTube](https://www.youtube.com/watch?v=VBCDhRrvlYo)
  - Inference: the tag/ECS model is very close to how a Scribblenauts-AI would represent generated objects (properties as tags that systems query).
- **Danielle An (Principal Engineer, Meta) and David Hoe (prototyper, Meta)** — "Think You Can Build a Game with AI? Think Again! The New Games Are Just Being Invented!", AI Engineer Europe 2026 (YouTube upload 2026-07-08). — [ai.engineer](https://ai.engineer/talks/think-you-can-build-a-game-with-ai-think-again-the-new-games-are-just-being-invented), [YouTube](https://www.youtube.com/watch?v=grdoOC1BT1s)
  - Demos: a slide-quest game played by the audience, and runtime-LLM NPCs given traits like "thief"/"honorable" whose stealing and blocking were "unscripted decisions made by the runtime models".
  - The talk names Nano Banana and Meshy for assets. Runtime content generation is framed as a future issue. This is company work.

**Agents playing and solving games**
- **Derek Bingham (Developer Advocate, AWS)** — "Claude plays Minecraft!", AIE World's Fair 2024 (uploaded 2025-02-15). "An AI entity capable of reasoning, problem-solving, and executing tasks in Minecraft. Leveraging... Amazon's Bedrock, Lambda, SNS... Claude 3". Angle: architecture demo of the employer's stack. — [YouTube](https://www.youtube.com/watch?v=1B9i7FBsRVQ)
- **Shafik Quoraishee (NYT Games)** — "New York Times' Connections: A Case Study on NLP in Word Games", WF 2025 (uploaded 2025-07-05). AI puzzle solving: clustering, semantic mapping, GNNs. — [YouTube](https://www.youtube.com/watch?v=P_uhFGH4J9Y)
- **Shafik Quoraishee and Joanne Song (NYT)** — "Local Agentic Theory For Mobile Games" (uploaded 2026-07-23). An on-device agent plays Space Invaders and solves the mini crossword. "These are experimental, and the Times is emphatic that its actual puzzles are made by people with no AI in the games." — [YouTube](https://www.youtube.com/watch?v=418t26CVz-w)
- **Anant Dole and Asbjørn Steinskog (Take Take Take, Magnus Carlsen's app)** — "Building a Chess Coach" (uploaded 2026-05-13). Stockfish plus detectors, with the LLM as "translator". — [YouTube](https://www.youtube.com/watch?v=FlzpEGHNVKQ)

**Viral game-like apps and creative AI**
- **Joseph Nelson (Co-founder/CEO, Roboflow)** — "120k players in a week: Lessons from the first viral CLIP app", AIE Summit 2023. paint.wtf is an AI Pictionary judged by CLIP; "Over 120,000 players played in the first week, peaking at 7 submissions per second." Company-team build. Angle: lessons learned/scale. — [YouTube](https://www.youtube.com/watch?v=OimPoLxioYg)
- **Lars Grammel** — "Storyteller: Building Multi-modal Apps with TS & ModelFusion", AIE Summit 2023. A kids' story generator used as an example app for his library. — [YouTube](https://www.youtube.com/watch?v=KnndhPSVF3E)
- **Benjamin (ex-Twilio GM; surname not in description)** — "Personality Driven Development: Exploring the Frontier of Agents with Attitude", WF 2024. Whimsical agent personas ("Hootie McHootface"). — [YouTube](https://www.youtube.com/watch?v=lG_8rgQqxfc)
- **Phlo Young** — "AI Music Generation, From Prompt to Production", a WF 2024 workshop (Suno/Udio). — [YouTube](https://www.youtube.com/watch?v=CoaL4JZKsWI)
- **Barr Yaron (Amplify)** — "Frontier Feud: Anthropic, Google DeepMind, Meta FAIR, Thinking Machines", AI Engineer Summit 2025. Inferred from the title to be a game-show-format panel, not a game build. — [YouTube](https://www.youtube.com/watch?v=BWqB6aatreE), [ai.engineer](https://www.ai.engineer/talks/BWqB6aatreE-frontier-feud)

**Other playful or creative titles found (not verified beyond title)**
- Steve Ruiz (tldraw) — "tldraw.computer" — [YouTube](https://www.youtube.com/watch?v=1C2TdPkj6aQ)
- Christopher Chedeau — "Excalidraw: AI and Human Whiteboarding Partnership" — [YouTube](https://www.youtube.com/watch?v=aopgVJBQC0o)
- Keegan McCallum (Luma AI) — "Dream Machine: Scaling to 1m users in 4 days" — [YouTube](https://www.youtube.com/watch?v=EY4O9M6AsWI)
- Andres Marafioti (Hugging Face) — "Reachy Mini: the $300 open source robot you can actually hack" — [YouTube](https://www.youtube.com/watch?v=0jeZfjJMfmo)
- Thor Schaeff (Google DeepMind) — "From Transcription to Live Music: Gemini's Audio Stack" — [YouTube](https://www.youtube.com/watch?v=Bc6Ojl2XS1w)

### Inferences
- What's covered: world models (pixels vs code), agents playing games, AI-assisted game creation tooling, and LLM-driven NPCs (Meta).
- **What's not covered on any AIE stage I found:** runtime generation of *objects plus their properties plus interaction rules* in a playable sandbox, i.e. the Scribblenauts / Infinite Craft mechanic. I also found no talk on evaluating the consistency of LLM-generated game rules ("does fire + rope always burn?"), or on caching or canonicalising an emergent object library.
- The open slot looks like an indie, side-project, demo-led talk with real architecture and eval lessons. Possible topics:
  - schema for object properties (cf. Nereu's tags, Moonlake's "objects you can pick up, open and move")
  - latency hiding (cf. Schomay's pre-generated stock)
  - interaction-rule consistency and caching (cf. Infinite Craft's persisted combinations)
  - eval of "fun"/coherence

### Gaps
- I didn't confirm conference names for the 2026 uploads lacking an event line (Nunez, Ahres, de Witte, Manning, Steinfurt). Their descriptions promote AIE events but don't name the source event.
- Whether Gemini or Claude Plays Pokémon ever got an AIE stage slot: none found by title search.

## Q3. Existing public projects/talks on LLM-driven Scribblenauts-like or "infinite crafting" mechanics

### Takeaway
The main public neighbour is **Infinite Craft** (Neal Agarwal, Jan 2024). It uses an LLM (Llama 2) to generate element combinations. I found no conference talk by Agarwal and no prominent "Scribblenauts with an LLM" project or talk. A research neighbour is MagicCraft (arXiv 2025). The original Scribblenauts' hand-authored library is well documented and makes a good contrast point.

### Cited Findings
- Infinite Craft: Agarwal told PC Gamer he was "using Facebook's Llama 2 on the backend" and that keeping servers running was a struggle. — [PC Gamer](https://www.pcgamer.com/this-browser-based-endless-crafting-game-starts-you-off-with-fire-and-water-but-it-quickly-escalates-to-god-the-big-bang-and-yin-yoda)
- Wikipedia says elements are generated by LLaMA 2 hosted by Together AI; it launched on the web in Jan 2024, with a mobile app in April 2024. — [Wikipedia](https://en.wikipedia.org/wiki/Infinite_Craft); also covered by [FlowingData](https://flowingdata.com/2024/02/02/infinite-craft-with-large-language-model/)
- An essay on Agarwal's craft exists, but I found no talk or long technical interview on the combination logic. — [Working Theorys](https://www.workingtheorys.com/p/the-craft-neal-agarwal)
- MagicCraft is a research system: "Natural Language-Driven Generation of Dynamic and Interactive 3D Objects for Commercial Metaverse Platforms". LLM plus image-to-3D plus automated behaviour scripting; not a game talk. — [arXiv 2504.21332](https://arxiv.org/pdf/2504.21332)
- Original Scribblenauts: objects were "hand authored 1 by 1 & lots of crunch" (former designer Liz England). Objects sat in a 2-tier hierarchy with many custom "exceptions". — [Kotaku](https://kotaku.com/the-secret-behind-scribblenauts-making-objects-by-hand-1796262472), [Game Developer](https://www.gamedeveloper.com/design/-i-scribblenauts-i-dev-shares-lessons-learned-in-making-its-huge-object-library)
- Some fans value hand-authorship and are sceptical that AI generation preserves the appeal. — [ResetEra thread](https://www.resetera.com/threads/did-scribblenauts-do-all-we-couldve-reasonably-asked-of-it.830049/)
- Adjacent tools (vendor/marketing, weak evidence): Rosebud AI's AI-built physics sandbox showcase. — [Rosebud](https://lab.rosebud.ai/blog/create-a-sandbox-game-online)
- Other references, outside these conferences: Gemini Plays Pokémon is run by Joel Zhang, an independent engineer "unaffiliated with Google". His blog post "The Making of Gemini Plays Pokémon" is at blog.jcz.dev. — [TechCrunch](https://techcrunch.com/2025/05/03/googles-gemini-has-beaten-pokemon-blue-with-a-little-help), [hashnode @jcz-dev](https://hashnode.com/@jcz-dev)

### Inferences
- Infinite Craft proves the mechanic is viral, but it is combination-only and text/emoji-only, with no physics or world interaction. Scribblenauts-with-AI adds a spatial world, generated properties and situational interactions. To my knowledge, that combination has no public talk.
- The user should still search itch.io, Reddit and Twitter for indie "Scribblenauts AI" demos before submitting. My searches (including an HN "Show HN" search) found none, but absence of evidence is weak here.

### Gaps
- I didn't find any "Scribblenauts with GPT" demo, the "Emoji Kitchen" pipeline technical details, or LLM physics/interaction-rule generation papers beyond MagicCraft. Search returned mostly unrelated results.

## Q4. Speakers who publicly described getting a first talk accepted based on a side project

### Takeaway
I found no blog post from a speaker describing a first AIE or AI Council talk accepted *because of a side project*. What exists is CFP-process information, plus the attendee-led lightning-talk precedent from Q1.

### Cited Findings
- The AIEWF 2026 CFP ran on Sessionize, and "MULTIPLE submissions are ok". — [Sessionize 2026](https://sessionize.com/aiewf2026/)
- The 2025 CFP said "standard talk length is 18 minutes (no on-stage q&a)" and invited "Screenshot Essay" versions of talks. — [Sessionize 2025](https://sessionize.com/ai-engineer-worlds-fair-2025/)
- An attendee write-up and a ThursdAI episode reportedly cite sub-5% talk acceptance for WF 2026. I saw this in a search summary only and didn't open either source. — [Paul Logan substack](https://laulpogan.substack.com/p/top-5-things-ai-engineer-worlds-fair), [ThursdAI](https://thursdai.news/ep/jul-02-2026)
- Orbital Witness (Orbital) has a "My talk for AI Engineer World's Fair 2025" post. It is a company engineering blog, not a side project; it redirected to orbital.tech and I didn't read it. — [Orbital blog](https://www.orbital.tech/posts/2025-06-11-ai-engineer-worlds-fair-talk)
- Attendee-Led 10-min lightning talks existed at WF 2025, and at least one was a self-built project (Gandecki). — [YouTube](https://www.youtube.com/watch?v=Kcka7rzcxLk)

### Inferences
- The lightning-talk or attendee-led track looks like a lower-barrier way in for a first-time side-project speaker. I didn't confirm whether it recurs in 2026.

### Gaps
- No first-person "my side project got me an AIE/AI Council talk" blog posts were found.
- The sub-5% acceptance figure is unverified (search summary only).
